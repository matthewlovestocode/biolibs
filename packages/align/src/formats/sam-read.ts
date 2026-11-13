/** SAM files: the reader (Biopython's `Bio.Align.sam.AlignmentIterator`). */

import { AssertionError, IndexError, KeyError, UnboundLocalError, ValueError, pyFloat, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { words as splitWords } from "./rows.js";
import { parseCigar, targetFromMd } from "./sam-cigar.js";
import { readSamHeader } from "./sam-header.js";
import { NumpyArray, PyFloatValue } from "./sam-values.js";
import type { TextStream } from "./stream.js";
import type { SeqRecord as SeqRecordType } from "@biolibs/seqrecord";

/** `field.split(":", 2)` unpacked into tag, datatype and value. */
function tagParts(field: string): [string, string, string] {
  const first = field.indexOf(":");
  const second = first < 0 ? -1 : field.indexOf(":", first + 1);
  if (second < 0) throw new ValueError(`not enough values to unpack (expected 3, got ${first < 0 ? 1 : 2})`);
  return [field.slice(0, first), field.slice(first + 1, second), field.slice(second + 1)];
}

/** One tag value converted according to its datatype. */
function tagValue(datatype: string, value: string, field: string): unknown {
  if (datatype === "i") return pyInt(value);
  if (datatype === "f") return new PyFloatValue(pyFloat(value));
  if (datatype === "A" || datatype === "Z") return value;
  if (datatype === "H") {
    const n = Array.from(value).length;
    const out: number[] = [];
    for (let i = 0; i < n; i += 2) out.push(pyInt(Array.from(value).slice(i, i + 2).join("")));
    return Uint8Array.from(out);
  }
  if (datatype === "B") {
    const chars = Array.from(value);
    if (chars.length === 0) throw new IndexError("string index out of range");
    const letter = chars[0]!;
    const items = chars.slice(1).join("").split(",");
    let convert: (s: string) => number;
    if ("cCsSiI".includes(letter)) convert = pyInt;
    else if (letter === "f") convert = pyFloat;
    else throw new ValueError(`Unknown number type '${letter}' in tag '${field}'`);
    return NumpyArray.from(items.map(convert));
  }
  return value;
}

const unboundLocal = (name: string): never => { throw new UnboundLocalError(`cannot access local variable '${name}' where it is not associated with a value`); };

/** Reads SAM files, one alignment per line; the header goes to `metadata` and `targets`. */
export class SamIterator extends AlignmentIterator {
  static override fmt: string | null = "SAM";
  /** `self._line`: the first line after the header. */
  private declare pending: string | undefined;
  /** Biopython's `self._target_indices`. */
  private declare targetIndices: Map<string, number>;
  /** The `@SQ` records. */
  declare targets: SeqRecordType[];

  protected override readHeader(stream: TextStream): void {
    const header = readSamHeader(stream);
    const self = this as { metadata?: Record<string, unknown> };
    self.metadata = header.metadata;
    this.targets = header.targets;
    this.targetIndices = header.targetIndices;
    if (header.line !== undefined) this.pending = header.line;
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    let line: string;
    if (this.pending !== undefined) { line = this.pending; this.pending = undefined; } else {
      const next = stream.readline();
      if (next === "") return null;
      line = next;
    }
    const fields = splitWords(line);
    if (fields.length < 11) throw new ValueError(`line has ${fields.length} columns; expected at least 11`);
    const qname = fields[0]!, flag = pyInt(fields[1]!), rname = fields[2]!;
    const targetPos = pyInt(fields[3]!) - 1;
    const mapq = pyInt(fields[4]!), cigar = fields[5]!, rnext = fields[6]!;
    const pnext = pyInt(fields[7]!) - 1;
    const tlen = pyInt(fields[8]!);
    const query = fields[9]!;
    const qual = fields[10]!;
    let md: string | null = null, score: number | null = null;
    const annotations = new Map<string, unknown>();
    for (const field of fields.slice(11)) {
      const [tag, datatype, value] = tagParts(field);
      if (tag === "AS") { if (datatype !== "i") throw new AssertionError(""); score = pyInt(value); }
      else if (tag === "MD") { if (datatype !== "Z") throw new AssertionError(""); md = value; }
      else annotations.set(tag, tagValue(datatype, value, field));
    }
    const strand = flag & 0x10 ? "-" : "+";
    let hardClipLeft: number | null = null, hardClipRight: number | null = null;
    let storeOperations = false;
    let queryPos: number | undefined;
    let target: SeqRecord | null;
    let coordinates: number[][] | null;
    let operations: number[] = [];
    if (flag & 0x4) { target = null; coordinates = null; }
    else if (md === null) {
      const r = parseCigar(cigar, targetPos, query, false);
      ({ hardClipLeft, hardClipRight, storeOperations, queryPos, operations } = r);
      coordinates = [r.coordinates.map((p) => p[0]), r.coordinates.map((p) => p[1])];
      const index = this.targetIndices.get(rname);
      if (index === undefined) {
        if (this.targets.length > 0) throw new ValueError(`Found target ${rname} missing from header`);
        target = new SeqRecord(null, rname, undefined, "");
      } else target = this.targets[index]!;
    } else {
      const r = parseCigar(cigar, targetPos, query, true);
      ({ hardClipLeft, hardClipRight, storeOperations, queryPos, operations } = r);
      coordinates = [r.coordinates.map((p) => p[0]), r.coordinates.map((p) => p[1])];
      const seq = targetFromMd(md, r.target);
      const index = this.targetIndices.get(rname);
      if (index === undefined) throw new KeyError(rname);
      const reference = this.targets[index]!;
      const length = reference.seq!.length;
      const data = new Map<number, string>();
      let at = 0;
      const chars = Array.from(seq);
      r.starts.forEach((start, i) => {
        if (i < r.sizes.length) { data.set(start, chars.slice(at, at + r.sizes[i]!).join("")); at += r.sizes[i]!; }
      });
      target = SeqRecord.fromValidated(new Seq(data, length), reference.id, reference.name, reference.description, null, null, new Map([...reference.annotations].map(([k, v]) => [k, Array.isArray(v) ? [...v] : v])));
    }
    if (coordinates !== null && strand === "-") { const q = queryPos!; coordinates[1] = coordinates[1]!.map((c) => q - c); }
    let sequence: Seq;
    if (query === "*") {
      if (queryPos === undefined) unboundLocal("query_pos");
      sequence = new Seq(null, queryPos!);
    } else {
      sequence = new Seq(query);
      if (!(flag & 0x4)) {
        if (Array.from(query).length !== queryPos) throw new AssertionError("");
        if (strand === "-") sequence = sequence.reverseComplement() as Seq;
      }
    }
    const queryRecord = new SeqRecord(sequence, qname, undefined, "");
    if (strand === "-") [hardClipLeft, hardClipRight] = [hardClipRight, hardClipLeft];
    if (hardClipLeft !== null) queryRecord.annotations.set("hard_clip_left", hardClipLeft);
    if (hardClipRight !== null) queryRecord.annotations.set("hard_clip_right", hardClipRight);
    if (qual !== "*") queryRecord.letterAnnotations.set("phred_quality", Array.from(qual, (c) => c.codePointAt(0)! - 33));
    const alignment = new Alignment([target, queryRecord], coordinates);
    alignment.flag = flag;
    if (mapq !== 255) alignment.mapq = mapq;
    if (rnext === "=") alignment.rnext = rname; else if (rnext !== "*") alignment.rnext = rnext;
    if (pnext >= 0) alignment.pnext = pnext;
    if (tlen !== 0) alignment.tlen = tlen;
    if (score !== null) alignment.score = score;
    if (annotations.size > 0) alignment.annotations = annotations;
    if (hardClipLeft !== null) alignment.hardClipLeft = hardClipLeft;
    if (hardClipRight !== null) alignment.hardClipRight = hardClipRight;
    if (storeOperations) alignment.operations = Uint8Array.from(operations);
    return alignment;
  }
}

registerFormat("sam", { AlignmentIterator: SamIterator });
