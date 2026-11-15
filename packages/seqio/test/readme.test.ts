/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import {
  BytesHandle, FORMAT_TO_ITERATOR, FORMAT_TO_WRITER, LineStream, StringHandle, convert, index, parse,
  read, toDict, write,
} from "@biolibs/seqio";
import { TwoBitWindow, blobSource, countingSource } from "@biolibs/seqio";
import { describe, expect, it } from "vitest";

const FASTA = ">a desc one\nACGTACGT\n>b\nGGTT\n";
const FASTQ = "@r1\nACGT\n+\nIIII\n@r2\nGGTT\n+\n!!!!\n";

/** The GenBank record the README's parse example reads. */
const GENBANK = `LOCUS       SCU49845     5028 bp    DNA             PLN       21-JUN-1999
DEFINITION  Saccharomyces cerevisiae TCP1-beta gene.
ACCESSION   U49845
VERSION     U49845.1  GI:1293613
KEYWORDS    .
SOURCE      Saccharomyces cerevisiae (baker's yeast).
FEATURES             Location/Qualifiers
     source          1..20
                     /organism="Saccharomyces cerevisiae"
     CDS             1..9
                     /gene="TCP1"
ORIGIN
        1 atgaaatagc ccgg
//
`;

describe("README: parse", () => {
  it("iterates the records", () => {
    expect([...parse(FASTA, "fasta")].map((r) => [r.id, r.description, r.seq!.toString()]))
      .toEqual([["a", "a desc one", "ACGTACGT"], ["b", "b", "GGTT"]]);
  });

  it("decodes FASTQ qualities into the named scale", () => {
    const [first, second] = [...parse(FASTQ, "fastq")];
    expect(first!.letterAnnotations.get("phred_quality")).toEqual([40, 40, 40, 40]);
    expect(second!.letterAnnotations.get("phred_quality")).toEqual([0, 0, 0, 0]);
  });

  it("reads a GenBank record with its annotations and features", () => {
    const rec = read(GENBANK, "genbank");
    expect([rec.id, rec.name]).toEqual(["U49845.1", "SCU49845"]);
    expect(rec.description).toBe("Saccharomyces cerevisiae TCP1-beta gene");
    expect(rec.annotations.get("molecule_type")).toBe("DNA");
    expect(rec.annotations.get("source")).toBe("Saccharomyces cerevisiae (baker's yeast)");
    expect(rec.features.map((f) => [f.type, String(f.location)]))
      .toEqual([["source", "[0:20](+)"], ["CDS", "[0:9](+)"]]);
    expect(rec.features[1]!.qualifiers.get("gene")).toEqual(["TCP1"]);
  });

  it("refuses an unknown, mis-cased or mis-moded format", () => {
    expect(() => [...parse(FASTA, "nope")]).toThrowError("Unknown format 'nope'");
    expect(() => [...parse(FASTA, "FASTA")])
      .toThrowError("Format string 'FASTA' should be lower case");
    expect(() => [...parse("x", "sff")]).toThrowError("SFF files must be opened in binary mode.");
  });
});

describe("README: read", () => {
  it("insists on exactly one record", () => {
    expect(read(">only\nACGT\n", "fasta").id).toBe("only");
    expect(() => read(">a\nAC\n>b\nGG\n", "fasta"))
      .toThrowError("More than one record found in handle");
    expect(() => read("", "fasta")).toThrowError("No records found in handle");
  });
});

describe("README: write", () => {
  it("writes records and returns the count", () => {
    const out = new StringHandle();
    const count = write([...parse(FASTA, "fasta")], out, "fasta");
    expect(count).toBe(2);
    expect(out.getvalue()).toBe(">a desc one\nACGTACGT\n>b\nGGTT\n");
  });

  it("refuses a read-only format and catches swapped arguments", () => {
    const records = [...parse(FASTA, "fasta")];
    expect(() => write(records, new StringHandle(), "ace"))
      .toThrowError("Reading format 'ace' is supported, but not writing");
    expect(() => write(new StringHandle() as never, records as never, "fasta"))
      .toThrowError("Check arguments, handle should NOT be a list");
  });

  it("round-trips a binary format through a byte handle", () => {
    const out = new BytesHandle();
    write([new SeqRecord(new Seq("ACGTACGT"), "n")], out, "nib");
    expect(out.getvalue().length).toBe(12);
    expect(read(out.getvalue(), "nib").seq!.toString()).toBe("ACGTACGT");
  });
});

describe("README: convert", () => {
  it("converts between formats and re-scales qualities", () => {
    const fasta = new StringHandle();
    expect(convert(FASTQ, "fastq", fasta, "fasta")).toBe(2);
    expect(fasta.getvalue()).toBe(">r1\nACGT\n>r2\nGGTT\n");

    const illumina = new StringHandle();
    convert(FASTQ, "fastq", illumina, "fastq-illumina");
    expect(illumina.getvalue()).toBe("@r1\nACGT\n+\nhhhh\n@r2\nGGTT\n+\n@@@@\n");
  });
});

describe("README: toDict", () => {
  it("keys the records and refuses a duplicate", () => {
    const byId = toDict(parse(FASTA, "fasta"));
    expect([...byId.keys()]).toEqual(["a", "b"]);
    expect(byId.get("b")!.seq!.toString()).toBe("GGTT");
    expect(() => toDict(parse(">a\nAC\n>a\nGG\n", "fasta"))).toThrowError("Duplicate key 'a'");
  });
});

describe("README: index", () => {
  it("looks a record up without holding them all", () => {
    const records = index(FASTA, "fasta");
    expect([...records.keys()]).toEqual(["a", "b"]);
    expect(records.size).toBe(2);
    expect(records.get("b")!.seq!.toString()).toBe("GGTT");
    expect(new TextDecoder().decode(records.getRaw("b"))).toBe(">b\nGGTT\n");

    const upper = index(">a desc\nAC\n>b x\nGG\n", "fasta",
                        { keyFunction: (k) => k.toUpperCase() });
    expect([...upper.keys()]).toEqual(["A", "B"]);
  });

  it("refuses an interleaved format", () => {
    expect(() => index("CLUSTAL W\n\na ACGT\n", "clustal"))
      .toThrowError("Unsupported format 'clustal'");
  });
});

describe("README: LineStream and the handles", () => {
  it("shares one position between readline and iteration", () => {
    const s = new LineStream(">a\nACGT\n");
    expect(s.readline()).toBe(">a\n");
    expect([...s]).toEqual(["ACGT\n"]);
  });
});

describe("README: the format registries", () => {
  it("counts what is registered", () => {
    expect(FORMAT_TO_ITERATOR.size).toBe(49);
    expect(FORMAT_TO_WRITER.size).toBe(26);
  });

  it("agrees with the README's read-only list", () => {
    for (const f of ["twobit", "gck", "snapgene", "abi", "uniprot-xml", "ace", "swiss"]) {
      expect(FORMAT_TO_ITERATOR.has(f), f).toBe(true);
      expect(FORMAT_TO_WRITER.has(f), f).toBe(false);
    }
    for (const f of ["xdna", "nib", "sff", "seqxml"]) {
      expect(FORMAT_TO_WRITER.has(f), f).toBe(true);
    }
  });
});

describe("README: things to know", () => {
  it("raises at the call for a bad opening, and from the iterator for a bad record", () => {
    // Biopython raises in both places too, for the same reason: the reader reads the header in its
    // constructor. The README says so rather than claiming a laziness the library does not have.
    expect(() => parse("not fasta at all\n", "fasta"))
      .toThrowError(/comments at the beginning of the file/);

    const later = parse("@a\nACGT\n+\nIIII\n@b\nACGT\n+\nII\n", "fastq");
    expect(() => [...later])
      .toThrowError("Lengths of sequence and quality values differs for b (4 and 2).");
  });

  it("gives qual records a defined length and undefined content", () => {
    const [r] = [...parse(">a\n40 40 30\n", "qual")];
    expect(r!.letterAnnotations.get("phred_quality")).toEqual([40, 40, 30]);
    expect(r!.seq!.length).toBe(3);
    expect(r!.seq!.defined).toBe(false);
    expect(() => r!.seq!.toString()).toThrowError("Sequence content is undefined");
  });

  it("refuses a wrapped sequence in fasta-2line", () => {
    expect(() => [...parse(">a\nAC\nGT\n", "fasta-2line")])
      .toThrowError(/Perhaps this file is using FASTA line wrapping\?/);
  });

  it("reads the alignment formats as one record per row", () => {
    expect([...parse("# STOCKHOLM 1.0\na ACGT\nb AC-T\n//\n", "stockholm")]
      .map((r) => [r.id, r.seq!.toString()])).toEqual([["a", "ACGT"], ["b", "AC-T"]]);
    expect([...parse("CLUSTAL W (1.81) multiple sequence alignment\n\na    ACGT\nb    AC-T\n",
                     "clustal")].map((r) => [r.id, r.seq!.toString()]))
      .toEqual([["a", "ACGT"], ["b", "AC-T"]]);
  });
});

describe("README: reading part of a large file", () => {
  /** The file the README describes: chrA is a million bases, chrB ten with an N block and a masked block. @returns Its bytes. */
  function twoBit(): Uint8Array {
    const codes: Record<string, number> = { T: 0, C: 1, A: 2, G: 3 };
    const entries = [
      { name: "chrA", dna: "ACGT".repeat(250_000), n: [] as number[][], mask: [] as number[][] },
      { name: "chrB", dna: "ACGTACGTAC", n: [[4, 2]], mask: [[6, 4]] },
    ];
    const words = (values: number[]) => values.flatMap((v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
    const sizes = entries.map((e) => 4 * (4 + 2 * e.n.length + 2 * e.mask.length) + Math.ceil(e.dna.length / 4));
    let offset = 16 + entries.reduce((sum, e) => sum + 5 + e.name.length, 0);
    const head = words([0x1a412743, 0, entries.length, 0]);
    entries.forEach((e, i) => {
      head.push(e.name.length, ...[...e.name].map((c) => c.charCodeAt(0)), ...words([offset]));
      offset += sizes[i]!;
    });
    const out = new Uint8Array(offset);
    out.set(head, 0);
    let at = head.length;
    for (const e of entries) {
      const header = words([e.dna.length, e.n.length, ...e.n.map((b) => b[0]!), ...e.n.map((b) => b[1]!),
        e.mask.length, ...e.mask.map((b) => b[0]!), ...e.mask.map((b) => b[1]!), 0]);
      out.set(header, at);
      at += header.length;
      for (let i = 0; i < e.dna.length; i++) out[at + (i >> 2)]! |= codes[e.dna[i]!]! << (6 - 2 * (i % 4));
      at += Math.ceil(e.dna.length / 4);
    }
    return out;
  }

  it("reads windows of a twoBit file, and counts what it took", async () => {
    const file = new Blob([twoBit()]);
    expect(file.size).toBe(250085);
    const source = countingSource(blobSource(file));
    const genome = await TwoBitWindow.open(source);
    expect(genome.names).toEqual(["chrA", "chrB"]);
    expect(await genome.lengthOf("chrA")).toBe(1000000);
    expect(await genome.fetch("chrA", 500_000, 500_012)).toBe("ACGTACGTACGT");
    expect(await genome.fetch("chrB", 0, 10)).toBe("ACGTNNgtac");
    expect(await genome.blocksOf("chrB")).toEqual({ nBlocks: [[4, 6]], maskBlocks: [[6, 10]] });
    expect(source.bytesRead).toBe(4150);
  });
});
