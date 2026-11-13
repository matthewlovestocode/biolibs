/** SAM files: the writer (Biopython's `Bio.Align.sam.AlignmentWriter`). */

import { AssertionError, IndexError, KeyError, UnboundLocalError, ValueError, pyFormatFixed, pyStr, pyTypeName } from "@biolibs/core";
import { Seq, UndefinedSequenceError, reverseComplement } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentWriter, type WriteTarget } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { SamIterator } from "./sam-read.js";
import { PyFloatValue } from "./sam-values.js";

/** `"\t".join(fields)`: every field must be text. */
function tabJoin(fields: unknown[]): string {
  fields.forEach((f, i) => { if (typeof f !== "string") throw new TypeError(`sequence item ${i}: expected str instance, ${pyTypeName(f)} found`); });
  return fields.join("\t");
}

/** Slicing `None`. */
function subscriptNone(): never { throw new TypeError("'NoneType' object is not subscriptable"); }

/** The text of a sequence slice (str or `Seq`). */
const textOf = (s: string | Seq | null, a: number, b: number): string => (s === null ? subscriptNone() : typeof s === "string" ? Array.from(s).slice(a, b).join("") : s.slice(a, b).toString());

/** Writes alignments as SAM lines; the header comes from `metadata` and `targets` of the parser that produced them. */
export class SamWriter extends AlignmentWriter {
  static override fmt: string | null = "SAM";

  /**
   * @param target - Where to write.
   * @param md - Also write the `MD` tag (default false).
   */
  constructor(target: WriteTarget | null = null, private readonly md: boolean = false) { super(target); }

  override writeHeader(stream: WriteTarget, alignments: unknown): void {
    const a = alignments as { metadata?: Record<string, unknown>; targets?: SeqRecord[] } | null;
    const metadata = a?.metadata ?? {};
    const targets = a?.targets ?? [];
    const hd = metadata["HD"] as Record<string, string> | undefined;
    if (hd !== undefined && hd !== null) {
      if (!("VN" in hd)) throw new KeyError("VN");
      const fields = ["@HD", `VN:${hd["VN"]}`];
      for (const [key, value] of Object.entries(hd)) if (key !== "VN") fields.push(`${key}:${value}`);
      stream.write(fields.join("\t") + "\n");
    }
    for (const record of targets) {
      const fields = ["@SQ", `SN:${record.id}`, `LN:${record.seq!.length}`];
      for (const [key, value] of record.annotations) {
        if (key === "alternate_locus") fields.push(`AH:${value}`);
        else if (key === "names") fields.push(`AN:${(value as string[]).join(",")}`);
        else if (key === "assembly") fields.push(`AS:${value}`);
        else if (key === "MD5") fields.push(`M5:${value}`);
        else if (key === "species") fields.push(`SP:${value}`);
        else if (key === "topology") {
          if (value !== "linear" && value !== "circular") throw new AssertionError("");
          fields.push(`PP:${value}`);
        } else if (key === "URI") fields.push(`UR:${value}`);
        else fields.push(`${Array.from(key).slice(0, 2).join("")}:${pyStr(value)}`);
      }
      if (record.description !== "<unknown description>") fields.push(`DS:${record.description}`);
      stream.write(fields.join("\t") + "\n");
    }
    for (const [tag, rows] of Object.entries(metadata)) {
      if (tag === "HD") continue;
      for (const row of rows as Record<string, string>[]) {
        stream.write(["@" + tag, ...Object.entries(row).map(([k, v]) => `${k}:${v}`)].join("\t") + "\n");
      }
    }
  }

  /** @returns One alignment as a SAM line. @param alignment - The alignment. @param md - Override the constructor's `md`. */
  formatAlignment(alignment: Alignment, md: boolean | null = null): string {
    if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
    const rows = alignment.coordinates!;
    let coordinates: number[][] = rows[0]!.map((_, c) => rows.map((row) => row[c]!));
    if (alignment.sequences.length !== 2) throw new ValueError(alignment.sequences.length < 2 ? `not enough values to unpack (expected 2, got ${alignment.sequences.length})` : `too many values to unpack (expected 2, got ${alignment.sequences.length})`);
    let [target, query] = alignment.sequences as [unknown, unknown];
    let hardLeft: number | null = null, hardRight: number | null = null;
    let qName: unknown, qual: string;
    if (query instanceof SeqRecord) {
      qName = query.id;
      const l = query.annotations.get("hard_clip_left"), r = query.annotations.get("hard_clip_right");
      if (l !== undefined) hardLeft = l as number;
      if (r !== undefined) hardRight = r as number;
      const phred = query.letterAnnotations.get("phred_quality") as number[] | undefined;
      qual = phred === undefined ? "*" : phred.map((v) => String.fromCodePoint(v + 33)).join("");
      query = query.seq;
    } else { qName = "query"; qual = "*"; }
    const qSize = (query as { length: number }).length;
    let rname: unknown;
    if (target instanceof SeqRecord) { rname = target.id; target = target.seq; } else rname = "target";
    if (coordinates.length === 0) throw new IndexError("index 0 is out of bounds for axis 0 with size 0");
    const last = coordinates.length - 1;
    if (coordinates[0]![0]! > coordinates[last]![0]!) coordinates = [...coordinates].reverse();
    let flag: number;
    if (coordinates[0]![1]! < coordinates[last]![1]!) flag = 0;
    else {
      flag = 16;
      query = reverseComplement(query as never);
      coordinates = coordinates.map(([t, q]) => [t!, qSize - q!]);
      [hardLeft, hardRight] = [hardRight, hardLeft];
    }
    if (alignment.flag !== undefined) flag |= alignment.flag;
    let queryText: string;
    if (typeof query === "string") queryText = query;
    else try { queryText = new TextDecoder("ascii").decode((query as Seq).toBytes()); } catch (e) {
      if (!(e instanceof UndefinedSequenceError)) throw e;
      queryText = "*";
    }
    let [tStart, qStart] = coordinates[0] as [number, number];
    const pos = tStart + 1;
    let cigar = "";
    if (hardLeft !== null) cigar += `${hardLeft}H`;
    if (qStart > 0) cigar += `${qStart}S`;
    const operations = alignment.operations;
    let qEnd: number | undefined;
    const steps = coordinates.slice(1);
    const count = operations === undefined ? steps.length : Math.min(operations.length, steps.length);
    for (let i = 0; i < count; i++) {
      const [tEnd, qE] = steps[i] as [number, number];
      qEnd = qE;
      const tCount = tEnd - tStart, qCount = qE - qStart;
      const op = operations?.[i];
      if (tCount === 0) {
        if (op !== undefined && op !== 73) throw new AssertionError("");
        cigar += `${qCount}I`; qStart = qE;
      } else if (qCount === 0) {
        if (op === undefined || op === 68) cigar += `${tCount}D`;
        else if (op === 78) cigar += `${tCount}N`;
        else throw new ValueError(`Unexpected operation ${op}`);
        tStart = tEnd;
      } else {
        if (tCount !== qCount) throw new ValueError("Unequal step sizes in alignment");
        if (op !== undefined && op !== 77) throw new AssertionError("");
        cigar += `${tCount}M`; tStart = tEnd; qStart = qE;
      }
    }
    if (qEnd === undefined) throw new UnboundLocalError("cannot access local variable 'qEnd' where it is not associated with a value");
    if (qEnd < qSize) cigar += `${qSize - qEnd}S`;
    if (hardRight !== null) cigar += `${hardRight}H`;
    const mapq = alignment.mapq ?? 255;
    const rnext: unknown = alignment.rnext === undefined ? "*" : alignment.rnext === rname ? "=" : alignment.rnext;
    const pnext = alignment.pnext === undefined ? 0 : alignment.pnext + 1;
    const fields: unknown[] = [qName, String(flag), rname, String(pos), String(mapq), cigar, rnext, String(pnext), "0", queryText, qual];
    const wantMd = md === null ? this.md : md;
    if (wantMd === true) {
      if (queryText === "*") throw new ValueError("requested MD tag with undefined sequence");
      fields.push("MD:Z:" + mdTag(coordinates, operations, target as string | Seq | null, queryText));
    }
    if (alignment.score !== undefined) {
      if (typeof alignment.score === "string") throw new TypeError("format argument: %f requires a real number, not str");
      fields.push("AS:i:" + pyFormatFixed(alignment.score, 0));
    }
    for (const [key, value] of alignment.annotations ?? []) {
      let datatype: string, text: string;
      if (value instanceof PyFloatValue) { datatype = "f"; text = String(value); }
      else if (typeof value === "number") { if (Number.isInteger(value)) { datatype = "i"; text = String(value); } else { datatype = "f"; text = new PyFloatValue(value).toString(); } }
      else if (typeof value === "string") { datatype = Array.from(value).length === 1 ? "A" : "Z"; text = value; }
      else if (value instanceof Uint8Array) { datatype = "H"; text = Array.from(value).map(String).join(""); }
      else throw new TypeError("isinstance() arg 2 must be a type, a tuple of types, or a union");
      fields.push(`${key}:${datatype}:${text}`);
    }
    return tabJoin(fields) + "\n";
  }
}

/** The text of the MD tag, computed from the alignment (Biopython's loop, with or without operations). */
function mdTag(coordinates: number[][], operations: Uint8Array | undefined, target: string | Seq | null, query: string): string {
  let [tStart, qStart] = coordinates[0] as [number, number];
  let number = 0, md = "";
  const steps = coordinates.slice(1);
  const count = operations === undefined ? steps.length : Math.min(operations.length, steps.length);
  for (let i = 0; i < count; i++) {
    const [tEnd, qEnd] = steps[i] as [number, number];
    const tCount = tEnd - tStart, qCount = qEnd - qStart;
    if (tCount === 0) qStart = qEnd;
    else if (qCount === 0) {
      if (operations === undefined || operations[i] !== 78) {
        if (number) { md += String(number); number = 0; }
        md += "^" + textOf(target, tStart, tEnd);
      }
      tStart = tEnd;
    } else {
      if (tCount !== qCount) throw new ValueError("Unequal step sizes in alignment");
      const t = Array.from(textOf(target, tStart, tEnd)), q = Array.from(Array.from(query).slice(qStart, qEnd).join(""));
      for (let k = 0; k < Math.min(t.length, q.length); k++) {
        if (t[k] === q[k]) number += 1; else { md += String(number) + t[k]; number = 0; }
      }
      tStart = tEnd; qStart = qEnd;
    }
  }
  if (number) md += String(number);
  return md;
}

registerFormat("sam", { AlignmentIterator: SamIterator, AlignmentWriter: SamWriter as never });
