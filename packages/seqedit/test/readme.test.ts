/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { Seq } from "@biolibs/seq";
import { BeforePosition, CompoundLocation, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { applyEdit, applyEdits, checkEdit, cleanBases, clipLocation, cutsThrough, deleteBases,
  editLocation, extractRegion, insertBases, isCircular, lengthChange, locationExtent, locationLength,
  mapPosition, replaceBases, reverseComplementRecord, rotateCircular, shiftLocation, spanOf,
  touches } from "@biolibs/seqedit";
import { describe, expect, it } from "vitest";

/** The README's record: 61 bases with a gene at 5..25 on the plus strand. */
function demo(): SeqRecord {
  const record = new SeqRecord(
    new Seq("ATGCGTACGTTAGCCATGGCTAGCTAGGCATCGATCGGATCCAAATTTGGGCCCTTTAAAG"), "pTest");
  record.features.push(new SeqFeature(new SimpleLocation(5, 25, 1), "gene"));
  return record;
}

/** The same record as a circle, as the README's circular section builds it. */
function plasmid(): SeqRecord {
  const record = new SeqRecord(
    new Seq("ATGCGTACGTTAGCCATGGCTAGCTAGGCATCGATCGGATCCAAATTTGGGCCCTTTAAAG"), "pTest");
  record.annotations.set("topology", "circular");
  return record;
}

describe("README: how a location moves", () => {
  it("maps a boundary through an edit", () => {
    const edit = { start: 10, end: 20, insert: "AAA" };
    expect(mapPosition(5, edit, "start")).toBe(5);
    expect(mapPosition(30, edit, "start")).toBe(23);
    expect(mapPosition(15, edit, "start")).toBe(10);
    expect(mapPosition(15, edit, "end")).toBe(13);
    expect(lengthChange(edit)).toBe(-7);
  });

  it("says what an edit touches", () => {
    expect(touches({ start: 10, end: 10, insert: "A" }, 10, 20)).toBe(false);
    expect(touches({ start: 15, end: 15, insert: "A" }, 10, 20)).toBe(true);
    expect(touches({ start: 10, end: 20, insert: "AAA" }, 20, 30)).toBe(false);
    expect(touches({ start: 10, end: 20, insert: "AAA" }, 5, 11)).toBe(true);
    // The sentence after the block: cutsThrough is the strictly-inside test.
    expect([cutsThrough(15, { start: 10, end: 20, insert: "AAA" }),
      cutsThrough(10, { start: 10, end: 20, insert: "AAA" })]).toEqual([true, false]);
  });
});

describe("README: editing a record", () => {
  it("moves, stretches and clips the gene", () => {
    const record = demo();
    expect(String(deleteBases(record, 10, 20).features[0]!.location)).toBe("[5:15](+)");
    expect(String(insertBases(record, 25, "GAATTC").features[0]!.location)).toBe("[5:25](+)");
    expect(String(insertBases(record, 15, "GAATTC").features[0]!.location)).toBe("[5:31](+)");
    expect(String(replaceBases(record, 5, 10, "AA").features[0]!.location)).toBe("[5:22](+)");
  });

  it("leaves the original alone", () => {
    const record = demo();
    const edited = applyEdit(record, { start: 10, end: 20, insert: "GGGG" });
    expect(edited.seq!.length).toBe(55);
    expect(record.seq!.length).toBe(61);
  });

  it("clips or drops a feature the edit cuts through", () => {
    const record = demo();
    expect(deleteBases(record, 10, 20).features).toHaveLength(1);
    expect(deleteBases(record, 10, 20, { cutFeatures: "drop" }).features).toHaveLength(0);
  });

  it("applies several edits in the original coordinates", () => {
    const patched = applyEdits(demo(), [
      { start: 10, end: 20, insert: "" },
      { start: 50, end: 50, insert: "GAATTC" },
    ]);
    expect(String(patched.features[0]!.location)).toBe("[5:15](+)");
  });

  it("refuses overlapping edits", () => {
    expect(() => applyEdits(demo(), [{ start: 10, end: 20, insert: "" }, { start: 15, end: 25, insert: "" }]))
      .toThrowError("the edits 10..20 and 15..25 overlap");
  });
});

describe("README: regions, rotation and reverse complement", () => {
  it("cuts a region out as a linear record named after it", () => {
    const region = extractRegion(demo(), 10, 35);
    expect(region.id).toBe("pTest:10-35");
    expect(region.annotations.get("topology")).toBe("linear");
    expect(String(region.features[0]!.location)).toBe("[0:15](+)");
  });

  it("drops an edge-crossing feature when asked, as Biopython's slicing does", () => {
    expect(extractRegion(demo(), 10, 35, { edgeFeatures: "drop" }).features).toHaveLength(0);
  });

  it("takes a region across a circular origin, and rotates one", () => {
    const p = plasmid();
    expect(isCircular(p)).toBe(true);
    expect(extractRegion(p, 50, 70).seq!.toString()).toBe("GCCCTTTAAAGATGCGTACG");

    const rotated = rotateCircular(p, 50);
    expect(rotated.seq!.toString().slice(0, 12)).toBe("GCCCTTTAAAGA");
    expect(rotated.annotations.get("topology")).toBe("circular");
    expect(rotated.id).toBe("pTest");
  });

  it("refuses to rotate a line, or to read past the end of one", () => {
    const linear = new SeqRecord(new Seq("ACGT"), "lin");
    expect(() => rotateCircular(linear, 2))
      .toThrowError("only a circular record can be rotated; set its topology annotation to 'circular'");
    expect(() => extractRegion(linear, 2, 9))
      .toThrowError("the region 2..9 runs past the end of a linear sequence of 4 bases");
  });

  it("turns a record over, keeping the metadata by default", () => {
    const record = demo();
    const flipped = reverseComplementRecord(record);
    expect(flipped.id).toBe("pTest");
    expect(String(flipped.features[0]!.location)).toBe("[36:56](-)");
    expect(reverseComplementRecord(record, false).id).toBe("<unknown id>");
  });
});

describe("README: locations on their own", () => {
  it("edits, shifts, clips and measures a location", () => {
    const gene = new SimpleLocation(100, 200, 1);
    expect(String(editLocation(gene, { start: 0, end: 50, insert: "" }))).toBe("[50:150](+)");
    expect(String(editLocation(gene, { start: 150, end: 250, insert: "" }))).toBe("[100:150](+)");
    expect(editLocation(gene, { start: 0, end: 300, insert: "" })).toBeNull();

    expect(String(shiftLocation(gene, 100))).toBe("[200:300](+)");
    expect(String(clipLocation(new SimpleLocation(90, 150, 1), 100, 200))).toBe("[0:50](+)");
    expect(spanOf(gene)).toEqual({ start: 100, end: 200 });

    const join = new CompoundLocation([new SimpleLocation(0, 10), new SimpleLocation(20, 30)]);
    expect(locationExtent(join)).toEqual({ start: 0, end: 30 });
    expect(locationLength(join)).toBe(20);
  });

  it("keeps fuzziness through a shift and loses it through a cut", () => {
    const fuzzy = new SimpleLocation(new BeforePosition(10), new BeforePosition(50), 1);
    expect(String(fuzzy)).toBe("[<10:<50](+)");
    expect(String(editLocation(fuzzy, { start: 0, end: 5, insert: "" }))).toBe("[<5:<45](+)");
    expect(String(editLocation(fuzzy, { start: 30, end: 60, insert: "" }))).toBe("[<10:30](+)");
  });
});

describe("README: metadata and per-letter annotations", () => {
  it("edits a per-letter annotation in step with the sequence", () => {
    const q = new SeqRecord(new Seq("ACGTACGT"), "q");
    q.letterAnnotations.set("phred_quality", [40, 40, 40, 40, 30, 30, 30, 30]);
    expect(applyEdit(q, { start: 2, end: 4, insert: "TT" }).letterAnnotations.get("phred_quality"))
      .toEqual([40, 40, null, null, 30, 30, 30, 30]);

    const s = new SeqRecord(new Seq("ACGTACGT"), "s");
    s.letterAnnotations.set("secondary_structure", "HHHHCCCC");
    expect(applyEdit(s, { start: 2, end: 4, insert: "TT" }).letterAnnotations.get("secondary_structure"))
      .toBe("HH  CCCC");
    expect(applyEdit(s, { start: 2, end: 4, insert: "TT" }, { fill: "X" })
      .letterAnnotations.get("secondary_structure")).toBe("HHXXCCCC");
  });
});

describe("README: typed input", () => {
  it("cleans pasted bases", () => {
    expect(cleanBases("  1 acgt acgt \n 9 acgt")).toBe("ACGTACGTACGT");
  });

  it("checks an edit before it is applied", () => {
    expect(() => checkEdit({ start: 10, end: 5, insert: "" }, 100))
      .toThrowError("edit end 5 is before its start 10");
    expect(() => checkEdit({ start: 0, end: 200, insert: "" }, 100))
      .toThrowError("the edit 0..200 is outside a sequence of 100 bases");
    expect(() => checkEdit({ start: 0, end: 1, insert: "AC-T" }, 100))
      .toThrowError("the inserted bases may only be letters, got 'AC-T'");
  });
});
