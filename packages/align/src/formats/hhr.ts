/** HHsearch / HHblits `.hhr` files (Biopython's `Bio.Align.hhr`); read only. */

import { AssertionError, KeyError, PyTuple, ValueError, pyFloat, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { encode, rstrip, strip, words as splitWords } from "./rows.js";
import { MissingAttribute } from "./tabular-errors.js";
import type { TextStream } from "./stream.js";

const cp = (s: string): string[] => Array.from(s);

/** `s.split(None, 1)` unpacked into two names. */
function splitPair(s: string): [string, string] {
  const m = /^\s*(\S+)\s+(\S[\s\S]*)$/.exec(s);
  if (m === null) throw new ValueError(`not enough values to unpack (expected 2, got ${/\S/.test(s) ? 1 : 0})`);
  return [m[1]!, m[2]!];
}

/** `s.rsplit(None, 1)` unpacked into two names. */
function rsplitPair(s: string): [string, string] {
  const m = /^([\s\S]*\S)\s+(\S+)\s*$/.exec(s);
  if (m === null) throw new ValueError(`not enough values to unpack (expected 2, got ${/\S/.test(s) ? 1 : 0})`);
  return [m[1]!, m[2]!];
}

/** A line split into exactly six words (`Q ...`/`T ...` lines). */
function sixWords(line: string): string[] {
  const w = splitWords(line);
  if (w.length !== 6) throw new ValueError(w.length < 6 ? `not enough values to unpack (expected 6, got ${w.length})` : `too many values to unpack (expected 6, got ${w.length})`);
  return w;
}

/** The `(123)` field at the end of a sequence line, as a number. */
function parenTotal(total: string): number {
  if (!total.startsWith("(")) throw new AssertionError("");
  if (!total.endsWith(")")) throw new AssertionError("");
  return pyInt(total.slice(1, -1));
}

/** `' ' * start + "%-{width}s" % text` with Python's rules: a negative count of spaces is none, a negative width counts as its size. */
function padLeft(start: number, width: number, text: string): string {
  const w = Math.abs(width);
  const n = cp(text).length;
  return " ".repeat(Math.max(0, start)) + text + " ".repeat(Math.max(0, w - n));
}

/** Python's error for a closure variable that was never assigned. */
/** Python's `NameError`. */
class NameError extends Error { override name = "NameError"; }

const free = (name: string): never => { throw new NameError(`cannot access free variable '${name}' where it is not associated with a value in enclosing scope`); };

/** Reads HHsearch/HHblits output: one pairwise alignment per hit of the single query. */
export class HhrIterator extends AlignmentIterator {
  static override fmt: string | null = "hhr";
  private declare queryName: string | undefined;
  private declare total: number;
  private declare counter: number;

  protected override readHeader(stream: TextStream): void {
    const metadata: Record<string, unknown> = {};
    for (const raw of stream) {
      const line = strip(raw);
      if (line === "") break;
      const [key, value] = splitPair(line);
      if (key === "Query") this.queryName = value;
      else if (key === "Match_columns") metadata[key] = pyInt(value);
      else if (key === "No_of_seqs") {
        const parts = value.split(" out of ");
        if (parts.length !== 2) throw new ValueError(parts.length < 2 ? `not enough values to unpack (expected 2, got ${parts.length})` : `too many values to unpack (expected 2, got ${parts.length})`);
        metadata[key] = PyTuple.from([pyInt(parts[0]!), pyInt(parts[1]!)]);
      } else if (key === "Neff" || key === "Template_Neff") metadata[key] = pyFloat(value);
      else if (key === "Searched_HMMs") metadata[key] = pyInt(value);
      else if (key === "Date") metadata["Rundate"] = value;
      else if (key === "Command") metadata["Command line"] = value;
      else throw new ValueError(`Unknown key '${key}'`);
    }
    (this as { metadata?: Record<string, unknown> }).metadata = metadata;
    let line = stream.readline();
    if (!line) throw new ValueError("Truncated file.");
    if (splitWords(line).join(" ") !== "No Hit Prob E-value P-value Score SS Cols Query HMM Template HMM") throw new AssertionError("");
    let counter = 0;
    for (line of stream) {
      if (strip(line) === "") break;
      counter += 1;
      const [word] = splitPair(line);
      if (pyInt(word) !== counter) throw new AssertionError("");
    }
    this.total = counter;
    this.counter = 0;
  }

  /** The number of hits the header lists (Biopython's `__len__`). */
  override get length(): number { return this.total; }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    const md = (this as { metadata?: Record<string, unknown> }).metadata!;
    let queryStart: number | null = null, queryLength: number | undefined;
    let querySequence = "", queryConsensus = "", querySsPred = "";
    let targetStart: number | null = null, targetLength: number | undefined, targetName: string | undefined;
    let targetSequence = "", targetConsensus = "", targetSsPred = "", targetSsDssp = "";
    let columnScore = "", confidence = "", consensus = "";
    let hmmName: string | undefined, hmmDescription: string | undefined;
    let alignmentAnnotations: Map<string, unknown> | undefined;

    const createAlignment = (): Alignment | null => {
      const n = cp(targetSequence).length;
      if (cp(querySequence).length !== n) throw new AssertionError("");
      if (n === 0) return null;
      const parsed = Alignment.parsePrintedAlignment([encode(targetSequence), encode(querySequence)]);
      if (targetStart === null) throw new TypeError("unsupported operand type(s) for +=: 'int' and 'NoneType'");
      if (queryStart === null) throw new TypeError("unsupported operand type(s) for +=: 'int' and 'NoneType'");
      const ts = targetStart, qs = queryStart;
      const coordinates = [parsed.coordinates[0]!.map((c) => c + ts), parsed.coordinates[1]!.map((c) => c + qs)];
      const [targetData, queryData] = parsed.sequences as [Uint8Array, Uint8Array];
      if (queryLength === undefined) free("query_length");
      const querySeq = new Seq(new Map([[qs, queryData]]), queryLength!);
      const query = new SeqRecord(querySeq, this.queryName ?? (() => { throw new MissingAttribute(); })());
      if (targetLength === undefined) free("target_length");
      const targetSeq = new Seq(new Map([[ts, targetData]]), targetLength!);
      if (hmmName === undefined) free("hmm_name");
      if (hmmDescription === undefined) free("hmm_description");
      if (targetName === undefined) free("target_name");
      const target = new SeqRecord(targetSeq, targetName!, undefined, undefined, null, null, new Map([["hmm_name", hmmName], ["hmm_description", hmmDescription]]));
      const tw = targetLength! - ts;
      target.letterAnnotations.set("Consensus", padLeft(ts, tw, targetConsensus.replaceAll("-", "")));
      target.letterAnnotations.set("ss_pred", padLeft(ts, tw, targetSsPred.replaceAll("-", "")));
      target.letterAnnotations.set("ss_dssp", padLeft(ts, tw, targetSsDssp.replaceAll("-", "")));
      const tChars = cp(targetSequence), cChars = cp(confidence);
      let kept = "";
      for (let i = 0; i < Math.min(tChars.length, cChars.length); i++) if (tChars[i] !== "-") kept += cChars[i];
      const alignmentConfidence = padLeft(ts, tw, kept);
      const qw = queryLength! - qs;
      if (queryConsensus) query.letterAnnotations.set("Consensus", padLeft(qs, qw, queryConsensus.replaceAll("-", "")));
      if (querySsPred) query.letterAnnotations.set("ss_pred", padLeft(qs, qw, querySsPred.replaceAll("-", "")));
      const alignment = new Alignment([target, query], coordinates);
      if (alignmentAnnotations === undefined) free("alignment_annotations");
      alignment.annotations = alignmentAnnotations!;
      alignment.columnAnnotations = new Map([["column score", columnScore], ["Confidence", alignmentConfidence]]);
      return alignment;
    };

    for (const raw of stream) {
      const line = rstrip(raw);
      if (!line) continue;
      if (line.startsWith(">")) {
        [hmmName, hmmDescription] = splitPair(line.slice(1));
        const w = splitWords(stream.readline());
        alignmentAnnotations = new Map();
        for (const word of w) {
          const parts = word.split("=");
          if (parts.length !== 2) throw new ValueError(parts.length < 2 ? `not enough values to unpack (expected 2, got ${parts.length})` : `too many values to unpack (expected 2, got ${parts.length})`);
          let [key, value] = parts as [string, string];
          if (key === "Aligned_cols") continue;
          if (key === "Identities") value = value.replace(/%+$/, "");
          alignmentAnnotations.set(key, pyFloat(value));
        }
      } else if (line === "Done!") {
        if (stream.readline()) throw new ValueError("Found additional data after 'Done!'; corrupt file?");
      } else if (line.startsWith(" ")) columnScore += strip(line);
      else if (line.startsWith("No ")) {
        const counter = this.counter;
        this.counter += 1;
        const w = splitWords(line);
        if (w.length !== 2) throw new ValueError(w.length < 2 ? `not enough values to unpack (expected 2, got ${w.length})` : `too many values to unpack (expected 2, got ${w.length})`);
        if (pyInt(w[1]!) !== this.counter) throw new AssertionError("");
        if (this.counter > this.total) throw new ValueError(`Expected ${this.total} alignments, found ${this.counter}`);
        if (counter > 0) return createAlignment();
      } else if (line.startsWith("Confidence")) {
        confidence += consensus.length === 0 ? line : cp(line).slice(-cp(consensus).length).join("");
      } else if (line.startsWith("Q ss_pred ")) querySsPred += rsplitPair(line)[1];
      else if (line.startsWith("Q Consensus ")) {
        const w = sixWords(line);
        pyInt(w[2]!); pyInt(w[4]!); parenTotal(w[5]!);
        consensus = w[3]!;
        queryConsensus += consensus;
      } else if (line.startsWith("Q ")) {
        const w = sixWords(line);
        if (this.queryName === undefined) throw new MissingAttribute();
        if (!this.queryName.startsWith(w[1]!)) throw new AssertionError("");
        const start = pyInt(w[2]!) - 1;
        pyInt(w[4]!);
        queryLength = parenTotal(w[5]!);
        if (!("Match_columns" in md)) throw new KeyError("Match_columns");
        if (queryLength !== md["Match_columns"]) throw new AssertionError("");
        if (queryStart === null) queryStart = start;
        querySequence += w[3]!;
      } else if (line.startsWith("T ss_pred ")) targetSsPred += rsplitPair(line)[1];
      else if (line.startsWith("T ss_dssp ")) targetSsDssp += rsplitPair(line)[1];
      else if (line.startsWith("T Consensus ")) {
        const w = sixWords(line);
        pyInt(w[2]!); pyInt(w[4]!); parenTotal(w[5]!);
        consensus = w[3]!;
        targetConsensus += consensus;
      } else if (line.startsWith("T ")) {
        const w = sixWords(line);
        if (w[0] !== "T") throw new AssertionError("");
        targetName = w[1]!;
        const start = pyInt(w[2]!) - 1;
        pyInt(w[4]!);
        targetLength = parenTotal(w[5]!);
        if (targetStart === null) targetStart = start;
        targetSequence += w[3]!;
      } else throw new ValueError(`Failed to parse line '${cp(line).slice(0, 30).join("")}...'`);
    }
    const alignment = createAlignment();
    if (alignment === null && this.counter !== this.total) throw new ValueError(`Expected ${this.total} alignments, found ${this.counter}`);
    return alignment;
  }
}

registerFormat("hhr", { AlignmentIterator: HhrIterator });
