/** MAF (Multiple Alignment Format) files: the reader (Biopython's `Bio.Align.maf.AlignmentIterator`). */

import { AssertionError, IndexError, UnboundLocalError, ValueError, pyFloat, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { strip, words as splitWords } from "./rows.js";
import { shlexSplit } from "./shlex.js";
import type { TextStream } from "./stream.js";

const STATUS = ["C", "I", "N", "n", "M", "T"];
const EMPTY_STATUS = ["C", "I", "M", "n"];

/** `word.split("=")` unpacked into two names. */
function keyValue(word: string): [string, string] {
  const parts = word.split("=");
  if (parts.length !== 2) throw new ValueError(parts.length < 2 ? `not enough values to unpack (expected 2, got ${parts.length})` : `too many values to unpack (expected 2, got ${parts.length})`);
  return [parts[0]!, parts[1]!];
}

const unbound = (name: string): never => { throw new UnboundLocalError(`cannot access local variable '${name}' where it is not associated with a value`); };

/** Reads MAF files: one alignment per `a` block; the header goes to `metadata`. */
export class MafIterator extends AlignmentIterator {
  static override fmt: string | null = "MAF";
  /** Biopython's `self._aline`: the `a` line that starts the next block, or null at the end. */
  private declare aline: string | null | undefined;

  protected override readHeader(stream: TextStream): void {
    const metadata: Record<string, unknown> = {};
    let line = stream.readline();
    if (line.startsWith("track ")) {
      for (const word of shlexSplit(line).slice(1)) {
        const [key, v] = keyValue(word);
        let value: unknown = v;
        if (key === "name" || key === "description" || key === "frames") { /* kept as is */ }
        else if (key === "mafDot") { if (v !== "on" && v !== "off") throw new ValueError(`Variable mafDot in track line has unexpected value '${v}'`); }
        else if (key === "visibility") { if (v !== "dense" && v !== "pack" && v !== "full") throw new ValueError(`Variable visibility in track line has unexpected value '${v}'`); }
        else if (key === "speciesOrder") value = splitWords(v);
        else throw new ValueError(`Unexpected variable '${key}' in track line`);
        metadata[key] = value;
      }
      line = stream.readline();
    }
    const w = splitWords(line);
    if (w.length === 0) throw new IndexError("list index out of range");
    if (w[0] !== "##maf") throw new ValueError("header line does not start with ##maf");
    for (const word of w.slice(1)) {
      let [key, value] = keyValue(word);
      if (key === "version") key = "MAF Version";
      else if (key === "scoring") key = "Scoring";
      else if (key === "program") key = "Program";
      else throw new ValueError(`Unexpected variable '${key}' in header line`);
      metadata[key] = value;
    }
    if (metadata["MAF Version"] !== "1") throw new ValueError("MAF version must be 1");
    const comments: string[] = [];
    let found = false;
    for (const l of stream) {
      if (strip(l)) {
        if (!l.startsWith("#")) {
          if (!l.startsWith("a")) throw new AssertionError("");
          this.aline = l;
          found = true;
          break;
        }
        comments.push(strip(l.slice(1)));
      }
    }
    // Biopython calls `self._close()` here, which does not exist: an AttributeError (a TypeError in the goldens).
    if (!found) throw new TypeError("object has no attribute '_close'");
    if (comments.length > 0) metadata["Comments"] = comments;
    (this as { metadata?: Record<string, unknown> }).metadata = metadata;
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    const aline = this.aline;
    if (aline === undefined) throw new TypeError("object has no attribute '_aline'");
    if (aline === null) return null;
    const records: SeqRecord[] = [], starts: number[] = [], sizes: number[] = [], strands: string[] = [], aligned: Uint8Array[] = [];
    let score: number | null = null;
    const annotations = new Map<string, unknown>();
    for (const word of splitWords(aline.slice(1))) {
      const [key, value] = keyValue(word);
      if (key === "score") score = pyFloat(value);
      else if (key === "pass") {
        const v = pyInt(value);
        if (v <= 0) throw new ValueError(`pass value must be positive (found ${v})`);
        annotations.set("pass", v);
      } else throw new ValueError(`Unknown annotation variable '${key}'`);
    }
    let src: string | undefined, record: SeqRecord | undefined;
    let ended = true;
    for (const line of stream) {
      if (line.startsWith("#")) continue;
      else if (line.startsWith("a")) { this.aline = line; ended = false; break; }
      else if (line.startsWith("s ")) {
        const w = splitWords(strip(line));
        if (w.length !== 7) throw new ValueError("Error parsing alignment - 's' line must have 7 fields");
        src = w[1]!;
        const start = pyInt(w[2]!), size = pyInt(w[3]!), strand = w[4]!, srcSize = pyInt(w[5]!);
        let text = w[6]!;
        for (const gap of ".=_") text = text.replaceAll(gap, "-");
        aligned.push(new TextEncoder().encode(text));
        record = new SeqRecord(new Seq(null, srcSize), src, "", "");
        records.push(record); starts.push(start); sizes.push(size); strands.push(strand);
      } else if (line.startsWith("i ")) {
        const w = splitWords(strip(line));
        if (w.length !== 6) throw new AssertionError("");
        if (w[1] !== (src ?? unbound("src"))) throw new AssertionError("");
        const leftStatus = w[2]!, leftCount = pyInt(w[3]!), rightStatus = w[4]!, rightCount = pyInt(w[5]!);
        if (!STATUS.includes(leftStatus)) throw new AssertionError("");
        if (!STATUS.includes(rightStatus)) throw new AssertionError("");
        const r = record ?? unbound("record");
        r.annotations.set("leftStatus", leftStatus); r.annotations.set("leftCount", leftCount);
        r.annotations.set("rightStatus", rightStatus); r.annotations.set("rightCount", rightCount);
      } else if (line.startsWith("e")) {
        const w = splitWords(line.slice(1));
        if (w.length !== 6) throw new AssertionError("");
        src = w[0]!;
        const start = pyInt(w[1]!), size = pyInt(w[2]!), strand = w[3]!, srcSize = pyInt(w[4]!), status = w[5]!;
        if (!EMPTY_STATUS.includes(status)) throw new AssertionError("");
        record = new SeqRecord(new Seq(null, srcSize), src, "", "");
        const end = start + size;
        const segment: [number, number] = strand === "+" ? [start, end] : [srcSize - start, srcSize - end];
        if (!annotations.has("empty")) annotations.set("empty", []);
        (annotations.get("empty") as unknown[]).push([record, segment, status]);
      } else if (line.startsWith("q ")) {
        const w = splitWords(strip(line));
        if (w.length !== 3) throw new AssertionError("");
        if (w[1] !== (src ?? unbound("src"))) throw new AssertionError("");
        (record ?? unbound("record")).annotations.set("quality", w[2]!.replaceAll("-", ""));
      } else if (!strip(line)) continue;
      else throw new ValueError(`Error parsing alignment - unexpected line:\n${line}`);
    }
    if (ended) this.aline = null;
    const parsed = Alignment.parsePrintedAlignment(aligned);
    const coordinates = parsed.coordinates;
    records.forEach((rec, i) => {
      const srcSize = rec.seq!.length;
      const sequence = parsed.sequences[i]!;
      if (sequence.length !== sizes[i]) throw new ValueError(`sequence size is incorrect (found ${sequence.length}, expected ${sizes[i]})`);
      rec.seq = new Seq(new Map([[starts[i]!, sequence]]), srcSize);
    });
    records.forEach((rec, i) => {
      let row = coordinates[i]!;
      if (strands[i] === "-") {
        const first = row[0]!, last = row[row.length - 1]!;
        row = row.map((c) => last - first - c);
        rec.seq = (rec.seq as Seq).reverseComplement() as Seq;
      }
      const ranges = (rec.seq as Seq).definedRanges;
      if (ranges.length === 0) throw new IndexError("list index out of range");
      const start = ranges[0]![0];
      coordinates[i] = row.map((c) => c + start);
    });
    const alignment = new Alignment(records, coordinates);
    alignment.annotations = annotations;
    if (score !== null) alignment.score = score;
    return alignment;
  }
}

registerFormat("maf", { AlignmentIterator: MafIterator });
