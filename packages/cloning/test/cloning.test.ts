import { ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { residuesOf } from "@biolibs/seqedit";
import { describe, expect, it } from "vitest";
import {
  MAX_FRAGMENTS, NATURAL_END, assembleGibson, canSelfClose, canonicalCircular, closeCircle, cloneProducts,
  compatible, cutCounts, cutsIn, cuttersUpTo, describeEnd, describePiece, designGibson, endAt, flipEnd, flipPiece,
  joinPieces, lookupEnzymes, overlapLength, parseEnzymeNames, piecesOf, religate, reverseComplement,
} from "@biolibs/cloning";

/** A record with the topology annotation GenBank uses. */
function record(residues: string, id: string, circular: boolean, features: SeqFeature[] = []): SeqRecord {
  return new SeqRecord(
    new Seq(residues), id, id, "", [], features,
    new Map<string, unknown>([["molecule_type", "DNA"], ["topology", circular ? "circular" : "linear"]]),
  );
}

const enzymesNamed = (names: string[]) => lookupEnzymes(names).enzymes;

describe("reverseComplement", () => {
  it("complements and reverses, and is its own inverse", () => {
    expect(reverseComplement("GAATTC")).toBe("GAATTC");
    expect(reverseComplement("AAAA")).toBe("TTTT");
    expect(reverseComplement(reverseComplement("ACGTTGCA"))).toBe("ACGTTGCA");
  });

  it("leaves an N as an N and keeps the length", () => {
    expect(reverseComplement("ACNGT")).toBe("ACNGT");
    expect(reverseComplement("ACXGT")).toHaveLength(5);
  });
});

describe("ends", () => {
  it("reads a 5' overhang where the bottom strand is cut further along", () => {
    // EcoRI, G^AATTC: top cut at 1, bottom at 5.
    expect(endAt(1, 5, "GAATTC", "EcoRI")).toEqual({ kind: "5'", overhang: "AATT", enzyme: "EcoRI" });
  });

  it("reads a 3' overhang where the top strand is cut further along", () => {
    // PstI, CTGCA^G: top cut at 5, bottom at 1.
    expect(endAt(5, 1, "CTGCAG", "PstI")).toEqual({ kind: "3'", overhang: "TGCA", enzyme: "PstI" });
  });

  it("reads a blunt end where both strands are cut at one place", () => {
    expect(endAt(3, 3, "CCCGGG", "SmaI")).toEqual({ kind: "blunt", overhang: "", enzyme: "SmaI" });
  });

  it("rejects an overhang running outside the sequence", () => {
    expect(() => endAt(1, 99, "GAATTC", "X")).toThrow(ValueError);
    expect(() => endAt(-1, 2, "GAATTC", "X")).toThrow(ValueError);
  });

  it("pairs ends of the same kind and overhang, whatever enzyme made them", () => {
    const bamHI = { kind: "5'", overhang: "GATC", enzyme: "BamHI" } as const;
    const bglII = { kind: "5'", overhang: "GATC", enzyme: "BglII" } as const;
    expect(compatible(bamHI, bglII)).toBe(true);
  });

  it("does not pair different overhangs or different kinds", () => {
    expect(compatible(
      { kind: "5'", overhang: "GATC", enzyme: "BamHI" },
      { kind: "5'", overhang: "AATT", enzyme: "EcoRI" },
    )).toBe(false);
    expect(compatible(
      { kind: "5'", overhang: "TGCA", enzyme: "a" },
      { kind: "3'", overhang: "TGCA", enzyme: "b" },
    )).toBe(false);
  });

  it("pairs any two blunt ends", () => {
    expect(compatible(NATURAL_END, { kind: "blunt", overhang: "", enzyme: "SmaI" })).toBe(true);
  });

  it("reverse-complements an overhang when an end is turned over, keeping the kind", () => {
    expect(flipEnd({ kind: "5'", overhang: "AATT", enzyme: "EcoRI" })).toEqual({ kind: "5'", overhang: "AATT", enzyme: "EcoRI" });
    expect(flipEnd({ kind: "5'", overhang: "GGCC", enzyme: "x" })).toEqual({ kind: "5'", overhang: "GGCC", enzyme: "x" });
    expect(flipEnd({ kind: "3'", overhang: "TGCA", enzyme: "PstI" }).kind).toBe("3'");
    expect(flipEnd({ kind: "5'", overhang: "AAAA", enzyme: "x" }).overhang).toBe("TTTT");
  });

  it("describes an end for a message", () => {
    expect(describeEnd({ kind: "5'", overhang: "AATT", enzyme: "EcoRI" })).toBe("EcoRI (5' AATT)");
    expect(describeEnd({ kind: "blunt", overhang: "", enzyme: "SmaI" })).toBe("SmaI (blunt)");
    expect(describeEnd(NATURAL_END)).toBe("blunt");
  });
});

describe("lookupEnzymes and parseEnzymeNames", () => {
  it("finds real enzymes and reports the rest", () => {
    const { enzymes, unknown } = lookupEnzymes(["EcoRI", "NotAnEnzyme", "BamHI"]);
    expect(enzymes.map((e) => e.name)).toEqual(["EcoRI", "BamHI"]);
    expect(unknown).toEqual(["NotAnEnzyme"]);
  });

  it("ignores blanks and repeats", () => {
    const { enzymes } = lookupEnzymes(["EcoRI", " ", "EcoRI", ""]);
    expect(enzymes).toHaveLength(1);
  });

  it("trims surrounding space", () => {
    expect(lookupEnzymes([" EcoRI "]).enzymes.map((e) => e.name)).toEqual(["EcoRI"]);
  });

  it("reaches the whole REBASE set, not a short table", () => {
    // An enzyme no hand-written table would include.
    expect(lookupEnzymes(["AbaSI"]).enzymes).toHaveLength(1);
  });

  it("splits names typed as one string", () => {
    expect(parseEnzymeNames("EcoRI, BamHI + HindIII")).toEqual(["EcoRI", "BamHI", "HindIII"]);
    expect(parseEnzymeNames("")).toEqual([]);
    expect(parseEnzymeNames("  EcoRI  ")).toEqual(["EcoRI"]);
  });
});

describe("cutsIn", () => {
  it("converts Biopython's 1-based cut to a 0-based boundary", () => {
    expect(cutsIn("AAAGAATTCAAA", "linear", enzymesNamed(["EcoRI"]))).toEqual([
      { topCut: 4, bottomCut: 8, enzyme: "EcoRI" },
    ]);
  });

  it("puts the bottom cut before the top for a 3' overhang", () => {
    expect(cutsIn("AAACTGCAGAAA", "linear", enzymesNamed(["PstI"]))).toEqual([
      { topCut: 8, bottomCut: 4, enzyme: "PstI" },
    ]);
  });

  it("puts both cuts together for a blunt cutter", () => {
    expect(cutsIn("AAACCCGGGAAA", "linear", enzymesNamed(["SmaI"]))).toEqual([
      { topCut: 6, bottomCut: 6, enzyme: "SmaI" },
    ]);
  });

  it("reads the overhang the cut implies straight off the sequence", () => {
    const residues = "AAAGAATTCAAA";
    const cut = cutsIn(residues, "linear", enzymesNamed(["EcoRI"]))[0]!;
    expect(residues.slice(cut.topCut, cut.bottomCut)).toBe("AATT");
  });

  it("finds nothing where there is no site", () => {
    expect(cutsIn("AAAAAAAAAAAA", "linear", enzymesNamed(["EcoRI"]))).toEqual([]);
  });

  it("finds every site, ordered by position", () => {
    const cuts = cutsIn(`GAATTC${"A".repeat(20)}GAATTC`, "linear", enzymesNamed(["EcoRI"]));
    expect(cuts).toHaveLength(2);
    expect(cuts[0]!.topCut).toBeLessThan(cuts[1]!.topCut);
  });

  it("counts cuts per enzyme and names the unique cutters", () => {
    const residues = `GAATTC${"A".repeat(20)}GAATTC${"T".repeat(20)}GGATCC`;
    const cuts = cutsIn(residues, "linear", enzymesNamed(["EcoRI", "BamHI"]));
    expect(cutCounts(cuts)).toEqual(new Map([["EcoRI", 2], ["BamHI", 1]]));
    expect(cuttersUpTo(cuts)).toEqual(["BamHI"]);
    expect(cuttersUpTo(cuts, 2)).toEqual(["BamHI", "EcoRI"]);
  });
});

describe("piecesOf", () => {
  const linear = record("AAAGAATTCAAAGGATCCAAA", "lin", false);

  it("gives one more piece than there are cuts on a line", () => {
    expect(piecesOf(linear, enzymesNamed(["EcoRI", "BamHI"]))).toHaveLength(3);
  });

  it("gives the whole record as one piece when nothing cuts a line", () => {
    const pieces = piecesOf(linear, enzymesNamed(["NotI"]));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.residues).toBe(residuesOf(linear));
    expect(pieces[0]!.left).toEqual(NATURAL_END);
  });

  it("gives no pieces when nothing cuts a circle, since nothing has been cut", () => {
    expect(piecesOf(record("A".repeat(50), "circ", true), enzymesNamed(["EcoRI"]))).toEqual([]);
  });

  it("keeps the ends a line already had on its outer pieces", () => {
    const pieces = piecesOf(linear, enzymesNamed(["EcoRI", "BamHI"]));
    expect(pieces[0]!.left).toEqual(NATURAL_END);
    expect(pieces[pieces.length - 1]!.right).toEqual(NATURAL_END);
  });

  it("gives each inner piece the ends of the cuts either side", () => {
    const pieces = piecesOf(linear, enzymesNamed(["EcoRI", "BamHI"]));
    const middle = pieces[1]!;
    expect(middle.left.enzyme).toBe("EcoRI");
    expect(middle.left.overhang).toBe("AATT");
    expect(middle.right.enzyme).toBe("BamHI");
    expect(middle.right.overhang).toBe("GATC");
  });

  it("starts each piece's top strand at its cut", () => {
    const pieces = piecesOf(linear, enzymesNamed(["EcoRI", "BamHI"]));
    expect(pieces[0]!.residues).toBe("AAAG");
    expect(pieces[1]!.residues).toBe("AATTCAAAG");
    expect(pieces[2]!.residues).toBe("GATCCAAA");
  });

  it("accounts for every base of a line exactly once", () => {
    const pieces = piecesOf(linear, enzymesNamed(["EcoRI", "BamHI"]));
    expect(pieces.map((p) => p.residues).join("")).toBe(residuesOf(linear));
  });

  it("gives a circle as many pieces as cuts, one spanning the origin", () => {
    const circular = record(`GAATTC${"A".repeat(40)}GGATCC${"T".repeat(40)}`, "circ", true);
    const pieces = piecesOf(circular, enzymesNamed(["EcoRI", "BamHI"]));
    expect(pieces).toHaveLength(2);
    expect(pieces.filter((p) => p.wraps)).toHaveLength(1);
    expect(pieces.reduce((n, p) => n + p.length, 0)).toBe(92);
  });

  it("leaves a circle cut once as a single piece of the full length", () => {
    const circular = record(`GAATTC${"A".repeat(40)}`, "circ", true);
    const pieces = piecesOf(circular, enzymesNamed(["EcoRI"]));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.length).toBe(46);
    expect(pieces[0]!.left.enzyme).toBe("EcoRI");
    expect(pieces[0]!.right.enzyme).toBe("EcoRI");
  });

  it("carries the features that fall in a piece", () => {
    const withFeature = record("AAAGAATTCAAAGGATCCAAA", "lin", false, [
      new SeqFeature(new SimpleLocation(0, 4, 1), "gene", "early"),
      new SeqFeature(new SimpleLocation(14, 20, 1), "gene", "late"),
    ]);
    const pieces = piecesOf(withFeature, enzymesNamed(["EcoRI", "BamHI"]));
    expect(pieces[0]!.record.features.map((f) => f.id)).toContain("early");
    expect(pieces[2]!.record.features.map((f) => f.id)).toContain("late");
  });

  it("refuses an enzyme whose cut is not known", () => {
    // Bio.Restriction carries enzymes whose cut position is undefined; they cannot be simulated.
    const undefinedCutters = ["BcgI"];
    const { enzymes } = lookupEnzymes(undefinedCutters);
    if (enzymes.length > 0 && enzymes[0]!.ovhg === null) {
      expect(() => piecesOf(linear, enzymes)).toThrow(ValueError);
    }
  });
});

describe("flipPiece", () => {
  const circular = record(`GAATTC${"A".repeat(40)}GGATCC${"T".repeat(40)}`, "circ", true);
  const piece = () => piecesOf(circular, enzymesNamed(["EcoRI", "BamHI"]))[0]!;

  it("reverse-complements the sequence", () => {
    expect(flipPiece(piece()).residues).toBe(reverseComplement(piece().residues));
  });

  it("exchanges the ends and reverse-complements each overhang", () => {
    const original = piece();
    const flipped = flipPiece(original);
    expect(flipped.left).toEqual(flipEnd(original.right));
    expect(flipped.right).toEqual(flipEnd(original.left));
  });

  it("is its own inverse", () => {
    const original = piece();
    const twice = flipPiece(flipPiece(original));
    expect(twice.residues).toBe(original.residues);
    expect(twice.left).toEqual(original.left);
    expect(twice.right).toEqual(original.right);
  });

  it("keeps the length", () => {
    expect(flipPiece(piece()).residues).toHaveLength(piece().length);
  });

  it("describes a piece for a message", () => {
    expect(describePiece(piece())).toMatch(/^46 bp \(EcoRI to BamHI\)$/);
  });
});

describe("joinPieces, closeCircle and religate", () => {
  const circular = record(`GAATTC${"A".repeat(40)}GGATCC${"T".repeat(40)}`, "circ", true);
  const pieces = () => piecesOf(circular, enzymesNamed(["EcoRI", "BamHI"]));

  it("joins two pieces whose ends pair, giving one top strand after the other", () => {
    const [first, second] = pieces();
    const joined = joinPieces(first!, second!);
    expect(joined.residues).toBe(first!.residues + second!.residues);
    expect(joined.length).toBe(92);
  });

  it("takes the outer ends of the two pieces", () => {
    const [first, second] = pieces();
    const joined = joinPieces(first!, second!);
    expect(joined.left).toEqual(first!.left);
    expect(joined.right).toEqual(second!.right);
  });

  it("refuses to join ends that do not pair", () => {
    const [first] = pieces();
    expect(() => joinPieces(first!, first!)).toThrow(ValueError);
    expect(() => joinPieces(first!, first!)).toThrow(/does not pair/);
  });

  it("carries both pieces' features, the right one moved along", () => {
    const withFeatures = record(`GAATTC${"A".repeat(40)}GGATCC${"T".repeat(40)}`, "circ", true, [
      new SeqFeature(new SimpleLocation(10, 20, 1), "gene", "early"),
      new SeqFeature(new SimpleLocation(60, 70, 1), "gene", "late"),
    ]);
    const [first, second] = piecesOf(withFeatures, enzymesNamed(["EcoRI", "BamHI"]));
    const joined = joinPieces(first!, second!);
    const ids = joined.record.features.map((f) => f.id);
    expect(ids).toContain("early");
    expect(ids).toContain("late");
    const late = joined.record.features.find((f) => f.id === "late")!;
    expect(Number(late.location!.start)).toBeGreaterThanOrEqual(first!.length);
  });

  it("closes a piece whose ends pair into a circle", () => {
    const circle = closeCircle(joinPieces(pieces()[0]!, pieces()[1]!));
    expect(circle.annotations.get("topology")).toBe("circular");
    expect(residuesOf(circle)).toHaveLength(92);
  });

  it("refuses to close a piece whose ends do not pair", () => {
    expect(() => closeCircle(pieces()[0]!)).toThrow(ValueError);
    expect(canSelfClose(pieces()[0]!)).toBe(false);
  });

  it("says a piece cut twice by one enzyme can self-close", () => {
    const oneEnzyme = record(`GAATTC${"A".repeat(40)}GAATTC${"T".repeat(40)}`, "circ", true);
    expect(piecesOf(oneEnzyme, enzymesNamed(["EcoRI"])).every(canSelfClose)).toBe(true);
  });

  it("re-ligates a digest back into the plasmid it came from", () => {
    const original = residuesOf(circular);
    const back = religate(pieces(), "back");
    expect(residuesOf(back)).toHaveLength(original.length);
    expect(canonicalCircular(residuesOf(back))).toBe(canonicalCircular(original));
  });

  it("re-ligates a digest of three pieces", () => {
    const three = record(`GAATTC${"A".repeat(30)}GGATCC${"T".repeat(30)}AAGCTT${"G".repeat(30)}`, "circ", true);
    const parts = piecesOf(three, enzymesNamed(["EcoRI", "BamHI", "HindIII"]));
    expect(parts).toHaveLength(3);
    expect(canonicalCircular(residuesOf(religate(parts)))).toBe(canonicalCircular(residuesOf(three)));
  });

  it("refuses to re-ligate nothing", () => {
    expect(() => religate([])).toThrow(ValueError);
  });
});

describe("cloneProducts", () => {
  const vector = record(`GAATTC${"A".repeat(60)}GGATCC${"T".repeat(60)}`, "pVEC", true);
  const insert = record(`CCGAATTC${"G".repeat(50)}GGATCCCC`, "myGene", false);

  it("finds the circles a vector and an insert make", () => {
    const result = cloneProducts(vector, insert, ["EcoRI", "BamHI"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products.length).toBeGreaterThan(0);
  });

  it("gives a product whose length is the two fragments added", () => {
    const result = cloneProducts(vector, insert, ["EcoRI", "BamHI"]);
    if (!result.ok) throw new Error(result.error);
    for (const product of result.products) {
      expect(product.length).toBe(product.vector.length + product.insert.length);
      expect(residuesOf(product.record)).toHaveLength(product.length);
    }
  });

  it("marks the product circular", () => {
    const result = cloneProducts(vector, insert, ["EcoRI", "BamHI"]);
    if (!result.ok) throw new Error(result.error);
    expect(result.products[0]!.record.annotations.get("topology")).toBe("circular");
  });

  it("reports both orientations when both junctions pair either way", () => {
    const result = cloneProducts(vector, insert, ["EcoRI", "BamHI"]);
    if (!result.ok) throw new Error(result.error);
    expect(new Set(result.products.map((p) => p.orientation))).toEqual(new Set(["as written", "turned over"]));
  });

  it("gives a product that the same enzymes cut back into the two fragments", () => {
    const result = cloneProducts(vector, insert, ["EcoRI", "BamHI"]);
    if (!result.ok) throw new Error(result.error);
    const product = result.products[0]!;
    const recut = piecesOf(product.record, enzymesNamed(["EcoRI", "BamHI"]));
    expect(recut).toHaveLength(2);
    expect(recut.map((p) => p.length).sort((a, b) => b - a))
      .toEqual([product.vector.length, product.insert.length].sort((a, b) => b - a));
  });

  it("describes each product in a sentence", () => {
    const result = cloneProducts(vector, insert, ["EcoRI", "BamHI"]);
    if (!result.ok) throw new Error(result.error);
    expect(result.products[0]!.description).toMatch(/bp: vector .* \+ myGene .*, (as written|turned over)/);
  });

  it("puts the largest vector fragment first", () => {
    const result = cloneProducts(vector, insert, ["EcoRI", "BamHI"]);
    if (!result.ok) throw new Error(result.error);
    const lengths = result.products.map((p) => p.vector.length);
    expect([...lengths]).toEqual([...lengths].sort((a, b) => b - a));
  });

  it("joins BamHI to BglII, since they leave the same overhang", () => {
    const bamVector = record(`GGATCC${"A".repeat(60)}GGATCC${"T".repeat(60)}`, "pBAM", true);
    const bglInsert = record(`CCAGATCT${"G".repeat(50)}AGATCTCC`, "bglGene", false);
    const result = cloneProducts(bamVector, bglInsert, ["BamHI"], ["BglII"]);
    expect(result.ok).toBe(true);
  });

  it("reports unknown enzymes", () => {
    const result = cloneProducts(vector, insert, ["EcoRI", "Nonsense"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not known enzymes: Nonsense/);
  });

  it("refuses a vector that is not circular", () => {
    const result = cloneProducts(record("GAATTC", "lin", false), insert, ["EcoRI"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/must be circular/);
  });

  it("says when the enzymes do not cut the vector", () => {
    const result = cloneProducts(record("A".repeat(100), "pFLAT", true), insert, ["EcoRI"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/do not cut the vector/);
  });

  it("says when nothing can be freed from the insert", () => {
    const result = cloneProducts(vector, record("A".repeat(100), "flat", false), ["EcoRI", "BamHI"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/do not cut the insert/);
  });

  it("says when the ends do not pair", () => {
    const hindInsert = record(`CCAAGCTT${"G".repeat(50)}AAGCTTCC`, "hindGene", false);
    const result = cloneProducts(vector, hindInsert, ["EcoRI", "BamHI"], ["HindIII"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/do not pair/);
  });

  it("says when no enzymes were given", () => {
    expect(cloneProducts(vector, insert, []).ok).toBe(false);
  });

  it("carries the insert's features into the product", () => {
    const annotated = record(`CCGAATTC${"G".repeat(50)}GGATCCCC`, "myGene", false, [
      new SeqFeature(new SimpleLocation(10, 40, 1), "CDS", "theGene", { gene: ["theGene"] }),
    ]);
    const result = cloneProducts(vector, annotated, ["EcoRI", "BamHI"]);
    if (!result.ok) throw new Error(result.error);
    expect(result.products[0]!.record.features.map((f) => f.id)).toContain("theGene");
  });
});

describe("overlapLength", () => {
  it("finds the overlap between one sequence's end and another's start", () => {
    expect(overlapLength("AAAGGTACC", "GGTACCTTT", 6, 60)).toBe(6);
  });

  it("prefers the longest overlap in range", () => {
    expect(overlapLength("AAAAAAAAAA", "AAAAAAAAAA", 2, 10)).toBe(10);
    expect(overlapLength("AAAAAAAAAA", "AAAAAAAAAA", 2, 4)).toBe(4);
  });

  it("gives zero when there is none long enough", () => {
    expect(overlapLength("AAAGGTACC", "GGTACCTTT", 7, 60)).toBe(0);
    expect(overlapLength("AAAA", "CCCC", 2, 60)).toBe(0);
  });

  it("is not symmetric", () => {
    expect(overlapLength("AAACCC", "CCCGGG", 3, 60)).toBe(3);
    expect(overlapLength("CCCGGG", "AAACCC", 3, 60)).toBe(0);
  });

  it("rejects a bad range", () => {
    expect(() => overlapLength("A", "A", 0, 10)).toThrow(ValueError);
    expect(() => overlapLength("A", "A", 10, 5)).toThrow(ValueError);
  });
});

describe("canonicalCircular", () => {
  it("is the same for every rotation of a circle", () => {
    expect(canonicalCircular("GCATT")).toBe(canonicalCircular("TTGCA"));
    expect(canonicalCircular("GCATT")).toBe(canonicalCircular("ATTGC"));
  });

  it("is the same for a circle and its reverse complement, being one molecule", () => {
    expect(canonicalCircular("GCATTAC")).toBe(canonicalCircular(reverseComplement("GCATTAC")));
  });

  it("differs for different circles", () => {
    expect(canonicalCircular("GGGGCCCCAAAA")).not.toBe(canonicalCircular("GGGGCCCCAAAT"));
  });

  it("handles an empty sequence", () => {
    expect(canonicalCircular("")).toBe("");
  });
});

describe("assembleGibson", () => {
  // Two fragments sharing an overlap at each junction, which is what a two-piece ring needs.
  const ov1 = "ACGTTGCATTAGCCAGTCA";
  const ov2 = "GGATCCATTAGCATCGATG";
  const x = "ATGGGCCCTTTAAAGGGCCCTTTAAA";
  const y = "TTTTCCCCGGGGAAAACCCCTTTTGG";
  const ring = ov1 + x + ov2 + y;
  const a = { name: "a", residues: ov1 + x + ov2 };
  const b = { name: "b", residues: ov2 + y + ov1 };

  it("assembles two fragments that overlap at both junctions", () => {
    const result = assembleGibson([a, b], { minOverlap: 15 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products).toHaveLength(1);
  });

  it("gives the ring the fragments actually make", () => {
    const result = assembleGibson([a, b], { minOverlap: 15 });
    if (!result.ok) throw new Error(result.error);
    const product = result.products[0]!;
    expect(product.length).toBe(ring.length);
    expect(canonicalCircular(residuesOf(product.record))).toBe(canonicalCircular(ring));
  });

  it("writes each overlap once, so the ring is the fragments less the overlaps", () => {
    const result = assembleGibson([a, b], { minOverlap: 15 });
    if (!result.ok) throw new Error(result.error);
    const product = result.products[0]!;
    const fragmentTotal = a.residues.length + b.residues.length;
    const overlapTotal = product.junctions.reduce((n, j) => n + j.length, 0);
    expect(product.length).toBe(fragmentTotal - overlapTotal);
  });

  it("marks the product circular and reports each junction's melting temperature", () => {
    const result = assembleGibson([a, b], { minOverlap: 15 });
    if (!result.ok) throw new Error(result.error);
    const product = result.products[0]!;
    expect(product.record.annotations.get("topology")).toBe("circular");
    expect(product.junctions).toHaveLength(2);
    for (const junction of product.junctions) {
      expect(junction.length).toBe(19);
      expect(junction.tm).toBeGreaterThan(30);
      expect(junction.overlap).toHaveLength(junction.length);
    }
  });

  it("reports one product per molecule, not one per fragment order", () => {
    // Starting the ring at a or at b gives the same plasmid, so it is reported once.
    const result = assembleGibson([a, b], { minOverlap: 15 });
    if (!result.ok) throw new Error(result.error);
    expect(result.products).toHaveLength(1);
  });

  it("assembles three fragments, whatever order they are given in", () => {
    const ov3 = "CCGGTTAACCGGTTAACCG";
    const z = "AGCTAGCTAGCTAGCTAGCTAGCTAG";
    const three = [
      { name: "c", residues: ov3 + z + ov1 },
      { name: "a", residues: ov1 + x + ov2 },
      { name: "b", residues: ov2 + y + ov3 },
    ];
    const result = assembleGibson(three, { minOverlap: 15 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products).toHaveLength(1);
    expect(result.products[0]!.length).toBe(ov1.length + x.length + ov2.length + y.length + ov3.length + z.length);
  });

  it("turns a fragment over when that is what makes the ring", () => {
    const flipped = { name: "b", residues: reverseComplement(b.residues) };
    const result = assembleGibson([a, flipped], { minOverlap: 15 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products[0]!.order.find((f) => f.name === "b")!.flipped).toBe(true);
    expect(canonicalCircular(residuesOf(result.products[0]!.record))).toBe(canonicalCircular(ring));
  });

  it("does not turn a fragment over when told not to", () => {
    const flipped = { name: "b", residues: reverseComplement(b.residues) };
    expect(assembleGibson([a, flipped], { minOverlap: 15, allowFlips: false }).ok).toBe(false);
  });

  it("closes a single fragment whose own ends overlap", () => {
    const self = { name: "self", residues: ov1 + x + ov1 };
    const result = assembleGibson([self], { minOverlap: 15 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products[0]!.length).toBe(ov1.length + x.length);
  });

  it("names the fragment that has no partner", () => {
    const lonely = { name: "lonely", residues: "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT" };
    const result = assembleGibson([a, b, lonely], { minOverlap: 15 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/'lonely'/);
  });

  it("says when fragments overlap only at one junction", () => {
    const halfOpen = { name: "b", residues: ov2 + y + "CCCCCCCCCCCCCCCCCCCC" };
    const result = assembleGibson([a, halfOpen], { minOverlap: 15 });
    expect(result.ok).toBe(false);
  });

  it("honours a longer minimum overlap", () => {
    expect(assembleGibson([a, b], { minOverlap: 25 }).ok).toBe(false);
  });

  it("rejects a bad overlap range, too many fragments, none, or bad input", () => {
    expect(assembleGibson([a, b], { minOverlap: 0 }).ok).toBe(false);
    expect(assembleGibson([a, b], { minOverlap: 30, maxOverlap: 20 }).ok).toBe(false);
    expect(assembleGibson([]).ok).toBe(false);
    const many = Array.from({ length: MAX_FRAGMENTS + 1 }, (_, i) => ({ name: `f${i}`, residues: ring }));
    expect(assembleGibson(many).ok).toBe(false);
    expect(assembleGibson([a, { name: "bad", residues: "ACGTN".repeat(10) }]).ok).toBe(false);
    expect(assembleGibson([a, { name: "a", residues: b.residues }]).ok).toBe(false);
    expect(assembleGibson([a, { name: "", residues: b.residues }]).ok).toBe(false);
  });

  it("rejects a fragment too short to carry the overlap", () => {
    const result = assembleGibson([a, { name: "tiny", residues: "ACGTACGTAC" }], { minOverlap: 15 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too short/);
  });

  it("carries a fragment's features into the ring", () => {
    const annotated = {
      name: "a",
      residues: a.residues,
      record: record(a.residues, "a", false, [new SeqFeature(new SimpleLocation(25, 40, 1), "gene", "inA")]),
    };
    const result = assembleGibson([annotated, b], { minOverlap: 15 });
    if (!result.ok) throw new Error(result.error);
    expect(result.products[0]!.record.features.map((f) => f.id)).toContain("inA");
  });
});

describe("designGibson", () => {
  const backbone = "A".repeat(40) + "GCTAGCTAGCTGATCGATCGTAGCTAGCTA";
  const inserted = "TTGCATCGATCGATTAGCCAGTCAGCATCGAT" + "GTACGTACGTACGTACGTACGTACGTACGTAC";

  it("designs a pair of primers for each amplified fragment", () => {
    const result = designGibson([
      { name: "bb", residues: backbone, amplify: false },
      { name: "ins", residues: inserted },
    ], { overlap: 16 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.primers.map((p) => p.name)).toEqual(["ins-F", "ins-R"]);
  });

  it("puts the whole overlap on the neighbour's primer when a fragment is not amplified", () => {
    const result = designGibson([
      { name: "bb", residues: backbone, amplify: false },
      { name: "ins", residues: inserted },
    ], { overlap: 16 });
    if (!result.ok) throw new Error(result.error);
    for (const primer of result.design.primers) expect(primer.tail).toHaveLength(16);
    for (const junction of result.design.junctions) {
      expect(junction.carried.fromReverse + junction.carried.toForward).toBe(16);
    }
  });

  it("shares an overlap between two amplified fragments", () => {
    const result = designGibson([
      { name: "one", residues: backbone },
      { name: "two", residues: inserted },
    ], { overlap: 16 });
    if (!result.ok) throw new Error(result.error);
    for (const junction of result.design.junctions) {
      expect(junction.carried.fromReverse).toBe(8);
      expect(junction.carried.toForward).toBe(8);
    }
    for (const primer of result.design.primers) expect(primer.tail).toHaveLength(8);
  });

  it("makes each primer the tail followed by the binding part", () => {
    const result = designGibson([
      { name: "bb", residues: backbone, amplify: false },
      { name: "ins", residues: inserted },
    ], { overlap: 16 });
    if (!result.ok) throw new Error(result.error);
    for (const primer of result.design.primers) {
      expect(primer.sequence).toBe(primer.tail + primer.binding);
      expect(primer.binding_report.sequence).toBe(primer.binding);
    }
  });

  it("anchors each binding part on its own fragment", () => {
    const result = designGibson([
      { name: "bb", residues: backbone, amplify: false },
      { name: "ins", residues: inserted },
    ], { overlap: 16 });
    if (!result.ok) throw new Error(result.error);
    const forward = result.design.primers.find((p) => p.direction === "forward")!;
    const reverse = result.design.primers.find((p) => p.direction === "reverse")!;
    expect(inserted.startsWith(forward.binding)).toBe(true);
    expect(inserted.endsWith(reverseComplement(reverse.binding))).toBe(true);
  });

  it("gives the ring's length as the fragments less one copy of each overlap", () => {
    const result = designGibson([
      { name: "bb", residues: backbone, amplify: false },
      { name: "ins", residues: inserted },
    ], { overlap: 16 });
    if (!result.ok) throw new Error(result.error);
    expect(result.design.length).toBe(backbone.length + inserted.length - 32);
  });

  it("designs one junction per fragment, the last closing the ring", () => {
    const result = designGibson([
      { name: "bb", residues: backbone, amplify: false },
      { name: "ins", residues: inserted },
    ], { overlap: 16 });
    if (!result.ok) throw new Error(result.error);
    expect(result.design.junctions.map((j) => [j.from, j.to])).toEqual([["bb", "ins"], ["ins", "bb"]]);
  });

  it("warns about a cool overlap and passes a primer's own warnings through", () => {
    const result = designGibson([
      { name: "bb", residues: "A".repeat(70), amplify: false },
      { name: "ins", residues: "A".repeat(20) + "T".repeat(50) },
    ], { overlap: 16 });
    if (!result.ok) throw new Error(result.error);
    expect(result.design.warnings.length).toBeGreaterThan(0);
    expect(result.design.warnings.some((w) => /melts at/.test(w))).toBe(true);
  });

  it("refuses when two neighbours are both left unamplified", () => {
    const result = designGibson([
      { name: "a", residues: backbone, amplify: false },
      { name: "b", residues: inserted, amplify: false },
    ], { overlap: 16 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least one fragment must be amplified/);
  });

  it("refuses a neighbouring pair that is both fixed in a longer ring", () => {
    const third = "C".repeat(40) + "GGCCAATTGGCCAATTGGCC";
    const result = designGibson([
      { name: "a", residues: backbone, amplify: false },
      { name: "b", residues: inserted, amplify: false },
      { name: "c", residues: third },
    ], { overlap: 16 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/neither 'a' nor 'b' is amplified/);
  });

  it("rejects fewer than two fragments, a bad overlap, or bad input", () => {
    expect(designGibson([{ name: "a", residues: backbone }]).ok).toBe(false);
    expect(designGibson([{ name: "a", residues: backbone }, { name: "b", residues: inserted }], { overlap: 5 }).ok).toBe(false);
    expect(designGibson([{ name: "a", residues: backbone }, { name: "b", residues: inserted }], { overlap: 100 }).ok).toBe(false);
    expect(designGibson([{ name: "a", residues: backbone }, { name: "a", residues: inserted }]).ok).toBe(false);
    expect(designGibson([{ name: "a", residues: "ACGTN".repeat(20) }, { name: "b", residues: inserted }]).ok).toBe(false);
  });

  it("rejects a fragment too short for the overlap and a primer", () => {
    const result = designGibson([
      { name: "a", residues: backbone },
      { name: "short", residues: "ACGTACGTACGTACGTACGT" },
    ], { overlap: 25 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too short/);
  });
});
