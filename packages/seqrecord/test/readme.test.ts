/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 *
 * The `format` section imports `@biolibs/seqio`, as the README's block does, because that is what
 * registers the writers. It is a test-only import: this package does not depend on seqio.
 */
import { captureWarnings } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { ExactPosition, SeqFeature, SimpleLocation, UnknownPosition } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { describe, expect, it } from "vitest";
import "@biolibs/seqio";

/** The annotated record the README builds once and uses throughout. */
const rec = (): SeqRecord => new SeqRecord(
  new Seq("ATGAAATAGCCC"), "id1", "name1", "desc1", null,
  [new SeqFeature(new SimpleLocation(0, 9, 1), "CDS")],
  { molecule_type: "DNA" },
  { q: "abcdefghijkl" },
);

describe("README: SeqRecord", () => {
  it("holds the sequence and everything known about it", () => {
    const r = rec();
    expect([r.id, r.name, r.description]).toEqual(["id1", "name1", "desc1"]);
    expect([r.length, r.features.length]).toEqual([12, 1]);
    expect(r.seq!.toString()).toBe("ATGAAATAGCCC");
    expect(r.annotations.get("molecule_type")).toBe("DNA");
    expect(r.letterAnnotations.get("q")).toBe("abcdefghijkl");
    expect(r.repr()).toBe(
      "SeqRecord(seq=Seq('ATGAAATAGCCC'), id='id1', name='name1', description='desc1', dbxrefs=[])");
  });

  it("uses Biopython's placeholder defaults", () => {
    const bare = new SeqRecord(new Seq("ACGT"));
    expect(bare.id).toBe("<unknown id>");
    expect(bare.name).toBe("<unknown name>");
    expect(bare.description).toBe("<unknown description>");
  });

  it("prints the summary Biopython prints", () => {
    expect(rec().toString()).toBe(
      "ID: id1\nName: name1\nDescription: desc1\nNumber of features: 1\n/molecule_type=DNA\n"
      + "Per letter annotation for: q\nSeq('ATGAAATAGCCC')");
  });
});

describe("README: slicing", () => {
  it("carries the per-letter annotation and the enclosed features", () => {
    const r = rec();
    expect(r.slice(2, 6).seq!.toString()).toBe("GAAA");
    expect(r.slice(3).letterAnnotations.get("q")).toBe("defghijkl");
    expect(r.slice(2, 6).features.length).toBe(0);
    expect(r.slice(0, 9).features.length).toBe(1);
    expect(r.slice(2, 6).id).toBe("id1");
    expect(r.at(0)).toBe("A");
    expect(r.contains("ATG")).toBe(true);
    expect([...r].slice(0, 3).join("")).toBe("ATG");
  });

  it("drops a feature pointing at another record, with the warning", () => {
    const { result, warnings } = captureWarnings(() => {
      const r = new SeqRecord(new Seq("ACGTACGT"), "r", "n", "d", null,
        [new SeqFeature(new SimpleLocation(0, 3, 1, "OTHER"), "misc")]);
      return r.slice(0, 4).features.length;
    });
    expect(result).toBe(0);
    expect(warnings[0]!.message).toBe(
      "When slicing SeqRecord objects, any SeqFeature referencing other sequences"
      + " (e.g. from segmented GenBank records) are ignored.");
  });
});

describe("README: concatenation", () => {
  it("appends and prepends a sequence, shifting features", () => {
    const r = rec();
    expect(r.add(new Seq("GGG")).seq!.toString()).toBe("ATGAAATAGCCCGGG");
    expect(r.radd(new Seq("GGG")).seq!.toString()).toBe("GGGATGAAATAGCCC");
    expect(String(r.radd(new Seq("GGG")).features[0]!.location)).toBe("[3:12](+)");
  });

  it("merges two records, keeping only what both agree on", () => {
    const both = rec().add(rec());
    expect(both.seq!.toString()).toBe("ATGAAATAGCCCATGAAATAGCCC");
    expect(both.features.length).toBe(2);
    expect(both.id).toBe("id1");
    expect(both.annotations.get("molecule_type")).toBe("DNA");
  });

  it("refuses to join a string per-letter annotation to a list one", () => {
    const a = new SeqRecord(new Seq("AC"), "i", "n", "d", null, [], {}, { q: "ab" });
    const b = new SeqRecord(new Seq("GT"), "i", "n", "d", null, [], {}, { q: [1, 2] });
    expect(() => a.add(b)).toThrowError(TypeError);
  });
});

describe("README: reverseComplement", () => {
  it("flips the sequence, the features and the per-letter annotation", () => {
    const r = rec();
    expect(r.reverseComplement().seq!.toString()).toBe("GGGCTATTTCAT");
    expect(String(r.reverseComplement().features[0]!.location)).toBe("[3:12](-)");
    expect(r.reverseComplement().letterAnnotations.get("q")).toBe("lkjihgfedcba");
    expect(r.reverseComplement().id).toBe("<unknown id>");
  });

  it("takes the polymorphic options", () => {
    const r = rec();
    expect(r.reverseComplement({ id: true, description: "reverse strand" }).id).toBe("id1");
    expect(r.reverseComplement({ id: true, description: "reverse strand" }).description)
      .toBe("reverse strand");
    expect(r.reverseComplement("new-id").id).toBe("new-id");
  });
});

describe("README: translate", () => {
  it("translates and sets molecule_type", () => {
    const r = rec();
    expect(r.translate().seq!.toString()).toBe("MK*P");
    expect(r.translate({ toStop: true }).seq!.toString()).toBe("MK");
    expect(r.translate({ id: true }).id).toBe("id1");
    expect(r.translate().annotations.get("molecule_type")).toBe("protein");
  });

  it("refuses to carry features across", () => {
    expect(() => rec().translate({ features: true } as never))
      .toThrowError("Unexpected features argument True");
  });
});

describe("README: letterAnnotations", () => {
  it("checks the length on assignment", () => {
    const r = new SeqRecord(new Seq("ACGT"));
    expect(() => { r.letterAnnotations = { q: "abc" }; }).toThrowError(
      "The per-letter-annotations have the same length as the sequence, but found: \n q=abc");
    r.letterAnnotations = { q: "abcd" };
    expect(r.letterAnnotations.get("q")).toBe("abcd");
  });

  it("refuses a resize while they exist", () => {
    const r2 = new SeqRecord(new Seq("ACGT"), "i", "n", "d", null, [], {}, { q: "abcd" });
    expect(() => { r2.seq = new Seq("AC"); })
      .toThrowError("You must empty the letter annotations first!");
  });
});

describe("README: count, upper, lower", () => {
  it("counts and changes case", () => {
    const r = rec();
    expect(r.count("A")).toBe(5);
    expect(r.lower().seq!.toString()).toBe("atgaaatagccc");
    expect(r.isupper()).toBe(true);
    expect(r.islower()).toBe(false);
  });
});

describe("README: format", () => {
  it("renders through the writers @biolibs/seqio registers", () => {
    const r = new SeqRecord(new Seq("ATGAAATAGCCC"), "id1", "name1", "desc1", null, [],
                            { molecule_type: "DNA" });
    expect(r.format("fasta")).toBe(">id1 desc1\nATGAAATAGCCC\n");
    expect(r.format("genbank").split("\n")[1]).toBe("DEFINITION  desc1.");
    // The README's count of what importing seqio registers.
    expect(SeqRecord.writers.size).toBe(26);
  });
});

describe("README: comparison refuses", () => {
  it("throws NotImplementedError for every comparison", () => {
    const r = rec();
    const message = "SeqRecord comparison is deliberately not implemented."
      + " Explicitly compare the attributes of interest.";
    expect(() => r.equals(r)).toThrowError(message);
    expect(() => r.ne(r)).toThrowError(message);
    expect(() => r.lt(r)).toThrowError(message);
    expect(() => r.le(r)).toThrowError(message);
    expect(() => r.gt(r)).toThrowError(message);
    expect(() => r.ge(r)).toThrowError(message);
  });
});

describe("README: things to know", () => {
  it("shares an annotations Map rather than copying it", () => {
    const shared = new Map<string, unknown>([["organism", "X y"]]);
    const r = new SeqRecord(new Seq("ACGT"), "i", "n", "d", null, [], shared);
    shared.set("organism", "changed");
    expect(r.annotations.get("organism")).toBe("changed");
  });

  it("raises when a flipped feature has an unknown start", () => {
    // An unknown *end* becomes an unknown start once flipped, and Python cannot order None against an
    // int -- so this raises while a record whose feature has an unknown *start* reverse-complements
    // fine. The asymmetry is Biopython's, and recorded in the golden cases.
    const unknownEnd = new SeqFeature(
      new SimpleLocation(new ExactPosition(2), new UnknownPosition(), 1), "weird");
    const gene = new SeqFeature(new SimpleLocation(0, 4, 1), "gene");
    const bad = new SeqRecord(new Seq("ACGTACGT"), "r", "n", "d", null, [gene, unknownEnd]);
    expect(() => bad.reverseComplement())
      .toThrowError("'<' not supported between instances of 'NoneType' and 'int'");

    const unknownStart = new SeqFeature(
      new SimpleLocation(new UnknownPosition(), new ExactPosition(5), 1), "weird");
    const fine = new SeqRecord(new Seq("ACGTACGT"), "r", "n", "d", null, [gene, unknownStart]);
    expect(fine.reverseComplement().features.length).toBe(2);
  });
});
