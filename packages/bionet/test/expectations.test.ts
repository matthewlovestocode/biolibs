/**
 * What a lab expects to see of a plan, and what was seen.
 *
 * A plan says what it would make. An expectation says what somebody would *observe* if it worked —
 * the bands a check digest should show, the size a colony PCR should give. The two are different
 * claims, and what is checked hardest here is that they stay apart: an expectation changes nothing
 * the lab holds, it cannot be written about a plan the lab does not have, and saying what was seen
 * is something only somebody with hands may do. An adviser may say what to look for and may not say
 * what was there.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addToRoster, entryId, expectOf, foundLab, meetExpectation, mergeLog, newExpectationId, newItemId,
         newPlanId, newRunId, nextEntry, planRun, recordRun, setField, settlePlan, type LabState, type Operation,
         type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";

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

/** A lab with a tube, a plan to do a PCR with it, and an adviser looking on. */
async function wren(): Promise<{ a: Device; b: Device; c: Device; tube: string; plan: string }> {
  const a = new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);
  await a.write(addToRoster(bob.publicKey, "Bob"));
  await a.write(addToRoster(claude.publicKey, "Claude", "adviser"));
  await a.write(addPart({ sequence: TEMPLATE, name: "template" }));
  const tube = newItemId();
  await a.write(addItem({ item: tube, part: (await a.lab()).parts[0]!.checksum, amount: 20, unit: "µL" }));
  const plan = newPlanId();
  await a.write(planRun({ plan, kind: "pcr", instrument: null, inputs: [{ item: tube, amount: 1, role: "template" }],
                          expects: [{ sequence: TEMPLATE.slice(0, 40), circular: false, name: "amplicon" }],
                          settings: {}, note: null }));
  return { a, b: new Device(bob, a.held), c: new Device(claude, a.held), tube, plan };
}

const said = (lab: LabState): { status: string; reason: string | null } => {
  const last = lab.entries.at(-1)!;
  return { status: last.status, reason: last.reason };
};
const only = (lab: LabState) => lab.expectations[0]!;

/** An expectation about the plan, with whatever is given changed. */
const about = (plan: string, more: Record<string, unknown> = {}) => ({
  expect: newExpectationId(), plan, kind: "digest", says: "two bands, at 4,757 and 614 bases",
  numbers: [4757, 614], settings: { cut_with: "XhoI and AvrII", gel: "1.5" }, note: null, ...more,
});

describe("an expectation", () => {
  it("is kept, and changes nothing the lab holds", async () => {
    const { a, plan } = await wren();
    const before = await a.lab();
    await a.write(expectOf(about(plan)));
    const lab = await a.lab();
    expect(said(lab)).toEqual({ status: "applied", reason: null });
    expect(lab.expectations).toHaveLength(1);
    expect(only(lab)).toMatchObject({ plan, kind: "digest", numbers: [4757, 614], met: null, by: ada.publicKey });
    // Nothing else moved: an expectation is a thing to look for, not a thing done.
    expect(lab.items.map((one) => one.amount)).toEqual(before.items.map((one) => one.amount));
    expect(lab.parts).toHaveLength(before.parts.length);
    expect(lab.runs).toHaveLength(before.runs.length);
  });

  it("is refused where it is about a plan the lab does not have", async () => {
    const { a } = await wren();
    await a.write(expectOf(about("nosuchplan")));
    expect(said(await a.lab())).toEqual({ status: "refused", reason: "The plan it is about is not one the lab has." });
    expect((await a.lab()).expectations).toHaveLength(0);
  });

  it("takes only whole readings, so that two devices sign the same document", async () => {
    const { a, plan } = await wren();
    // A fraction never becomes an entry at all: the log refuses to sign one, because two devices
    // that round differently would otherwise put their names to different documents. So a band at
    // 4,757.5 bases is written in the words, where a person reads it, and not in the numbers.
    await expect(a.write(expectOf(about(plan, { numbers: [4757.5] })))).rejects.toThrow(/only whole numbers/);
    // A negative reading is signable and meaningless, so it is refused where the lab is worked out.
    await a.write(expectOf(about(plan, { numbers: [-10] })));
    expect(said(await a.lab()).reason).toBe("Its readings are not whole numbers that are not negative.");
    expect((await a.lab()).expectations).toHaveLength(0);
  });

  it("may carry no readings at all, for something there is nothing to count about", async () => {
    const { a, plan } = await wren();
    await a.write(expectOf(about(plan, { kind: "plate", says: "colonies, and none on the no-DNA plate", numbers: [] })));
    expect(said(await a.lab()).status).toBe("applied");
    expect(only(await a.lab()).numbers).toEqual([]);
  });

  it("is not understood by a version that does not know the field", async () => {
    const { a, plan } = await wren();
    await a.write({ ...expectOf(about(plan)), confidence: "high" });
    expect(said(await a.lab()).status).toBe("not understood");
    expect((await a.lab()).expectations).toHaveLength(0);
  });
});

describe("saying what was seen", () => {
  it("records the reading and whether it was what was expected", async () => {
    const { a, plan } = await wren();
    const one = about(plan);
    await a.write(expectOf(one));
    await a.write(meetExpectation(one.expect, true, [4757, 611], { note: "the small band ran a little fast" }));
    expect(said(await a.lab())).toEqual({ status: "applied", reason: null });
    expect(only(await a.lab()).met).toMatchObject({ met: true, saw: [4757, 611], run: null, by: ada.publicKey,
                                                    note: "the small band ran a little fast" });
  });

  it("records a reading that was not what was expected, which is a result and not a failure", async () => {
    const { a, plan } = await wren();
    const one = about(plan);
    await a.write(expectOf(one));
    await a.write(meetExpectation(one.expect, false, [9851], { note: "one band; it did not cut" }));
    const lab = await a.lab();
    expect(said(lab).status).toBe("applied");
    expect(only(lab).met).toMatchObject({ met: false, saw: [9851] });
  });

  it("can point at the run it was seen in", async () => {
    const { a, tube, plan } = await wren();
    const run = newRunId();
    await a.write(recordRun({ run, kind: "digest", instrument: null, inputs: [{ item: tube, amount: 1, role: "plasmid" }],
                              outputs: [], settings: {}, outcome: "worked", note: null }));
    const one = about(plan);
    await a.write(expectOf(one));
    await a.write(meetExpectation(one.expect, true, [4757, 614], { run }));
    expect(only(await a.lab()).met?.run).toBe(run);
    await a.write(meetExpectation(one.expect, true, [], { run: "nosuchrun" }));
    expect(said(await a.lab()).reason).toBe("The run it says this was seen in is not one the lab has.");
  });

  it("is refused a second time by somebody who already knew of the first", async () => {
    const { a, plan } = await wren();
    const one = about(plan);
    await a.write(expectOf(one));
    await a.write(meetExpectation(one.expect, true, [4757, 614]));
    await a.write(meetExpectation(one.expect, false, [9851]));
    expect(said(await a.lab()).reason).toBe("What was seen of that expectation is already recorded.");
    expect(only(await a.lab()).met?.met).toBe(true);
  });

  it("shows the overlap where two people read the same gel without knowing of each other", async () => {
    const { a, b, plan } = await wren();
    const one = about(plan);
    await a.write(expectOf(one));
    b.hear(a);
    const mine = await a.write(meetExpectation(one.expect, true, [4757, 614]));
    const theirs = await b.write(meetExpectation(one.expect, false, [9851]));
    a.hear(b);
    const lab = await a.lab();
    // One stands, by the lower entry ID as everywhere else, and the disagreement is shown rather
    // than hidden: two people reading one gel differently is worth somebody looking at.
    const [mineId, theirsId] = await Promise.all([entryId(mine.entry), entryId(theirs.entry)]);
    expect(only(lab).met?.entry).toBe(mineId < theirsId ? mineId : theirsId);
    expect(lab.overlaps.some((over) => over.what.startsWith("what was seen of expectation"))).toBe(true);
  });

  it("is refused where it answers an expectation the lab does not have", async () => {
    const { a } = await wren();
    await a.write(meetExpectation("nosuchexpectation", true));
    expect(said(await a.lab()).reason).toBe("The expectation it answers is not one the lab has.");
  });

  it("stands whatever becomes of the plan, because what was seen was seen", async () => {
    const { a, plan } = await wren();
    const one = about(plan);
    await a.write(expectOf(one));
    await a.write(meetExpectation(one.expect, true, [4757, 614]));
    await a.write(settlePlan(plan, null));
    expect(only(await a.lab()).met?.met).toBe(true);
  });
});

describe("an adviser", () => {
  it("may say what to look for, which is reading and working out", async () => {
    const { a, c, plan } = await wren();
    c.hear(a);
    await c.write(expectOf(about(plan, { says: "a band at 614, and nothing at 36" })));
    expect(said(await c.lab())).toEqual({ status: "applied", reason: null });
    expect(only(await c.lab()).by).toBe(claude.publicKey);
  });

  it("may not say what was seen, because nothing with no hands was there", async () => {
    const { a, c, plan } = await wren();
    c.hear(a);
    const one = about(plan);
    await c.write(expectOf(one));
    await c.write(meetExpectation(one.expect, true, [4757, 614]));
    expect(said(await c.lab()).status).toBe("refused");
    expect(said(await c.lab()).reason).toContain("adviser");
    expect(only(await c.lab()).met).toBeNull();
  });
});

describe("filing an expectation", () => {
  it("takes a field of its own, and refuses one of its own names", async () => {
    const { a, plan } = await wren();
    const one = about(plan);
    await a.write(expectOf(one));
    await a.write(setField("expectation", one.expect, "project", "Real Vegan Cheese"));
    expect(only(await a.lab()).fields["project"]).toBe("Real Vegan Cheese");
    await a.write(setField("expectation", one.expect, "numbers", "something else"));
    expect(said(await a.lab()).reason).toBe("It does not name a field that can be set.");
  });
});
