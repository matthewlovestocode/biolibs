/**
 * What to do about an answer, written down before the answer arrives.
 *
 * A plan could say what it expected and nothing could say what either answer led to. The lab filed
 * thirteen predictions about protein gels and had nowhere to put the thing that makes a prediction
 * worth making: if the band comes back at the cut size, this is the step that answers it.
 *
 * What is checked hardest is that it stays a statement and never becomes an act. Nothing here
 * carries a plan out, settles one, or decides on anybody's behalf. The lab works out that a plan is
 * now the one to do, or that it no longer applies, and a person still does it and says so.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addToRoster, expectLeadsTo, expectOf, foundLab, meetExpectation, mergeLog,
         newExpectationId, newItemId, newPlanId, nextEntry, planRun, settlePlan, withdrawExpectation,
         type LabState, type Operation, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";

let ada: SigningKey;
let bob: SigningKey;
let claude: SigningKey;
beforeAll(async () => { [ada, bob, claude] = await Promise.all([generateSigningKey(), generateSigningKey(), generateSigningKey()]); });

class Device {
  held: SignedEntry[] = [];
  constructor(readonly key: SigningKey) {}
  async write(op: Operation): Promise<SignedEntry> {
    const entry = await nextEntry(await mergeLog(this.held), this.key, op);
    this.held.push(entry);
    return entry;
  }
  lab(): Promise<LabState> { return mergeLog(this.held); }
}

const said = (lab: LabState): { status: string; reason: string | null } => {
  const last = lab.entries.at(-1)!;
  return { status: last.status, reason: last.reason };
};

/**
 * A lab with a step that grows something, an expectation about the gel it would give, and a second
 * step that is only worth doing if that gel comes back wrong.
 */
async function wren(): Promise<{ a: Device; growing: string; reading: string; answer: string }> {
  const a = new Device(ada);
  a.held.push(await foundLab(ada, { name: "The Wren Lab", person: "Ada" }));
  await a.write(addToRoster(bob.publicKey, "Bob"));
  await a.write(addPart({ sequence: TEMPLATE, name: "pWren1" }));
  const part = (await a.lab()).parts[0]!.checksum;
  const tube = newItemId();
  await a.write(addItem({ item: tube, part, amount: 20, unit: "µL" }));

  const growing = newPlanId();
  await a.write(planRun({ plan: growing, kind: "induction", instrument: null,
                          inputs: [{ item: tube, amount: 1, role: "culture" }],
                          expects: [], settings: {}, note: "Grow it and look for the protein." }));
  const reading = newExpectationId();
  await a.write(expectOf({ expect: reading, plan: growing, kind: "protein gel",
                           says: "Intact at 24,320 Da. A pair at 15,800 and 8,600 is the cell having cut it.",
                           numbers: [24_320, 15_800, 8_600], settings: {}, note: null }));
  // The step that answers a bad gel: a host whose own protease has been taken out.
  const answer = newPlanId();
  await a.write(planRun({ plan: answer, kind: "transformation", instrument: null,
                          inputs: [{ part, amount: 1, role: "plasmid" }],
                          expects: [], settings: {}, note: "Into a host with the protease taken out." }));
  return { a, growing, reading, answer };
}

describe("a plan that follows a reading", () => {
  it("waits while nobody has looked", async () => {
    const { a, reading, answer } = await wren();
    await a.write(expectLeadsTo(reading, false, answer, "The gel showing it cut is what this answers."));
    const lab = await a.lab();
    expect(said(lab)).toEqual({ status: "applied", reason: null });
    const plan = lab.plans.find((one) => one.plan === answer)!;
    expect(plan.follows).toMatchObject({ expect: reading, met: false, standing: "waiting", by: ada.publicKey });
    expect(plan.follows!.why).toContain("cut");
  });

  it("becomes the thing to do when the reading comes out its way", async () => {
    const { a, reading, answer } = await wren();
    await a.write(expectLeadsTo(reading, false, answer, "The answer to a cut protein."));
    // The gel is read, and it is not what was hoped.
    await a.write(meetExpectation(reading, false, [15_800, 8_600], { note: "Two bands, no intact." }));
    const lab = await a.lab();
    expect(lab.plans.find((one) => one.plan === answer)!.follows!.standing).toBe("live");
    // And nothing has been carried out on its own: it is still an open proposal for a person to do.
    expect(lab.plans.find((one) => one.plan === answer)!.settled).toBeNull();
    expect(lab.runs).toHaveLength(0);
  });

  it("no longer applies when the reading comes out the other way", async () => {
    const { a, reading, answer } = await wren();
    await a.write(expectLeadsTo(reading, false, answer, "The answer to a cut protein."));
    await a.write(meetExpectation(reading, true, [24_320], { note: "One band, intact." }));
    const plan = (await a.lab()).plans.find((one) => one.plan === answer)!;
    expect(plan.follows!.standing).toBe("moot");
    // Moot is not set aside. Nothing here settles a plan, and the record keeps what was thought of.
    expect(plan.settled).toBeNull();
  });

  it("follows the answer back if the reading is read again the other way", async () => {
    const { a, reading, answer } = await wren();
    await a.write(expectLeadsTo(reading, true, answer, "Only worth doing if it came out whole."));
    await a.write(meetExpectation(reading, false, [15_800, 8_600]));
    expect((await a.lab()).plans.find((one) => one.plan === answer)!.follows!.standing).toBe("moot");
    // A withdrawal cannot undo a reading, but a plan's standing is worked out and never written
    // down, so it can only ever say what the readings now say.
    await a.write(withdrawExpectation(reading, "written on the wrong step"));
    expect(said(await a.lab()).reason).toBe("What was seen of that expectation is recorded, so it cannot be taken back.");
    expect((await a.lab()).plans.find((one) => one.plan === answer)!.follows!.standing).toBe("moot");
  });

  it("is refused where it does not name a reading and a plan the lab has", async () => {
    const { a, reading, answer } = await wren();
    await a.write(expectLeadsTo("nosuchexpectation", false, answer, "why"));
    expect(said(await a.lab()).reason).toBe("The expectation whose answer it follows is not one the lab has.");
    await a.write(expectLeadsTo(reading, false, "nosuchplan", "why"));
    expect(said(await a.lab()).reason).toBe("The plan it would have carried out is not one the lab has.");
    await a.write({ ...expectLeadsTo(reading, false, answer, "why"), met: "no" });
    expect(said(await a.lab()).reason).toBe("It does not say which answer the plan follows.");
    await a.write(expectLeadsTo(reading, false, answer, ""));
    expect(said(await a.lab()).reason).toBe("It does not say what makes that plan the answer.");
  });

  it("refuses a plan that would follow a reading of its own result", async () => {
    const { a, growing, reading } = await wren();
    // Waiting on a reading nobody can take until it has been carried out, which is the thing it is
    // waiting to be told to do.
    await a.write(expectLeadsTo(reading, false, growing, "do it again"));
    expect(said(await a.lab()).reason).toBe("A plan does not follow a reading of its own result.");
  });

  it("refuses a second reading for the same plan, rather than guess what was meant", async () => {
    const { a, reading, answer } = await wren();
    await a.write(expectLeadsTo(reading, false, answer, "the answer to a cut protein"));
    const other = newExpectationId();
    await a.write(expectOf({ expect: other, plan: (await a.lab()).plans[0]!.plan, kind: "colony pcr",
                             says: "a band at 900", numbers: [900], settings: {}, note: null }));
    await a.write(expectLeadsTo(other, false, answer, "and the answer to that too"));
    // Two would have to mean "when both" or "when either", and no reader could tell which.
    expect(said(await a.lab()).reason).toBe("That plan already follows a reading.");
    expect((await a.lab()).plans.find((one) => one.plan === answer)!.follows!.expect).toBe(reading);
  });

  it("lets an adviser say it about a plan of its own, and no other", async () => {
    const { a, reading, answer } = await wren();
    await a.write(addToRoster(claude.publicKey, "Claude", "adviser"));
    const adviser = new Device(claude);
    adviser.held = [...a.held];
    const asAdviser = async (op: Operation): Promise<void> => {
      adviser.held.push(await nextEntry(await mergeLog(adviser.held), claude, op, true));
    };
    // Ada's plan is not the adviser's to attach a contingency to.
    await asAdviser(expectLeadsTo(reading, false, answer, "mine to say"));
    expect(said(await adviser.lab()).reason).toBe("An adviser may only say that about a plan of its own.");
    // Its own proposal is. Saying what to do about a reading is reading and working out, which is
    // all an adviser does: it still takes a person to carry the plan out.
    const mine = newPlanId();
    const part = (await adviser.lab()).parts[0]!.checksum;
    await asAdviser(planRun({ plan: mine, kind: "transformation", instrument: null,
                              inputs: [{ part, amount: 1, role: "plasmid" }],
                              expects: [], settings: {}, note: "Worth trying if the gel is bad." }));
    await asAdviser(expectLeadsTo(reading, false, mine, "this is what I would do about it"));
    const lab = await adviser.lab();
    expect(said(lab)).toEqual({ status: "applied", reason: null });
    expect(lab.plans.find((one) => one.plan === mine)!.follows).toMatchObject({ standing: "waiting", by: claude.publicKey });
  });
});

describe("a version that does not know about conditionals", () => {
  it("turns the change down on its own and reads everything else", async () => {
    const { a, reading, answer } = await wren();
    await a.write(expectLeadsTo(reading, false, answer, "the answer to a cut protein"));
    // A reader from before this existed sees a type it does not know. It is one entry, so it is the
    // one entry turned down: the plan, the expectation and the reading are all still read. That is
    // why this is a change of its own and not a field on the plan — a field would have made the
    // whole plan unreadable, and a plan read without its condition would be worse still: a
    // contingency would look like a step somebody meant to do.
    const older = a.held.map((one) => one);
    const lab = await mergeLog(older);
    expect(lab.plans).toHaveLength(2);
    expect(lab.expectations).toHaveLength(1);
    // And this version does know it, so the entry stands.
    expect(said(lab).status).toBe("applied");
  });

  it("turns down a type it has never heard of, and keeps reading", async () => {
    // The mechanism the paragraph above depends on, shown rather than assumed. A reader from
    // before expect.leads existed is this reader without "expect.leads" in what it knows, and what
    // it does with an unknown type is what it would do with that one.
    const { a, reading, answer } = await wren();
    await a.write({ type: "expect.leadsToSomethingLater", expect: reading, met: false, plan: answer, why: "from the future" });
    const lab = await a.lab();
    expect(said(lab).status).toBe("not understood");
    // Everything written before it is still read, and the plan is untouched by what it could not read.
    expect(lab.plans).toHaveLength(2);
    expect(lab.expectations).toHaveLength(1);
    expect(lab.plans.find((one) => one.plan === answer)!.follows).toBeNull();
    // And the log carries on: the next entry is read as normal.
    await a.write(expectLeadsTo(reading, false, answer, "written by a reader that does know it"));
    expect(said(await a.lab()).status).toBe("applied");
  });

  it("is not understood where it carries a field this version does not know", async () => {
    const { a, reading, answer } = await wren();
    await a.write({ ...expectLeadsTo(reading, false, answer, "why"), urgency: "high" });
    expect(said(await a.lab()).status).toBe("not understood");
    expect((await a.lab()).plans.find((one) => one.plan === answer)!.follows).toBeNull();
  });

  it("leaves a plan that follows nothing exactly as it was", async () => {
    const { a, answer } = await wren();
    const plan = (await a.lab()).plans.find((one) => one.plan === answer)!;
    expect(plan.follows).toBeNull();
    // Which is what every plan written before this existed looks like.
    expect(plan.settled).toBeNull();
  });
});

describe("a conditional and the rest of the record", () => {
  it("does not make a plan adrift, and is not confused by one that is", async () => {
    const { a, growing, reading, answer } = await wren();
    await a.write(expectLeadsTo(reading, false, answer, "the answer to a cut protein"));
    // Setting aside the step the reading is about strands the reading itself.
    await a.write(settlePlan(growing, null));
    const lab = await a.lab();
    expect(lab.expectations[0]!.adrift).toBe(true);
    // The plan that followed it is still waiting, which is honest: nobody has read anything, and
    // now nobody will. Saying it was moot would claim an answer that was never given.
    expect(lab.plans.find((one) => one.plan === answer)!.follows!.standing).toBe("waiting");
  });
});
