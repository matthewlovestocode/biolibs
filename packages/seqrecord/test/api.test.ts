/** TypeScript-specific behaviour of SeqRecord that Biopython golden data cannot express. */
import { describe, expect, it } from "vitest";
import { MutableSeq, Seq } from "@biolibs/seq";
import { SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord, RestrictedDict } from "@biolibs/seqrecord";

const record = () =>
  new SeqRecord(new Seq("ATGAAATAGCCC"), "id1", "name1", "desc1", ["DB:1"], [new SeqFeature(new SimpleLocation(0, 9, 1), "CDS")], { molecule_type: "DNA", note: ["x"] }, { q: "abcdefghijkl" });

describe("options objects are equivalent to positional arguments", () => {
  it("reverseComplement", () => {
    const r = record();
    const positional = r.reverseComplement(true, true, "new description", true, true, true, true);
    const options = r.reverseComplement({ id: true, name: true, description: "new description", features: true, annotations: true, letterAnnotations: true, dbxrefs: true });
    expect(options.repr()).toBe(positional.repr());
    expect(options.toString()).toBe(positional.toString());
    expect(options.features.map((f) => f.repr())).toEqual(positional.features.map((f) => f.repr()));
  });

  it("translate", () => {
    const r = record();
    const positional = r.translate(11, "#", false, false, null, true, true, "p", false, true);
    const options = r.translate({ table: 11, stopSymbol: "#", id: true, name: true, description: "p", annotations: true });
    expect(options.toString()).toBe(positional.toString());
    expect(options.seq!.toString()).toBe("MK#P");
    expect(options.annotations.get("molecule_type")).toBe("protein");
  });

  it("defaults: reverseComplement keeps features and letter annotations, drops the rest", () => {
    const rc = record().reverseComplement();
    expect(rc.id).toBe("<unknown id>");
    expect(rc.features).toHaveLength(1);
    expect(rc.features[0]!.location!.toString()).toBe("[3:12](-)");
    expect(rc.letterAnnotations.get("q")).toBe("lkjihgfedcba");
  });
});

describe("annotations and constructor inputs", () => {
  it("accepts plain objects for annotations and letterAnnotations", () => {
    const r = new SeqRecord(new Seq("ACGT"), "i", "n", "d", null, null, { a: 1 }, { q: [1, 2, 3, 4] });
    expect(r.annotations).toBeInstanceOf(Map);
    expect(r.annotations.get("a")).toBe(1);
    expect(r.letterAnnotations).toBeInstanceOf(RestrictedDict);
  });

  it("shares a Map passed as annotations (like a Python dict) instead of copying it", () => {
    const annotations = new Map<string, unknown>([["k", "v"]]);
    const r = new SeqRecord(new Seq("ACGT"), "i", "n", "d", null, null, annotations);
    annotations.set("later", 1);
    expect(r.annotations.get("later")).toBe(1);
  });

  it("records are deliberately not comparable", () => {
    const r = record();
    expect(() => r.equals(r)).toThrow("deliberately not implemented");
    expect(() => r.lt(r)).toThrow(/NotImplemented|deliberately/);
  });
});

describe("format", () => {
  it("uses toString() for an empty format and registered writers otherwise", () => {
    const r = record();
    expect(r.format("")).toBe(r.toString());
    expect(() => r.format("fasta")).toThrow();
    SeqRecord.writers.set("demo", (rec) => `>${rec.id}\n${rec.seq!.toString()}\n`);
    try {
      expect(r.format("demo")).toBe(">id1\nATGAAATAGCCC\n");
    } finally {
      SeqRecord.writers.delete("demo");
    }
  });
});

describe("MutableSeq records", () => {
  it("keep their sequence type through slicing, but reverseComplement returns an immutable Seq", () => {
    const r = new SeqRecord(new MutableSeq("ACGTACGT"), "i", "n", "d");
    expect(r.slice(1, 5).seq).toBeInstanceOf(MutableSeq);
    expect(r.reverseComplement().seq).toBeInstanceOf(Seq);
  });
});

describe("subclasses", () => {
  class MyRecord extends SeqRecord {}
  it("slicing, upper and addition produce the subclass", () => {
    const r = new MyRecord(new Seq("ACGT"), "i", "n", "d");
    expect(r.slice(0, 2)).toBeInstanceOf(MyRecord);
    expect(r.upper()).toBeInstanceOf(MyRecord);
    expect(r.add("TT")).toBeInstanceOf(MyRecord);
    expect(r.radd("TT")).toBeInstanceOf(MyRecord);
  });
});
