/** Mauve xmfa files (Biopython's `Bio.Align.mauve`). */

import { AssertionError, IndexError, ValueError, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter, type WriteTarget } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { decode, encode, strip } from "./rows.js";
import { MissingAttribute } from "./tabular-errors.js";
import type { TextStream } from "./stream.js";

const SUFFIXES = ["File", "Entry", "Format"];

/** `s.split(None, maxsplit)` words; the last one keeps the rest of the line. */
function splitMax(s: string, maxsplit: number): string[] {
  const parts: string[] = [];
  let rest = s.replace(/^\s+/, "");
  while (rest.length > 0 && parts.length < maxsplit) {
    const m = /^(\S+)(\s+|$)/.exec(rest)!;
    parts.push(m[1]!);
    rest = rest.slice(m[0].length);
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/** Tuple unpacking of `parts` into `n` names with Python's `ValueError`s. */
function unpack(parts: string[], n: number): string[] {
  if (parts.length < n) throw new ValueError(`not enough values to unpack (expected ${n}, got ${parts.length})`);
  if (parts.length > n) throw new ValueError(`too many values to unpack (expected ${n}, got ${parts.length})`);
  return parts;
}

/** A parsed `>` line: identifier, zero-based start, end, strand and comments. */
type Description = [string, number, number, string, string];

/** Reads Mauve xmfa files; `metadata` holds the header and `identifiers` names the sequences. */
export class MauveIterator extends AlignmentIterator {
  static override fmt: string | null = "Mauve";
  /** Biopython's `self._line`: the first line after the header. */
  private declare pending: string | undefined;
  /** The sequence identifiers (the entry numbers of one file, or the file names). */
  declare identifiers: string[];

  protected override readHeader(stream: TextStream): void {
    const metadata: Record<string, string> = {};
    const info: Record<string, (string | number)[]> = { File: [], Entry: [], Format: [] };
    let broke = false;
    for (const line of stream) {
      if (!line.startsWith("#")) { this.pending = strip(line); broke = true; break; }
      const [key, rawValue] = unpack(line.slice(1).split(/\s+/).filter(Boolean), 2) as [string, string];
      if (key.startsWith("Sequence")) {
        const suffix = SUFFIXES.find((s) => key.endsWith(s));
        if (suffix === undefined) throw new ValueError(`Unexpected keyword '${key}'`);
        const value: string | number = suffix === "Entry" ? pyInt(rawValue) - 1 : rawValue;
        const seqNum = pyInt(key.slice("Sequence".length, key.length - suffix.length));
        info[suffix]!.push(value);
        if (seqNum !== info[suffix]!.length) throw new AssertionError("");
      } else metadata[key] = strip(rawValue);
    }
    if (!broke && Object.keys(metadata).length === 0) throw new ValueError("Empty file.");
    const files = info["File"] as string[];
    if (new Set(files).size === 1) {
      metadata["File"] = files[0]!;
      this.identifiers = info["Entry"]!.map(String);
    } else {
      if (new Set(files).size !== files.length) throw new AssertionError("");
      this.identifiers = files;
    }
    (this as { metadata?: Record<string, unknown> }).metadata = metadata;
  }

  private parseDescription(line: string): Description {
    if (!line.startsWith(">")) throw new AssertionError("");
    const [locus, strand, comments] = unpack(splitMax(line.slice(1), 2), 3) as [string, string, string];
    const [seqNumText, startEnd] = unpack(locus.split(":"), 2) as [string, string];
    const seqNum = pyInt(seqNumText) - 1;
    const index = seqNum < 0 ? this.identifiers.length + seqNum : seqNum;
    if (index < 0 || index >= this.identifiers.length) throw new IndexError("list index out of range");
    const identifier = this.identifiers[index]!;
    if (!"+-".includes(strand)) throw new AssertionError("");
    const [startText, endText] = unpack(startEnd.split("-"), 2) as [string, string];
    let start = pyInt(startText);
    const end = pyInt(endText);
    if (start === 0) { if (end !== 0) throw new AssertionError(""); } else start -= 1;
    return [identifier, start, end, strand, comments];
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    const descriptions: Description[] = [];
    const seqs: string[] = [];
    if (this.pending !== undefined) {
      const line = this.pending;
      this.pending = undefined;
      descriptions.push(this.parseDescription(line));
      seqs.push("");
    }
    for (const raw of stream) {
      const line = strip(raw);
      if (line.startsWith("=")) {
        const parsed = Alignment.parsePrintedAlignment(seqs.map(encode));
        const coordinates = parsed.coordinates;
        const records: SeqRecord[] = [];
        descriptions.forEach(([identifier, start, end, strand, comments], index) => {
          const bytes = parsed.sequences[index]!;
          if (bytes.length !== end - start) throw new AssertionError("");
          if (strand === "-") coordinates[index] = coordinates[index]!.map((c) => bytes.length - c);
          else if (strand !== "+") throw new ValueError(`Unexpected strand '${strand}'`);
          coordinates[index] = coordinates[index]!.map((c) => c + start);
          let seq: Seq;
          if (start === 0) {
            seq = new Seq(decode(bytes));
            if (strand === "-") seq = seq.reverseComplement() as Seq;
          } else if (strand === "+") seq = new Seq(new Map([[start, bytes]]), end);
          else seq = (new Seq(new Map([[0, bytes]]), end)).reverseComplement() as Seq;
          records.push(new SeqRecord(seq, identifier, undefined, comments));
        });
        return new Alignment(records, coordinates);
      } else if (line.startsWith(">")) {
        descriptions.push(this.parseDescription(line));
        seqs.push("");
      } else {
        if (seqs.length === 0) throw new IndexError("list index out of range");
        seqs[seqs.length - 1] += line;
      }
    }
    return null;
  }
}

/** Writes alignments as Mauve xmfa; the header needs `metadata` and `identifiers`, from the arguments or from the parser being written. */
export class MauveWriter extends AlignmentWriter {
  static override fmt: string | null = "Mauve";

  /**
   * @param target - Where to write.
   * @param metadata - Header values (`FormatVersion`, `File`, `BackboneFile`); taken from the alignments when null.
   * @param identifiers - The sequence identifiers; taken from the alignments when null.
   */
  constructor(target: WriteTarget | null = null, private metadata: Record<string, string> | null = null, private identifiers: string[] | null = null) { super(target); }

  override writeHeader(stream: WriteTarget): void {
    const metadata = this.metadata;
    if (metadata === null) throw new MissingAttribute();
    stream.write(`#FormatVersion ${metadata["FormatVersion"] ?? "Mauve1"}\n`);
    const identifiers = this.identifiers as string[];
    const filename = metadata["File"];
    if (filename === undefined) {
      identifiers.forEach((name, index) => {
        stream.write(`#Sequence${index + 1}File\t${name}\n`);
        stream.write(`#Sequence${index + 1}Format\tFastA\n`);
      });
    } else {
      identifiers.forEach((identifier, index) => {
        if (index !== pyInt(identifier)) throw new AssertionError("");
        const number = index + 1;
        stream.write(`#Sequence${number}File\t${filename}\n`);
        stream.write(`#Sequence${number}Entry\t${number}\n`);
        stream.write(`#Sequence${number}Format\tFastA\n`);
      });
    }
    const backbone = metadata["BackboneFile"];
    if (backbone !== undefined) stream.write(`#BackboneFile\t${backbone}\n`);
  }

  override writeFile(stream: WriteTarget, alignments: Iterable<Alignment>): number {
    if (this.metadata === null) {
      const m = (alignments as { metadata?: Record<string, string> }).metadata;
      if (m === undefined) throw new ValueError("alignments do not have an attribute `metadata`");
      this.metadata = m;
    }
    if (this.identifiers === null) {
      const ids = (alignments as { identifiers?: string[] }).identifiers;
      if (ids === undefined) throw new ValueError("alignments do not have an attribute `identifiers`");
      this.identifiers = ids;
    }
    return super.writeFile(stream, alignments);
  }

  formatAlignment(alignment: Alignment): string {
    const metadata = this.metadata;
    const [n, m] = alignment.shape;
    if (n === 0) throw new ValueError("Must have at least one sequence");
    if (m === 0) throw new ValueError("Non-empty sequences are required");
    if (metadata === null) throw new MissingAttribute();
    const filename = metadata["File"];
    const lines: string[] = [];
    const coordinates = alignment.coordinates!;
    for (let i = 0; i < n; i++) {
      const record = alignment.sequences[i];
      if (!(record instanceof SeqRecord)) throw new MissingAttribute();
      const identifier = record.id as string;
      let start = coordinates[i]![0]!, end = coordinates[i]![coordinates[i]!.length - 1]!;
      let strand = "+";
      if (start > end) { strand = "-"; [start, end] = [end, start]; }
      if (start === end) { if (start !== 0) throw new AssertionError(""); } else start += 1;
      const sequence = alignment.get(i) as string;
      if (filename === undefined) {
        const at = (this.identifiers as string[]).indexOf(identifier);
        if (at < 0) throw new ValueError("list.index(x): x not in list");
        lines.push(`> ${at + 1}:${start}-${end} ${strand} ${identifier}\n`);
      } else lines.push(`> ${pyInt(identifier) + 1}:${start}-${end} ${strand} ${filename}\n`);
      lines.push(`${sequence}\n`);
    }
    lines.push("=\n");
    return lines.join("");
  }
}

registerFormat("mauve", { AlignmentIterator: MauveIterator, AlignmentWriter: MauveWriter as never });
