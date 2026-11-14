/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { Dseq, ProteinSeq, PydnaSeq, cut, fillIn, mung, seguidOf, t4, terminalTransferase }
  from "@biolibs/dseq";
import { enzymes } from "@biolibs/restriction";
import { describe, expect, it } from "vitest";

/** The blunt nine-mer the README starts from. */
const blunt = (): Dseq => new Dseq("GGATCCAAA");
/** The three BamHI fragments of a two-site sequence. */
const fragments = (): Dseq[] => cut(new Dseq("AAAGGATCCAAAGGATCCTTT"), [enzymes.BamHI!]);

describe("README: a blunt molecule", () => {
  it("knows both strands and that its ends are blunt", () => {
    const d = blunt();
    expect(d.length).toBe(9);
    expect(d.watson).toBe("GGATCCAAA");
    expect(d.crick).toBe("TTTGGATCC");
    expect(d.ovhg).toBe(0);
    expect(d.circular).toBe(false);
    expect(d.isblunt()).toBe(true);
    expect(d.fivePrimeEnd()).toEqual(["blunt", ""]);
    expect(d.figure()).toBe("Dseq(-9)\nGGATCCAAA\nCCTAGGTTT");
  });

  it("weighs, reverse-complements and slices", () => {
    const d = blunt();
    expect(Number(d.mw().toFixed(4))).toBe(5596.5802);
    expect(String(d.rc())).toBe("TTTGGATCC");
    expect(String(d.slice(2, 6))).toBe("ATCC");
    expect(Array.from(d.toBytes()).slice(0, 4)).toEqual([71, 71, 65, 84]);
  });

  it("translates from the watson strand, with a genetic code", () => {
    const coding = new Dseq("ATGGCCTTTTGA");
    expect(String(coding.translate())).toBe("MAF*");
    // Code 2 reads TGA as tryptophan rather than stop.
    expect(String(coding.translate(2))).toBe("MAFW");
    expect(coding.repr().split("\n")[0]).toBe("Dseq(-12)");
  });
});

describe("README: circles", () => {
  it("wraps a slice past the origin", () => {
    const circle = blunt().looped();
    expect(circle.circular).toBe(true);
    expect(circle.length).toBe(9);
    expect(String(circle.shifted(3))).toBe("TCCAAAGGA");
    expect(String(circle.slice(7, 2))).toBe("AAGG");
  });
});

describe("README: cutting", () => {
  it("gives the fragments with their overhangs", () => {
    expect(fragments().map((f) => [f.watson, f.crick, f.ovhg])).toEqual([
      ["AAAG", "GATCCTTT", 0],
      ["GATCCAAAG", "GATCCTTTG", -4],
      ["GATCCTTT", "AAAG", -4],
    ]);
  });

  it("describes the middle fragment's sticky ends", () => {
    const middle = fragments()[1]!;
    expect(middle.ovhg).toBe(-4);
    expect(middle.isblunt()).toBe(false);
    expect(middle.fivePrimeEnd()).toEqual(["5'", "gatc"]);
    expect(middle.threePrimeEnd()).toEqual(["5'", "gatc"]);
  });
});

describe("README: ligation", () => {
  it("joins compatible ends and refuses the rest", () => {
    const f = fragments();
    expect(String(f[0]!.add(f[1]!))).toBe("AAAGGATCCAAAGGATC");
    // The point of the type: two strings would have concatenated happily.
    expect(() => f[0]!.add(blunt())).toThrowError("sticky ends not compatible!");
  });
});

describe("README: end chemistry", () => {
  it("fills in, bluntens, chews back and tails", () => {
    const middle = fragments()[1]!;
    expect(String(fillIn(middle))).toBe("GATCCAAAGgatc");
    expect(String(t4(middle))).toBe("GATCCAAAGgatc");
    expect(String(mung(middle))).toBe("CAAAG");
    expect(terminalTransferase(blunt()).watson).toBe("GGATCCAAAa");
  });

  it("flattens the case either way", () => {
    // The lower-case letters mark what the polymerase added rather than what was sequenced.
    const filled = fillIn(fragments()[1]!);
    expect(String(filled)).toBe("GATCCAAAGgatc");
    expect(String(filled.upper())).toBe("GATCCAAAGGATC");
    expect(String(filled.lower())).toBe("gatccaaaggatc");
    // `toBluntString` is the sequence as written, case included.
    expect(filled.toBluntString()).toBe("GATCCAAAGgatc");
  });
});

describe("README: identity", () => {
  it("checksums linear and circular molecules differently", () => {
    const d = blunt();
    expect(seguidOf(d)).toBe("ldseguid=N1zzL5Ylgjf8Uw5-bTu3Irw4ezA");
    expect(seguidOf(d.looped())).toBe("cdseguid=eLi_jYOyGlHgx82i9xfaliGA_Dk");
  });
});

describe("README: PydnaSeq and ProteinSeq", () => {
  it("answers pydna's questions about a coding sequence", () => {
    const s = new PydnaSeq("ATGGCCTTTAAATTTGGGTGCTGA");
    expect(s.gc()).toBe(0.417);
    expect(s.cai()).toBe(0.664);
    expect(String(s.translate())).toBe("MAFKFGC*");
    expect(s.startcodon()).toBe(1);
    expect(s.stopcodon()).toBe(0.3);
    expect(s.orfs(3).map(String)).toEqual(["0,24"]);
    expect(s.rarecodons("sce")).toEqual([]);
  });

  it("measures a protein", () => {
    const protein = new ProteinSeq("MKVLAAGIVG");
    expect(Number(protein.molecularWeight().toFixed(4))).toBe(958.2192);
    expect(Number(protein.pI().toFixed(6))).toBe(8.500108);
    expect(protein.instabilityIndex()).toBe(-24.96);
  });
});

describe("README: things to know", () => {
  it("gives NaN for a sequence of codons with no synonyms", () => {
    // ATG and TGG are dropped rather than scored, so there is nothing to average.
    expect(new PydnaSeq("ATG").cai()).toBeNaN();
  });

  it("has weights for sce alone", () => {
    expect(() => new PydnaSeq("ATGGCC").cai("eco")).toThrowError("eco");
    // The other organism-aware methods accept it happily, which is pydna's own asymmetry.
    expect(new PydnaSeq("ATGGCCTTT").rarecodons("eco")).toEqual([]);
  });
});
