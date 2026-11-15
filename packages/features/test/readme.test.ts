/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here. The sequence is the one the README
 * defines in its own block, and every later block reads it, exactly as the text says.
 */
import { Seq } from "@biolibs/seq";
import { SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { alreadyAnnotated, asFeature, bestHits, DEFAULT_DETECT, detectFeatures, libraryProblems,
  mismatchBudget, newHits, type ReferencePiece, requireLibrary } from "@biolibs/features";
import { describe, expect, it } from "vitest";

/** The README's sequence block, verbatim. */
const T7 = "TAATACGACTCACTATAG";
const GENE =
  "ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTT" +
  "AATGGGCACAAATTTTCTGTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGAAAACTT";
const FILLER_A = "CGATCGATCGTAGCTAGCTAACCGGTTAACCGGTTAAGCTT";
const FILLER_B = "GGCCTTAAGGCCTTAAGGCCAATTCCAATTCCAAGGTTCCA";
const PLASMID = `${FILLER_A}${T7}GGG${GENE}${FILLER_B}`;

/** The circle whose origin falls nine bases into the promoter. */
const CIRCLE = T7.slice(9) + FILLER_A + FILLER_B + T7.slice(0, 9);

/** The gene with four bases changed, as every variant block builds it. */
function variantGene(): string {
  const variant = [...GENE];
  for (const i of [10, 40, 70, 100]) variant[i] = variant[i] === "A" ? "G" : "A";
  return variant.join("");
}

/** The two-piece library the finding section uses. */
const library = (): ReferencePiece[] => [
  { name: "T7 promoter", type: "promoter", sequence: T7 },
  { name: "GFP", type: "CDS", sequence: GENE, note: "from pGFP" },
];

describe("README: no library ships with this package", () => {
  it("checks a library and says what is wrong with it", () => {
    expect(libraryProblems(library())).toEqual([]);
    expect(libraryProblems([{ name: "x", type: "CDS", sequence: "ACGN" }]))
      .toEqual(["piece 'x': the sequence may only contain A, C, G and T"]);
    expect(libraryProblems([{ name: "", type: "CDS", sequence: "ACGT" }]))
      .toEqual(["a piece has no name"]);
    expect(libraryProblems([{ name: "a", type: "CDS", sequence: "ACGT" },
      { name: "a", type: "CDS", sequence: "TTTT" }]))
      .toEqual(["piece 'a': two pieces share this name"]);

    expect(() => requireLibrary([{ name: "x", type: "CDS", sequence: "ACGN" }])).toThrowError(
      "the reference library is not usable: piece 'x': the sequence may only contain A, C, G and T");
  });
});

describe("README: the sequence", () => {
  it("has the promoter at 41 and the gene at 62", () => {
    expect(T7).toHaveLength(18);
    expect(GENE).toHaveLength(126);
    expect(PLASMID).toHaveLength(229);
    expect(PLASMID.indexOf(T7)).toBe(41);
    expect(PLASMID.indexOf(GENE)).toBe(62);
  });
});

describe("README: finding the pieces", () => {
  it("finds both pieces on the top strand", () => {
    const hits = detectFeatures(PLASMID, "linear", library());
    expect(hits.map((h) => [h.piece.name, h.start, h.end, h.strand]))
      .toEqual([["T7 promoter", 41, 59, 1], ["GFP", 62, 188, 1]]);
    expect(hits[0]!.mismatches).toBe(0);
    expect(hits[0]!.identity).toBe(1);
    expect(hits[0]!.wraps).toBe(false);
  });

  it("holds short pieces to an exact match and long ones to a fraction", () => {
    expect(DEFAULT_DETECT).toEqual({ tolerance: 0.05, exactBelow: 30, maxHits: 1000 });

    expect(mismatchBudget({ name: "T7", type: "promoter", sequence: T7 }, DEFAULT_DETECT)).toBe(0);
    expect(mismatchBudget({ name: "GFP", type: "CDS", sequence: GENE }, DEFAULT_DETECT)).toBe(6);
    expect(mismatchBudget({ name: "a", type: "CDS", sequence: "A".repeat(30) }, DEFAULT_DETECT)).toBe(0);
    expect(mismatchBudget({ name: "a", type: "CDS", sequence: "A".repeat(31) }, DEFAULT_DETECT)).toBe(1);

    expect(mismatchBudget({ name: "GFP", type: "CDS", sequence: GENE, tolerance: 0.1 }, DEFAULT_DETECT))
      .toBe(12);
    expect(mismatchBudget({ name: "T7", type: "promoter", sequence: T7, tolerance: 0.5 }, DEFAULT_DETECT))
      .toBe(0);
  });

  it("finds a variant and records how far off it was", () => {
    const VARIANT = variantGene();
    const found = detectFeatures(PLASMID, "linear",
      [{ name: "GFP variant", type: "CDS", sequence: VARIANT }]);
    expect(found[0]!.mismatches).toBe(4);
    expect(found[0]!.identity.toFixed(4)).toBe("0.9683");

    expect(detectFeatures(PLASMID, "linear",
      [{ name: "GFP variant", type: "CDS", sequence: VARIANT, tolerance: 0.02 }])).toHaveLength(0);
  });

  it("finds a short element one base off only when exactBelow is lowered", () => {
    const oneOff = `CCCC${T7.slice(0, 5)}G${T7.slice(6)}CCCC`;
    expect(detectFeatures(oneOff, "linear", [{ name: "T7", type: "promoter", sequence: T7 }]))
      .toHaveLength(0);
    expect(detectFeatures(oneOff, "linear", [{ name: "T7", type: "promoter", sequence: T7 }],
      { exactBelow: 0, tolerance: 0.1 }).map((h) => [h.start, h.mismatches])).toEqual([[4, 1]]);
  });

  it("searches both strands", () => {
    const flipped = `${FILLER_A}CTATAGTGAGTCGTATTA${FILLER_B}`;
    expect(detectFeatures(flipped, "linear", [{ name: "T7 promoter", type: "promoter", sequence: T7 }])
      .map((h) => [h.start, h.end, h.strand])).toEqual([[41, 59, -1]]);

    expect(detectFeatures("AAAGAATTCAAA", "linear",
      [{ name: "EcoRI site", type: "misc_feature", sequence: "GAATTC" }])
      .map((h) => [h.start, h.strand])).toEqual([[3, -1], [3, 1]]);
  });

  it("searches a circle across its origin, exactly once", () => {
    expect(detectFeatures(CIRCLE, "circular", [{ name: "T7 promoter", type: "promoter", sequence: T7 }])
      .map((h) => [h.start, h.end, h.wraps])).toEqual([[91, 109, true]]);
    expect(detectFeatures(CIRCLE, "linear", [{ name: "T7 promoter", type: "promoter", sequence: T7 }]))
      .toHaveLength(0);
  });

  it("never matches an ambiguous base", () => {
    const broken = `CGATCGATCG${T7.slice(0, 9)}N${T7.slice(10)}CGATCGATCG`;
    expect(detectFeatures(broken, "linear", [{ name: "T7 promoter", type: "promoter", sequence: T7 }]))
      .toHaveLength(0);
  });
});

describe("README: picking the best hits", () => {
  /** The four-piece library of the crowding example. */
  const crowded = (): ReferencePiece[] => [
    { name: "T7 promoter", type: "promoter", sequence: T7 },
    { name: "GFP", type: "CDS", sequence: GENE },
    { name: "GFP variant", type: "CDS", sequence: variantGene() },
    { name: "GFP N-term", type: "misc_feature", sequence: GENE.slice(0, 20) },
  ];

  it("drops a redundant variant and keeps a short element inside a long one", () => {
    const all = detectFeatures(PLASMID, "linear", crowded());
    expect(all.map((h) => [h.piece.name, h.start, h.end, h.mismatches])).toEqual([
      ["T7 promoter", 41, 59, 0], ["GFP", 62, 188, 0],
      ["GFP variant", 62, 188, 4], ["GFP N-term", 62, 82, 0],
    ]);
    expect(bestHits(all).map((h) => h.piece.name))
      .toEqual(["T7 promoter", "GFP", "GFP N-term"]);
  });

  it("takes the threshold as an argument", () => {
    const all = detectFeatures(PLASMID, "linear", crowded());
    expect(bestHits(all, 1).map((h) => h.piece.name))
      .toEqual(["T7 promoter", "GFP", "GFP variant", "GFP N-term"]);
    expect(bestHits(all, 0).map((h) => h.piece.name)).toEqual(["T7 promoter", "GFP"]);
  });
});

describe("README: turning hits into features", () => {
  it("puts the name where a GenBank reader will find it", () => {
    const hits = detectFeatures(PLASMID, "linear", library());
    const feature = asFeature(hits[1]!, { length: PLASMID.length });

    expect(feature.type).toBe("CDS");
    expect(String(feature.location)).toBe("[62:188](+)");
    expect(feature.qualifiers.get("label")).toEqual(["GFP"]);
    expect(feature.qualifiers.get("gene")).toEqual(["GFP"]);
    expect(feature.qualifiers.get("note")).toEqual([
      "from pGFP", "found by comparison with a reference sequence, 100% identical"]);
  });

  it("keeps the piece's own note, and records the identity", () => {
    const geneHit = detectFeatures(PLASMID, "linear",
      [{ name: "GFP", type: "CDS", sequence: GENE, note: "from pGFP" }])[0]!;
    expect(asFeature(geneHit, { note: "" }).qualifiers.get("note")).toEqual(["from pGFP"]);
    expect(asFeature(geneHit, { note: "hand checked" }).qualifiers.get("note"))
      .toEqual(["from pGFP", "hand checked"]);

    const variantHit = detectFeatures(PLASMID, "linear",
      [{ name: "GFP variant", type: "CDS", sequence: variantGene() }])[0]!;
    expect(asFeature(variantHit).qualifiers.get("note"))
      .toEqual(["found by comparison with a reference sequence, 96.8% identical"]);
  });

  it("writes a wrapping hit as a join, and needs the length to do it", () => {
    const wrapping = detectFeatures(CIRCLE, "circular",
      [{ name: "T7 promoter", type: "promoter", sequence: T7 }])[0]!;
    expect(String(asFeature(wrapping, { length: CIRCLE.length }).location))
      .toBe("join{[91:100](+), [0:9](+)}");
    expect(() => asFeature(wrapping)).toThrowError(
      "a hit that wraps the origin needs the sequence length, so it can be written as a join");
  });
});

describe("README: not annotating twice", () => {
  it("recognises an existing annotation by name, by coverage, and not by type alone", () => {
    const hits = bestHits(detectFeatures(PLASMID, "linear", library()));

    const byName = [new SeqFeature(new SimpleLocation(62, 188, 1), "CDS", "",
      new Map([["gene", ["GFP"]]]))];
    expect(alreadyAnnotated(hits[1]!, byName)).toBe(true);

    const byCoverage = [new SeqFeature(new SimpleLocation(62, 188, 1), "CDS", "",
      new Map([["product", ["green fluorescent protein"]]]))];
    expect(alreadyAnnotated(hits[1]!, byCoverage)).toBe(true);

    const wrongType = [new SeqFeature(new SimpleLocation(62, 188, 1), "misc_feature", "", new Map())];
    expect(alreadyAnnotated(hits[1]!, wrongType)).toBe(false);

    expect(newHits(hits, byName).map((h) => h.piece.name)).toEqual(["T7 promoter"]);
  });

  it("leaves the record to the caller", () => {
    const record = new SeqRecord(new Seq(PLASMID), "pTest");
    for (const hit of newHits(bestHits(detectFeatures(PLASMID, "linear", library())), record.features)) {
      record.features.push(asFeature(hit, { length: PLASMID.length }));
    }
    expect(record.features.map((f) => [f.type, String(f.location)]))
      .toEqual([["promoter", "[41:59](+)"], ["CDS", "[62:188](+)"]]);
  });
});
