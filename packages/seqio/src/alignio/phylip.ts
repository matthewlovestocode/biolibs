/** PHYLIP alignment files: interleaved (`phylip`), `phylip-sequential` and `phylip-relaxed`. */

import { ValueError, pyInt, pyRepr, pyRstrip, pySplit, pyStrip } from "@biolibs/core";
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { AlignmentIterator, SequentialAlignmentWriter } from "./interfaces.js";
import { splitFirst, unpackTwo } from "../insdc/text.js";

const PHYLIP_ID_WIDTH = 10;
const NO_DOTS = "PHYLIP format no longer allows dots in sequence";
/** ASCII whitespace as in Python's `string.whitespace`. */
const WHITESPACE = " \t\n\r\x0b\x0c";

/**
 * Make a name safe for PHYLIP: strip it, drop `[](),`, turn `:;` into `|`, and cut it to `width` characters.
 *
 * @example
 * ```ts
 * sanitizeName("a:b(c)", 10);   // "a|bc"
 * ```
 */
export function sanitizeName(name: string, width: number | null = null): string {
  name = pyStrip(name);
  for (const ch of "[](),") name = name.replaceAll(ch, "");
  for (const ch of ":;") name = name.replaceAll(ch, "|");
  if (width !== null) name = name.slice(0, width);
  return name;
}

/** Python's `'%i %s' % (...)`-style check shared by the writers: at least one sequence, equal non-zero lengths. */
function checkAlignment(alignment: MultipleSeqAlignment): number {
  if (alignment.length === 0) throw new ValueError("Must have at least one sequence");
  const length = alignment.getAlignmentLength();
  for (const record of alignment) if (length !== record.seq!.length) throw new ValueError("Sequences must all be the same length");
  if (length <= 0) throw new ValueError("Non-empty sequences are required");
  return length;
}

/** Python `'text'.ljust(width)`. */
const ljust = (s: string, width: number): string => s.padEnd(width, " ");

/** Names for the records, sanitized and checked for duplicates. */
function uniqueNames(alignment: MultipleSeqAlignment, idWidth: number): string[] {
  const names: string[] = [];
  for (const record of alignment) {
    const name = sanitizeName(record.id as string, idWidth);
    if (names.includes(name)) throw new ValueError(`Repeated name ${pyRepr(name)} (originally ${pyRepr(record.id)}), possibly due to truncation`);
    names.push(name);
  }
  return names;
}

/** Writes interleaved PHYLIP: ten-character names, sequences in blocks of fifty letters in groups of ten. */
export class PhylipWriter extends SequentialAlignmentWriter {
  writeAlignment(alignment: MultipleSeqAlignment, idWidth = PHYLIP_ID_WIDTH): void {
    const lengthOfSeqs = checkAlignment(alignment);
    const names: string[] = [];
    const seqs: string[] = [];
    for (const record of alignment) {
      const name = sanitizeName(record.id as string, idWidth);
      if (names.includes(name)) throw new ValueError(`Repeated name ${pyRepr(name)} (originally ${pyRepr(record.id)}), possibly due to truncation`);
      names.push(name);
      const sequence = record.seq!.toString();
      if (sequence.includes(".")) throw new ValueError(NO_DOTS);
      seqs.push(sequence);
    }
    const handle = this.handle;
    handle.write(` ${alignment.length} ${lengthOfSeqs}\n`);
    let block = 0;
    for (;;) {
      names.forEach((name, k) => {
        const sequence = seqs[k]!;
        handle.write(block === 0 ? ljust(name.slice(0, idWidth), idWidth) : " ".repeat(idWidth));
        for (let chunk = 0; chunk < 5; chunk++) {
          const i = block * 50 + chunk * 10;
          handle.write(` ${sequence.slice(i, i + 10)}`);
          if (i + 10 > lengthOfSeqs) break;
        }
        handle.write("\n");
      });
      block += 1;
      if (block * 50 >= lengthOfSeqs) break;
      handle.write("\n");
    }
  }
}

/** Reads interleaved PHYLIP. */
export class PhylipIterator extends AlignmentIterator {
  /** Width of the name field. */
  protected idWidth = PHYLIP_ID_WIDTH;
  /** A header line already read while looking for the end of the previous alignment. */
  protected pendingHeader: string | null = null;

  /** Whether a line is an alignment header: two integers. */
  protected isHeader(line: string): boolean {
    const parts = pySplit(pyStrip(line));
    if (parts.length !== 2) return false;
    try {
      pyInt(parts[0]!);
      pyInt(parts[1]!);
      return true;
    } catch (e) {
      if (e instanceof ValueError) return false;
      throw e;
    }
  }

  /** Split a sequence line into name and sequence. */
  protected splitId(line: string): [string, string] {
    return [pyStrip(line.slice(0, this.idWidth)), pyStrip(line.slice(this.idWidth)).replaceAll(" ", "")];
  }

  /** Read the header and return the sequence count and length, or null at the end of input. */
  protected readHeader(): [number, number] | null {
    let line: string;
    if (this.pendingHeader === null) line = this.handle.readline();
    else {
      line = this.pendingHeader;
      this.pendingHeader = null;
    }
    if (!line) return null;
    const parts = pySplit(pyStrip(line));
    if (parts.length !== 2) throw new ValueError("First line should have two integers");
    let numberOfSeqs: number;
    let lengthOfSeqs: number;
    try {
      numberOfSeqs = pyInt(parts[0]!);
      lengthOfSeqs = pyInt(parts[1]!);
    } catch (e) {
      if (e instanceof ValueError) throw new ValueError("First line should have two integers");
      throw e;
    }
    if (this.recordsPerAlignment !== null && this.recordsPerAlignment !== numberOfSeqs) {
      throw new ValueError(`Found ${numberOfSeqs} records in this alignment, told to expect ${this.recordsPerAlignment}`);
    }
    return [numberOfSeqs, lengthOfSeqs];
  }

  /** Build the alignment from names and sequences. */
  protected build(ids: string[], seqs: string[]): MultipleSeqAlignment {
    return new MultipleSeqAlignment(ids.map((id, k) => new SeqRecord(new Seq(seqs[k]!), id, id, id)));
  }

  nextAlignment(): MultipleSeqAlignment | null {
    const handle = this.handle;
    const header = this.readHeader();
    if (header === null) return null;
    const [numberOfSeqs] = header;
    const ids: string[] = [];
    const seqs: string[][] = [];
    for (let i = 0; i < numberOfSeqs; i++) {
      const line = pyRstrip(handle.readline());
      const [sequenceId, s] = this.splitId(line);
      ids.push(sequenceId);
      if (s.includes(".")) throw new ValueError(NO_DOTS);
      seqs.push([s]);
    }
    let line = "";
    for (;;) {
      while (pyStrip(line) === "") {
        line = handle.readline();
        if (!line) break;
      }
      if (!line) break;
      if (this.isHeader(line)) {
        this.pendingHeader = line;
        break;
      }
      for (let i = 0; i < numberOfSeqs; i++) {
        const s = pyStrip(line).replaceAll(" ", "");
        if (s.includes(".")) throw new ValueError(NO_DOTS);
        seqs[i]!.push(s);
        line = handle.readline();
        if (!line && i + 1 < numberOfSeqs) throw new ValueError("End of file mid-block");
      }
      if (!line) break;
    }
    return this.build(ids, seqs.map((s) => s.join("")));
  }
}

/** Writes relaxed PHYLIP: names of any length, separated from the sequence by a space. */
export class RelaxedPhylipWriter extends PhylipWriter {
  writeAlignment(alignment: MultipleSeqAlignment): void {
    for (const record of alignment) {
      const name = pyStrip(record.id as string);
      if ([...name].some((c) => WHITESPACE.includes(c))) throw new ValueError(`Whitespace not allowed in identifier: ${name}`);
    }
    const idWidth = alignment.length === 0 ? 1 : Math.max(...[...alignment].map((s) => pyStrip(s.id as string).length)) + 1;
    super.writeAlignment(alignment, idWidth);
  }
}

/** Reads relaxed PHYLIP. */
export class RelaxedPhylipIterator extends PhylipIterator {
  protected splitId(line: string): [string, string] {
    const [seqId, sequence] = unpackTwo(splitFirst(line));
    return [seqId, pyStrip(sequence).replaceAll(" ", "")];
  }
}

/** Writes sequential PHYLIP: each record's whole sequence on one line. */
export class SequentialPhylipWriter extends SequentialAlignmentWriter {
  writeAlignment(alignment: MultipleSeqAlignment, idWidth = PHYLIP_ID_WIDTH): void {
    const lengthOfSeqs = checkAlignment(alignment);
    const names = uniqueNames(alignment, idWidth);
    const handle = this.handle;
    handle.write(` ${alignment.length} ${lengthOfSeqs}\n`);
    let k = 0;
    for (const record of alignment) {
      const sequence = record.seq!.toString();
      if (sequence.includes(".")) throw new ValueError(NO_DOTS);
      handle.write(ljust(names[k]!.slice(0, idWidth), idWidth));
      handle.write(sequence);
      handle.write("\n");
      k += 1;
    }
  }
}

/** Reads sequential PHYLIP. */
export class SequentialPhylipIterator extends PhylipIterator {
  nextAlignment(): MultipleSeqAlignment | null {
    const handle = this.handle;
    const header = this.readHeader();
    if (header === null) return null;
    const [numberOfSeqs, lengthOfSeqs] = header;
    const ids: string[] = [];
    const seqs: string[] = [];
    for (let i = 0; i < numberOfSeqs; i++) {
      const line = pyRstrip(handle.readline());
      const [sequenceId, first] = this.splitId(line);
      let s = first;
      ids.push(sequenceId);
      while (s.length < lengthOfSeqs) {
        const more = pyStrip(handle.readline());
        if (!more) break;
        s = s + pyStrip(more).replaceAll(" ", "");
        if (s.length > lengthOfSeqs) throw new ValueError(`Found a record of length ${s.length}, should be ${lengthOfSeqs}`);
      }
      if (s.includes(".")) throw new ValueError(NO_DOTS);
      seqs.push(s);
    }
    for (;;) {
      const line = handle.readline();
      if (!line) break;
      if (this.isHeader(line)) {
        this.pendingHeader = line;
        break;
      }
    }
    return this.build(ids, seqs);
  }
}

