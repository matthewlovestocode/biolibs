/**
 * A run proposed, and what becomes of it.
 *
 * A plan is the one thing in the log that claims nothing happened, which is what lets a key with no
 * hands write it. So what is checked hardest is that a plan changes nothing the lab holds, that an
 * adviser can write a plan and a part and nothing else whatever it tries, and that closing a plan
 * leaves the run it points at readable by a device that has never heard of plans.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addPlace, addToRoster, adjustItem, foundLab, mergeLog, newItemId, newPlaceId, newPlanId, newRunId, nextEntry,
         planRun, putItem, recordRun, retireItem, setField, setRole, settlePlan, type LabState, type Operation, type PlanRecord, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const FORWARD = "GGATCACAGTCTACACTG";
const REVERSE = "GGTATACATACTCTGAAG";
/** Something a plan can be expected to make, so that another plan can be written to use it. */
const PRODUCT = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACCTTTAAACCCGGGAAATTTCCCGGG";

let ada: SigningKey;
let bob: SigningKey;
let claude: SigningKey;
beforeAll(async () => { [ada, bob, claude] = await Promise.all([generateSigningKey(), generateSigningKey(), generateSigningKey()]); });

class Device {
  held: SignedEntry[];
  constructor(readonly key: SigningKey, from: readonly SignedEntry[] = []) { this.held = [...from]; }
  async write(op: Operation): Promise<SignedEntry> {
    const entry = await nextEntry(await mergeLog(this.held), this.key, op);
    this.held.push(entry);
    return entry;
  }
  hear(other: Device): void { for (const entry of other.held) if (!this.held.includes(entry)) this.held.push(entry); }
  lab(): Promise<LabState> { return mergeLog(this.held); }
}

/** A lab with a template in a tube, a primer that is only a part, a thermocycler, a member and an adviser. */
async function wren(): Promise<{ a: Device; b: Device; c: Device; tube: string; primer: string; cycler: string; plan: (more?: Partial<PlanRecord>) => PlanRecord }> {
  const a = new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);
  await a.write(addToRoster(bob.publicKey, "Bob"));
  await a.write(addToRoster(claude.publicKey, "Claude", "adviser"));
  await a.write(addPart({ sequence: TEMPLATE, name: "template" }));
  await a.write(addPart({ sequence: FORWARD, name: "fwd" }));
  const [template, primer] = (await a.lab()).parts.map((one) => one.checksum) as [string, string];
  const tube = newItemId();
  await a.write(addItem({ item: tube, part: template, amount: 20, unit: "µL" }));
  const cycler = newPlaceId();
  await a.write(addPlace({ place: cycler, kind: "instrument", name: "Thermocycler" }));
  const plan = (more: Partial<PlanRecord> = {}): PlanRecord => ({
    plan: newPlanId(), kind: "pcr", instrument: cycler,
    inputs: [{ item: tube, amount: 1, role: "template" }, { part: primer, amount: 2, role: "forward primer" }],
    expects: [{ sequence: TEMPLATE, circular: false, name: "amplicon" }],
    settings: { anneal_at_least: 18 }, note: "to check the insert is there", ...more,
  });
  return { a, b: new Device(bob, a.held), c: new Device(claude, a.held), tube, primer, cycler, plan };
}

const lastOf = async (device: Device): Promise<{ status: string; reason: string | null }> => {
  const lab = await device.lab();
  const entry = lab.entries.find((one) => one.signed === device.held.at(-1))!;
  return { status: entry.status, reason: entry.reason };
};

describe("a plan", () => {
  it("is kept, and changes nothing the lab holds", async () => {
    const { b, tube, plan } = await wren();
    const before = await b.lab();
    const proposed = plan();
    await b.write(planRun(proposed));
    const lab = await b.lab();
    expect(await lastOf(b)).toEqual({ status: "applied", reason: null });
    expect(lab.plans).toHaveLength(1);
    expect(lab.plans[0]).toMatchObject({ plan: proposed.plan, kind: "pcr", by: bob.publicKey, settled: null, wanting: [], note: "to check the insert is there" });
    // No amount moved, and nothing was made: not an item, not a part, not a run.
    expect(lab.items.find((one) => one.item === tube)!.amount).toBe(20);
    expect(lab.items).toHaveLength(before.items.length);
    expect(lab.parts).toHaveLength(before.parts.length);
    expect(lab.runs).toHaveLength(0);
  });

  it("gives what it expects the checksum that would be its identity", async () => {
    const { a, b, plan } = await wren();
    await b.write(planRun(plan()));
    const lab = await b.lab();
    // The same bases as the template, so the same identity as the part the lab already has.
    expect(lab.plans[0]!.expects[0]).toMatchObject({ name: "amplicon", length: TEMPLATE.length, checksum: (await a.lab()).parts[0]!.checksum });
  });

  it("may count on a part there is no tube of yet", async () => {
    const { b, primer, plan } = await wren();
    await b.write(planRun(plan()));
    expect((await b.lab()).plans[0]!.inputs[1]).toEqual({ part: primer, amount: 2, role: "forward primer" });
  });

  it.each([
    ["an item the lab does not have", (p: PlanRecord): void => { p.inputs[0] = { item: "nosuchitem", amount: 1, role: "template" }; }, "A tube it would use is not an item the lab has."],
    ["a part the lab does not have", (p: PlanRecord): void => { p.inputs[1] = { part: "nosuchpart", amount: 1, role: "primer" }; }, "A part it would use is not one the lab has."],
    ["an input that is both", (p: PlanRecord): void => { p.inputs[0] = { item: p.inputs[0]!.item!, part: p.inputs[1]!.part!, amount: 1, role: "template" }; }, "Each thing it would use has to be a tube, a part or a prospect, and only one of those."],
    ["an input that is neither", (p: PlanRecord): void => { p.inputs[0] = { amount: 1, role: "template" }; }, "Each thing it would use has to be a tube, a part or a prospect, and only one of those."],
    ["less than nothing of a tube", (p: PlanRecord): void => { p.inputs[0]!.amount = -1; }, "It does not say how many whole units of each thing it would use, and as what."],
    ["an instrument the lab does not have", (p: PlanRecord): void => { p.instrument = "nowhere"; }, "The place it would be done at is not one the lab has."],
    ["something that is not a sequence", (p: PlanRecord): void => { p.expects[0]!.sequence = "not dna!"; }, "Something it expects to make is not a sequence, with ends a molecule of that length can have."],
    ["ends on a circle", (p: PlanRecord): void => { p.expects[0] = { ...p.expects[0]!, circular: true, ends: { left: 4, right: 0 } }; }, "Something it expects to make is not a sequence, with ends a molecule of that length can have."],
  ])("is refused for %s", async (_what, spoil, reason) => {
    const { b, plan } = await wren();
    const proposed = plan();
    spoil(proposed);
    await b.write(planRun(proposed));
    expect(await lastOf(b)).toEqual({ status: "refused", reason });
    expect((await b.lab()).plans).toHaveLength(0);
  });

  it("is refused if its ID is already a plan's", async () => {
    const { b, plan } = await wren();
    const proposed = plan();
    await b.write(planRun(proposed));
    await b.write(planRun(proposed));
    expect(await lastOf(b)).toEqual({ status: "refused", reason: "A plan with that ID already exists." });
  });

  it("is not understood if it carries a field this version does not know", async () => {
    const { b, plan } = await wren();
    await b.write({ ...planRun(plan()), urgency: "high" });
    expect((await lastOf(b)).status).toBe("not understood");
    expect((await b.lab()).plans).toHaveLength(0);
  });

  it("is flagged, not refused, when a tube it counts on runs short or is retired", async () => {
    const { a, b, tube, plan } = await wren();
    await b.write(planRun(plan({ inputs: [{ item: tube, amount: 15, role: "template" }] })));
    expect((await b.lab()).plans[0]!.wanting).toEqual([]);
    a.hear(b);
    await a.write(adjustItem(tube, -10));
    expect((await a.lab()).plans[0]!.wanting).toEqual([tube]);
    await a.write(retireItem(tube));
    expect((await a.lab()).plans[0]!.wanting).toEqual([tube]);
    expect((await a.lab()).plans).toHaveLength(1);
  });
});

describe("settling a plan", () => {
  /** Bob proposes; Ada carries it out as a run. */
  const carriedOut = async (): Promise<{ a: Device; b: Device; c: Device; plan: string; run: string; tube: string }> => {
    const { a, b, c, tube, cycler, plan } = await wren();
    const proposed = plan();
    await b.write(planRun(proposed));
    a.hear(b);
    const run = newRunId();
    await a.write(recordRun({ run, kind: "pcr", instrument: cycler, inputs: [{ item: tube, amount: 1, role: "template" }],
                              outputs: [{ item: newItemId(), sequence: TEMPLATE, circular: false, name: "amplicon", amount: 50, unit: "µL" }],
                              settings: {}, outcome: "worked", note: null }));
    return { a, b, c, plan: proposed.plan, run, tube };
  };

  it("points it at the run that carried it out", async () => {
    const { a, plan, run } = await carriedOut();
    await a.write(settlePlan(plan, run));
    expect(await lastOf(a)).toEqual({ status: "applied", reason: null });
    expect((await a.lab()).plans[0]!.settled).toMatchObject({ run, by: ada.publicKey });
  });

  it("sets it aside when no run is named", async () => {
    const { b, plan } = await wren();
    const proposed = plan();
    await b.write(planRun(proposed));
    await b.write(settlePlan(proposed.plan, null));
    expect((await b.lab()).plans[0]!.settled).toMatchObject({ run: null, by: bob.publicKey });
  });

  it("stops flagging a plan once it is settled", async () => {
    const { a, plan, run, tube } = await carriedOut();
    await a.write(settlePlan(plan, run));
    await a.write(retireItem(tube));
    expect((await a.lab()).plans[0]!.wanting).toEqual([]);
  });

  it("is refused for a plan or a run the lab does not have", async () => {
    const { a, plan, run } = await carriedOut();
    await a.write(settlePlan("nosuchplan", run));
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "It does not name a plan the lab has." });
    await a.write(settlePlan(plan, "nosuchrun"));
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "The run it says carried the plan out is not one the lab has." });
    expect((await a.lab()).plans[0]!.settled).toBeNull();
  });

  it("is refused once somebody who knew it was settled settles it again", async () => {
    const { a, plan, run } = await carriedOut();
    await a.write(settlePlan(plan, run));
    await a.write(settlePlan(plan, null));
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "That plan is already settled." });
    expect((await a.lab()).plans[0]!.settled!.run).toBe(run);
  });

  it("lets one stand, the same one everywhere, when two settle it apart", async () => {
    const { a, b, plan, run } = await carriedOut();
    b.hear(a);
    const [mine, theirs] = [await a.write(settlePlan(plan, run)), await b.write(settlePlan(plan, null))];
    a.hear(b);
    b.hear(a);
    const [atA, atB] = [await a.lab(), await b.lab()];
    expect(atA.plans[0]!.settled).toEqual(atB.plans[0]!.settled);
    expect(atA.overlaps).toHaveLength(1);
    expect(atA.overlaps[0]!.what).toContain("what became of plan");
    // The lower entry ID stood, whichever of the two that was.
    const ids = [atA.entries.find((one) => one.signed === mine)!.id, atA.entries.find((one) => one.signed === theirs)!.id].sort();
    expect(atA.plans[0]!.settled!.entry).toBe(ids[0]);
  });

  it("asks nothing new of the run, so a device that reads no plans still reads it", async () => {
    const { a, plan, run, tube } = await carriedOut();
    await a.write(settlePlan(plan, run));
    // The link is the settling entry's alone. The run is, field for field, what a run always was:
    // a version that has never heard of plans refuses an entry with a field it does not know, and
    // would have lost the run and every amount it moved.
    const recorded = a.held.find((one) => one.entry.op.type === "run.record")!.entry.op;
    expect(Object.keys(recorded).sort()).toEqual(["inputs", "instrument", "kind", "note", "outcome", "outputs", "run", "settings", "type"]);
    const lab = await a.lab();
    expect(lab.runs.map((one) => one.run)).toEqual([run]);
    expect(lab.items.find((one) => one.item === tube)!.amount).toBe(19);
  });
});

describe("an adviser", () => {
  it("may propose a run and add a part", async () => {
    const { c, plan } = await wren();
    await c.write(planRun(plan()));
    expect((await lastOf(c)).status).toBe("applied");
    await c.write(addPart({ sequence: REVERSE, name: "rev, designed" }));
    expect((await lastOf(c)).status).toBe("applied");
    const lab = await c.lab();
    expect(lab.plans[0]!.by).toBe(claude.publicKey);
    expect(lab.parts.map((one) => one.name)).toContain("rev, designed");
  });

  it("may set aside a plan of its own", async () => {
    const { c, plan } = await wren();
    const proposed = plan();
    await c.write(planRun(proposed));
    await c.write(settlePlan(proposed.plan, null));
    expect((await c.lab()).plans[0]!.settled).toMatchObject({ run: null, by: claude.publicKey });
  });

  it("may not set aside somebody else's, or say that a run was done", async () => {
    const { a, b, c, tube, cycler, plan } = await wren();
    const [theirs, mine] = [plan(), plan()];
    await b.write(planRun(theirs));
    c.hear(b);
    await c.write(settlePlan(theirs.plan, null));
    expect(await lastOf(c)).toEqual({ status: "refused", reason: "An adviser may only set aside a plan of its own." });
    await c.write(planRun(mine));
    a.hear(c);
    const run = newRunId();
    await a.write(recordRun({ run, kind: "pcr", instrument: cycler, inputs: [{ item: tube, amount: 1, role: "template" }], outputs: [], settings: {}, outcome: "failed", note: null }));
    c.hear(a);
    await c.write(settlePlan(mine.plan, run));
    expect(await lastOf(c)).toEqual({ status: "refused", reason: "An adviser may only set aside a plan of its own." });
    expect((await c.lab()).plans.every((one) => one.settled === null)).toBe(true);
  });

  it("may say what is on a part nobody has described, and may not change what somebody marked", async () => {
    const { a, b, c } = await wren();
    const [mine, theirs] = (await a.lab()).parts.map((one) => one.checksum) as [string, string];
    const mark = (label: string): Operation => ({ type: "part.annotate", part: mine, features: [{ type: "CDS", label, strand: 1, parts: [{ start: 0, end: 20 }] }] });

    await c.write(mark("as the adviser reads it"));
    expect(await lastOf(c)).toEqual({ status: "applied", reason: null });
    expect((await c.lab()).parts.find((one) => one.checksum === mine)!.features[0]!.label).toBe("as the adviser reads it");

    // A person's reading always stands over the adviser's, whichever came first.
    a.hear(c);
    await a.write(mark("as Ada reads it"));
    c.hear(a);
    await c.write(mark("and again"));
    expect(await lastOf(c)).toEqual({ status: "refused", reason: "Its key is an adviser, which may mark a part only while nothing is marked on it. Somebody has marked this one." });
    expect((await c.lab()).parts.find((one) => one.checksum === mine)!.features[0]!.label).toBe("as Ada reads it");

    // One somebody described before the adviser ever saw it is not the adviser's to change.
    await b.write({ type: "part.annotate", part: theirs, features: [{ type: "CDS", label: "Bob's", strand: 1, parts: [{ start: 0, end: 10 }] }] });
    c.hear(b);
    await c.write({ type: "part.annotate", part: theirs, features: [] });
    expect((await lastOf(c)).status).toBe("refused");
    expect((await c.lab()).parts.find((one) => one.checksum === theirs)!.features[0]!.label).toBe("Bob's");
  });

  it("settles the same way on every machine when a person and an adviser mark at once", async () => {
    const { a, c } = await wren();
    const mine = (await a.lab()).parts[0]!.checksum;
    const mark = (label: string): Operation => ({ type: "part.annotate", part: mine, features: [{ type: "CDS", label, strand: 1, parts: [{ start: 0, end: 20 }] }] });
    // Neither had heard of the other when they wrote.
    await a.write(mark("Ada"));
    await c.write(mark("the adviser"));
    const [atA, atC] = [new Device(ada, [...a.held, ...c.held]), new Device(claude, [...c.held, ...a.held])];
    const [one, two] = [await atA.lab(), await atC.lab()];
    const marked = (lab: LabState): string | undefined => lab.parts.find((part) => part.checksum === mine)!.features[0]?.label;
    expect(marked(one)).toBe(marked(two));
    // Whatever the order they arrive in, what stands is what a person marked.
    expect(marked(one)).toBe("Ada");
    // Which way the adviser's was turned away depends only on which entry ID was lower, so both are
    // allowed: it is refused where Ada's was placed first, and overlapped where it was not. Either
    // way it is not silent, and both machines say the same thing.
    const theirs = (lab: LabState) => lab.entries.find((entry) => entry.signed.entry.author === claude.publicKey && entry.signed.entry.op.type === "part.annotate")!;
    expect(theirs(one).status).toBe(theirs(two).status);
    expect(one.overlaps.map((overlap) => overlap.what)).toEqual(two.overlaps.map((overlap) => overlap.what));
    if (theirs(one).status === "applied") {
      expect(one.overlaps[0]!.what).toContain("what is marked on");
    } else {
      expect(theirs(one)).toMatchObject({ status: "refused", reason: expect.stringContaining("only while nothing is marked on it") });
    }
  });

  it("is refused everything that would change what the lab holds", async () => {
    const { a, c, tube, cycler } = await wren();
    const part = (await a.lab()).parts[0]!.checksum;
    const tries: Operation[] = [
      addItem({ item: newItemId(), part, amount: 5, unit: "µL" }),
      adjustItem(tube, -5),
      retireItem(tube),
      putItem(tube, cycler),
      addPlace({ place: newPlaceId(), kind: "room", name: "A room of its own" }),
      recordRun({ run: newRunId(), kind: "pcr", instrument: cycler, inputs: [{ item: tube, amount: 1, role: "template" }], outputs: [], settings: {}, outcome: "failed", note: null }),
      { type: "field.set", on: "item", id: tube, field: "note", value: "mine now" },
      { type: "part.offer", part, available: true },
      addToRoster(bob.publicKey, "Bob again"),
    ];
    const before = await c.lab();
    for (const op of tries) {
      await c.write(op);
      const { status } = await lastOf(c);
      expect(status, op.type).toBe("refused");
    }
    const after = await c.lab();
    expect(after.items).toEqual(before.items);
    expect(after.places).toEqual(before.places);
    expect(after.runs).toEqual(before.runs);
    expect(after.roster.map((one) => [one.key, one.role])).toEqual(before.roster.map((one) => [one.key, one.role]));
  });

  it("is judged by what it was when it wrote, not by what it is made later", async () => {
    const { a, c, tube } = await wren();
    await c.write(adjustItem(tube, -5));
    a.hear(c);
    await a.write(setRole(claude.publicKey, "member"));
    // The use it tried as an adviser stays refused; one written after being made a member counts.
    expect((await a.lab()).items.find((one) => one.item === tube)!.amount).toBe(20);
    c.hear(a);
    await c.write(adjustItem(tube, -3));
    expect((await c.lab()).items.find((one) => one.item === tube)!.amount).toBe(17);
  });

  it("cannot be what the last keeper is turned into", async () => {
    const { a } = await wren();
    await a.write(setRole(ada.publicKey, "adviser"));
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "A lab cannot be left without a keeper." });
  });
});

describe("filing a plan under a project", () => {
  it("is a label on it, and changes nothing about what it would do", async () => {
    const { a, plan, tube, primer } = await wren();
    const one = plan();
    await a.write(planRun(one));
    await a.write(setField("plan", one.plan, "project", "Real Vegan Cheese"));
    expect(await lastOf(a)).toEqual({ status: "applied", reason: null });
    const filed = (await a.lab()).plans[0]!;
    expect(filed.fields).toEqual({ project: "Real Vegan Cheese" });
    // Everything the plan actually is, untouched.
    expect(filed).toMatchObject({ kind: "pcr", note: "to check the insert is there", settled: null });
    expect(filed.inputs).toEqual([{ item: tube, amount: 1, role: "template" }, { part: primer, amount: 2, role: "forward primer" }]);
    expect(filed.expects[0]).toMatchObject({ name: "amplicon" });
    // And nothing the lab holds moved.
    expect((await a.lab()).items[0]!.amount).toBe(20);
  });

  it("can be moved to another project, or taken off", async () => {
    const { a, plan } = await wren();
    const one = plan();
    await a.write(planRun(one));
    await a.write(setField("plan", one.plan, "project", "Real Vegan Cheese"));
    await a.write(setField("plan", one.plan, "project", "Bioprinting"));
    expect((await a.lab()).plans[0]!.fields["project"]).toBe("Bioprinting");
    await a.write(setField("plan", one.plan, "project", null));
    expect((await a.lab()).plans[0]!.fields["project"]).toBeNull();
  });

  it("may not rewrite what the plan would do", async () => {
    const { a, plan } = await wren();
    const one = plan();
    await a.write(planRun(one));
    for (const field of ["kind", "inputs", "expects", "settled", "note", "by"]) {
      await a.write(setField("plan", one.plan, field, "something else"));
      expect(await lastOf(a)).toEqual({ status: "refused", reason: "It does not name a field that can be set." });
    }
    expect((await a.lab()).plans[0]!).toMatchObject({ kind: "pcr", note: "to check the insert is there" });
  });

  it("is refused for a plan the lab does not have", async () => {
    const { a } = await wren();
    await a.write(setField("plan", newPlanId(), "project", "Real Vegan Cheese"));
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "It does not name a part, an item, a place, a strain, a specimen, a plan, an expectation or a prospect the lab has." });
  });

  it("is settled between two people the same way everything else is", async () => {
    const { a, b, plan } = await wren();
    const one = plan();
    await a.write(planRun(one));
    b.hear(a);
    // Two people file it differently without having heard of each other.
    await a.write(setField("plan", one.plan, "project", "Real Vegan Cheese"));
    await b.write(setField("plan", one.plan, "project", "Bioprinting"));
    a.hear(b);
    const lab = await a.lab();
    expect(["Real Vegan Cheese", "Bioprinting"]).toContain(lab.plans[0]!.fields["project"]);
    expect(lab.overlaps.map((each) => each.what)).toContain("project of plan " + one.plan.slice(0, 12));
    // And both machines come out the same way, which is the whole point.
    b.hear(a);
    expect((await b.lab()).plans[0]!.fields["project"]).toBe(lab.plans[0]!.fields["project"]);
  });

  it("an adviser may file a plan of its own, since it is the one that proposed the work", async () => {
    const { a, c, plan } = await wren();
    const own = plan();
    c.hear(a);
    await c.write(planRun(own));
    await c.write(setField("plan", own.plan, "project", "Real Vegan Cheese"));
    expect(await lastOf(c)).toEqual({ status: "applied", reason: null });
    expect((await c.lab()).plans[0]!.fields["project"]).toBe("Real Vegan Cheese");
  });

  it("and may not touch anything else, which is the line plan.settle already draws", async () => {
    const { a, c, plan, primer } = await wren();
    const mine = plan();
    await a.write(planRun(mine));
    c.hear(a);
    // Not somebody else's plan.
    await c.write(setField("plan", mine.plan, "project", "Something else"));
    expect(await lastOf(c)).toEqual({ status: "refused", reason: "An adviser may only set a field on a plan of its own." });
    // Nor a part, which is how a lab's own names could otherwise be rewritten under it.
    await c.write(setField("part", primer, "name", "something else"));
    expect(await lastOf(c)).toEqual({ status: "refused", reason: "An adviser may only set a field on a plan of its own." });
    const lab = await c.lab();
    expect(lab.plans[0]!.fields["project"]).toBeUndefined();
    expect(lab.parts.find((one) => one.checksum === primer)!.name).toBe("fwd");
  });

  it("a person's filing stands over an adviser's, as everything of a person's does", async () => {
    const { a, c, plan } = await wren();
    const own = plan();
    c.hear(a);
    await c.write(planRun(own));
    a.hear(c);
    // Both file the adviser's own plan, without having heard of each other.
    await c.write(setField("plan", own.plan, "project", "Real Vegan Cheese"));
    await a.write(setField("plan", own.plan, "project", "Bioprinting"));
    a.hear(c);
    expect((await a.lab()).plans[0]!.fields["project"]).toBe("Bioprinting");
  });

});

describe("a plan left over by a refiling", () => {
  /**
   * A lab with a product in it as a part, a plan that would make it, and a plan that would use it.
   * This is the shape every corrected design takes: the molecule is known, so a plan may name it,
   * but whether anything is going to make it depends on which plans are still open.
   */
  async function downstream(): Promise<{ a: Device; product: string; makes: string; uses: string; plan: (more?: Partial<PlanRecord>) => PlanRecord }> {
    const { a, plan } = await wren();
    await a.write(addPart({ sequence: PRODUCT, name: "ligated" }));
    const product = (await a.lab()).parts.find((one) => one.length === PRODUCT.length)!.checksum;
    const makes = plan({ expects: [{ sequence: PRODUCT, circular: false, name: "ligated" }] });
    await a.write(planRun(makes));
    const uses = plan({ kind: "transformation", inputs: [{ part: product, amount: 0, role: "plasmid" }], expects: [] });
    await a.write(planRun(uses));
    return { a, product, makes: makes.plan, uses: uses.plan, plan };
  }
  const openPlan = async (a: Device, id: string): Promise<PlanRecord & { orphaned: string[] }> =>
    (await a.lab()).plans.find((one) => one.plan === id)! as never;

  it("says which molecule it would use that only a plan now set aside would have made", async () => {
    const { a, product, makes, uses } = await downstream();
    // While both plans are open this is the ordinary case, and nothing is flagged.
    expect((await openPlan(a, uses)).orphaned).toEqual([]);
    // Setting the first aside is what breaks the pair: the second still names what it would have
    // made. Neither entry is wrong, so neither is refused, and the one left pointing says so.
    await a.write(settlePlan(makes, null));
    expect((await openPlan(a, uses)).orphaned).toEqual([product]);
    expect((await lastOf(a)).status).toBe("applied");
  });

  it("stops saying it once another open plan would make that molecule again", async () => {
    const { a, product, makes, uses, plan } = await downstream();
    await a.write(settlePlan(makes, null));
    expect((await openPlan(a, uses)).orphaned).toEqual([product]);
    await a.write(planRun(plan({ expects: [{ sequence: PRODUCT, circular: false, name: "ligated" }] })));
    expect((await openPlan(a, uses)).orphaned).toEqual([]);
  });

  it("stops saying it once a tube of that molecule exists, however it got there", async () => {
    const { a, product, makes, uses } = await downstream();
    await a.write(settlePlan(makes, null));
    const tube = newItemId();
    await a.write(addItem({ item: tube, part: product, amount: 5, unit: "µL" }));
    expect((await openPlan(a, uses)).orphaned).toEqual([]);
    // An empty tube is not a tube of it, so retiring the last one brings the warning back.
    await a.write(retireItem(tube));
    expect((await openPlan(a, uses)).orphaned).toEqual([product]);
  });

  it("says nothing about a molecule still to be ordered, which nothing here was ever going to make", async () => {
    const { a, primer, plan } = await wren();
    await a.write(planRun(plan()));
    const open = (await a.lab()).plans[0]!;
    expect(open.inputs.some((one) => one.part === primer)).toBe(true);
    expect(open.orphaned).toEqual([]);
  });

  it("says nothing once it is settled itself, since nobody is going to carry it out", async () => {
    const { a, product, makes, uses } = await downstream();
    await a.write(settlePlan(makes, null));
    expect((await openPlan(a, uses)).orphaned).toEqual([product]);
    await a.write(settlePlan(uses, null));
    expect((await openPlan(a, uses)).orphaned).toEqual([]);
  });

  it("is told apart from a tube that has merely run short, which is what wanting says", async () => {
    const { a, tube, plan } = await wren();
    await a.write(planRun(plan({ inputs: [{ item: tube, amount: 15, role: "template" }] })));
    await a.write(adjustItem(tube, -10));
    const open = (await a.lab()).plans[0]!;
    expect(open.wanting).toEqual([tube]);
    expect(open.orphaned).toEqual([]);
  });
});
