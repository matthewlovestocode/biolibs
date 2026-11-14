/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { captureWarnings } from "@biolibs/core";
import {
  backTranscribe, CodonTable, complement, IUPACData, MutableSeq, reverseComplement, Seq, transcribe,
  translate,
} from "@biolibs/seq";
import { describe, expect, it } from "vitest";

/** The sequence the README's `Seq` and biology sections both use. */
const S = "ATGGCCATTGTAATGGGCCGC";

describe("README: Seq", () => {
  it("reports its length, text and repr, and indexes", () => {
    const s = new Seq(S);
    expect(s.length).toBe(21);
    expect(s.toString()).toBe("ATGGCCATTGTAATGGGCCGC");
    expect(s.repr()).toBe("Seq('ATGGCCATTGTAATGGGCCGC')");
    expect(String(s.at(0))).toBe("A");
    expect(s.slice(0, 3).toString()).toBe("ATG");
    expect([...new Seq("ACG")]).toEqual(["A", "C", "G"]);
  });

  it("searches", () => {
    const s = new Seq(S);
    expect(s.count("G")).toBe(7);
    expect(s.countOverlap("GG")).toBe(3);
    expect(s.find("ATT")).toBe(6);
    expect(s.contains("GCC")).toBe(true);
    expect([...new Seq("ACGTACGT").search(["ACG", "GT"])])
      .toEqual([[0, "ACG"], [2, "GT"], [4, "ACG"], [6, "GT"]]);
  });

  it("edits into new sequences", () => {
    expect(new Seq("acgt").upper().toString()).toBe("ACGT");
    expect(new Seq(" AC ").strip().toString()).toBe("AC");
    expect(new Seq("AACGTT").replace("A", "T").toString()).toBe("TTCGTT");
    expect(new Seq("A-C-G").split("-").map(String)).toEqual(["A", "C", "G"]);
    expect(new Seq("-").join([new Seq("AC"), new Seq("GT")]).toString()).toBe("AC-GT");
  });

  it("adds, multiplies and compares", () => {
    expect(new Seq("ATG").add(new Seq("TTT")).toString()).toBe("ATGTTT");
    expect(new Seq("AT").mul(3).toString()).toBe("ATATAT");
    expect(new Seq("AT").radd("GG").toString()).toBe("GGAT");
    expect(new Seq("ACGT").equals(new Seq("ACGT"))).toBe(true);
    expect(new Seq("ACGT").equals("ACGT")).toBe(true);
    expect(new Seq("A").lt(new Seq("C"))).toBe(true);
  });
});

describe("README: biology", () => {
  it("complements, transcribes and translates", () => {
    const s = new Seq(S);
    expect(s.complement().toString()).toBe("TACCGGTAACATTACCCGGCG");
    expect(s.reverseComplement().toString()).toBe("GCGGCCCATTACAATGGCCAT");
    expect(s.transcribe().toString()).toBe("AUGGCCAUUGUAAUGGGCCGC");
    expect(s.translate().toString()).toBe("MAIVMGR");
  });

  it("refuses an in-place edit of a Seq", () => {
    expect(() => new Seq("ACGT").reverseComplement(true)).toThrowError("Sequence is immutable");
  });
});

describe("README: translate", () => {
  const cds = (): Seq => new Seq("ATGGCCATTGTAATGGGCCGCTGAAAG");

  it("takes a table by id or by name, and the options", () => {
    expect(cds().translate().toString()).toBe("MAIVMGR*K");
    expect(cds().translate(2).toString()).toBe("MAIVMGRWK");
    expect(cds().translate("Vertebrate Mitochondrial").toString()).toBe("MAIVMGRWK");
    expect(cds().translate({ toStop: true }).toString()).toBe("MAIVMGR");
    expect(cds().translate({ stopSymbol: "@" }).toString()).toBe("MAIVMGR@K");
  });

  it("resolves ambiguity and keeps a gap codon a gap", () => {
    expect(new Seq("TTNCTNGARRAY").translate().toString()).toBe("XLEB");
    expect(new Seq("ATG---GCC").translate().toString()).toBe("M-A");
  });

  it("warns on a partial codon and raises under cds", () => {
    const { result, warnings } = captureWarnings(() =>
      new Seq("ATGGCCATTGTAATGGGCCGCTGAAA").translate().toString());
    expect(result).toBe("MAIVMGR*");
    expect(warnings[0]!.message).toBe(
      "Partial codon, len(sequence) not a multiple of three. Explicitly trim the sequence or add"
      + " trailing N before translation. This may become an error in future.");

    expect(() => new Seq("ATGGCCATTGT").translate({ cds: true }))
      .toThrowError("Sequence length 11 is not a multiple of three");
  });
});

describe("README: MutableSeq", () => {
  it("edits in place", () => {
    const m = new MutableSeq("ACGT");
    m.set(0, "T");
    m.append("A");
    m.insert(0, "G");
    m.reverse();
    expect(m.toString()).toBe("ATGCTG");
    expect(m.repr()).toBe("MutableSeq('ATGCTG')");
  });

  it("assigns a slice", () => {
    const n = new MutableSeq("ACGTACGT");
    n.set({ start: 0, stop: 4 }, "TTTT");
    expect(n.toString()).toBe("TTTTACGT");
  });

  it("removes and pops", () => {
    const q = new MutableSeq("ACGTACGT");
    q.remove("A");
    expect(q.toString()).toBe("CGTACGT");
    expect(String(q.pop())).toBe("T");
    expect(q.toString()).toBe("CGTACG");
  });

  it("converts either way", () => {
    expect(new Seq(new MutableSeq("ACGT")).toString()).toBe("ACGT");
    expect(new MutableSeq(new Seq("ACGT")).toString()).toBe("ACGT");
  });

  it("imul returns a new object, as Biopython's *= does", () => {
    const m = new MutableSeq("AC");
    const r = m.imul(2);
    expect(m.toString()).toBe("AC");
    expect(r.toString()).toBe("ACAC");
    expect(r === m).toBe(false);
  });
});

describe("README: undefined and partially defined content", () => {
  it("knows a length without the bases", () => {
    const u = new Seq(null, 100);
    expect(u.length).toBe(100);
    expect(u.defined).toBe(false);
    expect(u.definedRanges).toEqual([]);
    expect(() => u.toString()).toThrowError("Sequence content is undefined");
    expect(u.reverseComplement().length).toBe(100);
  });

  it("keeps the known stretches through a slice", () => {
    const p = new Seq(new Map([[0, "ACGT"], [10, "TT"]]), 12);
    expect(p.length).toBe(12);
    expect(p.definedRanges).toEqual([[0, 4], [10, 12]]);
    expect(p.slice(0, 4).toString()).toBe("ACGT");
    expect(p.slice(2, 12).repr()).toBe("Seq({0: 'GT', 8: 'TT'}, length=10)");
    expect(() => p.slice(4, 8).toString()).toThrowError("Sequence content is undefined");
  });
});

describe("README: module functions", () => {
  it("takes a string or a sequence", () => {
    expect(transcribe("ACGT")).toBe("ACGU");
    expect(backTranscribe("ACGU")).toBe("ACGT");
    expect(complement("ACGT")).toBe("TGCA");
    expect(reverseComplement("ATGC")).toBe("GCAT");
    expect((reverseComplement(new Seq("ATGC")) as Seq).toString()).toBe("GCAT");
    expect(translate("ATGGCC")).toBe("MA");
    expect(() => reverseComplement("ATGC", true)).toThrowError("strings are immutable");
  });
});

describe("README: CodonTable", () => {
  it("describes the standard code", () => {
    const t = CodonTable.unambiguousDnaByName.get("Standard")!;
    expect(t.id).toBe(1);
    expect(t.names).toEqual(["Standard", "SGC0"]);
    expect(t.forwardTable.get("ATG")).toBe("M");
    expect(t.startCodons).toEqual(["TTG", "CTG", "ATG"]);
    expect(t.stopCodons).toEqual(["TAA", "TAG", "TGA"]);
    expect(t.nucleotideAlphabet).toBe("GATC");
    expect(t.proteinAlphabet).toBe("ACDEFGHIKLMNPQRSTVWY");
    expect(t.backTable.get("M")).toBe("ATG");
    expect(t.backTable.get(null)).toBe("TAA");
    expect(() => t.forwardTable.getItem("TAA")).toThrowError("TAA");
    expect(t.toString().split("\n")[0]).toBe("Table 1 Standard, SGC0");
  });

  it("holds all 27 codes, by id and by name", () => {
    expect(CodonTable.unambiguousDnaById.get(2)!.names)
      .toEqual(["Vertebrate Mitochondrial", "SGC1"]);
    expect(CodonTable.unambiguousDnaById.size).toBe(27);
    // The alias names bring the by-name registry to 45 keys.
    expect(CodonTable.unambiguousDnaByName.size).toBe(45);
  });

  it("resolves ambiguity on its own", () => {
    const t = CodonTable.unambiguousDnaById.get(1)!;
    expect(CodonTable.listPossibleProteins("TTR", t.forwardTable, IUPACData.ambiguousDnaValues))
      .toEqual(["L"]);
    expect(CodonTable.listAmbiguousCodons(["TAA", "TAG"], IUPACData.ambiguousDnaValues))
      .toEqual(["TAA", "TAG", "TAR"]);
    expect(CodonTable.ambiguousDnaById.get(1)!.forwardTable.get("TTR")).toBe("L");
  });
});

describe("README: IUPACData", () => {
  it("holds the generated constants", () => {
    expect(IUPACData.unambiguousDnaLetters).toBe("GATC");
    expect(IUPACData.ambiguousDnaLetters).toBe("GATCRYWSMKHBVDN");
    expect(IUPACData.ambiguousDnaValues.R).toBe("AG");
    expect(IUPACData.ambiguousDnaComplement.R).toBe("Y");
    expect(IUPACData.proteinLetters1to3.A).toBe("Ala");
    expect(IUPACData.monoisotopicProteinWeights.A).toBe(89.047678);
  });
});

describe("README: things to know", () => {
  it("refuses non-ASCII content with Biopython's message", () => {
    expect(() => new Seq("é")).toThrowError(
      "'ascii' codec can't encode character '\\xe9' in position 0: ordinal not in range(128)");
  });

  it("throws on an out-of-range index and clamps a slice", () => {
    expect(() => new Seq("ACGT").at(99)).toThrowError("index out of range");
    expect(new Seq("ACGT").slice(2, 99).toString()).toBe("GT");
  });

  it("elides a long repr where Biopython does", () => {
    // 60 bases print whole; one more elides, keeping the first 54 and the last 3.
    expect(new Seq("A".repeat(60)).repr()).toBe(`Seq('${"A".repeat(60)}')`);
    expect(new Seq("A".repeat(61)).repr()).toBe(`Seq('${"A".repeat(54)}...AAA')`);
  });

  it("counts without overlapping unless asked", () => {
    expect(new Seq("GGG").count("GG")).toBe(1);
    expect(new Seq("GGG").countOverlap("GG")).toBe(2);
  });
});
