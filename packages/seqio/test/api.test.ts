/** TypeScript-specific behaviour of SeqIO that Biopython golden data cannot express. */
import { describe, expect, it } from "vitest";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import {
  FORMAT_TO_ITERATOR, FORMAT_TO_WRITER, FastaWriter, LineStream, QualPhredWriter, SequenceIterator, SequenceWriter, StreamModeError, StringHandle,
  BytesHandle, SAXParseException, SeqXmlWriter, parse, parseSwissProt, read, readSwissProt, SwissProtParserError, registerIterator, registerWriter, toDict, write,
} from "@biolibs/seqio";

const rec = (id: string, seq: string, quals?: number[]) => new SeqRecord(new Seq(seq), id, "n", `${id} d`, null, null, null, quals ? { phred_quality: quals } : null);

describe("handles", () => {
  it("LineStream mixes readline, iteration and read like a Python text file", () => {
    const s = new LineStream("one\ntwo\nthree");
    expect(s.readline()).toBe("one\n");
    expect(s.read(2)).toBe("tw");
    expect(s.readline()).toBe("o\n");
    expect([...s]).toEqual(["three"]);
    expect(s.readline()).toBe("");
    expect(s.read()).toBe("");
  });

  it("StringHandle accumulates writes", () => {
    const h = new StringHandle();
    expect(h.write("ab")).toBe(2);
    h.write("c");
    expect(h.getvalue()).toBe("abc");
  });

  it("parse accepts an already open LineStream and continues from its position", () => {
    const stream = new LineStream(">a\nAC\n>b\nGG\n");
    const first = parse(stream, "fasta-pearson");
    expect(first.next().value!.id).toBe("a");
  });
});

describe("custom writers and readers", () => {
  it("FastaWriter and QualPhredWriter accept a custom record2title", () => {
    const out = new StringHandle();
    new FastaWriter(out, 4, (r) => `${r.id}|len=${r.length}`).writeFile([rec("x", "ACGTACGT")]);
    expect(out.getvalue()).toBe(">x|len=8\nACGT\nACGT\n");
    const q = new StringHandle();
    new QualPhredWriter(q, 60, (r) => `custom ${r.id}`).writeFile([rec("x", "ACG", [1, 2, 3])]);
    expect(q.getvalue()).toBe(">custom x\n1 2 3\n");
  });

  it("a registered writer also powers SeqRecord.format, and binary-only writers become a ValueError", () => {
    class UpperWriter extends SequenceWriter {
      get modes() { return "t"; }
      writeRecord(r: SeqRecord) { this.handle.write(r.seq!.toString().toUpperCase()); }
    }
    class BinaryOnly extends SequenceWriter {
      get modes() { return "b"; }
      writeRecord() { throw new StreamModeError("File must be opened in binary mode."); }
    }
    registerWriter("shout", UpperWriter as never);
    registerWriter("binonly", BinaryOnly as never);
    try {
      expect(rec("a", "acgt").format("shout")).toBe("ACGT");
      expect(() => rec("a", "acgt").format("binonly")).toThrow("Binary format binonly cannot be used with SeqRecord format method");
      const out = new StringHandle();
      expect(write([rec("a", "ac"), rec("b", "gt")], out, "shout")).toBe(2);
      expect(out.getvalue()).toBe("ACGT");
    } finally {
      FORMAT_TO_WRITER.delete("shout");
      FORMAT_TO_WRITER.delete("binonly");
      SeqRecord.writers.delete("shout");
      SeqRecord.writers.delete("binonly");
    }
  });

  it("a registered reader is available to parse and read", () => {
    class LinesIterator extends SequenceIterator {
      get modes() { return "t"; }
      constructor(source: unknown) { super(source, null, "Lines"); }
      protected nextRecord() {
        const line = this.stream!.readline().trim();
        return line ? new SeqRecord(new Seq(line), line.slice(0, 3)) : null;
      }
    }
    registerIterator("lines", LinesIterator);
    try {
      expect([...parse("ACGT\nTTTT\n", "lines")].map((r) => r.id)).toEqual(["ACG", "TTT"]);
      expect(() => read("ACGT\nTTTT\n", "lines")).toThrow("More than one record");
      expect(read("ACGT\n", "lines").seq!.toString()).toBe("ACGT");
    } finally {
      FORMAT_TO_ITERATOR.delete("lines");
    }
  });
});

describe("iterator lifecycle and helpers", () => {
  it("close() releases the stream and further reading finds nothing to read from", () => {
    const it = parse(">a\nAC\n", "fasta-pearson");
    it.close();
    expect(() => it.next()).toThrow();
  });

  it("toDict supports a key function and reports duplicates", () => {
    const records = [rec("a", "AC"), rec("b", "GT")];
    expect([...toDict(records, (r) => r.id!.toUpperCase()).keys()]).toEqual(["A", "B"]);
    expect(() => toDict([...records, rec("a", "TT")])).toThrow("Duplicate key 'a'");
  });

  it("write accepts a single record and anything with write(text)", () => {
    const chunks: string[] = [];
    expect(write(rec("a", "ACGT"), { write: (t: string) => chunks.push(t) }, "fasta")).toBe(1);
    expect(chunks.join("")).toBe(">a d\nACGT\n"); // the description starts with the id, so it is the whole header
  });
});

describe("SwissProt parser", () => {
  const entry = "ID   A_B Reviewed; 4 AA.\nAC   P1;\nOS   Some one.\nSQ   SEQUENCE   4 AA;  1 MW;  X CRC64;\n     MKVL\n//\n";

  it("parseSwissProt yields entries and readSwissProt returns exactly one", () => {
    const [rec] = [...parseSwissProt(entry)];
    expect(rec!.accessions).toEqual(["P1"]);
    expect(rec!.sequence).toBe("MKVL");
    expect(readSwissProt(entry).entryName).toBe("A_B");
    expect(() => readSwissProt(entry + entry)).toThrow("More than one SwissProt record found");
    expect(() => readSwissProt("")).toThrow("No SwissProt record found");
  });

  it("reports SwissProtParserError with the offending line", () => {
    try {
      [...parseSwissProt("XX\n")];
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SwissProtParserError);
      expect((e as SwissProtParserError).line).toBe("XX\n");
    }
  });
});

describe("binary formats", () => {
  const xml = new TextEncoder().encode('<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq></entry></seqXML>');

  it("seqxml reads bytes and refuses text", () => {
    expect([...parse(xml, "seqxml")].map((r) => r.id)).toEqual(["a"]);
    expect(() => parse('<seqXML seqXMLversion="0.4"/>', "seqxml")).toThrow(StreamModeError);
    expect(() => parse(xml, "fasta")).toThrow(StreamModeError);
  });

  it("seqxml writes to a byte target and refuses a text target", () => {
    const out = new BytesHandle();
    write([...parse(xml, "seqxml")], out, "seqxml");
    expect(new TextDecoder().decode(out.getvalue())).toContain('<DNAseq>ACGT</DNAseq>');
    expect(() => write([...parse(xml, "seqxml")], new StringHandle(), "seqxml")).toThrow("File must be opened in binary mode.");
    expect(() => write([...parse(xml, "seqxml")], new BytesHandle(), "fasta")).toThrow("File must be opened in text mode.");
    void SeqXmlWriter;
  });

  it("malformed XML raises SAXParseException", () => {
    expect(() => [...parse(new TextEncoder().encode('<seqXML seqXMLversion="0.4"><entry id="a"></seqXML>'), "seqxml")]).toThrow(SAXParseException);
  });
});

import { NibIterator, StructError, pack, unpack } from "@biolibs/seqio";

describe("binary helpers", () => {
  it("struct pack and unpack round-trip", () => {
    expect(unpack(">BHI", pack(">BHI", 1, 513, 70000))).toEqual([1, 513, 70000]);
    expect(() => pack(">B", 300)).toThrow("'B' format requires 0 <= number <= 255");
    expect(() => unpack(">I", Uint8Array.of(1, 2))).toThrow(StructError);
  });
  it("nib round trip", () => {
    const out = new BytesHandle();
    write(new SeqRecord(new Seq("ACGTNacg")), out, "nib");
    const [rec] = [...new NibIterator(out.getvalue())];
    expect(rec!.seq!.toString()).toBe("ACGTNacg");
  });
  it("refuses text for a binary format", () => {
    expect(() => parse("abc", "nib")).toThrow(StreamModeError);
  });
});
