import { describe, expect, it } from "vitest";
import { parseFasta, parseFastq, parseGenBank, writeFasta, writeFastq } from "@biolibs/seqio";

describe("seqio", () => {
  it("round-trips FASTA", () => {
    const recs = parseFasta(">a first\nACGT\nAC\n>b\nGG\n");
    expect(recs).toEqual([
      { id: "a", description: "a first", sequence: "ACGTAC" },
      { id: "b", description: "b", sequence: "GG" },
    ]);
    expect(parseFasta(writeFasta(recs, 4))).toEqual(recs);
  });
  it("round-trips FASTQ", () => {
    const text = "@r1\nACGT\n+\nIIII\n";
    const recs = parseFastq(text);
    expect(recs[0]!.quality).toEqual([40, 40, 40, 40]);
    expect(writeFastq(recs)).toBe(text);
  });
  it("rejects bad FASTQ", () => expect(() => parseFastq("@r\nACG\n+\nII\n")).toThrow());
  it("parses GenBank", () => {
    const gb = `LOCUS       TEST1       12 bp    DNA     linear   SYN 01-JAN-2000
DEFINITION  Test sequence.
ACCESSION   TEST1
VERSION     TEST1.1
ORIGIN
        1 atgcatgcat gc
//
`;
    const [r] = parseGenBank(gb);
    expect(r).toMatchObject({ id: "TEST1", description: "Test sequence.", sequence: "atgcatgcatgc" });
  });
});
