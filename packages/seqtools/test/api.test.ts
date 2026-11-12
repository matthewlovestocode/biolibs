import { describe, expect, it } from "vitest";
import { Seq } from "@biolibs/seq";
import { CodonAdaptationIndex, gcFraction, molecularWeight, ntSearch, seq1, seq3 } from "@biolibs/seqtools";

describe("seqtools API", () => {
  it("accepts text, Seq and MutableSeq alike", () => {
    expect(gcFraction(new Seq("ACTG"))).toBe(gcFraction("ACTG"));
  });
  it("round-trips amino acid codes", () => {
    expect(seq1(seq3("MAIV*"))).toBe("MAIV*");
  });
  it("finds ambiguous matches", () => {
    expect(ntSearch("ACGTGGAGAGATGAT", "GRG")).toEqual(["G[AG]G", 5, 7]);
  });
  it("computes molecular weight like the docs example", () => {
    expect(molecularWeight("ACGT", "DNA")).toBeCloseTo(1253.8027, 3);
  });
  it("prints a codon adaptation index table", () => {
    const cai = new CodonAdaptationIndex(["ATGGCCAAA", "ATGGCCAAG"]);
    expect(cai.toString().split("\n")[0]).toMatch(/^AAA\t\d\.\d{3}$/);
    expect(cai.size).toBe(64);
  });
});
