import { describe, expect, it } from "vitest";
import { digest, findSites, gcContent, gcSkew, meltingTemp } from "@biolibs/seqtools";

describe("seqtools", () => {
  it("GC content and skew", () => {
    expect(gcContent("ATGC")).toBe(0.5);
    expect(gcSkew("GGGC")).toBe(0.5);
  });
  it("melting temperature", () => {
    expect(meltingTemp("ATGCATGC")).toBe(24); // Wallace: 2*4 + 4*4
    expect(meltingTemp("ATGCATGCATGCATGCATGC")).toBeCloseTo(64.9 + (41 * (10 - 16.4)) / 20);
  });
  it("finds sites and digests", () => {
    const dna = "AAAGAATTCCCCGGATCCTTT";
    expect(findSites(dna, "EcoRI")).toEqual([3]);
    expect(digest(dna, ["EcoRI", "BamHI"])).toEqual(["AAAG", "AATTCCCCG", "GATCCTTT"]);
  });
  it("throws for unknown enzyme", () => expect(() => findSites("ACGT", "Nope")).toThrow());
});
