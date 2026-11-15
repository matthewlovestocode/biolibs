/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { commonSubStrings, terminalOverlap } from "@biolibs/assembly";
import { describe, expect, it } from "vitest";

describe("README: commonSubStrings", () => {
  it("finds every maximal shared stretch", () => {
    expect(commonSubStrings("gatgatttcggtagtta", "gtcagtatgtctatctatcgcg", 3))
      .toEqual([[1, 6, 3], [7, 17, 3], [10, 4, 3], [12, 3, 3]]);
  });

  it("reports seven for four characters against themselves", () => {
    // Every offset agrees with every other, which is why a near-uniform sequence is quadratic.
    expect(commonSubStrings("AAAA", "AAAA", 1))
      .toEqual([[0, 0, 4], [0, 1, 3], [1, 0, 3], [0, 2, 2], [2, 0, 2], [0, 3, 1], [3, 0, 1]]);
  });

  it("is case sensitive", () => {
    expect(commonSubStrings("ACGT", "acgt", 2)).toEqual([]);
  });
});

describe("README: terminalOverlap", () => {
  it("keeps only the stretches at a seam", () => {
    expect(terminalOverlap("agctatgtatcttgcatcgta", "gcatcgtagtctatttgcttac", 8))
      .toEqual([[13, 0, 8]]);
  });
});

describe("README: what they refuse", () => {
  it("passes on the library's own messages", () => {
    expect(() => commonSubStrings("", "ACGT", 2))
      .toThrowError("zero-size array to reduction operation maximum which has no identity");
    expect(() => commonSubStrings("AC", "AC", -1))
      .toThrowError("can't convert negative value to npy_uint64");
    expect(() => commonSubStrings("ACGé", "ACG", 2))
      .toThrowError("str must only contain ascii chars");
  });

  it("accepts a limit of zero, which asks the same as one", () => {
    expect(commonSubStrings("AC", "AC", 0)).toEqual(commonSubStrings("AC", "AC", 1));
  });
});
