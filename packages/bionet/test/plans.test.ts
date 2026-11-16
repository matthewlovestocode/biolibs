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
         planRun, putItem, recordRun, retireItem, setRole, settlePlan, type LabState, type Operation, type PlanRecord, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const FORWARD = "GGATCACAGTCTACACTG";
const REVERSE = "GGTATACATACTCTGAAG";

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
    ["an input that is both", (p: PlanRecord): void => { p.inputs[0] = { item: p.inputs[0]!.item!, part: p.inputs[1]!.part!, amount: 1, role: "template" }; }, "Each thing it would use has to be a tube or a part, and not both."],
    ["an input that is neither", (p: PlanRecord): void => { p.inputs[0] = { amount: 1, role: "template" }; }, "Each thing it would use has to be a tube or a part, and not both."],
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
      { type: "part.annotate", part, features: [] },
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
