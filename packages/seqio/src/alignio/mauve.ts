/** Mauve XMFA alignment files (`mauve`). */

import { AssertionError, ValueError, pyInt, pyRepr, pyStr, pyStrip } from "@biolibs/core";
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { AlignmentIterator, SequentialAlignmentWriter } from "./interfaces.js";

/** Header written by Biopython, which carries the real identifier after a `#`. */
const HEADER_BIOPYTHON = /^> (?<id>\d+):(?<start>\d+)-(?<end>\d+) (?<strand>[+-]) (?<name>[^#]*) # (?<realname>.*)/;
/** Plain Mauve header. */
const HEADER = /^> (?<id>\d+):(?<start>\d+)-(?<end>\d+) (?<strand>[+-]) (?<name>.*)/;

/** Python's `value + 1` for an annotation. */
function plusOne(value: unknown): number {
  if (typeof value === "number") return value + 1;
  if (typeof value === "string") throw new TypeError('can only concatenate str (not "int") to str');
  throw new TypeError(`unsupported operand type(s) for +: '${typeof value}' and 'int'`);
}

/** Writes Mauve XMFA: a header with one entry line per sequence, then the aligned blocks separated by `=` lines. */
export class MauveWriter extends SequentialAlignmentWriter {
  private wroteHeader = false;
  private wroteFirst = false;
  private lengthOfSequences = 0;

  writeAlignment(alignment: MultipleSeqAlignment): void {
    const count = alignment.length;
    this.lengthOfSequences = alignment.getAlignmentLength();
    if (count === 0) throw new ValueError("Must have at least one sequence");
    if (this.lengthOfSequences === 0) throw new ValueError("Non-empty sequences are required");
    if (!this.wroteHeader) {
      this.wroteHeader = true;
      this.handle.write("#FormatVersion Mauve1\n");
      for (let i = 1; i <= count; i++) this.handle.write(`#Sequence${i}Entry\t${i}\n`);
    }
    let idx = 0;
    for (const record of alignment) {
      this.writeRecord(record, idx);
      idx += 1;
    }
    this.handle.write("=\n");
  }

  /** Build the `> id:start-end strand file # name` line. */
  private idLine(seqName: string, start: unknown, end: unknown, strand: string, record: SeqRecord): string {
    return `> ${seqName}:${pyStr(start)}-${pyStr(end)} ${strand} ${record.name + ".fa"} # ${pyStr(record.id)}`;
  }

  private writeRecord(record: SeqRecord, recordIdx = 0): void {
    if (this.lengthOfSequences !== record.seq!.length) throw new ValueError("Sequences must all be the same length");
    let seqName: string;
    try {
      seqName = String(pyInt(record.name));
    } catch (e) {
      if (!(e instanceof ValueError)) throw e;
      seqName = String(recordIdx + 1);
    }
    const a = record.annotations;
    if (a.has("start") && a.has("end")) {
      const start = a.get("start");
      const suffix0 = `/${pyStr(start)}-${pyStr(a.get("end"))}`;
      const suffix1 = `/${pyStr(plusOne(start))}-${pyStr(a.get("end"))}`;
      if (seqName.slice(-suffix0.length) === suffix0) seqName = seqName.slice(0, -suffix0.length);
      if (seqName.slice(-suffix1.length) === suffix1) seqName = seqName.slice(0, -suffix1.length);
    }
    let idLine: string;
    let lackingAnnotations: boolean;
    if (a.has("start") && a.has("end") && a.has("strand")) {
      idLine = this.idLine(seqName, plusOne(a.get("start")), a.get("end"), a.get("strand") === 1 ? "+" : "-", record);
      lackingAnnotations = false;
    } else {
      idLine = this.idLine(seqName, 0, 0, "+", record);
      lackingAnnotations = true;
    }
    if ((idLine.includes(":0-0 ") || idLine.includes(":1-0 ")) && !lackingAnnotations) {
      if (!this.wroteFirst) {
        this.wroteFirst = true;
        idLine = this.idLine(seqName, 0, 0, "+", record).replaceAll("\n", " ").replaceAll("\r", " ");
        this.handle.write(idLine + "\n\n");
      }
    } else {
      this.handle.write(idLine.replaceAll("\n", " ").replaceAll("\r", " ") + "\n");
      const text = record.seq!.toString();
      for (let i = 0; i < text.length; i += 80) this.handle.write(`${text.slice(i, i + 80)}\n`);
    }
  }
}

/**
 * Reads Mauve XMFA alignments. Like Biopython, the list of sequence ids seen so far is shared by every reader
 * (a class-level list), so a sequence from an earlier file shows up as an all-gap row in later ones.
 */
export class MauveIterator extends AlignmentIterator {
  /** Sequence ids seen so far, shared by all readers (Biopython's class attribute `_ids`). */
  static sharedIds: string[] = [];

  /** Forget the ids seen so far. */
  static resetSharedState(): void {
    MauveIterator.sharedIds = [];
  }

  nextAlignment(): MultipleSeqAlignment | null {
    const handle = this.handle;
    let line = handle.readline();
    if (!line) return null;
    while (line && pyStrip(line).startsWith("#")) line = handle.readline();
    const seqs = new Map<string, string>();
    const seqRegions = new Map<string, { start: number; end: number; id: string; strand: string; name: string; realname?: string }>();
    let latestId: string | null = null;
    const ids = MauveIterator.sharedIds;
    for (;;) {
      if (!line) break;
      line = pyStrip(line);
      if (line.startsWith("=")) break;
      else if (line.startsWith(">")) {
        let m = HEADER_BIOPYTHON.exec(line);
        const biopython = m !== null;
        if (!m) {
          m = HEADER.exec(line);
          if (!m) throw new ValueError(`(${pyRepr("Malformed header line: %s")}, ${pyRepr(line)})`);
        }
        const g = m.groups!;
        const parsedId = g["id"]!;
        let start = pyInt(g["start"]!);
        if (start > 0) start -= 1;
        const data = { start, end: pyInt(g["end"]!), id: g["id"]!, strand: g["strand"]!, name: g["name"]!, ...(biopython ? { realname: g["realname"]! } : {}) };
        seqRegions.set(parsedId, data);
        if (!ids.includes(parsedId)) ids.push(parsedId);
        if (!seqs.has(parsedId)) seqs.set(parsedId, "");
        latestId = parsedId;
      } else {
        if (latestId === null) throw new ValueError("Saw sequence before definition line");
        seqs.set(latestId, seqs.get(latestId)! + line);
      }
      line = handle.readline();
    }
    if (!(seqs.size <= ids.length)) throw new AssertionError();
    if (ids.length > 0 && seqs.size > 0) {
      const alignmentLength = Math.max(...[...seqs.values()].map((s) => s.length));
      const records: SeqRecord[] = [];
      for (const id of ids) {
        const seq = !seqs.has(id) || seqs.get(id)!.length === 0 ? "-".repeat(alignmentLength) : seqs.get(id)!;
        if (alignmentLength !== seq.length) throw new ValueError("Sequences have different lengths, or repeated identifier");
        const region = seqRegions.get(id);
        if (region === undefined) continue;
        let correctedId: string;
        if (region.start !== 0 || region.end !== 0) {
          const suffix = `/${region.start}-${region.end}`;
          correctedId = region.realname !== undefined ? region.realname : region.name;
          if (correctedId.split(suffix).length - 1 === 0) correctedId += suffix;
        } else {
          correctedId = region.realname !== undefined ? region.realname : region.name;
        }
        const record = new SeqRecord(new Seq(seq), correctedId, id);
        record.annotations.set("start", region.start);
        record.annotations.set("end", region.end);
        record.annotations.set("strand", region.strand === "+" ? 1 : -1);
        records.push(record);
      }
      return new MultipleSeqAlignment(records);
    }
    return null;
  }
}
