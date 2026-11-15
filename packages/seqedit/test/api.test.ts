import { ValueError } from "@biolibs/core";
import { MutableSeq, Seq } from "@biolibs/seq";
import { CompoundLocation, ExactPosition, BeforePosition, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { describe, expect, it } from "vitest";
import {
  applyEdit, applyEdits, checkEdit, cleanBases, clipLocation, deleteBases, editLocation, extractRegion,
  insertBases, isCircular, lengthChange, locationExtent, locationLength, mapPosition, replaceBases,
  residuesOf, reverseComplementRecord, rotateCircular, shiftLocation, spanOf, touches,
} from "@biolibs/seqedit";

const SEQ = "ATGAAAGGGCCCTTTATGCGTACGTTAGCCATGGCATTAGCATCGATCGGATCCATTAGC"; // 60 bases

/** A record with a gene at 20..30 on the plus strand and a CDS at 40..50 on the minus strand. */
function demo(topology = "linear"): SeqRecord {
  return new SeqRecord(
    new Seq(SEQ), "demo", "DEMO", "a demonstration record", ["GeneID:1"],
    [
      new SeqFeature(new SimpleLocation(20, 30, 1), "gene", "g", { gene: ["middle"] }),
      new SeqFeature(new SimpleLocation(40, 50, -1), "CDS", "c", { product: ["p"] }),
    ],
    new Map<string, unknown>([["molecule_type", "DNA"], ["topology", topology]]),
  );
}

const locationOf = (record: SeqRecord, id: string) => record.features.find((f) => f.id === id)?.location ?? null;
const boundsOf = (record: SeqRecord, id: string) => {
  const location = locationOf(record, id)!;
  return [Number(location.start), Number(location.end)];
};

describe("cleanBases", () => {
  it("upper-cases and drops whitespace and position numbers", () => {
    expect(cleanBases("  1 acgt acgt \n 9 acgt")).toBe("ACGTACGTACGT");
  });

  it("leaves other characters in, so a caller can report them", () => {
    expect(cleanBases("ac-gt")).toBe("AC-GT");
  });
});

describe("checkEdit", () => {
  it("accepts an edit inside the sequence", () => {
    expect(() => checkEdit({ start: 0, end: 60, insert: "" }, 60)).not.toThrow();
    expect(() => checkEdit({ start: 60, end: 60, insert: "AAA" }, 60)).not.toThrow();
  });

  it("rejects bounds outside the sequence, the wrong way round, or not whole", () => {
    expect(() => checkEdit({ start: 0, end: 61, insert: "" }, 60)).toThrow(ValueError);
    expect(() => checkEdit({ start: -1, end: 10, insert: "" }, 60)).toThrow(ValueError);
    expect(() => checkEdit({ start: 20, end: 10, insert: "" }, 60)).toThrow(ValueError);
    expect(() => checkEdit({ start: 1.5, end: 10, insert: "" }, 60)).toThrow(ValueError);
  });

  it("rejects an insert holding anything but letters", () => {
    expect(() => checkEdit({ start: 0, end: 0, insert: "AC GT" }, 60)).toThrow(ValueError);
    expect(() => checkEdit({ start: 0, end: 0, insert: "AC-GT" }, 60)).toThrow(ValueError);
    expect(() => checkEdit({ start: 0, end: 0, insert: "ACGT" }, 60)).not.toThrow();
  });
});

describe("mapPosition, lengthChange and touches", () => {
  const edit = { start: 10, end: 20, insert: "AAA" }; // ten out, three in

  it("leaves positions before the edit where they are", () => {
    expect(mapPosition(0, edit, "start")).toBe(0);
    expect(mapPosition(10, edit, "start")).toBe(10);
    expect(mapPosition(10, edit, "end")).toBe(10);
  });

  it("moves positions after the edit by the change in length", () => {
    expect(mapPosition(20, edit, "start")).toBe(13);
    expect(mapPosition(30, edit, "start")).toBe(23);
    expect(mapPosition(30, edit, "end")).toBe(23);
  });

  it("collapses a position inside the removed stretch to the end the bias names", () => {
    expect(mapPosition(15, edit, "start")).toBe(10);
    expect(mapPosition(15, edit, "end")).toBe(13);
  });

  it("is monotonic, so a feature can never come out inside out", () => {
    for (const bias of ["start", "end"] as const) {
      let previous = -1;
      for (let position = 0; position <= 60; position++) {
        const mapped = mapPosition(position, edit, bias);
        expect(mapped).toBeGreaterThanOrEqual(previous);
        previous = mapped;
      }
    }
  });

  it("puts a left edge after a pure insertion and a right edge before it", () => {
    const insertion = { start: 10, end: 10, insert: "AAA" };
    expect(mapPosition(10, insertion, "start")).toBe(13);
    expect(mapPosition(10, insertion, "end")).toBe(10);
    expect(mapPosition(9, insertion, "start")).toBe(9);
    expect(mapPosition(11, insertion, "end")).toBe(14);
  });

  it("leaves a left edge at the start of a replacement, which falls inside it", () => {
    expect(mapPosition(10, { start: 10, end: 20, insert: "AAA" }, "start")).toBe(10);
  });

  it("reports the change in length", () => {
    expect(lengthChange(edit)).toBe(-7);
    expect(lengthChange({ start: 5, end: 5, insert: "AAA" })).toBe(3);
    expect(lengthChange({ start: 5, end: 8, insert: "GGG" })).toBe(0);
  });

  it("says whether an edit touches a span", () => {
    expect(touches({ start: 0, end: 5, insert: "" }, 10, 20)).toBe(false);
    expect(touches({ start: 15, end: 16, insert: "" }, 10, 20)).toBe(true);
    expect(touches({ start: 5, end: 15, insert: "" }, 10, 20)).toBe(true);
  });

  it("treats an insertion at a span's boundary as leaving the span alone", () => {
    expect(touches({ start: 10, end: 10, insert: "AAA" }, 10, 20)).toBe(false);
    expect(touches({ start: 20, end: 20, insert: "AAA" }, 10, 20)).toBe(false);
    expect(touches({ start: 15, end: 15, insert: "AAA" }, 10, 20)).toBe(true);
  });
});

describe("editLocation", () => {
  const gene = new SimpleLocation(100, 200, 1);

  it("shifts a location after the edit and leaves one before it alone", () => {
    const earlier = editLocation(gene, { start: 0, end: 50, insert: "" })!;
    expect([Number(earlier.start), Number(earlier.end)]).toEqual([50, 150]);
    const later = editLocation(gene, { start: 300, end: 350, insert: "" })!;
    expect([Number(later.start), Number(later.end)]).toEqual([100, 200]);
  });

  it("keeps the strand, ref and fuzziness of a location it only shifts", () => {
    const fuzzy = new SimpleLocation(new BeforePosition(100), new ExactPosition(200), -1, "REF", "db");
    const moved = editLocation(fuzzy, { start: 0, end: 50, insert: "" })!;
    expect(moved.strand).toBe(-1);
    expect(moved.ref).toBe("REF");
    expect(moved.refDb).toBe("db");
    expect(moved.start).toBeInstanceOf(BeforePosition);
    expect(Number(moved.start)).toBe(50);
  });

  it("clips a location the edit cuts into, keeping the part that survives", () => {
    const clippedEnd = editLocation(gene, { start: 150, end: 250, insert: "" })!;
    expect([Number(clippedEnd.start), Number(clippedEnd.end)]).toEqual([100, 150]);
    const clippedStart = editLocation(gene, { start: 50, end: 150, insert: "" })!;
    expect([Number(clippedStart.start), Number(clippedStart.end)]).toEqual([50, 50 + 0 + 50]);
  });

  it("makes a clipped boundary exact, since the edit created it", () => {
    const fuzzy = new SimpleLocation(new BeforePosition(100), new ExactPosition(200), 1);
    const clipped = editLocation(fuzzy, { start: 50, end: 150, insert: "" })!;
    expect(clipped.start).toBeInstanceOf(ExactPosition);
  });

  it("returns null when the edit removes every base the location covered", () => {
    expect(editLocation(gene, { start: 0, end: 300, insert: "" })).toBeNull();
    expect(editLocation(gene, { start: 100, end: 200, insert: "" })).toBeNull();
  });

  it("grows a location the edit inserts into", () => {
    const grown = editLocation(gene, { start: 150, end: 150, insert: "AAAAA" })!;
    expect([Number(grown.start), Number(grown.end)]).toEqual([100, 205]);
  });

  it("does not stretch a location when the insertion is at its boundary", () => {
    const atStart = editLocation(gene, { start: 100, end: 100, insert: "AAAAA" })!;
    expect([Number(atStart.start), Number(atStart.end)]).toEqual([105, 205]);
    const atEnd = editLocation(gene, { start: 200, end: 200, insert: "AAAAA" })!;
    expect([Number(atEnd.start), Number(atEnd.end)]).toEqual([100, 200]);
  });

  it("carries every part of a join through and keeps the operator", () => {
    const join = new CompoundLocation([new SimpleLocation(10, 20, 1), new SimpleLocation(30, 40, 1)], "order");
    const moved = editLocation(join, { start: 0, end: 5, insert: "" })! as CompoundLocation;
    expect(moved).toBeInstanceOf(CompoundLocation);
    expect(moved.operator).toBe("order");
    expect(moved.parts.map((p) => [Number(p.start), Number(p.end)])).toEqual([[5, 15], [25, 35]]);
  });

  it("collapses a join left with one part to a simple location", () => {
    const join = new CompoundLocation([new SimpleLocation(10, 20, 1), new SimpleLocation(30, 40, 1)]);
    const moved = editLocation(join, { start: 25, end: 45, insert: "" })!;
    expect(moved).toBeInstanceOf(SimpleLocation);
    expect([Number(moved.start), Number(moved.end)]).toEqual([10, 20]);
  });

  it("returns null for a join whose every part is removed", () => {
    const join = new CompoundLocation([new SimpleLocation(10, 20, 1), new SimpleLocation(30, 40, 1)]);
    expect(editLocation(join, { start: 0, end: 50, insert: "" })).toBeNull();
  });
});

describe("shiftLocation, locationExtent, locationLength and spanOf", () => {
  it("shifts a location, keeping fuzzy classes (measured against Biopython in golden.test.ts)", () => {
    const moved = shiftLocation(new SimpleLocation(new BeforePosition(10), new ExactPosition(20), 1), 100);
    expect([Number(moved.start), Number(moved.end)]).toEqual([110, 120]);
    expect(moved.start).toBeInstanceOf(BeforePosition);
  });

  it("gives the outermost bounds of a join as its extent", () => {
    const join = new CompoundLocation([new SimpleLocation(10, 20, 1), new SimpleLocation(30, 40, 1)]);
    expect(locationExtent(join)).toEqual({ start: 10, end: 40 });
  });

  it("counts the bases a join covers, not the gaps", () => {
    const join = new CompoundLocation([new SimpleLocation(10, 20, 1), new SimpleLocation(30, 40, 1)]);
    expect(locationLength(join)).toBe(20);
    expect(locationLength(new SimpleLocation(10, 20, 1))).toBe(10);
  });

  it("reads a part's span as numbers", () => {
    expect(spanOf(new SimpleLocation(new BeforePosition(10), new ExactPosition(20), 1))).toEqual({ start: 10, end: 20 });
  });
});

describe("clipLocation", () => {
  it("re-bases a location onto the window", () => {
    const clipped = clipLocation(new SimpleLocation(120, 150, 1), 100, 200)!;
    expect([Number(clipped.start), Number(clipped.end)]).toEqual([20, 50]);
  });

  it("cuts a location back to the window's edges", () => {
    const clipped = clipLocation(new SimpleLocation(90, 250, 1), 100, 200)!;
    expect([Number(clipped.start), Number(clipped.end)]).toEqual([0, 100]);
  });

  it("returns null for a location wholly outside the window", () => {
    expect(clipLocation(new SimpleLocation(0, 50, 1), 100, 200)).toBeNull();
    expect(clipLocation(new SimpleLocation(100, 100, 1), 100, 200)).toBeNull();
  });

  it("keeps a boundary inside the window fuzzy and makes a cut one exact", () => {
    const clipped = clipLocation(new SimpleLocation(new BeforePosition(120), new ExactPosition(250), 1), 100, 200)!;
    expect(clipped.start).toBeInstanceOf(BeforePosition);
    expect(clipped.end).toBeInstanceOf(ExactPosition);
  });
});

describe("residuesOf", () => {
  it("reads a record's sequence as a string", () => {
    expect(residuesOf(demo())).toBe(SEQ);
  });

  it("gives an empty string for a record without a sequence", () => {
    expect(residuesOf(new SeqRecord(null))).toBe("");
  });
});

describe("applyEdit", () => {
  it("replaces the bases asked for", () => {
    const edited = applyEdit(demo(), { start: 0, end: 3, insert: "GGG" });
    expect(residuesOf(edited)).toBe("GGG" + SEQ.slice(3));
    expect(residuesOf(edited)).toHaveLength(60);
  });

  it("leaves the original record alone", () => {
    const record = demo();
    applyEdit(record, { start: 0, end: 30, insert: "" });
    expect(residuesOf(record)).toBe(SEQ);
    expect(record.features).toHaveLength(2);
  });

  it("moves a feature after the edit and leaves one before it", () => {
    const edited = applyEdit(demo(), { start: 0, end: 10, insert: "" });
    expect(boundsOf(edited, "g")).toEqual([10, 20]);
    expect(boundsOf(edited, "c")).toEqual([30, 40]);
  });

  it("keeps a feature's type, id and qualifiers", () => {
    const edited = applyEdit(demo(), { start: 0, end: 10, insert: "" });
    const gene = edited.features.find((f) => f.id === "g")!;
    expect(gene.type).toBe("gene");
    expect(gene.qualifiers.get("gene")).toEqual(["middle"]);
  });

  it("keeps a feature's strand", () => {
    const edited = applyEdit(demo(), { start: 0, end: 10, insert: "" });
    expect(locationOf(edited, "c")!.strand).toBe(-1);
  });

  it("clips a feature the edit cuts through, by default", () => {
    const edited = applyEdit(demo(), { start: 25, end: 35, insert: "" });
    expect(boundsOf(edited, "g")).toEqual([20, 25]);
  });

  it("drops a feature the edit cuts through when asked, as Biopython's slicing does", () => {
    const edited = applyEdit(demo(), { start: 25, end: 35, insert: "" }, { cutFeatures: "drop" });
    expect(edited.features.map((f) => f.id)).toEqual(["c"]);
  });

  it("drops a feature the edit removes entirely, whatever the policy", () => {
    for (const cutFeatures of ["clip", "drop"] as const) {
      const edited = applyEdit(demo(), { start: 15, end: 35, insert: "" }, { cutFeatures });
      expect(edited.features.map((f) => f.id)).toEqual(["c"]);
    }
  });

  it("keeps a feature with no location, there being nothing in it to move", () => {
    const record = demo();
    record.features.push(new SeqFeature(null, "assembly_gap", "gap", { note: ["unplaced"] }));
    const edited = applyEdit(record, { start: 0, end: 59, insert: "" });
    const gap = edited.features.find((f) => f.id === "gap")!;
    expect(gap.location).toBeNull();
    expect(gap.qualifiers.get("note")).toEqual(["unplaced"]);
  });

  it("carries the id, name, description, dbxrefs and annotations over", () => {
    const edited = applyEdit(demo(), { start: 0, end: 10, insert: "" });
    expect(edited.id).toBe("demo");
    expect(edited.name).toBe("DEMO");
    expect(edited.description).toBe("a demonstration record");
    expect(edited.dbxrefs).toEqual(["GeneID:1"]);
    expect(edited.annotations.get("molecule_type")).toBe("DNA");
  });

  it("does not share the annotations, dbxrefs or qualifiers with the original", () => {
    const record = demo();
    const edited = applyEdit(record, { start: 0, end: 10, insert: "" });
    edited.annotations.set("molecule_type", "RNA");
    edited.dbxrefs.push("GeneID:2");
    edited.features[0]!.qualifiers.set("gene", ["changed"]);
    expect(record.annotations.get("molecule_type")).toBe("DNA");
    expect(record.dbxrefs).toEqual(["GeneID:1"]);
    expect(record.features[0]!.qualifiers.get("gene")).toEqual(["middle"]);
  });

  it("keeps a MutableSeq record mutable", () => {
    const record = new SeqRecord(new MutableSeq(SEQ), "m");
    expect(applyEdit(record, { start: 0, end: 1, insert: "" }).seq).toBeInstanceOf(MutableSeq);
    expect(applyEdit(demo(), { start: 0, end: 1, insert: "" }).seq).toBeInstanceOf(Seq);
  });

  it("edits a string per-letter annotation in step with the sequence", () => {
    const record = new SeqRecord(new Seq("ACGTACGTAC"), "q");
    record.letterAnnotations = new Map([["secondary_structure", "HHHHHEEEEE"]]);
    const edited = applyEdit(record, { start: 2, end: 6, insert: "GG" });
    expect(edited.letterAnnotations.get("secondary_structure")).toBe("HH  EEEE");
    expect(residuesOf(edited)).toHaveLength(8);
  });

  it("edits a list per-letter annotation too, filling the new bases with null", () => {
    const record = new SeqRecord(new Seq("ACGTAC"), "q");
    record.letterAnnotations = new Map([["phred_quality", [1, 2, 3, 4, 5, 6]]]);
    const edited = applyEdit(record, { start: 1, end: 3, insert: "GGG" });
    expect(edited.letterAnnotations.get("phred_quality")).toEqual([1, null, null, null, 4, 5, 6]);
  });

  it("takes a custom fill for per-letter annotations", () => {
    const record = new SeqRecord(new Seq("ACGTAC"), "q");
    record.letterAnnotations = new Map([["secondary_structure", "HHHEEE"]]);
    expect(applyEdit(record, { start: 0, end: 0, insert: "GG" }, { fill: "-" }).letterAnnotations.get("secondary_structure")).toBe("--HHHEEE");
  });

  it("appends at the end and prepends at the start", () => {
    expect(residuesOf(insertBases(demo(), 60, "GGG"))).toBe(SEQ + "GGG");
    expect(residuesOf(insertBases(demo(), 0, "GGG"))).toBe("GGG" + SEQ);
    expect(boundsOf(insertBases(demo(), 0, "GGG"), "g")).toEqual([23, 33]);
  });

  it("rejects an edit outside the sequence", () => {
    expect(() => applyEdit(demo(), { start: 0, end: 61, insert: "" })).toThrow(ValueError);
  });
});

describe("replaceBases, insertBases and deleteBases", () => {
  it("are the three edits spelled out", () => {
    expect(residuesOf(replaceBases(demo(), 0, 3, "GGG"))).toBe("GGG" + SEQ.slice(3));
    expect(residuesOf(insertBases(demo(), 3, "GGG"))).toBe(SEQ.slice(0, 3) + "GGG" + SEQ.slice(3));
    expect(residuesOf(deleteBases(demo(), 0, 3))).toBe(SEQ.slice(3));
  });

  it("pass their options through", () => {
    expect(deleteBases(demo(), 25, 35, { cutFeatures: "drop" }).features.map((f) => f.id)).toEqual(["c"]);
  });
});

describe("applyEdits", () => {
  it("applies several edits given in the original coordinates", () => {
    const edited = applyEdits(demo(), [
      { start: 0, end: 10, insert: "" },
      { start: 50, end: 50, insert: "GGGGG" },
    ]);
    expect(residuesOf(edited)).toBe(SEQ.slice(10, 50) + "GGGGG" + SEQ.slice(50));
  });

  it("gives the same answer whatever order the edits come in", () => {
    const edits = [{ start: 50, end: 55, insert: "TT" }, { start: 5, end: 10, insert: "" }];
    expect(residuesOf(applyEdits(demo(), edits))).toBe(residuesOf(applyEdits(demo(), [...edits].reverse())));
  });

  it("moves features through all of them", () => {
    const edited = applyEdits(demo(), [{ start: 0, end: 10, insert: "" }, { start: 55, end: 60, insert: "" }]);
    expect(boundsOf(edited, "g")).toEqual([10, 20]);
    expect(boundsOf(edited, "c")).toEqual([30, 40]);
  });

  it("does nothing for an empty list", () => {
    expect(residuesOf(applyEdits(demo(), []))).toBe(SEQ);
  });

  it("rejects overlapping edits", () => {
    expect(() => applyEdits(demo(), [{ start: 0, end: 20, insert: "" }, { start: 10, end: 30, insert: "" }])).toThrow(ValueError);
    expect(() => applyEdits(demo(), [{ start: 0, end: 20, insert: "" }, { start: 10, end: 30, insert: "" }])).toThrow(/overlap/);
  });

  it("rejects two insertions at the same point, which have no defined order", () => {
    expect(() => applyEdits(demo(), [{ start: 10, end: 10, insert: "A" }, { start: 10, end: 10, insert: "G" }])).toThrow(ValueError);
  });

  it("allows edits that merely touch", () => {
    expect(() => applyEdits(demo(), [{ start: 0, end: 10, insert: "" }, { start: 10, end: 20, insert: "" }])).not.toThrow();
  });

  it("rejects an edit outside the sequence before applying any of them", () => {
    expect(() => applyEdits(demo(), [{ start: 0, end: 10, insert: "" }, { start: 0, end: 99, insert: "" }])).toThrow(ValueError);
  });
});

describe("isCircular", () => {
  it("reads the topology annotation", () => {
    expect(isCircular(demo("circular"))).toBe(true);
    expect(isCircular(demo("linear"))).toBe(false);
    expect(isCircular(new SeqRecord(new Seq("ACGT")))).toBe(false);
  });
});

describe("extractRegion", () => {
  it("takes the bases asked for", () => {
    expect(residuesOf(extractRegion(demo(), 10, 50))).toBe(SEQ.slice(10, 50));
  });

  it("re-bases the features onto the region", () => {
    const region = extractRegion(demo(), 10, 50);
    expect(boundsOf(region, "g")).toEqual([10, 20]);
    expect(boundsOf(region, "c")).toEqual([30, 40]);
  });

  it("keeps a feature crossing an edge as the part inside, by default", () => {
    const region = extractRegion(demo(), 25, 45);
    expect(boundsOf(region, "g")).toEqual([0, 5]);
    expect(boundsOf(region, "c")).toEqual([15, 20]);
  });

  it("drops a feature crossing an edge when asked, as Biopython's slicing does", () => {
    expect(extractRegion(demo(), 25, 45, { edgeFeatures: "drop" }).features).toEqual([]);
  });

  it("drops a join that loses part of one exon under 'drop'", () => {
    const record = demo();
    record.features.push(new SeqFeature(
      new CompoundLocation([new SimpleLocation(10, 20, 1), new SimpleLocation(50, 58, 1)]), "mRNA", "j",
    ));
    // The region keeps the whole first exon and part of the second, so the extent alone would not catch it.
    expect(extractRegion(record, 10, 55, { edgeFeatures: "drop" }).features.map((f) => f.id)).not.toContain("j");
    expect(extractRegion(record, 10, 58, { edgeFeatures: "drop" }).features.map((f) => f.id)).toContain("j");
  });

  it("names the new record after the region, unless told otherwise", () => {
    expect(extractRegion(demo(), 10, 50).id).toBe("demo:10-50");
    expect(extractRegion(demo(), 10, 50, { id: "insert" }).id).toBe("insert");
  });

  it("marks the region linear, since a piece cut out of a circle is a line", () => {
    expect(extractRegion(demo("circular"), 10, 50).annotations.get("topology")).toBe("linear");
  });

  it("takes a region across the origin of a circular record", () => {
    const region = extractRegion(demo("circular"), 50, 70);
    expect(residuesOf(region)).toBe(SEQ.slice(50) + SEQ.slice(0, 10));
    expect(residuesOf(region)).toHaveLength(20);
  });

  it("places features of a wrapping region on both sides of the origin", () => {
    const record = demo("circular");
    record.features.push(new SeqFeature(new SimpleLocation(2, 8, 1), "gene", "early"));
    const region = extractRegion(record, 50, 70);
    // The region starts at 50, so base 2 of the original is base 12 of the region.
    expect(boundsOf(region, "early")).toEqual([12, 18]);
  });

  it("joins a feature that spans the origin into one stretch after the cut", () => {
    const record = demo("circular");
    record.features.push(new SeqFeature(new SimpleLocation(55, 60, 1), "gene", "atEnd"));
    record.features.push(new SeqFeature(new SimpleLocation(0, 5, 1), "gene", "atStart"));
    const region = extractRegion(record, 55, 65);
    expect(boundsOf(region, "atEnd")).toEqual([0, 5]);
    expect(boundsOf(region, "atStart")).toEqual([5, 10]);
  });

  it("refuses to wrap a linear record", () => {
    expect(() => extractRegion(demo("linear"), 50, 70)).toThrow(ValueError);
    expect(() => extractRegion(demo("linear"), 50, 70)).toThrow(/linear/);
  });

  it("refuses a region longer than a circular record", () => {
    expect(() => extractRegion(demo("circular"), 10, 80)).toThrow(ValueError);
  });

  it("rejects a region outside the record or the wrong way round", () => {
    expect(() => extractRegion(demo(), -1, 10)).toThrow(ValueError);
    expect(() => extractRegion(demo(), 30, 10)).toThrow(ValueError);
    expect(() => extractRegion(demo(), 1.5, 10)).toThrow(ValueError);
  });

  it("gives an empty record for an empty region", () => {
    const region = extractRegion(demo(), 20, 20);
    expect(residuesOf(region)).toBe("");
    expect(region.features).toEqual([]);
  });
});

describe("reverseComplementRecord", () => {
  it("reverse-complements the sequence", () => {
    expect(residuesOf(reverseComplementRecord(demo()))).toBe(new Seq(SEQ).reverseComplement().toString());
  });

  it("flips strands and mirrors locations", () => {
    const flipped = reverseComplementRecord(demo());
    const gene = flipped.features.find((f) => f.id === "g")!;
    expect(gene.location!.strand).toBe(-1);
    // A feature at 20..30 of a 60-base record lands at 30..40 when turned over.
    expect([Number(gene.location!.start), Number(gene.location!.end)]).toEqual([30, 40]);
  });

  it("keeps the metadata by default and drops it when asked", () => {
    expect(reverseComplementRecord(demo()).id).toBe("demo");
    expect(reverseComplementRecord(demo()).annotations.get("topology")).toBe("linear");
    expect(reverseComplementRecord(demo(), false).id).toBe("<unknown id>");
  });

  it("is its own inverse", () => {
    const twice = reverseComplementRecord(reverseComplementRecord(demo()));
    expect(residuesOf(twice)).toBe(SEQ);
    const gene = twice.features.find((f) => f.id === "g")!;
    expect([Number(gene.location!.start), Number(gene.location!.end)]).toEqual([20, 30]);
    expect(gene.location!.strand).toBe(1);
  });

  it("keeps a feature with no location instead of raising, unlike Biopython", () => {
    const record = demo();
    record.features.push(new SeqFeature(null, "assembly_gap", "gap", { note: ["unplaced"] }));
    const flipped = reverseComplementRecord(record);
    const gap = flipped.features.find((f) => f.id === "gap")!;
    expect(gap.location).toBeNull();
    expect(gap.qualifiers.get("note")).toEqual(["unplaced"]);
    expect(flipped.features).toHaveLength(3);
  });
});

describe("rotateCircular", () => {
  it("moves the chosen base to the start", () => {
    expect(residuesOf(rotateCircular(demo("circular"), 10))).toBe(SEQ.slice(10) + SEQ.slice(0, 10));
  });

  it("keeps the length and the topology", () => {
    const rotated = rotateCircular(demo("circular"), 10);
    expect(residuesOf(rotated)).toHaveLength(60);
    expect(rotated.annotations.get("topology")).toBe("circular");
  });

  it("moves the features with it", () => {
    const rotated = rotateCircular(demo("circular"), 10);
    expect(boundsOf(rotated, "g")).toEqual([10, 20]);
    expect(boundsOf(rotated, "c")).toEqual([30, 40]);
  });

  it("keeps a feature that ends up spanning the new origin, as a join", () => {
    const rotated = rotateCircular(demo("circular"), 25);
    const gene = locationOf(rotated, "g")!;
    // The gene ran 20..30; from base 25 it starts five bases before the new origin.
    expect(locationLength(gene)).toBe(10);
  });

  it("carries a feature with no location through, as applyEdit does", () => {
    // extractRegion is the engine of rotateCircular, so dropping such a feature would lose annotation for
    // nothing: rotating a circle changes no base. Biopython raises on one instead, which the golden file
    // records as this package's one deliberate divergence.
    const record = demo("circular");
    record.features.push(new SeqFeature(null, "source", "s"));
    expect(rotateCircular(record, 10).features.map((f) => f.type)).toEqual(["gene", "CDS", "source"]);
    expect(locationOf(rotateCircular(record, 10), "s")).toBeNull();
    expect(extractRegion(record, 10, 50).features.map((f) => f.type)).toEqual(["gene", "CDS", "source"]);
    expect(extractRegion(record, 10, 50, { edgeFeatures: "drop" }).features.map((f) => f.type))
      .toEqual(["gene", "CDS", "source"]);
  });

  it("does nothing for an origin of zero", () => {
    expect(residuesOf(rotateCircular(demo("circular"), 0))).toBe(SEQ);
  });

  it("returns to the original after rotating all the way round", () => {
    let record = demo("circular");
    for (let i = 0; i < 6; i++) record = rotateCircular(record, 10);
    expect(residuesOf(record)).toBe(SEQ);
  });

  it("refuses a linear record", () => {
    expect(() => rotateCircular(demo("linear"), 10)).toThrow(ValueError);
    expect(() => rotateCircular(demo("linear"), 10)).toThrow(/circular/);
  });

  it("rejects an origin outside the record", () => {
    expect(() => rotateCircular(demo("circular"), 60)).toThrow(ValueError);
    expect(() => rotateCircular(demo("circular"), -1)).toThrow(ValueError);
    expect(() => rotateCircular(demo("circular"), 1.5)).toThrow(ValueError);
  });
});
