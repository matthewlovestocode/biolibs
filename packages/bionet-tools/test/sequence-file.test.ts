/**
 * A sequence brought in from the file a lab already has.
 *
 * The files are small ones written here, so every base and every feature can be checked against
 * what went in. What matters is that a part arrives as the file had it: the same bases, a circle
 * if it was a circle, and its features where they were.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { carryFeatures, featureTone, readSequenceFile, sequenceFormat } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const BASES = "ACGTTGCAAGGCTTAACCGGTTAAGGCCTAATGCCGTAGCTAGGATCCGATCGATTACGCTAGCATCGATGGATCACAGTCTACACTGAACTGATAAATGC".repeat(3);
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A GenBank file of `BASES`, as a circle, with four features. */
function genbank(): string {
  const lines = [
    `LOCUS       pTest                   ${BASES.length} bp    DNA     circular SYN 01-JAN-2000`,
    "DEFINITION  A plasmid written for a test.", "ACCESSION   pTest", "VERSION     pTest", "KEYWORDS    .", "SOURCE      synthetic construct",
    "  ORGANISM  synthetic construct", "FEATURES             Location/Qualifiers",
    "     source          1..300", '                     /organism="synthetic construct"',
    "     promoter        11..40", '                     /label="P1"',
    "     CDS             51..200", '                     /gene="demo"', '                     /product="a protein"',
    "     CDS             complement(210..260)", '                     /product="only a product"',
    "     misc_feature    join(291..300,1..10)", '                     /note="crosses the origin"',
    "ORIGIN",
  ];
  for (let at = 0; at < BASES.length; at += 60) lines.push(`${String(at + 1).padStart(9)} ${(BASES.slice(at, at + 60).toLowerCase().match(/.{1,10}/g) ?? []).join(" ")}`);
  return [...lines, "//", ""].join("\n");
}

describe("what kind of file it is", () => {
  it("is told by its name, or by how it begins", () => {
    expect(sequenceFormat("pUC19.dna", bytes(""))).toBe("snapgene");
    expect(sequenceFormat("pUC19.GBK", bytes(""))).toBe("genbank");
    expect(sequenceFormat("reads.fna", bytes(""))).toBe("fasta");
    expect(sequenceFormat("unnamed", bytes("LOCUS       x"))).toBe("genbank");
    expect(sequenceFormat("unnamed", bytes(">x\nACGT"))).toBe("fasta");
    expect(sequenceFormat("unnamed", bytes("ID   x"))).toBe("embl");
    expect(sequenceFormat("unnamed", new Uint8Array([9, 0, 0]))).toBe("snapgene");
    expect(sequenceFormat("notes.txt", bytes("hello"))).toBeNull();
    expect(sequenceFormat("constructor", bytes("hello"))).toBeNull();
  });
});

describe("a sequence read from a file", () => {
  it("arrives from GenBank with its bases, its shape and its features where they were", () => {
    const read = readSequenceFile("pTest.gb", bytes(genbank()));
    expect(read).toMatchObject({ fileName: "pTest.gb", format: "genbank", name: "pTest", circular: true, description: "A plasmid written for a test" });
    expect(read.sequence).toBe(BASES);
    expect(read.features).toEqual([
      { type: "promoter", label: "P1", strand: 1, parts: [{ start: 10, end: 40 }] },
      { type: "CDS", label: "demo", strand: 1, parts: [{ start: 50, end: 200 }] },
      { type: "CDS", label: "only a product", strand: -1, parts: [{ start: 209, end: 260 }] },
      { type: "misc_feature", label: "crosses the origin", strand: 1, parts: [{ start: 290, end: 300 }, { start: 0, end: 10 }] },
    ]);
  });

  it("arrives from FASTA as a line with nothing marked, named by the file if the file names nothing", () => {
    const read = readSequenceFile("insert.fa", bytes(">my insert a description\nggatcacagt\nctacactg\n"));
    expect(read).toMatchObject({ format: "fasta", sequence: "GGATCACAGTCTACACTG", circular: false, features: [] });
    expect(read.name.length).toBeGreaterThan(0);
  });

  it("says in words when a file is not one it reads, or holds nothing", () => {
    expect(() => readSequenceFile("notes.txt", bytes("hello"))).toThrow(/Could not tell what kind of file/);
    expect(() => readSequenceFile("empty.fa", bytes(""))).toThrow(/holds no sequence|could not be read/);
    expect(() => readSequenceFile("broken.dna", new Uint8Array([9, 1, 2, 3]))).toThrow(/could not be read|holds no sequence/);
  });

  it("reads SnapGene's own files, where the repository has any to read", () => {
    const folder = [join(__dirname, "../../seqio/test/fixtures"), join(__dirname, "../../seqio/test/data"), join(__dirname, "../../seqio/golden")].find((one) => existsSync(one));
    const files = folder === undefined ? [] : readdirSync(folder, { recursive: true }).map(String).filter((name) => name.endsWith(".dna"));
    for (const name of files.slice(0, 3)) {
      const read = readSequenceFile(name, new Uint8Array(readFileSync(join(folder!, name))));
      expect(read.format).toBe("snapgene");
      expect(read.sequence).toMatch(/^[ACGTRYSWKMBDHVN]+$/);
      for (const feature of read.features) for (const part of feature.parts) expect(part.end).toBeLessThanOrEqual(read.sequence.length);
    }
  });
});

describe("what is marked on a stretch", () => {
  const features = readSequenceFile("pTest.gb", bytes(genbank())).features;

  it("is carried onto the stretch alone, moved to where it now is", () => {
    expect(carryFeatures(features, 40, 205)).toEqual([{ type: "CDS", label: "demo", strand: 1, parts: [{ start: 10, end: 160 }] }]);
    expect(carryFeatures(features, 40, 205, 6)[0]!.parts).toEqual([{ start: 16, end: 166 }]);      // behind a primer's six-base tail
    expect(carryFeatures(features, 0, 300)).toEqual(features);
    expect(carryFeatures(features, 262, 288)).toEqual([]);
  });

  it("keeps what is only partly inside as far as it is inside, and says so", () => {
    const part = carryFeatures(features, 100, 230);
    expect(part.map((one) => [one.label, one.parts])).toEqual([["demo (part)", [{ start: 0, end: 100 }]], ["only a product (part)", [{ start: 109, end: 130 }]]]);
    // Of something in two pieces, one piece is part of it.
    expect(carryFeatures(features, 280, 300).map((one) => one.label)).toEqual(["crosses the origin (part)"]);
  });

  it("is coloured by what it is", () => {
    expect(["CDS", "gene", "promoter", "terminator", "rep_origin", "primer_bind", "misc_feature", "anything else"].map(featureTone))
      .toEqual(["yours", "yours", "held", "attention", "theirs", "found", "good", "dim"]);
  });
});
