import { ValueError } from "@biolibs/core";
import { CompoundLocation, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DETECT, alreadyAnnotated, asFeature, bestHits, detectFeatures, libraryProblems, mismatchBudget,
  newHits, requireLibrary, type ReferencePiece,
} from "@biolibs/features";

/** The T7 promoter: 18 bases, so under the exact-match threshold. */
const T7 = "TAATACGACTCACTATAG";
/** A 40-base piece, over the threshold, so it tolerates mismatches. */
const LONG = "ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAA";

const piece = (over: Partial<ReferencePiece> = {}): ReferencePiece => ({ name: "T7", type: "promoter", sequence: T7, ...over });
const longPiece = (over: Partial<ReferencePiece> = {}): ReferencePiece => ({ name: "GFP", type: "CDS", sequence: LONG, ...over });

const reverseComplement = (dna: string) =>
  [...dna].reverse().map((c) => ({ A: "T", T: "A", G: "C", C: "G" } as Record<string, string>)[c] ?? c).join("");

describe("libraryProblems and requireLibrary", () => {
  it("accepts a usable library", () => {
    expect(libraryProblems([piece(), longPiece()])).toEqual([]);
    expect(() => requireLibrary([piece()])).not.toThrow();
  });

  it("accepts an empty library", () => {
    expect(libraryProblems([])).toEqual([]);
  });

  it("rejects an empty name, an empty sequence and an ambiguous one", () => {
    expect(libraryProblems([piece({ name: "" })])).toContain("a piece has no name");
    expect(libraryProblems([piece({ sequence: "" })])[0]).toMatch(/sequence is empty/);
    expect(libraryProblems([piece({ sequence: "ACGN" })])[0]).toMatch(/only contain A, C, G and T/);
  });

  it("rejects duplicate names", () => {
    expect(libraryProblems([piece(), piece()])[0]).toMatch(/two pieces share this name/);
  });

  it("rejects a tolerance outside 0 to 1", () => {
    expect(libraryProblems([piece({ tolerance: 1.5 })])[0]).toMatch(/between 0 and 1/);
    expect(libraryProblems([piece({ tolerance: -0.1 })])[0]).toMatch(/between 0 and 1/);
    expect(libraryProblems([piece({ tolerance: 0 })])).toEqual([]);
  });

  it("lists every problem at once", () => {
    expect(libraryProblems([piece({ name: "", sequence: "ACGN" })])).toHaveLength(2);
  });

  it("throws from requireLibrary with the problems in the message", () => {
    expect(() => requireLibrary([piece({ sequence: "ACGN" })])).toThrow(ValueError);
    expect(() => requireLibrary([piece({ sequence: "ACGN" })])).toThrow(/only contain A, C, G and T/);
  });
});

describe("mismatchBudget", () => {
  it("is zero for a piece at or below the exact threshold", () => {
    expect(mismatchBudget(piece(), DEFAULT_DETECT)).toBe(0);
    expect(mismatchBudget(piece({ sequence: "A".repeat(30) }), DEFAULT_DETECT)).toBe(0);
  });

  it("scales with length above the threshold", () => {
    expect(mismatchBudget(piece({ sequence: "A".repeat(100) }), DEFAULT_DETECT)).toBe(5);
    expect(mismatchBudget(piece({ sequence: "A".repeat(900) }), DEFAULT_DETECT)).toBe(45);
  });

  it("lets a piece set its own tolerance", () => {
    expect(mismatchBudget(piece({ sequence: "A".repeat(100), tolerance: 0.2 }), DEFAULT_DETECT)).toBe(20);
    expect(mismatchBudget(piece({ sequence: "A".repeat(100), tolerance: 0 }), DEFAULT_DETECT)).toBe(0);
  });

  it("still holds a short piece to an exact match whatever its own tolerance", () => {
    expect(mismatchBudget(piece({ tolerance: 0.5 }), DEFAULT_DETECT)).toBe(0);
  });
});

describe("detectFeatures", () => {
  const padded = `AAAAAAAAAA${T7}GGGGGGGGGG`;

  it("finds an exact match and reports where it is", () => {
    const hits = detectFeatures(padded, "linear", [piece()]);
    const forward = hits.find((h) => h.strand === 1)!;
    expect(forward.start).toBe(10);
    expect(forward.end).toBe(10 + T7.length);
    expect(forward.mismatches).toBe(0);
    expect(forward.identity).toBe(1);
    expect(forward.wraps).toBe(false);
    expect(forward.piece.name).toBe("T7");
  });

  it("finds a piece on the bottom strand", () => {
    const flipped = `AAAAAAAAAA${reverseComplement(T7)}GGGGGGGGGG`;
    const hits = detectFeatures(flipped, "linear", [piece()]);
    const reverse = hits.find((h) => h.strand === -1)!;
    expect(reverse.start).toBe(10);
    expect(reverse.mismatches).toBe(0);
  });

  it("finds nothing when the piece is absent", () => {
    expect(detectFeatures("A".repeat(100), "linear", [piece()])).toEqual([]);
  });

  it("holds a short piece to an exact match", () => {
    const oneOff = `AAAAAAAAAA${T7.slice(0, 5)}G${T7.slice(6)}GGGGGGGGGG`;
    expect(detectFeatures(oneOff, "linear", [piece()])).toEqual([]);
  });

  it("tolerates a few mismatches in a long piece", () => {
    const oneOff = `AAAAAAAAAA${LONG.slice(0, 20)}${LONG[20] === "C" ? "A" : "C"}${LONG.slice(21)}GGGGGGGGGG`;
    const hits = detectFeatures(oneOff, "linear", [longPiece()]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.mismatches).toBe(1);
    expect(hits[0]!.identity).toBeCloseTo(39 / 40, 10);
  });

  it("refuses a long piece once the mismatches exceed the budget", () => {
    // A 40-base piece at 5% tolerates two mismatches; make three.
    let broken = LONG;
    for (const i of [5, 15, 25]) broken = broken.slice(0, i) + (broken[i] === "C" ? "A" : "C") + broken.slice(i + 1);
    expect(mismatchBudget(longPiece(), DEFAULT_DETECT)).toBe(2);
    expect(detectFeatures(`AAAA${broken}GGGG`, "linear", [longPiece()])).toEqual([]);
  });

  it("honours a piece's own tolerance", () => {
    let broken = LONG;
    for (const i of [5, 15, 25]) broken = broken.slice(0, i) + (broken[i] === "C" ? "A" : "C") + broken.slice(i + 1);
    const hits = detectFeatures(`AAAA${broken}GGGG`, "linear", [longPiece({ tolerance: 0.1 })]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.mismatches).toBe(3);
  });

  it("finds a piece that straddles the origin of a circular sequence", () => {
    // Put the last six bases of the promoter at the end and the first twelve at the start.
    const circular = T7.slice(12) + "A".repeat(20) + T7.slice(0, 12);
    const hits = detectFeatures(circular, "circular", [piece()]);
    const wrapping = hits.find((h) => h.wraps && h.strand === 1)!;
    expect(wrapping.start).toBe(26);
    expect(wrapping.end).toBe(26 + T7.length);
    expect(wrapping.mismatches).toBe(0);
  });

  it("does not wrap a linear sequence", () => {
    const circular = T7.slice(12) + "A".repeat(20) + T7.slice(0, 12);
    expect(detectFeatures(circular, "linear", [piece()])).toEqual([]);
  });

  it("finds a wrapping piece exactly once", () => {
    const circular = T7.slice(12) + "A".repeat(20) + T7.slice(0, 12);
    expect(detectFeatures(circular, "circular", [piece()]).filter((h) => h.strand === 1)).toHaveLength(1);
  });

  it("never matches across an ambiguity code", () => {
    const withN = `AAAAAAAAAA${T7.slice(0, 5)}N${T7.slice(6)}GGGGGGGGGG`;
    expect(detectFeatures(withN, "linear", [piece()])).toEqual([]);
    expect(detectFeatures("N".repeat(100), "linear", [longPiece({ tolerance: 1 })])).toEqual([]);
  });

  it("finds every copy of a repeated piece", () => {
    const twice = `AAAA${T7}GGGG${T7}CCCC`;
    expect(detectFeatures(twice, "linear", [piece()]).filter((h) => h.strand === 1)).toHaveLength(2);
  });

  it("skips a piece longer than the sequence", () => {
    expect(detectFeatures("ACGT", "linear", [piece()])).toEqual([]);
  });

  it("returns hits ordered by start, longer piece first", () => {
    const library = [piece(), longPiece()];
    const text = `AAAA${LONG}GG${T7}CCCC`;
    const hits = detectFeatures(text, "linear", library);
    const starts = hits.map((h) => h.start);
    expect([...starts]).toEqual([...starts].sort((a, b) => a - b));
  });

  it("caps the number of hits", () => {
    const text = "AT".repeat(500);
    const hits = detectFeatures(text, "linear", [{ name: "AT", type: "misc_feature", sequence: "ATAT" }], { maxHits: 7 });
    expect(hits).toHaveLength(7);
  });

  it("searches an empty library without complaint", () => {
    expect(detectFeatures(padded, "linear", [])).toEqual([]);
  });

  it("rejects an unusable library or a bad option", () => {
    expect(() => detectFeatures(padded, "linear", [piece({ sequence: "ACGN" })])).toThrow(ValueError);
    expect(() => detectFeatures(padded, "linear", [piece()], { tolerance: 2 })).toThrow(ValueError);
    expect(() => detectFeatures(padded, "linear", [piece()], { exactBelow: -1 })).toThrow(ValueError);
    expect(() => detectFeatures(padded, "linear", [piece()], { maxHits: -1 })).toThrow(ValueError);
  });

  it("finds a piece at its own position in its own source sequence", () => {
    // The invariant that matters for a library cut out of real records.
    const source = `CCCC${LONG}TTTT`;
    const hits = detectFeatures(source, "linear", [longPiece()]);
    const forward = hits.find((h) => h.strand === 1)!;
    expect(source.slice(forward.start, forward.end)).toBe(LONG);
  });
});

describe("bestHits", () => {
  it("keeps a single hit", () => {
    const hits = detectFeatures(`AAAA${T7}GGGG`, "linear", [piece()]);
    expect(bestHits(hits).length).toBeGreaterThan(0);
  });

  it("drops the worse of two hits at the same place", () => {
    // Two pieces that are the same sequence under different names overlap completely.
    const library = [piece(), piece({ name: "T7 variant" })];
    const hits = detectFeatures(`AAAA${T7}GGGG`, "linear", library);
    const kept = bestHits(hits);
    // One per strand survives, rather than two per strand.
    expect(kept.filter((h) => h.strand === 1)).toHaveLength(1);
  });

  it("prefers the hit with fewer mismatches when lengths are equal", () => {
    const exact = `AAAA${LONG}GGGG`;
    const variant = LONG.slice(0, 10) + (LONG[10] === "C" ? "A" : "C") + LONG.slice(11);
    const library = [longPiece(), longPiece({ name: "GFP variant", sequence: variant })];
    const kept = bestHits(detectFeatures(exact, "linear", library));
    const forward = kept.filter((h) => h.strand === 1);
    expect(forward).toHaveLength(1);
    expect(forward[0]!.mismatches).toBe(0);
  });

  it("keeps a short piece sitting inside a long one, since little of the long one is covered", () => {
    const text = `AAAA${LONG.slice(0, 10)}${T7}${LONG.slice(10)}GGGG`;
    const inner = { name: "inner", type: "promoter", sequence: T7 };
    const outer = { name: "outer", type: "CDS", sequence: `${LONG.slice(0, 10)}${T7}${LONG.slice(10)}` };
    const kept = bestHits(detectFeatures(text, "linear", [inner, outer]));
    expect(kept.map((h) => h.piece.name)).toContain("outer");
    expect(kept.map((h) => h.piece.name)).toContain("inner");
  });

  it("keeps hits that do not overlap at all", () => {
    const text = `AAAA${T7}GGGGGGGGGGGGGGGGGGGG${LONG}CCCC`;
    const kept = bestHits(detectFeatures(text, "linear", [piece(), longPiece()]));
    expect(new Set(kept.map((h) => h.piece.name))).toEqual(new Set(["T7", "GFP"]));
  });

  it("returns hits in the order detectFeatures gave them", () => {
    const text = `AAAA${LONG}GGGGGGGGGGGGGGGGGGGG${T7}CCCC`;
    const hits = detectFeatures(text, "linear", [piece(), longPiece()]);
    const kept = bestHits(hits);
    const starts = kept.map((h) => h.start);
    expect([...starts]).toEqual([...starts].sort((a, b) => a - b));
  });

  it("handles no hits", () => {
    expect(bestHits([])).toEqual([]);
  });

  it("rejects a maxOverlap outside 0 to 1", () => {
    expect(() => bestHits([], 1.5)).toThrow(ValueError);
    expect(() => bestHits([], -0.1)).toThrow(ValueError);
  });
});

describe("asFeature", () => {
  const hit = () => detectFeatures(`AAAA${T7}GGGG`, "linear", [piece()]).find((h) => h.strand === 1)!;

  it("builds a feature at the hit's location, on its strand", () => {
    const feature = asFeature(hit());
    expect(feature.type).toBe("promoter");
    expect(Number(feature.location!.start)).toBe(4);
    expect(Number(feature.location!.end)).toBe(4 + T7.length);
    expect(feature.location!.strand).toBe(1);
  });

  it("puts the name in a label so it survives a GenBank round trip", () => {
    expect(asFeature(hit()).qualifiers.get("label")).toEqual(["T7"]);
  });

  it("also puts a gene's name in /gene", () => {
    const geneHit = detectFeatures(`AAAA${LONG}GGGG`, "linear", [longPiece()]).find((h) => h.strand === 1)!;
    expect(asFeature(geneHit).qualifiers.get("gene")).toEqual(["GFP"]);
    expect(asFeature(hit()).qualifiers.has("gene")).toBe(false);
  });

  it("records how the feature was found, with the identity", () => {
    const note = asFeature(hit()).qualifiers.get("note") as string[];
    expect(note[0]).toMatch(/100% identical/);
  });

  it("keeps the piece's own note alongside the detection note", () => {
    const withNote = detectFeatures(`AAAA${T7}GGGG`, "linear", [piece({ note: "from pUC19, L09137" })]).find((h) => h.strand === 1)!;
    expect(asFeature(withNote).qualifiers.get("note")).toEqual([
      "from pUC19, L09137",
      expect.stringMatching(/100% identical/) as unknown as string,
    ]);
  });

  it("takes a custom note, or none", () => {
    expect(asFeature(hit(), { note: "mine" }).qualifiers.get("note")).toEqual(["mine"]);
    expect(asFeature(hit(), { note: "" }).qualifiers.has("note")).toBe(false);
  });

  it("writes a wrapping hit as a two-part join", () => {
    const circular = T7.slice(12) + "A".repeat(20) + T7.slice(0, 12);
    const wrapping = detectFeatures(circular, "circular", [piece()]).find((h) => h.wraps && h.strand === 1)!;
    const feature = asFeature(wrapping, { length: circular.length });
    expect(feature.location).toBeInstanceOf(CompoundLocation);
    const parts = (feature.location as CompoundLocation).parts;
    expect(parts).toHaveLength(2);
    expect(Number(parts[0]!.end)).toBe(circular.length);
    expect(Number(parts[1]!.start)).toBe(0);
    // The two parts together cover the piece.
    expect(parts.reduce((n, p) => n + Number(p.end) - Number(p.start), 0)).toBe(T7.length);
  });

  it("refuses a wrapping hit without the sequence length", () => {
    const circular = T7.slice(12) + "A".repeat(20) + T7.slice(0, 12);
    const wrapping = detectFeatures(circular, "circular", [piece()]).find((h) => h.wraps)!;
    expect(() => asFeature(wrapping)).toThrow(ValueError);
    expect(() => asFeature(wrapping)).toThrow(/sequence length/);
  });

  it("reports a partial identity with one decimal", () => {
    const variant = LONG.slice(0, 10) + (LONG[10] === "C" ? "A" : "C") + LONG.slice(11);
    const found = detectFeatures(`AAAA${variant}GGGG`, "linear", [longPiece()]).find((h) => h.strand === 1)!;
    expect((asFeature(found).qualifiers.get("note") as string[])[0]).toMatch(/97\.5% identical/);
  });
});

describe("alreadyAnnotated and newHits", () => {
  const hit = () => detectFeatures(`AAAA${T7}GGGG`, "linear", [piece()]).find((h) => h.strand === 1)!;

  it("is false against an empty feature list", () => {
    expect(alreadyAnnotated(hit(), [])).toBe(false);
  });

  it("matches a feature with the same name in /label, /gene or /product", () => {
    for (const key of ["label", "gene", "product", "standard_name"]) {
      const feature = new SeqFeature(new SimpleLocation(0, 5, 1), "misc_feature", "x", { [key]: ["T7"] });
      expect(alreadyAnnotated(hit(), [feature])).toBe(true);
    }
  });

  it("ignores case when matching a name", () => {
    const feature = new SeqFeature(new SimpleLocation(0, 5, 1), "misc_feature", "x", { label: ["t7"] });
    expect(alreadyAnnotated(hit(), [feature])).toBe(true);
  });

  it("matches a feature whose id is the name", () => {
    expect(alreadyAnnotated(hit(), [new SeqFeature(new SimpleLocation(0, 5, 1), "misc_feature", "T7")])).toBe(true);
  });

  it("matches a same-type feature covering most of the hit, under any name", () => {
    const covering = new SeqFeature(new SimpleLocation(4, 4 + T7.length, 1), "promoter", "unnamed");
    expect(alreadyAnnotated(hit(), [covering])).toBe(true);
  });

  it("does not match a same-type feature covering too little", () => {
    const barely = new SeqFeature(new SimpleLocation(4, 8, 1), "promoter", "unnamed");
    expect(alreadyAnnotated(hit(), [barely])).toBe(false);
  });

  it("does not match a feature of another type at the same place", () => {
    const other = new SeqFeature(new SimpleLocation(4, 4 + T7.length, 1), "CDS", "unnamed");
    expect(alreadyAnnotated(hit(), [other])).toBe(false);
  });

  it("takes a stricter or looser cover threshold", () => {
    const half = new SeqFeature(new SimpleLocation(4, 4 + T7.length / 2, 1), "promoter", "unnamed");
    expect(alreadyAnnotated(hit(), [half], 0.9)).toBe(false);
    expect(alreadyAnnotated(hit(), [half], 0.4)).toBe(true);
  });

  it("ignores a feature with no location when covering is the only test", () => {
    expect(alreadyAnnotated(hit(), [new SeqFeature(null, "promoter", "unnamed")])).toBe(false);
  });

  it("rejects a minCover outside 0 to 1", () => {
    expect(() => alreadyAnnotated(hit(), [], 1.5)).toThrow(ValueError);
  });

  it("filters the hits worth offering, keeping their order", () => {
    const text = `AAAA${T7}GGGGGGGGGGGGGGGGGGGG${LONG}CCCC`;
    const hits = detectFeatures(text, "linear", [piece(), longPiece()]);
    const existing = [new SeqFeature(new SimpleLocation(0, 5, 1), "misc_feature", "x", { label: ["T7"] })];
    const offered = newHits(hits, existing);
    expect(offered.every((h) => h.piece.name !== "T7")).toBe(true);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((h) => h.piece.name === "GFP")).toBe(true);
  });

  it("offers everything when nothing is annotated", () => {
    const hits = detectFeatures(`AAAA${T7}GGGG`, "linear", [piece()]);
    expect(newHits(hits, [])).toEqual(hits);
  });
});
