/**
 * A ligation: pieces joined where their ends fit.
 *
 * The joining is the assembly engine's, so what is checked here is what this package says about it
 * and the engine does not: that each piece really sits where the plan says it does in the product's
 * own bases, that each join's overhang is really there, and that what was marked on a piece is
 * marked where that piece ended up, the right way round.
 */
import type { PartFeature } from "@biolibs/bionet";
import { endBases, endsFit, joinWorking, ligationChecks, ligationLengthWorking, ligationRun, planLigation, ratioWorking } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
const flipped = (bases: string): string => [...bases].reverse().map((base) => PAIR[base]!).join("");
const piece = (id: string, name: string, sequence: string, left: number, right: number, features: PartFeature[] = []) =>
  ({ id, name, sequence, ends: { left, right }, features });

// A vector with an EcoRI end and a BamHI end, and an insert with the same two the other way about.
const VECTOR = piece("v", "vector", `AATT${"G".repeat(40)}GATC`, 4, 4, [{ type: "CDS", label: "AmpR", strand: -1, parts: [{ start: 10, end: 30 }] }]);
const INSERT = piece("i", "insert", `GATC${"A".repeat(20)}AATT`, 4, 4, [{ type: "CDS", label: "gene", strand: 1, parts: [{ start: 4, end: 24 }] }]);

/** @param product - A product. @param at - Where to read. @param many - How many bases. @returns Them, round the circle if need be. */
const read = (product: { sequence: string; length: number }, at: number, many: number): string =>
  Array.from({ length: many }, (_, index) => product.sequence[(at + index) % product.length]!).join("");

describe("what a piece's ends are made of", () => {
  it("reads each overhang along the strand that carries it", () => {
    expect(endBases(VECTOR)).toEqual({ left: { kind: "5′", bases: "AATT" }, right: { kind: "5′", bases: "GATC" } });
    // A 3′ overhang at the left end is the bottom strand's, which reads the other way.
    expect(endBases(piece("p", "p", `GGTAC${"A".repeat(20)}GTAC`, -4, -4))).toEqual({ left: { kind: "3′", bases: "TACC" }, right: { kind: "3′", bases: "GTAC" } });
    expect(endBases(piece("p", "p", "A".repeat(20), 0, 0))).toEqual({ left: { kind: "blunt", bases: "" }, right: { kind: "blunt", bases: "" } });
  });

  it("fits two ends only when they are the same kind, the same length and partners", () => {
    const ends = { v: endBases(VECTOR), i: endBases(INSERT) };
    expect(endsFit(ends.v.right, ends.i.left)).toEqual({ kind: "5′", bases: "GATC" });
    expect(endsFit(ends.i.right, ends.v.left)).toEqual({ kind: "5′", bases: "AATT" });
    // A BamHI end fits another BamHI end: GATC is its own partner, which is why a plasmid cut once
    // with it closes again on itself.
    expect(endsFit(ends.v.right, ends.v.right)).toEqual({ kind: "5′", bases: "GATC" });
    expect(endsFit({ kind: "5′", bases: "AATG" }, { kind: "5′", bases: "AATG" })).toBeNull();
    expect(endsFit({ kind: "5′", bases: "AATT" }, { kind: "3′", bases: "AATT" })).toBeNull();
    expect(endsFit({ kind: "5′", bases: "AATT" }, { kind: "5′", bases: "AAT" })).toBeNull();
    expect(endsFit({ kind: "5′", bases: "AATG" }, { kind: "5′", bases: "CATT" })).toEqual({ kind: "5′", bases: "AATG" });
    expect(endsFit({ kind: "blunt", bases: "" }, { kind: "blunt", bases: "" })).toEqual({ kind: "blunt", bases: "" });
    expect(endsFit({ kind: "blunt", bases: "" }, { kind: "5′", bases: "AATT" })).toBeNull();
  });
});

describe("what a ligation would make", () => {
  it("closes two pieces into a circle, and says where each sits", () => {
    const plan = planLigation([VECTOR, INSERT]);
    expect(plan.problem).toBeNull();
    expect(plan.products.length).toBe(1);
    const [product] = plan.products;
    // 48 and 28 bases, less the two 4-base overhangs each shared once.
    expect(product).toMatchObject({ length: 68, circular: true });
    expect(product!.pieces.map((one) => [one.name, one.at, one.flipped])).toEqual([["vector", 0, false], ["insert", 44, false]]);
    // Every piece really is where it is said to be, in the product's own bases.
    for (const placed of product!.pieces) {
      const source = [VECTOR, INSERT].find((one) => one.id === placed.id)!;
      expect(read(product!, placed.at, source.sequence.length)).toBe(source.sequence);
    }
    // And every join's overhang really is there.
    for (const join of product!.joins) expect(read(product!, join.at, join.bases.length)).toBe(join.bases);
    expect(product!.joins.map((one) => [one.from, one.to, one.bases])).toEqual([["i", "v", "AATT"], ["v", "i", "GATC"]]);
  });

  it("carries what each piece carried to where that piece ended up", () => {
    const [product] = planLigation([VECTOR, INSERT]).products;
    expect(product!.features).toEqual([
      { type: "CDS", label: "AmpR", strand: -1, parts: [{ start: 10, end: 30 }] },
      { type: "CDS", label: "gene", strand: 1, parts: [{ start: 48, end: 68 }] },
    ]);
  });

  it("turns a flipped piece's features round with it", () => {
    // Both ends the same, so the insert can go in either way round.
    const vector = piece("v", "vector", `AATT${"G".repeat(40)}AATT`, 4, 4);
    const insert = piece("i", "insert", `AATT${"C".repeat(20)}AATT`, 4, 4, [{ type: "CDS", label: "gene", strand: 1, parts: [{ start: 4, end: 10 }] }]);
    const plan = planLigation([vector, insert]);
    expect(plan.products.length).toBe(2);
    const turned = plan.products.find((one) => one.pieces.some((each) => each.flipped))!;
    const gene = turned.features.find((one) => one.label === "gene")!;
    expect(gene.strand).toBe(-1);
    // 4..10 of a 28-base piece becomes 18..24 of it, and the piece starts at 44.
    expect(gene.parts).toEqual([{ start: 62, end: 68 }]);
  });

  it("will not join what does not fit, and says why", () => {
    const other = piece("o", "other", `CATG${"T".repeat(20)}CATG`, 4, 4);
    expect(planLigation([VECTOR, other]).problem).toMatch(/No two of those ends fit/);
    expect(planLigation([]).problem).toMatch(/Choose the pieces/);
    expect(planLigation([VECTOR]).problem).toMatch(/cannot close on itself/);
    // One cut with the same enzyme at both ends closes on itself.
    expect(planLigation([piece("p", "p", `AATT${"G".repeat(30)}AATT`, 4, 4)]).products[0]).toMatchObject({ circular: true, length: 34 });
  });

  it("joins blunt ends only when it is allowed to, and keeps lines only when asked", () => {
    const one = piece("1", "one", "G".repeat(30), 0, 0);
    const other = piece("2", "other", "T".repeat(20), 0, 0);
    expect(planLigation([one, other]).products.length).toBe(0);
    const blunt = planLigation([one, other], { blunt: true });
    expect(blunt.products[0]).toMatchObject({ circular: true, length: 50 });
    expect(blunt.products[0]!.joins.every((join) => join.kind === "blunt")).toBe(true);
    // Two pieces that join at one end only, and whose other ends are blunt, make a line and nothing else.
    const left = piece("l", "left", `${"C".repeat(20)}GATC`, 0, 4);
    const right = piece("r", "right", `GATC${"T".repeat(20)}`, 4, 0);
    expect(planLigation([left, right]).problem).toMatch(/No two of those ends fit|not close/);
    const lines = planLigation([left, right], { linear: true });
    expect(lines.products[0]).toMatchObject({ circular: false, length: 44 });
  });
});

describe("a ligation's working", () => {
  it("says a join in the bases that make it", () => {
    const working = joinWorking({ name: "vector", end: endBases(VECTOR).right }, { name: "insert", end: endBases(INSERT).left });
    expect(working).toMatchObject({ comes: "4 bases, GATC", kind: "exact" });
    // The insert's overhang is written back to front, so each base sits under the one it pairs with.
    expect(working.bases).toEqual({ from: "vector", to: "insert", left: "GATC", right: "CTAG", kind: "5′" });
    const wrong = joinWorking({ name: "vector", end: endBases(VECTOR).right }, { name: "other", end: { kind: "5′", bases: "CATG" } });
    expect(wrong.comes).toBe("they do not fit");
    expect(wrong.steps.at(-1)).toMatch(/would have to meet CTAG to pair/);
    expect(joinWorking({ name: "a", end: { kind: "blunt", bases: "" } }, { name: "b", end: { kind: "blunt", bases: "" } }).comes).toBe("a blunt join");
    expect(joinWorking({ name: "a", end: { kind: "blunt", bases: "" } }, { name: "b", end: { kind: "5′", bases: "AATT" } }).steps.at(-1)).toMatch(/nothing to pair/);
  });

  it("counts a shared overhang once", () => {
    const [product] = planLigation([VECTOR, INSERT]).products;
    const working = ligationLengthWorking(product!, [VECTOR, INSERT]);
    expect(working.comes).toBe("68 bp");
    expect(working.steps[1]).toMatch(/4 \+ 4 = 8/);
    expect(working.steps[2]).toBe("76 − 8 = 68, closed into a circle.");
  });

  it("works out how much insert to put in from the lengths", () => {
    const working = ratioWorking({ name: "vector", length: 3000 }, { name: "insert", length: 600 });
    expect(working).toMatchObject({ comes: "30 ng of insert", kind: "estimate" });
    expect(working.steps[1]).toMatch(/50 ng × 600 ÷ 3,000 × 3 = 30 ng/);
    expect(ratioWorking({ name: "v", length: 3000 }, { name: "i", length: 600 }, { ratio: 1, ng: 100 }).comes).toBe("20 ng of insert");
  });
});

describe("what a careful person would ask of a ligation", () => {
  it("stops at a piece that can close on itself", () => {
    const vector = piece("v", "vector", `AATT${"G".repeat(40)}AATT`, 4, 4);
    const insert = piece("i", "insert", `AATT${"C".repeat(20)}AATT`, 4, 4);
    const said = ligationChecks([vector, insert], planLigation([vector, insert]));
    expect(said[0]!.weight).toBe("stop");
    expect(said[0]!.says).toMatch(/can close on itself/);
    // A vector cut with two different enzymes cannot, which is why it is done that way.
    expect(ligationChecks([VECTOR, INSERT], planLigation([VECTOR, INSERT])).some((check) => /close on itself/.test(check.says))).toBe(false);
  });

  it("says when the same pieces make more than one thing", () => {
    const vector = piece("v", "vector", `AATT${"G".repeat(40)}AATT`, 4, 4);
    const insert = piece("i", "insert", `AATT${"C".repeat(20)}AATT`, 4, 4);
    const said = ligationChecks([vector, insert], planLigation([vector, insert]));
    expect(said.find((check) => /the other way round/.test(check.says))?.because).toBe("2 circles of 2 pieces");
  });

  it("says that a blunt join is the harder one, and that a PCR product has no phosphate", () => {
    const one = piece("1", "one", "G".repeat(30), 0, 0);
    const other = piece("2", "other", "T".repeat(20), 0, 0);
    const plan = planLigation([one, other], { blunt: true });
    expect(ligationChecks([one, other], plan).some((check) => /blunt join/.test(check.says))).toBe(true);
    const pcr = ligationChecks([one, other], plan, { fromPcr: ["1"] }).find((check) => check.because === "made by pcr")!;
    expect(pcr).toMatchObject({ weight: "stop" });
    expect(pcr.says).toMatch(/no phosphate at its 5′ ends/);
  });
});

describe("a ligation as a lab records it", () => {
  const lab = {
    parts: [
      { checksum: "pv", name: "vector", sequence: VECTOR.sequence, length: VECTOR.sequence.length, circular: false, features: VECTOR.features, ends: VECTOR.ends },
      { checksum: "pi", name: "insert", sequence: INSERT.sequence, length: INSERT.sequence.length, circular: false, features: INSERT.features, ends: INSERT.ends },
      { checksum: "pc", name: "a circle", sequence: "G".repeat(50), length: 50, circular: true, features: [], ends: { left: 0, right: 0 } },
    ],
    items: [{ item: "v", part: "pv", amount: 10, unit: "µL", retired: false }, { item: "i", part: "pi", amount: 10, unit: "µL", retired: false },
            { item: "c", part: "pc", amount: 10, unit: "µL", retired: false }],
    places: [],
  };

  it("asks for one tube of what it made, with what it carries", () => {
    const run = ligationRun(lab as never, { tubes: ["v", "i"], name: " pWren1 ", amount: 25 });
    expect(run.product).toMatchObject({ length: 68, circular: true });
    const worked = run.worked as { outputs: Record<string, unknown>[]; settings: Record<string, unknown>; inputs: unknown[] };
    expect(worked.outputs).toHaveLength(1);
    expect(worked.outputs[0]).toMatchObject({ circular: true, name: "pWren1", amount: 25, unit: "µL" });
    expect(worked.outputs[0]!["ends"]).toBeUndefined();
    expect((worked.outputs[0]!["features"] as PartFeature[]).map((one) => one.label)).toEqual(["AmpR", "gene"]);
    expect(worked.settings).toMatchObject({ pieces: 2, joins: 2, made: "circle" });
    expect(worked.inputs).toEqual([{ item: "v", amount: 1, role: "piece" }, { item: "i", amount: 1, role: "piece" }]);
    expect((run.failed as { outputs: unknown[] }).outputs).toEqual([]);
  });

  it("keeps the outer ends of something that did not close", () => {
    const ends = {
      parts: [{ checksum: "pl", name: "left", sequence: `${"C".repeat(20)}GATC`, length: 24, circular: false, features: [], ends: { left: 0, right: 4 } },
              { checksum: "pr", name: "right", sequence: `GATC${"T".repeat(20)}`, length: 24, circular: false, features: [], ends: { left: 4, right: 0 } }],
      items: [{ item: "l", part: "pl", amount: 10, unit: "µL", retired: false }, { item: "r", part: "pr", amount: 10, unit: "µL", retired: false }],
      places: [],
    };
    const run = ligationRun(ends as never, { tubes: ["l", "r"], linear: true });
    expect(run.product).toMatchObject({ circular: false, length: 44 });
    // The line keeps the outer ends the two pieces brought: blunt at each end here.
    expect((run.worked as { outputs: Record<string, unknown>[] }).outputs[0]!["ends"]).toBeUndefined();
    expect((run.worked as { settings: Record<string, unknown> }).settings).toMatchObject({ made: "line" });
  });

  it("will not take a circle, which has no ends to join", () => {
    expect(ligationRun(lab as never, { tubes: ["v", "c"] })).toMatchObject({ plan: null, product: null, worked: null });
  });
});
