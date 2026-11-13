/** EMBOSS pair/srspair/simple alignment output (Biopython's `Bio.Align.emboss`); read only. */

import { IndexError, ValueError, pyFloat, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator } from "./interfaces.js";
import { AssertionError, decode, encode, rstrip, strip, words } from "./rows.js";
import { registerFormat } from "./registry.js";
import type { TextStream } from "./stream.js";

const RULE = "########################################";

/**
 * Biopython writes `raise ValueError("Unexpected line: %s") % line`, which applies `%` to the exception object
 * and so raises this `TypeError` instead of the intended `ValueError`.
 */
const unexpectedLine = (): TypeError => new TypeError("unsupported operand type(s) for %: 'ValueError' and 'str'");

/** Python `s.split(sep, 1)` unpacked into two names. @throws ValueError as Python's unpacking does. */
function splitTwo(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  if (i < 0) throw new ValueError("not enough values to unpack (expected 2, got 1)");
  return [s.slice(0, i), s.slice(i + sep.length)];
}

/** `s.split(None, 1)` unpacked into two names. */
function splitWordPair(s: string): [string, string] {
  const m = /^\s*(\S+)\s+(\S[\s\S]*)$/.exec(s);
  if (m === null) throw new ValueError(`not enough values to unpack (expected 2, got ${/\S/.test(s) ? 1 : 0})`);
  return [m[1]!, m[2]!];
}

const cp = (s: string): string[] => Array.from(s);

/** Reads EMBOSS alignment output; the header goes to `metadata`. */
export class EmbossIterator extends AlignmentIterator {
  static override fmt: string | null = "EMBOSS";

  protected override readHeader(stream: TextStream): void {
    let line = stream.readline();
    if (!line) throw new ValueError("Empty file.");
    if (rstrip(line) !== RULE) throw unexpectedLine();
    const md: Record<string, unknown> = { Align_format: "srspair" };
    (this as { metadata?: Record<string, unknown> }).metadata = md;
    let commandline: string | null = null;
    for (line of stream) {
      if (rstrip(line) === RULE) break;
      if (!line.startsWith("# ")) throw unexpectedLine();
      if (commandline !== null) {
        if (line.startsWith("#    ")) { commandline += " " + strip(line.slice(1)); continue; }
        md["Command line"] = commandline;
        commandline = null;
      }
      const [key, value] = splitTwo(line.slice(2), ":");
      if (key === "Program" || key === "Rundate" || key === "Report_file" || key === "Align_format") md[key] = strip(value);
      else if (key === "Commandline") commandline = strip(value);
    }
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    const md = (this as { metadata?: Record<string, unknown> }).metadata!;
    let numberOfSequences: number | null = null;
    const annotations = new Map<string, unknown>();
    const identifiers: string[] = [];
    let ncols: number | null = null;
    let started = false;
    for (const raw of stream) {
      const line = raw.replace(/[\r\n]+$/, "");
      if (!line) continue;
      if (line.startsWith("#---------------------------------------")) continue;
      if (line.startsWith("#=======================================")) { started = true; break; }
      throw new ValueError(`Unexpected line: ${line}`);
    }
    if (!started) return null;
    let ended = false;
    for (const raw of stream) {
      const line = raw.replace(/[\r\n]+$/, "");
      if (line === "#=======================================") { ended = true; break; }
      if (strip(line) === "#") continue;
      if (!line.startsWith("# ")) throw unexpectedLine();
      let key: string, value: string;
      try { [key, value] = splitTwo(line.slice(2), ":"); } catch (e) {
        if (!(e instanceof ValueError)) throw e;
        [key, value] = splitTwo(line.slice(2), " = ");
      }
      if (key === "Aligned_sequences") {
        numberOfSequences = pyInt(strip(value));
        if (identifiers.length !== 0) throw new AssertionError("");
        let i = 0;
        for (const l2 of stream) {
          if (!l2.startsWith("# ")) throw unexpectedLine();
          const parts = l2.slice(2).split(":");
          if (parts.length !== 2) throw new ValueError(parts.length < 2 ? `not enough values to unpack (expected 2, got ${parts.length})` : `too many values to unpack (expected 2, got ${parts.length})`);
          if (i + 1 !== pyInt(parts[0]!)) throw new AssertionError("");
          identifiers.push(strip(parts[1]!));
          i += 1;
          if (identifiers.length === numberOfSequences) break;
        }
      } else if (key === "Matrix") annotations.set(key, strip(value));
      else if (key === "Gap_penalty" || key === "Extend_penalty" || key === "Score") annotations.set(key, pyFloat(strip(value)));
      else if (key === "Length") ncols = pyInt(strip(value));
      else if (key === "Identity" || key === "Similarity" || key === "Gaps") annotations.set(key, pyInt(strip(value).split("/")[0]!));
      else if (key === "Longest_Identity" || key === "Longest_Similarity" || key === "Shortest_Identity" || key === "Shortest_Similarity") annotations.set(key, strip(value));
      else throw new ValueError(`Failed to parse line '${line}'`);
    }
    if (!ended) return null;
    if (identifiers.length === 0) throw new ValueError("Number of sequences missing!");
    if (ncols === null) throw new ValueError("Length of alignment missing!");
    const n = numberOfSequences!;
    const sequences: string[] = Array.from({ length: n }, () => "");
    const alignedSequences: string[] = Array.from({ length: n }, () => "");
    let consensus = "";
    const starts: number[] = Array.from({ length: n }, () => 0);
    const ends: number[] = Array.from({ length: n }, () => 0);
    let column = 0, index = 0;
    for (const raw of stream) {
      const line = raw.replace(/[\r\n]+$/, "");
      if (!line) {
        if (index === n) {
          if (column === ncols) break;
          index = 0;
        }
        continue;
      }
      const chars = cp(line);
      const prefix = strip(chars.slice(0, 21).join(""));
      if (prefix === "") {
        consensus += chars.slice(21, 71).join("");
        continue;
      }
      const [identifier, startText] = splitWordPair(prefix);
      if (index >= identifiers.length) throw new IndexError("list index out of range");
      if (!identifiers[index]!.startsWith(identifier)) throw new AssertionError("");
      const [alignedSequence, endText] = splitWordPair(chars.slice(21).join(""));
      let start = pyInt(startText);
      let end = pyInt(endText);
      const length = cp(sequences[index]!).length;
      const sequence = alignedSequence.replaceAll("-", "");
      const slen = cp(sequence).length;
      if (length === 0 && slen > 0) {
        if (start < end) { start -= 1; if (end !== start + slen) throw new AssertionError(""); }
        else { end -= 1; if (end !== start - slen) throw new AssertionError(""); }
        starts[index] = start;
      } else if (starts[index]! <= ends[index]!) {
        if (md["Align_format"] === "srspair" && slen === 0) {
          if (start !== ends[index]) throw new AssertionError("");
          if (end !== start) throw new AssertionError("");
        } else { start -= 1; if (end !== start + slen) throw new AssertionError(""); }
      } else if (md["Align_format"] === "srspair" && slen === 0) {
        if (start - 1 !== ends[index]) throw new AssertionError("");
        if (end !== start) throw new AssertionError("");
      } else { end -= 1; if (end !== start - slen) throw new AssertionError(""); }
      ends[index] = end;
      sequences[index] += sequence;
      alignedSequences[index] += alignedSequence;
      if (index === 0) column += cp(alignedSequence).length;
      else if (column !== cp(alignedSequences[index]!).length) throw new AssertionError("");
      index += 1;
    }
    const parsed = Alignment.parsePrintedAlignment(alignedSequences.map(encode));
    const coordinates = parsed.coordinates;
    const records: SeqRecord[] = [];
    for (let i = 0; i < parsed.sequences.length; i++) {
      let start = starts[i]!, end = ends[i]!;
      const data = parsed.sequences[i]!;
      let seq: Seq;
      if (start === 0) seq = new Seq(decode(data));
      else if (start < end) {
        coordinates[i] = coordinates[i]!.map((c) => c + start);
        seq = new Seq(new Map([[start, data]]), end);
      } else {
        [start, end] = [end, start];
        coordinates[i] = coordinates[i]!.map((c) => end - c);
        seq = new Seq(new Map([[0, data]]), end).reverseComplement() as Seq;
      }
      records.push(new SeqRecord(seq, identifiers[i]!));
    }
    const alignment = new Alignment(records, coordinates);
    if (annotations.size > 0) alignment.annotations = annotations;
    if (consensus) alignment.columnAnnotations = new Map([["emboss_consensus", consensus]]);
    return alignment;
  }
}

registerFormat("emboss", { AlignmentIterator: EmbossIterator });
