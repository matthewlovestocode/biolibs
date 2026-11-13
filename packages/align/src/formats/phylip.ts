/** PHYLIP files, sequential or interleaved (Biopython's `Bio.Align.phylip`). */

import { ValueError, pyInt } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter } from "./interfaces.js";
import { AssertionError, decode, encode, recordOf, rowsOf, rstrip, strip } from "./rows.js";
import { registerFormat } from "./registry.js";
import type { TextStream } from "./stream.js";

const ID_WIDTH = 10;
const sliceCp = (s: string, a: number, b?: number): string => Array.from(s).slice(a, b).join("");

/** Writes alignments as PHYLIP (names cut to 10 characters). */
export class PhylipWriter extends AlignmentWriter {
  static override fmt: string | null = "PHYLIP";

  formatAlignment(alignment: Alignment): string {
    const names = alignment.sequences.map((record) => {
      if (!(record instanceof SeqRecord) || record.id === null) return "";
      let name = strip(record.id);
      for (const ch of "[](),") name = name.replaceAll(ch, "");
      for (const ch of ":;") name = name.replaceAll(ch, "|");
      return sliceCp(name, 0, ID_WIDTH);
    });
    const [nseqs, length] = alignment.shape;
    if (nseqs === 0) throw new ValueError("Must have at least one sequence");
    if (length === 0) throw new ValueError("Non-empty sequences are required");
    const lines = [`${nseqs} ${length}\n`];
    rowsOf(alignment).forEach((sequence, i) => lines.push(sliceCp(names[i]!, 0, ID_WIDTH).padEnd(ID_WIDTH) + sequence + "\n"));
    return lines.join("");
  }
}

/** Reads one alignment from a PHYLIP file; the layout (sequential or interleaved) is detected from the line after the first block. */
export class PhylipIterator extends AlignmentIterator {
  static override fmt: string | null = "PHYLIP";
  // `declare` so that the field initialisers do not run after the base constructor has read the header.
  private declare numberOfSeqs: number | undefined;
  private declare lengthOfSeqs: number;

  protected override readHeader(stream: TextStream): void {
    const line = stream.readline();
    if (!line) throw new ValueError("Empty file.");
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 2) {
      try {
        this.numberOfSeqs = pyInt(words[0]!);
        this.lengthOfSeqs = pyInt(words[1]!);
        return;
      } catch { /* fall through to the error */ }
    }
    throw new ValueError(`Expected two integers in the first line, received '${line}'`);
  }

  private parseInterleavedFirstBlock(lines: string[], seqs: string[][], names: string[]): void {
    for (const raw of lines) {
      const line = rstrip(raw);
      names.push(strip(sliceCp(line, 0, ID_WIDTH)));
      seqs.push([strip(sliceCp(line, ID_WIDTH)).replaceAll(" ", "")]);
    }
  }

  private parseInterleavedOtherBlocks(stream: TextStream, seqs: string[][]): void {
    let i = 0;
    for (const raw of stream) {
      const line = rstrip(raw);
      if (!line) {
        if (i !== this.numberOfSeqs) throw new AssertionError("");
        i = 0;
      } else {
        const seq = line.replaceAll(" ", "");
        if (seqs[i] === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
        seqs[i]!.push(seq);
        i += 1;
      }
    }
    if (i !== 0 && i !== this.numberOfSeqs) throw new ValueError("Unexpected file format");
  }

  private parseSequential(lines: Iterable<string>, seqs: string[][], names: string[], length0: number): number {
    let length = length0;
    for (const raw of lines) {
      let seq: string;
      if (length === 0) {
        const line = rstrip(raw);
        names.push(strip(sliceCp(line, 0, ID_WIDTH)));
        seq = strip(sliceCp(line, ID_WIDTH));
        seqs.push([]);
      } else seq = strip(raw);
      seq = seq.replaceAll(" ", "");
      seqs[seqs.length - 1]!.push(seq);
      length += Array.from(seq).length;
      if (length === this.lengthOfSeqs) length = 0;
    }
    return length;
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    if (this.numberOfSeqs === undefined) return null;
    const names: string[] = [];
    const seqs: string[][] = [];
    const lines: string[] = [];
    for (let k = 0; k < this.numberOfSeqs; k++) lines.push(stream.readline());
    const line = stream.readline();
    if (rstrip(line)) {
      lines.push(line);
      const length = this.parseSequential(lines, seqs, names, 0);
      this.parseSequential(stream, seqs, names, length);
    } else {
      this.parseInterleavedFirstBlock(lines, seqs, names);
      this.parseInterleavedOtherBlocks(stream, seqs);
    }
    const joined = seqs.map((s) => s.join(""));
    if (joined.length !== this.numberOfSeqs) throw new ValueError(`Found ${joined.length} records in this alignment, told to expect ${this.numberOfSeqs}`);
    for (const seq of joined) {
      if (Array.from(seq).length !== this.lengthOfSeqs) throw new ValueError(`Expected all sequences to have length ${this.lengthOfSeqs}; found ${Array.from(seq).length}`);
      if (seq.includes(".")) throw new ValueError("PHYLIP format no longer allows dots in sequence");
    }
    const parsed = Alignment.parsePrintedAlignment(joined.map(encode));
    const records = names.map((name, i) => recordOf(decode(parsed.sequences[i]!), name, ""));
    const alignment = new Alignment(records, parsed.coordinates);
    this.numberOfSeqs = undefined;
    return alignment;
  }
}

registerFormat("phylip", { AlignmentIterator: PhylipIterator, AlignmentWriter: PhylipWriter as never });
