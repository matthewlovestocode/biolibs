/**
 * A sequence's map, and what a PCR's product carries from its template.
 *
 * The map's geometry is `@biolibs/seqmap`'s and is tested there. What is checked here is what this
 * package decides: which pieces are drawn and in which lanes, and what ends up marked on a product.
 */
import { mapPieces, moleculeOf, pcrFeatures, pcrRun, planPcr } from "@biolibs/bionet-tools";
import type { PartFeature } from "@biolibs/bionet";
import { describe, expect, it } from "vitest";

const feature = (label: string, start: number, end: number, strand: -1 | 0 | 1 = 1, type = "CDS"): PartFeature => ({ type, label, strand, parts: [{ start, end }] });

/** 600 bases with no repeats long enough to bind a primer twice. */
const TEMPLATE = (() => {
  let seed = 11;
  const next = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: 600 }, () => "ACGT"[Math.floor(next() * 4)]).join("");
})();
const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
const flipped = (bases: string): string => [...bases].reverse().map((base) => PAIR[base]).join("");

describe("the pieces of a map", () => {
  it("puts features that overlap in different lanes, and ones that do not in the same", () => {
    const pieces = mapPieces([feature("a", 0, 400), feature("b", 300, 700), feature("c", 800, 900)], 3000, false);
    expect(pieces.map((one) => one.lane)).toEqual([0, 1, 0]);
  });

  it("draws a feature that crosses a circle's origin as two pieces, with one arrowhead", () => {
    const crossing: PartFeature = { type: "CDS", label: "over", strand: 1, parts: [{ start: 2900, end: 3000 }, { start: 0, end: 100 }] };
    const pieces = mapPieces([crossing], 3000, true);
    expect(pieces.map((one) => [one.start, one.end])).toEqual([[2900, 3000], [0, 100]]);
    expect(pieces.map((one) => one.arrow)).toEqual([undefined, "end"]);
  });

  it("leaves out a piece that runs past the end", () => {
    expect(mapPieces([feature("too far", 2900, 3100)], 3000, false)).toEqual([]);
  });
});

describe("what is marked on a PCR's product", () => {
  const forward = { name: "fwd", sequence: TEMPLATE.slice(100, 122) };
  const reverse = { name: "rvs", sequence: flipped(TEMPLATE.slice(380, 402)) };
  const features = [feature("inside", 150, 300), feature("half in", 50, 140, 1, "promoter"), feature("outside", 450, 500), feature("backwards", 310, 370, -1)];
  const template = { sequence: TEMPLATE, features };

  it("carries what lies on the stretch copied, moved to where it now is", () => {
    const marked = pcrFeatures(template, forward, reverse);
    expect(marked.map((one) => one.label)).toEqual(["inside", "half in (part)", "backwards", "fwd", "rvs"]);
    expect(marked[0]!.parts).toEqual([{ start: 50, end: 200 }]);
    expect(marked[1]!.parts).toEqual([{ start: 0, end: 40 }]);
    expect(marked[2]!.strand).toBe(-1);
  });

  it("marks each primer at the end it became", () => {
    const marked = pcrFeatures(template, forward, reverse);
    expect(marked.at(-2)).toEqual({ type: "primer_bind", label: "fwd", strand: 1, parts: [{ start: 0, end: 22 }] });
    expect(marked.at(-1)).toEqual({ type: "primer_bind", label: "rvs", strand: -1, parts: [{ start: 280, end: 302 }] });
  });

  it("does not care which primer is called forward", () => {
    expect(pcrFeatures(template, reverse, forward).map((one) => one.label).slice(0, 3)).toEqual(["inside", "half in (part)", "backwards"]);
  });

  it("moves everything along by a primer's tail", () => {
    const tailed = { name: "fwd", sequence: `GGATCC${forward.sequence}` };
    const marked = pcrFeatures(template, tailed, reverse);
    expect(marked[0]!.parts).toEqual([{ start: 56, end: 206 }]);
    expect(marked.at(-1)!.parts).toEqual([{ start: 286, end: 308 }]);
    expect(planPcr({ sequence: TEMPLATE, circular: false }, tailed.sequence, reverse.sequence).products[0]!.length).toBe(308);
  });

  it("marks nothing if a primer does not bind", () => {
    expect(pcrFeatures(template, forward, { name: "rvs", sequence: "ACGTACGTACGTACGTACGTAC" })).toEqual([]);
  });

  it("is what a run asks the lab to keep with the product", () => {
    const part = (name: string, sequence: string, marks: PartFeature[] = []) => ({ checksum: name, name, sequence, length: sequence.length, circular: false, features: marks });
    const item = (id: string, of: string) => ({ item: id, part: of, amount: 10, unit: "µL", retired: false });
    const lab = { parts: [part("t", TEMPLATE, features), part("fwd", forward.sequence), part("rvs", reverse.sequence)], items: [item("1", "t"), item("2", "fwd"), item("3", "rvs")], places: [] };
    const run = pcrRun(lab as never, { template: "1", forward: "2", reverse: "3" });
    expect(run.features.length).toBe(5);
    expect((run.worked as { outputs: { features: PartFeature[] }[] }).outputs[0]!.features).toEqual(run.features);
  });
});

describe("a part as a molecule to draw", () => {
  it("gives each piece of each feature its colour's meaning", () => {
    const drawn = moleculeOf({ name: "p", length: 3000, circular: true, features: [feature("bla", 100, 900, -1), feature("ori", 1000, 1500, 0, "rep_origin")] });
    expect(drawn.features.map((one) => [one.label, one.start, one.end, one.strand])).toEqual([["bla", 100, 900, -1], ["ori", 1000, 1500, 0]]);
    expect(drawn.features[0]!.tone).not.toBe(drawn.features[1]!.tone);
  });
});
