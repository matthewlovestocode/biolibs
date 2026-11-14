/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { MutableSeq, Seq } from "@biolibs/seq";
import {
  AllEnzymes, Analysis, CommOnly, FormattedSeq, NonComm, RestrictionBatch, enzymes,
} from "@biolibs/restriction";
import { describe, expect, it } from "vitest";

const { EcoRI, SmaI, BamHI, AluI } = enzymes;
/** The 24-base test sequence every block cuts: two EcoRI sites with a SmaI site between them. */
const DNA = (): Seq => new Seq("GAATTCAAACCCGGGTTTGAATTC");
/** A result map as the README prints it. */
const names = (m: Map<unknown, unknown>): unknown[] => [...m].map(([e, v]) => [String(e), v]);

describe("README: an enzyme", () => {
  it("counts what is shipped", () => {
    expect(Object.keys(enzymes).length).toBe(1088);
    expect(AllEnzymes.size).toBe(1088);
    expect(CommOnly.size).toBe(623);
    expect(NonComm.size).toBe(465);
  });

  it("describes its site and cut", () => {
    expect(EcoRI!.site).toBe("GAATTC");
    expect(EcoRI!.size).toBe(6);
    expect(EcoRI!.fst5).toBe(1);
    expect(EcoRI!.fst3).toBe(-1);
    expect(EcoRI!.ovhgseq).toBe("AATT");
    expect(EcoRI!.elucidate()).toBe("G^AATT_C");
    expect(EcoRI!.frequency()).toBe(4096);
    expect(String(EcoRI)).toBe("EcoRI");
  });

  it("knows what kind it is", () => {
    expect(EcoRI!.isA("Palindromic")).toBe(true);
    expect(EcoRI!.isA("Blunt")).toBe(false);
    expect(EcoRI!.is5overhang()).toBe(true);
    expect(EcoRI!.isBlunt()).toBe(false);
    expect(EcoRI!.cutOnce()).toBe(true);
    expect([...EcoRI!.kinds]).toEqual(["Palindromic", "OneCut", "Ov5", "Defined", "Meth_Dep",
      "Commercially_available", "AbstractCut", "RestrictionType"]);
  });
});

describe("README: search and catalyse", () => {
  it("finds the cut positions, 1-based", () => {
    expect(EcoRI!.search(DNA())).toEqual([2, 20]);
    expect(SmaI!.search(DNA())).toEqual([13]);
  });

  it("gives the fragments", () => {
    expect(EcoRI!.catalyse(DNA()).map(String)).toEqual(["G", "AATTCAAACCCGGGTTTG", "AATTC"]);
    expect(SmaI!.catalyse(DNA()).map(String)).toEqual(["GAATTCAAACCC", "GGGTTTGAATTC"]);
  });

  it("joins the ends when the sequence is circular", () => {
    expect(EcoRI!.catalyse(DNA(), false).map(String)).toEqual(["AATTCG", "AATTCAAACCCGGGTTTG"]);
  });

  it("has Python's operators under their own names", () => {
    expect(EcoRI!.div(DNA())).toEqual([2, 20]);
    expect(EcoRI!.floordiv(DNA()).map(String)).toEqual(["G", "AATTCAAACCCGGGTTTG", "AATTC"]);
    // `catalyze` is the same method under the American spelling, as in Biopython.
    expect(EcoRI!.catalyze(DNA()).map(String)).toEqual(["G", "AATTCAAACCCGGGTTTG", "AATTC"]);
  });
});

describe("README: comparing enzymes", () => {
  it("compares by cut rather than by identity", () => {
    expect(EcoRI!.ne(SmaI!)).toBe(true);
    expect(EcoRI!.lt(SmaI!)).toBe(true);
    expect(EcoRI!.rshift(SmaI!)).toBe(false);
    expect(EcoRI!.mod(SmaI!)).toBe(false);
  });

  it("lists compatible ends, and no isoschizomers for EcoRI", () => {
    expect(EcoRI!.compatibleEnd().map(String).slice(0, 5))
      .toEqual(["FspEI", "LpnPI", "MluCI", "MspJI", "SgeI"]);
    expect(EcoRI!.isoschizomers()).toEqual([]);
    expect(EcoRI!.equischizomers()).toEqual([]);
  });
});

describe("README: RestrictionBatch", () => {
  it("takes enzymes or their names", () => {
    const batch = new RestrictionBatch([EcoRI!, "SmaI"]);
    expect(batch.size).toBe(2);
    expect([...batch].map(String)).toEqual(["EcoRI", "SmaI"]);
    expect(batch.has(EcoRI!)).toBe(true);
    expect(batch.toString()).toBe("EcoRI+SmaI");
    expect([...batch.search(DNA())].map(([e, at]) => [String(e), at]))
      .toEqual([["EcoRI", [2, 20]], ["SmaI", [13]]]);
  });

  it("refuses an unknown name", () => {
    // Biopython names the type, not the name it could not find.
    expect(() => new RestrictionBatch(["NoSuchEnzyme"]))
      .toThrowError("<class 'str'> is not a RestrictionType");
  });
});

describe("README: Analysis", () => {
  /** @returns The four-enzyme analysis the README builds. */
  const analysis = (): Analysis =>
    new Analysis(new RestrictionBatch([EcoRI!, SmaI!, BamHI!, AluI!]), DNA());

  it("selects every way the README shows", () => {
    const a = analysis();
    expect(names(a.full()))
      .toEqual([["EcoRI", [2, 20]], ["SmaI", [13]], ["BamHI", []], ["AluI", []]]);
    expect(names(a.withSites())).toEqual([["EcoRI", [2, 20]], ["SmaI", [13]]]);
    expect([...a.withoutSite()].map(([e]) => String(e))).toEqual(["BamHI", "AluI"]);
    expect(names(a.withNSites(2))).toEqual([["EcoRI", [2, 20]]]);
    expect(names(a.between(1, 12))).toEqual([["EcoRI", [2, 20]]]);
    expect(names(a.onlyOutside(1, 12))).toEqual([["SmaI", [13]]]);
    expect([...a.blunt()].map(([e]) => String(e))).toEqual(["SmaI", "AluI"]);
    expect([...a.overhang5()].map(([e]) => String(e))).toEqual(["EcoRI", "BamHI"]);
    expect([...a.doNotCut(1, 12)].map(([e]) => String(e))).toEqual(["BamHI", "AluI", "SmaI"]);
  });
});

describe("README: the three layouts", () => {
  it("lists, groups by count, and draws a map", () => {
    const a = new Analysis(new RestrictionBatch([EcoRI!, SmaI!]), DNA());
    expect(a.formatOutput()).toBe("EcoRI      :  2, 20.\nSmaI       :  13.\n");

    a.printAs("number");
    expect(a.formatOutput().split("\n")).toEqual(["", "", "enzymes which cut 1 times :", "",
      "SmaI       :  13.", "", "", "enzymes which cut 2 times :", "", "EcoRI      :  2, 20.", ""]);

    const m = new Analysis(new RestrictionBatch([EcoRI!, SmaI!]), DNA());
    m.printAs("map");
    expect(m.formatOutput().split("\n")).toEqual([
      " 2 EcoRI",
      " |                                                          ",
      " |          13 SmaI",
      " |          |                                               ",
      " |          |      20 EcoRI",
      " |          |      |                                        ",
      "GAATTCAAACCCGGGTTTGAATTC",
      "||||||||||||||||||||||||",
      "CTTAAGTTTGGGCCCAAACTTAAG",
      "1                           24",
      "",
      "",
    ]);
  });
});

describe("README: FormattedSeq", () => {
  it("carries the topology the search needs", () => {
    const fs = new FormattedSeq(DNA());
    expect(fs.repr()).toBe("FormattedSeq(Seq('GAATTCAAACCCGGGTTTGAATTC'), linear=True)");
    expect(fs.isLinear()).toBe(true);
    expect(fs.length).toBe(24);
    expect(fs.toCircular().isLinear()).toBe(false);
    // It has no toString, which the README says so nobody reaches for one.
    expect(String(fs)).toBe("[object Object]");
  });

  it("refuses a MutableSeq, with Biopython's own inconsistent message", () => {
    const batch = new RestrictionBatch([EcoRI!]);
    expect(() => batch.search(new MutableSeq("GAATTC") as never))
      .toThrowError(/Expected Seq or MutableSeq instance, got <class 'Bio.Seq.MutableSeq'>/);
    // An enzyme's own search takes both.
    expect(EcoRI!.search(new MutableSeq("GAATTC"))).toEqual([2]);
  });
});

describe("README: things to know", () => {
  it("keeps the last search on the enzyme", () => {
    EcoRI!.search(DNA());
    expect(EcoRI!.results).toEqual([2, 20]);
  });

  it("returns an empty batch from split", () => {
    const batch = new RestrictionBatch([EcoRI!, SmaI!]);
    expect(batch.split("Blunt").size).toBe(0);
  });
});
