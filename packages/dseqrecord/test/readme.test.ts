/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { Dseqrecord, PydnaSeqRecord } from "@biolibs/dseqrecord";
import { enzymes } from "@biolibs/restriction";
import { describe, expect, it } from "vitest";
// The README's `format` block imports this too: it registers the file-format writers, and this package
// deliberately does not depend on the IO layer.
import "@biolibs/seqio";

/** The two-site molecule most blocks start from. */
const record = (): Dseqrecord => new Dseqrecord("AAAGGATCCAAAGGATCCTTT");

describe("README: a record", () => {
  it("reports its sequence, topology and checksum", () => {
    const r = record();
    expect(r.length).toBe(21);
    expect(String(r.seq)).toBe("AAAGGATCCAAAGGATCCTTT");
    expect(r.circular).toBe(false);
    expect([r.name, r.id]).toEqual(["name", "id"]);
    expect(r.seguid()).toBe("ldseguid=OrOJIU0P7tAJBZMPpHCfsPY2ar0");
  });
});

describe("README: features", () => {
  it("adds one by position and one by sequence", () => {
    const r = new Dseqrecord("AAAGGATCCAAA");
    r.addFeature(3, 9, null, "misc");
    expect(String(r.features[0]!.location)).toBe("[3:9](+)");

    const q = new Dseqrecord("AAAGGATCCAAA");
    q.addFeature(null, null, "GGATCC", "misc");
    expect(String(q.features[0]!.location)).toBe("[3:9](+)");
    expect(() => q.addFeature(null, null, "xyz")).toThrowError("Could not find xyz");
  });

  it("refuses a backwards span, from the location rather than pydna", () => {
    expect(() => new Dseqrecord("AAAGGATCCAAA").addFeature(9, 3))
      .toThrowError("End location (3) must be greater than or equal to start location (9)");
  });

  it("gives the table pydna prints, as data", () => {
    const r = new Dseqrecord("AAAGGATCCAAA");
    r.addFeature(3, 9, null, "misc");
    const table = r.listFeatures();
    expect(table.fieldNames)
      .toEqual(["Ft#", "Label or Note", "Dir", "Sta", "End", "Len", "type", "orf?"]);
    expect(table.rows[0]).toEqual([0, "L:ft6", "-->", 3, 9, 6, "misc", "no"]);
  });
});

describe("README: circles", () => {
  it("rotates the origin", () => {
    const circle = record().looped();
    expect(circle.circular).toBe(true);
    expect(String(circle.shifted(3).seq)).toBe("GGATCCAAAGGATCCTTTAAA");
  });
});

describe("README: cutting", () => {
  it("cuts into fragments and counts the sites", () => {
    const r = record();
    expect(r.cut(enzymes.BamHI!).map((f) => String(f.seq)))
      .toEqual(["AAAGGATC", "GATCCAAAGGATC", "GATCCTTT"]);
    expect(r.numberOfCuts(enzymes.BamHI!)).toBe(2);
  });

  it("refuses to linearize at more than one site", () => {
    expect(() => record().looped().linearize(enzymes.BamHI!))
      .toThrowError("More than one fragment is formed!");
  });
});

describe("README: synced", () => {
  it("rotates a circle to start where the reference does", () => {
    const circle = record().looped();
    expect(String(circle.synced("GGATCCAAAGGATCCTTTAAA").seq)).toBe("GGATCCAAAGGATCCTTTAAA");
  });
});

describe("README: stamp", () => {
  it("puts the checksum in the comment", () => {
    const r = new Dseqrecord("AAAGGATCC");
    expect(r.stamp(() => "2026-01-01")).toBe("ldseguid=eLi_jYOyGlHgx82i9xfaliGA_Dk");
    expect(r.comment()).toBe("pydna ldseguid=eLi_jYOyGlHgx82i9xfaliGA_Dk 2026-01-01");
  });
});

describe("README: format", () => {
  it("sets topology for GenBank and leaves the record alone", () => {
    const r = new Dseqrecord("aaa", true);
    r.annotations.set("date", "02-FEB-2013");
    expect(r.format("gb").split("\n")[0])
      .toBe("LOCUS       name                       3 bp    DNA     circular UNK 02-FEB-2013");
    expect(r.format("fasta").split("\n")[0]).toBe(">id description");
    // The topology went on a copy, so the record is untouched.
    expect(r.annotations.get("topology")).toBeUndefined();
  });

  it("strips the format name and trims the output", () => {
    const r = new Dseqrecord("aaa");
    expect(r.format(" gb ").endsWith("//")).toBe(true);
  });

  it("writes the dscode encoding when asked", () => {
    const odd = new Dseqrecord("PEXIGATCQFZJ");
    expect(odd.format("fasta-2line dscode")).toBe(">id description\nPEXIGATCQFZJ");
    expect(odd.format("fasta-2line")).toBe(">id description\nGATCGATCGATC");
  });

  it("needs no writer for pydna's own formats", () => {
    expect(new Dseqrecord("atgtaa").format("pydnafasta")).toBe(">id 6 bp linear\natgtaa");
  });
});

describe("README: figure", () => {
  it("draws the molecule with a feature highlighted", () => {
    const r = new Dseqrecord("AAAGGATCCAAA");
    r.addFeature(3, 9, null, "misc");
    expect(r.figure(0, "<", ">")).toBe("Dseqrecord(-12)\nAAA<GGATCC>AAA\nTTTCCTAGGTTT");
  });

  it("highlights each part of an origin-spanning feature", () => {
    const circle = new Dseqrecord("atgtaa", true);
    circle.addFeature(5, 6, null, "misc");
    // Shifting the origin turns that feature into a compound location across the join.
    const shifted = circle.shifted(5);
    expect(shifted.figure(0, "<", ">").split("\n")[1]).toContain("<");
  });

  it("raises for a molecule with no single overhang", () => {
    expect(() => new Dseqrecord("PEXI").figure())
      .toThrowError("unsupported operand type(s) for +: 'NoneType' and 'int'");
  });

  it("gives an empty highlight pair when there are no features", () => {
    expect(new Dseqrecord("AAAGG").figure(0, "<", ">"))
      .toBe("Dseqrecord(-5)\n<>AAAGG\nTTTCC");
  });
});

describe("README: PydnaSeqRecord", () => {
  it("answers the coding-sequence questions", () => {
    const p = new PydnaSeqRecord("ATGGCCTTTAAATTTGGGTGCTGA");
    expect(p.gc()).toBe(0.417);
    expect(p.cai()).toBe(0.664);
    expect(p.isorf()).toBe(true);
  });

  it("does not answer them on a Dseqrecord, whose sequence is a Dseq", () => {
    expect(() => record().gc()).toThrowError();
  });
});
