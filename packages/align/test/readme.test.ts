/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { analysis, CodonAligner, MultipleSeqAlignment, PairwiseAligner, parse, read,
  substitutionMatrices, SummaryInfo, write } from "@biolibs/align";
import { captureWarnings } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { describe, expect, it } from "vitest";
import "@biolibs/seqio";

/** @returns A configured aligner, as the README's first block builds one. */
function aligner(): PairwiseAligner {
  const a = new PairwiseAligner();
  a.match = 1;
  a.mismatch = -1;
  a.openGapScore = -2;
  a.extendGapScore = -1;
  return a;
}

/** @returns The three-row alignment the README uses for `MultipleSeqAlignment`. */
const msa = (): MultipleSeqAlignment => new MultipleSeqAlignment([
  new SeqRecord(new Seq("ACGT"), "a"),
  new SeqRecord(new Seq("AC-T"), "b"),
  new SeqRecord(new Seq("ACGA"), "c"),
]);

describe("README: PairwiseAligner", () => {
  it("reports its mode and algorithm", () => {
    expect(aligner().mode).toBe("global");
    expect(aligner().algorithm).toBe("Gotoh global alignment algorithm");
  });

  it("scores and aligns", () => {
    const a = aligner();
    expect(a.score("GAATTC", "GATTC")).toBe(3);
    const alignments = a.align("GAATTC", "GATTC");
    expect(alignments.length).toBe(2n);
    const [best] = alignments;
    expect(best!.score).toBe(3);
  });

  it("aligns locally", () => {
    const local = aligner();
    local.mode = "local";
    expect(local.score("AAGAATTCAA", "GAATTC")).toBe(6);
  });
});

describe("README: Alignment", () => {
  it("prints, and reports its shape and blocks", () => {
    const [best] = aligner().align("GAATTC", "GATTC");
    expect(best!.toString().trimEnd()).toBe(
      "target            0 GAATTC 6\n"
      + "                  0 |-|||| 6\n"
      + "query             0 G-ATTC 5");
    expect(best!.shape).toEqual([2, 6]);
    expect(best!.aligned).toEqual([[[0, 1], [2, 6]], [[0, 1], [1, 5]]]);
    expect(best!.indices).toEqual([[0, 1, 2, 3, 4, 5], [0, -1, 1, 2, 3, 4]]);
  });

  it("formats named records as fasta", () => {
    const [named] = aligner().align(
      new SeqRecord(new Seq("GAATTC"), "target"),
      new SeqRecord(new Seq("GATTC"), "query"),
    );
    expect(named!.format("fasta").trimEnd()).toBe(
      ">target <unknown description>\nGAATTC\n>query <unknown description>\nG-ATTC");
  });
});

describe("README: MultipleSeqAlignment", () => {
  it("indexes rows and columns", () => {
    expect(msa().length).toBe(3);
    expect(msa().getAlignmentLength()).toBe(4);
    expect(msa().get(0, 2)).toBe("G");
    expect(msa().get({ start: 1 }, 3)).toBe("TA");
  });

  it("formats as clustal", () => {
    expect(msa().format("clustal").trimEnd()).toBe(
      "CLUSTAL X (1.81) multiple sequence alignment\n\n\n"
      + "a                                   ACGT\n"
      + "b                                   AC-T\n"
      + "c                                   ACGA");
  });
});

describe("README: substitutionMatrices", () => {
  it("loads BLOSUM62 and reports the bundle", () => {
    const blosum62 = substitutionMatrices.loadMatrix("BLOSUM62");
    expect(blosum62.getOr(["W", "W"], null)).toBe(11);
    expect(blosum62.alphabet).toBe("ARNDCQEGHILKMFPSTWYVBZX*");
    expect(substitutionMatrices.loadNames().length).toBe(30);
  });
});

describe("README: CodonAligner", () => {
  it("aligns a protein to a nucleotide sequence", () => {
    const codon = new CodonAligner();
    expect(codon.score(new Seq("MAF"), new Seq("ATGGCCTTT"))).toBe(3);
    const [aligned] = codon.align(new Seq("MAF"), new Seq("ATGGCCTTT"));
    expect(aligned!.toString().trimEnd()).toBe(
      "target            0 M  A  F   3\nquery             0 ATGGCCTTT 9");
  });
});

describe("README: parse, read and write", () => {
  const text = ">a\nACGT\n>b\nAC-T\n";

  it("parses, reads and writes", () => {
    expect([...parse(text, "fasta")].length).toBe(1);
    expect(read(text, "fasta").shape).toEqual([2, 4]);
    const out: string[] = [];
    const n = write(read(text, "fasta"),
                    { write: (s: string) => out.push(s) } as never, "phylip");
    expect(n).toBe(1);
    expect(out.join("").trimEnd()).toBe("2 4\na         ACGT\nb         AC-T");
  });
});

describe("README: analysis", () => {
  const coding = (): ReturnType<typeof read> => read(
    ">a\nAGGTGCTCAGTGATATATCACTTTTCAGCGGAGGCCTGGTCCATCAAAGGCATCAAGCGC\n"
    + ">b\nAGGTGCTCAGTGCTCTATCACTTTGGGGCGGCCCAGTGGTCCGCAAAACTCATCAAGCGC\n",
    "fasta");

  it("gives dN/dS by NG86 and LWL85", () => {
    expect(analysis.calculateDnDs(coding(), "NG86"))
      .toEqual([0.288197175343171, 0.36256998718340716]);
    expect(analysis.calculateDnDs(coding(), "LWL85"))
      .toEqual([0.3335876036212768, 0.16176814573678225]);
  });

  it("fails the way Biopython does on too little data", () => {
    const thin = (): ReturnType<typeof read> =>
      read(">a\nATGGCCTTTAAA\n>b\nATGGCGTTTAAG\n", "fasta");
    expect(analysis.calculateDnDs(thin(), "NG86")).toEqual([0, -1]);
    expect(() => analysis.calculateDnDs(thin(), "LWL85"))
      .toThrowError("division by zero");
    expect(() => analysis.calculateDnDs(read(">a\nATGTGAATG\n>b\nATGTGAATG\n", "fasta"), "NG86"))
      .toThrowError("TGA");
  });
});

describe("README: SummaryInfo", () => {
  it("reads a column, and warns that it is deprecated", () => {
    const { result, warnings } = captureWarnings(() => new SummaryInfo(msa()).getColumn(2));
    expect(result).toBe("G-G");
    expect(warnings.map((w) => w.category)).toContain("BiopythonDeprecationWarning");
  });
});
