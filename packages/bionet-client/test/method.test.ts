/**
 * One lab publishing its plan, and another carrying it out.
 *
 * This is the test the whole idea rests on, and it is written as two labs that share nothing: two
 * keys, two stores, two lab IDs, no peer between them. The only thing that crosses is a document.
 * If the second lab ends up with the same steps in the same order, naming its own tubes, then a
 * method travels; if it does not, publishing one was decorative.
 */
import { Lab, memoryKeys, memoryStore } from "@biolibs/bionet-client";
import { readMethod, verifyMethod, type LabModel, type SignedMethod } from "@biolibs/bionet";
import { describe, expect, it } from "vitest";

const WREN: LabModel = { name: "The Wren Lab", origin: "https://wrenlab.example", contact: null, note: null };
const INSERT = "ACGTACGTAACCGGTTACGTACGTAACCGGTTACGTACGTAA";
const VECTOR = "TTGGCCAATTGGCCAATTGGCCAATTGGCCAATTGGCCAATT";
const RING = INSERT + VECTOR;

/** A lab with nothing in it, on its own key and its own store. */
const open = async (person: string, name: string): Promise<Lab> => {
  const lab = await new Lab({ store: memoryStore(), keys: memoryKeys(), adviserKeys: memoryKeys() }).open();
  await lab.setPerson(person);
  await lab.found({ name, furnish: false });
  return lab;
};

/** The Wren Lab, partway through building a construct: two things to copy, then a ring to build. */
async function building(): Promise<Lab> {
  const lab = await open("Ada", "The Wren Lab");
  const seen = () => lab.snapshot().lab!;
  await lab.addPart({ name: "pGene", sequence: `${INSERT}GGGGGGG` });
  await lab.addPart({ name: "pBackbone", sequence: `${VECTOR}CCCCCCC` });
  const [gene, backbone] = seen().parts.map((one) => one.checksum) as [string, string];
  const geneTube = await lab.addItem({ part: gene, amount: 30, unit: "µL" });
  const backboneTube = await lab.addItem({ part: backbone, amount: 30, unit: "µL" });
  // What the two copies would make has to be a part before a later step can name it.
  await lab.addPart({ name: "the insert", sequence: INSERT });
  await lab.addPart({ name: "the vector", sequence: VECTOR });
  const insert = seen().parts.find((one) => one.name === "the insert")!.checksum;
  const vector = seen().parts.find((one) => one.name === "the vector")!.checksum;

  const first = await lab.planRun({ kind: "pcr", inputs: [{ item: geneTube, amount: 1, role: "template" }],
                                    expects: [{ sequence: INSERT, name: "the insert" }], note: "Amplify the casein insert." });
  const second = await lab.planRun({ kind: "pcr", inputs: [{ item: backboneTube, amount: 1, role: "template" }],
                                     expects: [{ sequence: VECTOR, name: "the vector" }], note: "Amplify the backbone." });
  const third = await lab.planRun({ kind: "assembly",
                                    inputs: [{ part: insert, amount: 1, role: "piece" }, { part: vector, amount: 1, role: "piece" }],
                                    expects: [{ sequence: RING, circular: true, name: "pWren-CSN2" }], note: "Join them." });
  for (const { plan } of [first, second, third]) await lab.setField({ on: "plan", id: plan, field: "project", value: "Real Vegan Cheese" });
  return lab;
}

describe("publishing a plan as a method", () => {
  it("names every tube by what is in it, since a tube's ID means nothing elsewhere", async () => {
    const wren = await building();
    const published = await wren.publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    const { method } = published;
    expect(method.name).toBe("Real Vegan Cheese");
    expect(method.lab.name).toBe("The Wren Lab");
    expect(method.steps).toHaveLength(3);
    // Not one item ID anywhere in it: that is the whole of what makes it travel.
    const asText = JSON.stringify(method);
    for (const item of wren.snapshot().lab!.items) expect(asText).not.toContain(item.item);
    for (const step of method.steps) for (const used of step.uses) expect(used.part).toMatch(/seguid=/);
  });

  it("puts the steps in an order that can be carried out, and says what follows what", async () => {
    const { method } = await (await building()).publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    expect(method.steps.map((one) => [one.step, one.kind])).toEqual([[1, "pcr"], [2, "pcr"], [3, "assembly"]]);
    expect(method.steps[2]!.after).toEqual([1, 2]);
    // And each thing the third step uses points at the step that makes it.
    expect(method.steps[2]!.uses.map((one) => one.from)).toEqual([1, 2]);
    expect(method.steps[0]!.after).toEqual([]);
  });

  it("says what has to be had before it starts, and what following it leaves you with", async () => {
    const { method } = await (await building()).publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    expect(method.needs.map((one) => one.name).sort()).toEqual(["pBackbone", "pGene"]);
    // By checksum, which is what whoHas searches on, so a lab without one can go and find it.
    for (const need of method.needs) expect(need.part).toMatch(/seguid=/);
    expect(method.makes.map((one) => one.name)).toEqual(["pWren-CSN2"]);
  });

  it("writes the starting sequences out unless the lab says not to", async () => {
    const wren = await building();
    const open = await wren.publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    expect(open.method.needs.every((one) => typeof one.sequence === "string")).toBe(true);
    const closed = await wren.publishMethod({ lab: WREN, project: "Real Vegan Cheese", sequences: false });
    expect(closed.method.needs.every((one) => one.sequence === undefined)).toBe(true);
    // What the steps make is written out either way: a later step has to be able to name it.
    for (const step of closed.method.steps) for (const made of step.makes) expect(typeof made.sequence).toBe("string");
  });

  it("is signed, and reads back as what was signed", async () => {
    const published = await (await building()).publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    expect((await verifyMethod(published)).every((one) => one.ok)).toBe(true);
    const crossed = readMethod(JSON.stringify(published));
    expect(crossed.method).toEqual(published.method);
    // And a method somebody has edited no longer verifies.
    const tampered: SignedMethod = { ...published, method: { ...published.method, name: "Something else" } };
    expect((await verifyMethod(tampered)).every((one) => one.ok)).toBe(false);
  });

  it("refuses what is not a method, saying what is wrong", async () => {
    expect(() => readMethod("not json")).toThrow(/not JSON/);
    expect(() => readMethod({ method: {}, signatures: [] })).toThrow(/version/);
    const published = await (await building()).publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    const outOfOrder = { ...published, method: { ...published.method, steps: [...published.method.steps].reverse() } };
    expect(() => readMethod(outOfOrder)).toThrow(/not numbered from 1 in order/);
    const backwards = { ...published, method: { ...published.method,
      steps: published.method.steps.map((one) => (one.step === 1 ? { ...one, after: [3] } : one)) } };
    expect(() => readMethod(backwards)).toThrow(/not a step before it/);
  });

  it("will not publish what is not there", async () => {
    const empty = await open("Bob", "Another Lab");
    await expect(empty.publishMethod({ lab: WREN })).rejects.toThrow(/no open plans to publish/);
  });
});

describe("another lab taking the method", () => {
  /** The Finch Lab: a different key, a different store, a different lab, and nothing shared. */
  const finch = async (): Promise<Lab> => open("Bob", "The Finch Lab");

  it("proposes every step here, naming this lab's own tubes", async () => {
    const wren = await building();
    const published = await wren.publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    const lab = await finch();
    // The Finch Lab has the same two starting molecules, under its own names and in its own tubes.
    await lab.addPart({ name: "our gene plasmid", sequence: `${INSERT}GGGGGGG` });
    await lab.addPart({ name: "our backbone", sequence: `${VECTOR}CCCCCCC` });
    const ours = lab.snapshot().lab!.parts;
    for (const part of ours) await lab.addItem({ part: part.checksum, amount: 50, unit: "µL" });

    const taken = await lab.takeMethod({ method: JSON.stringify(published), project: "Cheese, ours" });
    expect(taken.proposed).toHaveLength(3);
    expect(taken.missing).toEqual([]);

    const seen = lab.snapshot().lab!;
    const plans = seen.plans.filter((one) => one.settled === null);
    expect(plans.map((one) => one.kind)).toEqual(["pcr", "pcr", "assembly"]);
    // Every step names a tube of this lab's own, not the Wren Lab's.
    const theirs = new Set(wren.snapshot().lab!.items.map((one) => one.item));
    const used = plans.flatMap((one) => one.inputs.flatMap((each) => (each.item === undefined ? [] : [each.item])));
    expect(used.length).toBeGreaterThan(0);
    for (const item of used) expect(theirs.has(item)).toBe(false);
    for (const item of used) expect(seen.items.some((one) => one.item === item)).toBe(true);
    // Filed where this lab files it, not where the Wren Lab did.
    for (const plan of plans) expect(plan.fields["project"]).toBe("Cheese, ours");
  });

  it("arrives at the same molecules, which is what reproducible means here", async () => {
    const wren = await building();
    const published = await wren.publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    const lab = await finch();
    await lab.addPart({ name: "our gene plasmid", sequence: `${INSERT}GGGGGGG` });
    await lab.addPart({ name: "our backbone", sequence: `${VECTOR}CCCCCCC` });
    for (const part of lab.snapshot().lab!.parts) await lab.addItem({ part: part.checksum, amount: 50, unit: "µL" });
    await lab.takeMethod({ method: JSON.stringify(published) });

    const expected = (one: Lab): string[] =>
      one.snapshot().lab!.plans.filter((each) => each.settled === null).flatMap((each) => each.expects.map((made) => made.checksum)).sort();
    // The two labs have never spoken, share no key and no store, and expect the same molecules.
    expect(expected(lab)).toEqual(expected(wren));
    expect(expected(lab)).toHaveLength(3);
  });

  it("says what it would have to get, rather than proposing work nobody can do", async () => {
    const wren = await building();
    // Published without the starting sequences, so the taking lab cannot add what it lacks.
    const published = await wren.publishMethod({ lab: WREN, project: "Real Vegan Cheese", sequences: false });
    const lab = await finch();
    await lab.addPart({ name: "our gene plasmid", sequence: `${INSERT}GGGGGGG` });
    await lab.addItem({ part: lab.snapshot().lab!.parts[0]!.checksum, amount: 50, unit: "µL" });

    const taken = await lab.takeMethod({ method: JSON.stringify(published) });
    // Only the step that needs the missing molecule is held back. The step after it is still
    // proposed, naming what it needs as a part with no tube — which is Bionet's way of saying "get
    // this first", and is right: the vector could be ordered, or had from whoever holds that
    // checksum, rather than only from the copy this lab cannot run.
    expect(taken.missing.map((one) => one.name)).toEqual(["pBackbone"]);
    expect(taken.missing[0]!.forSteps).toEqual([2]);
    expect(taken.missing[0]!.checksum).toMatch(/seguid=/);
    expect(taken.proposed).toHaveLength(2);
    const proposed = lab.snapshot().lab!.plans.filter((one) => one.settled === null);
    expect(proposed.map((one) => one.kind)).toEqual(["pcr", "assembly"]);
    expect(proposed[1]!.inputs.every((one) => one.item === undefined)).toBe(true);
  });

  it("rebuilds a starting molecule that is a ring as a ring, and not as a line", async () => {
    // A backbone is nearly always a circle, and the same bases closed into a ring and left as a
    // line are two different molecules with two different checksums. If the shape does not travel
    // beside the sequence, a lab holding none of the starting material rebuilds every ring as a
    // line and then matches nothing — so the method would be useless for exactly the molecule
    // almost every real method starts from.
    const wren = await open("Ada", "The Wren Lab");
    await wren.addPart({ name: "pBackbone", sequence: VECTOR, circular: true });
    const backbone = wren.snapshot().lab!.parts[0]!.checksum;
    expect(backbone).toMatch(/^cdseguid=/);
    await wren.planRun({ kind: "assembly", inputs: [{ part: backbone, amount: 1, role: "backbone" }],
                         expects: [{ sequence: RING, circular: true, name: "pWren-CSN2" }], note: "Build it." });
    const published = await wren.publishMethod({ lab: WREN });

    // The shape is written out alongside the sequence, because it is part of what the molecule is.
    const need = published.method.needs.find((one) => one.name === "pBackbone")!;
    expect(need.sequence).toBe(VECTOR);
    expect(need.circular).toBe(true);

    // A lab holding none of it rebuilds it from the document alone and arrives at the same molecule.
    const lab = await finch();
    const taken = await lab.takeMethod({ method: JSON.stringify(published) });
    expect(taken.missing).toEqual([]);
    expect(taken.proposed).toHaveLength(1);
    const rebuilt = lab.snapshot().lab!.parts.find((one) => one.name === "pBackbone")!;
    expect(rebuilt.circular).toBe(true);
    expect(rebuilt.checksum).toBe(backbone);
  });

  it("brings the starting molecules in where the method wrote them out", async () => {
    const wren = await building();
    const published = await wren.publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    const lab = await finch();
    // This lab has nothing at all. The sequences came with the method, so the parts can be added —
    // but a part is not a tube, and nothing can be carried out until somebody makes or orders one.
    const taken = await lab.takeMethod({ method: JSON.stringify(published) });
    expect(taken.missing).toEqual([]);
    expect(taken.proposed).toHaveLength(3);
    const seen = lab.snapshot().lab!;
    expect(seen.items).toHaveLength(0);
    // Every step names a part rather than a tube, which is what says it has to be got first.
    for (const plan of seen.plans) for (const input of plan.inputs) expect(input.item).toBeUndefined();
  });

  it("says what is alive cannot be sent, and does not pretend otherwise", async () => {
    const wren = await building();
    const strain = await wren.addStrain({ name: "W303 pWren-1", host: "Saccharomyces cerevisiae W303" });
    const culture = await wren.addItem({ strain, amount: 50, unit: "mL" });
    const construct = wren.snapshot().lab!.parts.find((one) => one.name === "the insert")!.checksum;
    await wren.planRun({ kind: "transformation", inputs: [{ part: construct, amount: 1, role: "construct" }, { item: culture, amount: 1, role: "host" }],
                         expects: [], note: "Into W303." });
    const plans = wren.snapshot().lab!.plans;
    await wren.setField({ on: "plan", id: plans.at(-1)!.plan, field: "project", value: "Real Vegan Cheese" });

    const published = await wren.publishMethod({ lab: WREN, project: "Real Vegan Cheese" });
    const host = published.method.steps.at(-1)!.uses.find((one) => one.role === "host")!;
    // A strain is the lab's own, so what travels is what it would have to be a culture of.
    expect(host.part).toBeNull();
    expect(host.alive).toEqual({ carries: [], host: "Saccharomyces cerevisiae W303" });

    const lab = await finch();
    const taken = await lab.takeMethod({ method: JSON.stringify(published) });
    expect(taken.alive).toEqual([{ name: "W303 pWren-1", forSteps: [4] }]);
    // Three steps proposed; the transformation is not, because nobody can be handed a strain.
    expect(taken.proposed).toHaveLength(3);
  });
});
