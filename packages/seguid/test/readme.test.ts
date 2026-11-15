/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { AssertionError, ValueError } from "@biolibs/core";
import { Dseq, seguidOf } from "@biolibs/dseq";
import { ALPHABETS, assertComplementary, assertInAlphabet, cdseguid, csseguid, ldseguid, lsseguid,
  minRotation, rotate, rotateToMin, seguid, tableFactory } from "@biolibs/seguid";
import { describe, expect, it } from "vitest";

describe("README: the checksums", () => {
  it("gives each variant's checksum", () => {
    expect(seguid("GATTACA")).toBe("seguid=tp2jzeCM2e3W4yxtrrx09CMKa/8");
    expect(lsseguid("GATTACA")).toBe("lsseguid=tp2jzeCM2e3W4yxtrrx09CMKa_8");
    expect(csseguid("GATTACA")).toBe("csseguid=mtrvbtuwr6_MoBxvtm4BEpv-jKQ");
    expect(ldseguid("GATTACA", "TGTAATC")).toBe("ldseguid=zDq4dp6G3AIsldhPDDL8S5A0BKk");
    expect(cdseguid("GAATTCGG", "CCGAATTC")).toBe("cdseguid=ngaZNIVvW0vWnz91kMnoJrFcWiI");
  });

  it("takes an alphabet and a form", () => {
    expect(lsseguid("GATTACA", "{DNA}", "short")).toBe("tp2jze");
    expect(lsseguid("GATTACA", "{DNA}", "both"))
      .toEqual(["tp2jze", "lsseguid=tp2jzeCM2e3W4yxtrrx09CMKa_8"]);
    expect(lsseguid("GAUUACA", "{RNA}")).toBe("lsseguid=NTXSpBPMp73fAKo85eV-5P1lO2k");
    expect(seguid("MKKLYS", "{protein}")).toBe("seguid=/CAYn4t4bBIoFA5oQ/4oYypGsTs");
  });

  it("is free of the origin for a circle, and not for a linear molecule", () => {
    const origins = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => csseguid(rotate("GAATTCGG", n)));
    expect(new Set(origins).size).toBe(1);
    expect(origins[0]).toBe("csseguid=Mav3XgQmACy3tBbLLGSH2fk3RpI");

    expect(lsseguid("GAATTCGG")).toBe("lsseguid=OJMdfIfDLRdIZV5N1sxYn0ZtR-Y");
    expect(lsseguid(rotate("GAATTCGG", 3))).toBe("lsseguid=WuDFWTNb0m_IDRCMvM5UWusPj_g");
  });

  it("is free of the origin and of the strand order for a circular duplex", () => {
    const expected = "cdseguid=ngaZNIVvW0vWnz91kMnoJrFcWiI";
    expect(cdseguid("GAATTCGG", "CCGAATTC")).toBe(expected);
    expect(cdseguid("CCGAATTC", "GAATTCGG")).toBe(expected);
    // The crick strand runs the other way, so a duplex rotates by +n and -n.
    expect(cdseguid(rotate("GAATTCGG", 3), rotate("CCGAATTC", -3))).toBe(expected);
  });
});

describe("README: alphabets", () => {
  it("names the alphabets and builds their pairing tables", () => {
    expect(Object.keys(ALPHABETS)).toEqual(
      ["{DNA}", "{RNA}", "{DNA-extended}", "{RNA-extended}", "{protein}", "{protein-extended}"]);
    expect(ALPHABETS["{DNA}"]).toBe("GC,AT");

    expect([...tableFactory("GC,AT")]).toEqual([["G", "C"], ["C", "G"], ["A", "T"], ["T", "A"]]);
    expect([...tableFactory("{protein}")].slice(0, 3)).toEqual([["A", ""], ["C", ""], ["D", ""]]);
  });

  it("composes a name with further pairs", () => {
    expect([...tableFactory("{DNA-extended},AU")].length).toBe(16);
  });

  it("refuses a specification it cannot read", () => {
    // Entries of different lengths come from a bare `assert`, so there is no message.
    expect(() => tableFactory("GC,ATT")).toThrowError(AssertionError);
    expect(() => tableFactory("ATT")).toThrowError("Unknown alphabet specification: ATT");
  });
});

describe("README: the checks", () => {
  it("passes what fits the alphabet and the duplex", () => {
    expect(assertInAlphabet("GATTACA", tableFactory("{DNA}").keys())).toBeUndefined();
    expect(assertComplementary("GATTACA", "TGTAATC", "{DNA}")).toBeUndefined();
    expect(assertComplementary("GATTACA", "TGTAAT-", "{DNA}")).toBeUndefined();
  });

  it("names what does not", () => {
    expect(() => assertInAlphabet("gattaca", tableFactory("{DNA}").keys()))
      .toThrowError("Detected symbols 'a c g t' not in the 'alphabet'");
    expect(() => assertComplementary("GATTACA", "TGTAATG", "{DNA}"))
      .toThrowError("Non-complementary basepair (G,G) detected at position 1");
    expect(() => assertComplementary("GATTACA", "TGTAAT", "{DNA}")).toThrowError(AssertionError);
    expect(() => assertComplementary("MKK", "KKM", "{protein}"))
      .toThrowError("Was a single-stranded alphabet used by mistake?");
  });
});

describe("README: rotation", () => {
  it("rotates and finds the smallest reading", () => {
    expect(rotate("GATTACA", 3)).toBe("TACAGAT");
    expect(rotate("GATTACA", -1)).toBe("AGATTAC");
    expect(rotate("GATTACA", 10)).toBe("TACAGAT");

    expect(minRotation("TAAA")).toBe(1);
    expect(rotateToMin("TAAA")).toBe("AAAT");
    expect(rotateToMin("CCGAATTC")).toBe("AATTCCCG");
  });

  it("returns the reference's negative offset for a fully repeated sequence", () => {
    expect(minRotation("AA")).toBe(-1);
    expect(rotate("AA", -1)).toBe("AA");
  });
});

describe("README: refusals", () => {
  it("raises the type and message the Python raises", () => {
    expect(() => seguid("")).toThrowError("A sequence must not be empty");
    expect(() => seguid("GATTACA", "{RNA}"))
      .toThrowError("Detected symbols 'T' not in the 'alphabet'");
    expect(() => ldseguid("", "")).toThrowError("Watson sequence must not be empty");
    // The table in the README, row by row.
    expect(() => ldseguid("GATTACA", "TGTAAT")).toThrowError(AssertionError);
    expect(() => ldseguid("MKK", "KKM", "{protein}"))
      .toThrowError("Was a single-stranded alphabet used by mistake?");
    expect(() => seguid("GATTACAX")).toThrowError(ValueError);
  });
});

describe("README: with pydna's sequences", () => {
  it("identifies a Dseq through the matching variant", () => {
    expect(seguidOf(new Dseq("GATTACA"))).toBe("ldseguid=zDq4dp6G3AIsldhPDDL8S5A0BKk");
    expect(seguidOf(new Dseq("GAATTCGG").looped())).toBe("cdseguid=ngaZNIVvW0vWnz91kMnoJrFcWiI");
  });
});
