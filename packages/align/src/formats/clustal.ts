/** Clustal files (Biopython's `Bio.Align.clustal`), including the consensus line as a column annotation. */

import { ValueError, pyInt } from "@biolibs/core";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter, type WriteTarget } from "./interfaces.js";
import { AssertionError, decode, encode, recordOf, rowsOf, words } from "./rows.js";
import { registerFormat } from "./registry.js";
import type { TextStream } from "./stream.js";
import { SeqRecord } from "@biolibs/seqrecord";

/** The Biopython version that the writer puts in the header of files it makes. */
const BIOPYTHON_VERSION = "1.88";

/** Writes alignments as Clustal files (blocks of 50 columns). */
export class ClustalWriter extends AlignmentWriter {
  static override fmt: string | null = "Clustal";

  override writeHeader(stream: WriteTarget, alignments: unknown): void {
    const metadata = (alignments as { metadata?: Record<string, unknown> }).metadata;
    let program: string, version: string;
    if (metadata === undefined || metadata["Program"] === undefined) { program = "Biopython"; version = BIOPYTHON_VERSION; }
    else { program = String(metadata["Program"]); version = metadata["Version"] === undefined ? "" : String(metadata["Version"]); }
    stream.write(`${program} ${version} multiple sequence alignment\n`);
    stream.write("\n");
    stream.write("\n");
  }

  formatAlignment(alignment: Alignment): string {
    const [nseqs, length] = alignment.shape;
    if (nseqs === 0) throw new ValueError("Must have at least one sequence");
    if (length === 0) throw new ValueError("Non-empty sequences are required");
    const consensus = alignment.columnAnnotations === undefined ? undefined : alignment.columnAnnotations.get("clustal_consensus");
    const gapped = rowsOf(alignment);
    const names = alignment.sequences.map((sequence, i) => {
      const name = sequence instanceof SeqRecord && sequence.id !== null ? Array.from(sequence.id).slice(0, 30).join("").replaceAll(" ", "_") : `sequence_${i}`;
      return name.padEnd(36);
    });
    const lines: string[] = [];
    let start = 0;
    while (start !== length) {
      const stop = Math.min(start + 50, length);
      names.forEach((name, k) => lines.push(`${name}${gapped[k]!.slice(start, stop)}\n`));
      if (consensus !== undefined) lines.push(" ".repeat(36) + (consensus as string).slice(start, stop) + "\n");
      lines.push("\n");
      start = stop;
    }
    lines.push("\n");
    return lines.join("");
  }
}

const KNOWN_PROGRAMS = ["CLUSTAL", "PROBCONS", "MUSCLE", "MSAPROBS", "Kalign", "Biopython"];

/** Reads Clustal files; the program and version from the first line are kept in `metadata`. */
export class ClustalIterator extends AlignmentIterator {
  static override fmt: string | null = "Clustal";

  protected override readHeader(stream: TextStream): void {
    const line = stream.readline();
    if (!line) throw new ValueError("Empty file.");
    const self = this as { metadata?: Record<string, unknown> };
    self.metadata = {};
    const ws = words(line);
    if (ws.length === 0) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
    const program = ws[0]!;
    if (!KNOWN_PROGRAMS.includes(program)) throw new ValueError(`${program} is not known to generate CLUSTAL files: ${KNOWN_PROGRAMS.join(", ")}`);
    self.metadata["Program"] = program;
    for (let word of ws) {
      if (word[0] === "(" && word[word.length - 1] === ")") word = word.slice(1, -1);
      if (word.length > 0 && /^[0-9]/.test(word[0]!)) { self.metadata["Version"] = word; break; }
    }
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    const ids: string[] = [];
    const aligned: string[] = [];
    let consensus = "";
    let index: number | null = null;
    let alignedSeq = "";
    let broke = false;
    for (const line of stream) {
      if (line.startsWith(" ")) {
        if (ids.length === 0) throw new AssertionError("");
        if (index === null) throw new AssertionError("");
        consensus = line.slice(index, index + alignedSeq.length);
        broke = true;
        break;
      } else if (line.trim()) {
        const fields = words(line);
        if (fields.length < 2 || fields.length > 3) throw new ValueError(`Could not parse line:\n${line}`);
        const seqid = fields[0]!;
        alignedSeq = fields[1]!;
        ids.push(seqid);
        aligned.push(alignedSeq);
        if (index === null) index = line.indexOf(alignedSeq, seqid.length);
        if (fields.length === 3) {
          let count: number;
          try { count = pyInt(fields[2]!); } catch { throw new ValueError(`Could not parse line, bad sequence count:\n${line}`); }
          if (alignedSeq.length - alignedSeq.split("-").length + 1 !== count) throw new ValueError(`Could not parse line, incorrect sequence count:\n${line}`);
        }
      } else if (index) { broke = true; break; }
    }
    if (!broke) return null;
    if (index === null) throw new AssertionError("");
    const length = aligned[0]!.length;
    for (const s of aligned) if (s.length !== length) throw new AssertionError("");
    if (consensus && consensus.length !== length) throw new AssertionError("");
    const n = aligned.length;
    let i = 0;
    for (const line of stream) {
      if (line.startsWith(" ")) {
        consensus += line.slice(index, index + alignedSeq.length);
      } else if (!line.trim()) continue;
      else {
        const seqid = ids[i];
        const fields = words(line);
        if (fields.length < 2 || fields.length > 3) throw new ValueError(`Could not parse line:\n${line}`);
        if (seqid !== fields[0]) throw new AssertionError("");
        alignedSeq = fields[1]!;
        aligned[i] += alignedSeq;
        if (fields.length === 3) {
          let count: number;
          try { count = pyInt(fields[2]!); } catch { throw new ValueError(`Could not parse line, bad sequence number:\n${line}`); }
          if (aligned[i]!.length - (aligned[i]!.split("-").length - 1) !== count) throw new ValueError(`Could not parse line, incorrect sequence count:\n${line}`);
        }
        i += 1;
        if (i === n) i = 0;
      }
    }
    const parsed = Alignment.parsePrintedAlignment(aligned.map(encode));
    const records = ids.map((id, k) => recordOf(decode(parsed.sequences[k]!), id, ""));
    const alignment = new Alignment(records, parsed.coordinates);
    if (consensus) {
      const columns = alignment.length;
      if (consensus.length !== columns) throw new ValueError(`Alignment has ${columns} columns, consensus length is ${consensus.length}, '${consensus}'`);
      alignment.columnAnnotations = new Map([["clustal_consensus", consensus]]);
    }
    return alignment;
  }
}

registerFormat("clustal", { AlignmentIterator: ClustalIterator, AlignmentWriter: ClustalWriter as never });
