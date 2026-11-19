/**
 * Something the lab understands the makeup of and has not made.
 *
 * The chain of work used to stop at a transformation: what that makes is alive and has no checksum,
 * so a plan after it could name nothing at all and had to be proposed afresh once somebody was
 * holding something. A prospect is how the chain carries on — the mirror of a specimen, which is a
 * tube the lab holds and cannot name.
 *
 * What is checked hardest is that it stays honest. It has no checksum and never gains one; a plan
 * that rests on one says so; and it cannot travel in a method, because telling another lab to use a
 * thing nobody has made is a wish and not a method.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addProspect, addStrain, addToRoster, foundLab, mergeLog, newItemId, newPlanId,
         newProspectId, newRunId, newStrainId, nextEntry, planRun, publicMethod, realiseProspect, recordRun, setField,
         type LabState, type Operation, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";

let ada: SigningKey;
let bob: SigningKey;
beforeAll(async () => { [ada, bob] = await Promise.all([generateSigningKey(), generateSigningKey()]); });

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

/** A lab with a construct in a tube, which a transformation would put into a host. */
async function wren(): Promise<{ a: Device; b: Device; tube: string; part: string }> {
  const a = new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);
  await a.write(addToRoster(bob.publicKey, "Bob"));
  await a.write(addPart({ sequence: TEMPLATE, name: "pWren1" }));
  const part = (await a.lab()).parts[0]!.checksum;
  const tube = newItemId();
  await a.write(addItem({ item: tube, part, amount: 20, unit: "µL" }));
  return { a, b: new Device(bob, a.held), tube, part };
}

const said = (lab: LabState): { status: string; reason: string | null } => {
  const last = lab.entries.at(-1)!;
  return { status: last.status, reason: last.reason };
};
const strainCarrying = (more: Record<string, unknown> = {}) => ({
  prospect: newProspectId(), name: "GS115 carrying pWren1", kind: "strain",
  madeOf: "GS115, with pWren1 integrated at AOX1", note: null, ...more,
});

describe("a prospect", () => {
  it("names something nobody has made, and makes no tube and no part", async () => {
    const { a } = await wren();
    const before = await a.lab();
    const one = strainCarrying();
    await a.write(addProspect(one));
    const lab = await a.lab();
    expect(said(lab)).toEqual({ status: "applied", reason: null });
    expect(lab.prospects).toHaveLength(1);
    expect(lab.prospects[0]).toMatchObject({ name: "GS115 carrying pWren1", kind: "strain", became: null, by: ada.publicKey });
    expect(lab.items).toHaveLength(before.items.length);
    expect(lab.parts).toHaveLength(before.parts.length);
  });

  it("has no checksum, and nothing gives it one", async () => {
    const { a } = await wren();
    await a.write(addProspect(strainCarrying()));
    const only = (await a.lab()).prospects[0]!;
    // A part is known by the checksum of its sequence. This has no sequence, so it is known by an
    // ID, the way a strain and a specimen are, and that is the whole point of it.
    expect("checksum" in only).toBe(false);
    expect("sequence" in only).toBe(false);
  });

  it("lets a plan after a transformation name what it would use", async () => {
    const { a, tube } = await wren();
    const one = strainCarrying();
    await a.write(addProspect(one));

    // The transformation says what it would bring into existence, which has no sequence to expect.
    const putting = newPlanId();
    await a.write(planRun({ plan: putting, kind: "transformation", instrument: null,
                            inputs: [{ item: tube, amount: 1, role: "construct" }],
                            expects: [], makes: [one.prospect], settings: {}, note: null }));
    expect(said(await a.lab()).status).toBe("applied");

    // And the induction after it names that thing, instead of naming nothing at all.
    const inducing = newPlanId();
    await a.write(planRun({ plan: inducing, kind: "induction", instrument: null,
                            inputs: [{ prospect: one.prospect, amount: 0, role: "culture" }],
                            expects: [], settings: {}, note: null }));
    const lab = await a.lab();
    expect(said(lab).status).toBe("applied");
    expect(lab.plans.find((plan) => plan.plan === putting)?.makes).toEqual([one.prospect]);
    expect(lab.plans.find((plan) => plan.plan === inducing)?.inputs[0]).toMatchObject({ prospect: one.prospect, role: "culture" });
  });

  it("is refused where a plan names one the lab does not have", async () => {
    const { a, tube } = await wren();
    await a.write(planRun({ plan: newPlanId(), kind: "induction", instrument: null,
                            inputs: [{ prospect: "nosuchprospect", amount: 0, role: "culture" }],
                            expects: [], settings: {}, note: null }));
    expect(said(await a.lab()).reason).toBe("A prospect it would use is not one the lab has.");
    await a.write(planRun({ plan: newPlanId(), kind: "transformation", instrument: null,
                            inputs: [{ item: tube, amount: 1, role: "construct" }],
                            expects: [], makes: ["nosuchprospect"], settings: {}, note: null }));
    expect(said(await a.lab()).reason).toBe("Something it would bring into existence is not a prospect the lab has.");
  });

  it("refuses an input that is two things at once", async () => {
    const { a, tube, part } = await wren();
    const one = strainCarrying();
    await a.write(addProspect(one));
    await a.write(planRun({ plan: newPlanId(), kind: "induction", instrument: null,
                            inputs: [{ item: tube, prospect: one.prospect, amount: 1, role: "culture" }],
                            expects: [], settings: {}, note: null }));
    expect(said(await a.lab()).reason).toBe("Each thing it would use has to be a tube, a part or a prospect, and only one of those.");
    expect(part).not.toBe("");
  });

  it("becomes a strain once somebody has made it, and says who said so", async () => {
    const { a, part } = await wren();
    const one = strainCarrying();
    await a.write(addProspect(one));
    const made = newStrainId();
    await a.write(addStrain({ strain: made, name: "GS115 pWren1-1", host: "Komagataella phaffii GS115",
                              carries: [part], parent: null, from: null }));
    await a.write(realiseProspect(one.prospect, { strain: made }));
    const lab = await a.lab();
    expect(said(lab)).toEqual({ status: "applied", reason: null });
    expect(lab.prospects[0]!.became).toMatchObject({ strain: made, item: null, by: ada.publicKey });
  });

  it("is refused where what it became is not something the lab has", async () => {
    const { a } = await wren();
    const one = strainCarrying();
    await a.write(addProspect(one));
    await a.write(realiseProspect(one.prospect, { strain: "nosuchstrain" }));
    expect(said(await a.lab()).reason).toBe("The strain it says the prospect became is not one the lab has.");
    await a.write(realiseProspect(one.prospect, {}));
    expect(said(await a.lab()).reason).toBe("A prospect becomes a strain or an item, and only one of those.");
  });

  it("settles two people making it at once the way every other register does", async () => {
    const { a, b, part } = await wren();
    const one = strainCarrying();
    await a.write(addProspect(one));
    const mine = newStrainId(), theirs = newStrainId();
    await a.write(addStrain({ strain: mine, name: "mine", host: "GS115", carries: [part], parent: null, from: null }));
    b.hear(a);
    await b.write(addStrain({ strain: theirs, name: "theirs", host: "GS115", carries: [part], parent: null, from: null }));
    await a.write(realiseProspect(one.prospect, { strain: mine }));
    await b.write(realiseProspect(one.prospect, { strain: theirs }));
    a.hear(b);
    b.hear(a);
    const lab = await a.lab();
    // One of them stands, and both devices read the same one.
    expect([mine, theirs]).toContain(lab.prospects[0]!.became?.strain);
    expect((await b.lab()).prospects[0]!.became?.strain).toBe(lab.prospects[0]!.became?.strain);
  });

  it("takes a field of its own, and refuses one of its own names", async () => {
    const { a } = await wren();
    const one = strainCarrying();
    await a.write(addProspect(one));
    await a.write(setField("prospect", one.prospect, "project", "Real Vegan Cheese"));
    expect((await a.lab()).prospects[0]!.fields["project"]).toBe("Real Vegan Cheese");
    await a.write(setField("prospect", one.prospect, "madeOf", "something else"));
    expect(said(await a.lab()).reason).toBe("It does not name a field that can be set.");
  });

  it("is not understood by a version that does not know the field", async () => {
    const { a } = await wren();
    await a.write({ ...addProspect(strainCarrying()), likelihood: "high" });
    expect(said(await a.lab()).status).toBe("not understood");
    expect((await a.lab()).prospects).toHaveLength(0);
  });
});

describe("a method", () => {
  it("will not carry a prospect, because a thing nobody has made is a wish and not a method", async () => {
    const { a, tube } = await wren();
    const one = strainCarrying();
    await a.write(addProspect(one));
    const putting = newPlanId();
    await a.write(planRun({ plan: putting, kind: "transformation", instrument: null,
                            inputs: [{ item: tube, amount: 1, role: "construct" }],
                            expects: [], makes: [one.prospect], settings: {}, note: null }));
    await a.write(planRun({ plan: newPlanId(), kind: "induction", instrument: null,
                            inputs: [{ prospect: one.prospect, amount: 0, role: "culture" }],
                            expects: [], settings: {}, note: null }));

    const method = publicMethod(await a.lab(), { name: "The Wren Lab", origin: "", contact: null, note: null }, {});
    const induction = method.steps.find((step) => step.kind === "induction")!;
    const used = induction.uses[0]!;
    expect(used.part).toBeNull();
    expect(used.name).toContain("had not made");
    expect(used.name).toContain("strain");
    // The lab's own name for it does not travel either: "GS115 carrying pWren1" is this lab talking
    // to itself about something that does not exist.
    expect(JSON.stringify(method)).not.toContain("GS115 carrying pWren1");
  });
});
