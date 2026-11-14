/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { Seq } from "@biolibs/seq";
import {
  CodonAdaptationIndex, IsoelectricPoint, MeltingTempData, ProteinAnalysis, ProtParamData, crc32, crc64,
  gc123, gcFraction, gcSkew, gcg, lccMult, lccSimp, molecularWeight, ntSearch, saltCorrection, seguid,
  seq1, seq3, setStderrWriter, sixFrameTranslations, tmGC, tmNN, tmWallace,
} from "@biolibs/seqtools";
import { describe, expect, it } from "vitest";

/** @param x - A number. @param d - Places. @returns It rounded as the README prints it. */
const n = (x: number, d = 6): number => Number(x.toFixed(d));

describe("README: GC content", () => {
  it("handles ambiguity three ways", () => {
    expect(gcFraction("ACTGN")).toBe(0.5);
    expect(gcFraction("ACTGN", "ignore")).toBe(0.4);
    expect(gcFraction("ACTGN", "weighted")).toBe(0.5);
    expect(() => gcFraction("ACGT", "nope"))
      .toThrowError("ambiguous value 'nope' not recognized");
  });

  it("reports by codon position and by window", () => {
    expect(gc123("ACGTACGTAC").map((x) => Number(x.toFixed(4))))
      .toEqual([50, 50, 33.3333, 66.6667]);
    expect(gcSkew("ACGTACGTACGT", 4)).toEqual([0, 0, 0]);
  });
});

describe("README: molecular weight", () => {
  it("weighs DNA single- and double-stranded, and protein", () => {
    expect(n(molecularWeight("ACGT", "DNA"), 4)).toBe(1253.8027);
    expect(n(molecularWeight("ACGT", "DNA", true), 4)).toBe(2507.6054);
    expect(n(molecularWeight("MKVL", "protein"), 4)).toBe(489.6722);
  });
});

describe("README: melting temperature", () => {
  it("gives the three estimates", () => {
    expect(tmWallace("ACGTTGCAATGCCGTA")).toBe(48);
    expect(n(tmGC("ACGTTGCAATGCCGTA"))).toBe(42.902902);
    expect(n(tmNN("CGTTCCAAAGATGTGGGCATGAGCTTAC"))).toBe(60.320919);
  });

  it("corrects for salt, and refuses zero ions", () => {
    expect(n(saltCorrection(50))).toBe(-21.597098);
    expect(n(saltCorrection(50, 0, 0, 0, 0, 3))).toBe(-16.262875);
    expect(() => saltCorrection())
      .toThrowError("Total ion concentration of zero is not allowed in this method.");
  });

  it("ships the twelve nearest-neighbour tables", () => {
    expect(Object.keys(MeltingTempData).length).toBe(12);
  });
});

describe("README: checksums", () => {
  it("computes all four", () => {
    expect(crc32("ACGT")).toBe(2735644658);
    expect(crc64("ACGT")).toBe("CRC-71A87EBDB0000000");
    expect(gcg("ACGT")).toBe(748);
    expect(seguid("ACGT")).toBe("IQiZThf2zKn/I1KtqStlEdsHYDQ");
  });
});

describe("README: complexity", () => {
  it("measures local composition complexity", () => {
    expect(n(lccSimp("ACGTACGTAC"))).toBe(0.985475);
    expect(lccMult("ACGTACGTACGTACGT", 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("README: protein analysis", () => {
  /** @returns The ten-residue peptide the README analyses. */
  const analysis = (): ProteinAnalysis => new ProteinAnalysis("MKVLAAGIVG");

  it("reports every property the README lists", () => {
    const p = analysis();
    expect(n(p.molecularWeight(), 4)).toBe(958.2192);
    expect(p.aromaticity()).toBe(0);
    expect(p.instabilityIndex()).toBe(-24.96);
    expect(p.gravy()).toBe(1.75);
    expect(n(p.isoelectricPoint())).toBe(8.500108);
    expect([...p.countAminoAcids()].slice(0, 4))
      .toEqual([["A", 2], ["C", 0], ["D", 0], ["E", 0]]);
    expect(p.secondaryStructureFraction()).toEqual([0.5, 0.2, 0.4]);
    // No tryptophan, tyrosine or cysteine, so nothing absorbs at 280 nm.
    expect(p.molarExtinctionCoefficient()).toEqual([0, 0]);
    expect(n(p.flexibility()[0]!)).toBe(0.976738);
  });

  it("slides a hydropathy scale along the sequence", () => {
    expect(analysis().proteinScale(ProtParamData.kd, 5, 1.0)[0]).toBe(1.56);
  });

  it("warns on standard error for a letter no scale knows", () => {
    const warnings: string[] = [];
    const previous = setStderrWriter((text) => { warnings.push(text); });
    const scale = new ProteinAnalysis("MKVLXAAGIVG").proteinScale(ProtParamData.kd, 5, 1.0);
    setStderrWriter(previous);
    // A window naming both letters warns about the pair, which is Biopython's own message.
    expect(warnings[2]).toBe("warning: X is not a standard amino acid.\n");
    expect(scale.slice(0, 3).map((x) => Number(x.toFixed(4)))).toEqual([0.82, 0.34, 2.32]);
  });
});

describe("README: IsoelectricPoint", () => {
  it("gives the pI and the charge at a pH", () => {
    const ip = new IsoelectricPoint("MKVLAAGIVG");
    expect(n(ip.pi())).toBe(8.500108);
    expect(n(ip.chargeAtPH(7))).toBe(0.499356);
  });
});

describe("README: CodonAdaptationIndex", () => {
  it("is a Map of 64 codons, and scores a sequence", () => {
    const cai = new CodonAdaptationIndex(["ATGAAAGTT", "ATGAAGGTC"].map((s) => new Seq(s)));
    expect(cai.size).toBe(64);
    expect(cai.calculate(new Seq("ATGAAAGTT"))).toBe(1);
  });
});

describe("README: names and views", () => {
  it("converts names, searches with ambiguity, and shows six frames", () => {
    expect(seq3("MAIV*")).toBe("MetAlaIleValTer");
    expect(seq1("MetAlaIleValTer")).toBe("MAIV*");
    expect(ntSearch("ACGTGGAGAGATGAT", "GRG")).toEqual(["G[AG]G", 5, 7]);
    expect(String(sixFrameTranslations("ACGTACGTACGTACGT")).split("\n").length).toBe(15);
  });
});

describe("README: things to know", () => {
  it("raises RuntimeError for an empty ntSearch pattern, where Python loops forever", () => {
    expect(() => ntSearch("ACGT", ""))
      .toThrowError("nt_search with an empty subsequence never terminates in Biopython");
  });

  it("raises ZeroDivisionError from gc123 with no bases to count", () => {
    expect(() => gc123("NNNNNN")).toThrowError("division by zero");
  });
});
