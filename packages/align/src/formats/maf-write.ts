/** MAF (Multiple Alignment Format) files: the writer (Biopython's `Bio.Align.maf.AlignmentWriter`). */

import { ValueError, pyFormatFixed, pyStr } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentWriter, type WriteTarget } from "./interfaces.js";
import { MafIterator } from "./maf-read.js";
import { registerFormat } from "./registry.js";
import { rowsOf } from "./rows.js";

const TRACK_KEYS = ["name", "description", "frames", "mafDot", "visibility", "speciesOrder"];
const cpLen = (s: string): number => Array.from(s).length;
const ljust = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - cpLen(s)));
const rjust = (s: string, n: number): string => " ".repeat(Math.max(0, n - cpLen(s))) + s;

/** `len(record)` for a record, `Seq` or string. */
const lengthOf = (r: unknown): number => (r instanceof SeqRecord ? r.seq!.length : (r as { length: number }).length);
/** `record.id`, or Biopython's default name for objects without one. */
const nameOf = (r: unknown, i: number): string => (r instanceof SeqRecord ? (r.id as string) : `sequence_${i}`);

/** An `empty` entry of the alignment annotations: the record, its segment and the status letter. */
type Empty = [SeqRecord, [number, number], string];

/** Writes alignments as MAF blocks; the header comes from the `metadata` of the parser that produced them. */
export class MafWriter extends AlignmentWriter {
  static override fmt: string | null = "MAF";

  private writeTrackline(stream: WriteTarget, metadata: Record<string, unknown>): void {
    stream.write("track");
    for (const [key, value0] of Object.entries(metadata)) {
      let value = value0;
      if (key === "name" || key === "description" || key === "frames") { /* as is */ }
      else if (key === "mafDot") { if (value !== "on" && value !== "off") throw new ValueError(`mafDot value must be 'on' or 'off' (received '${pyStr(value)}')`); }
      else if (key === "visibility") { if (value !== "dense" && value !== "pack" && value !== "full") throw new ValueError(`visibility value must be 'dense', 'pack', or 'full' (received '${pyStr(value)}')`); }
      else if (key === "speciesOrder") value = (value as string[]).join(" ");
      else continue;
      let text = value as string;
      if (text.includes(" ")) text = `"${text}"`;
      stream.write(` ${key}=${text}`);
    }
    stream.write("\n");
  }

  override writeHeader(stream: WriteTarget, alignments: unknown): void {
    const metadata = (alignments as { metadata?: Record<string, unknown> } | null)?.metadata ?? { "MAF Version": "1" };
    if (TRACK_KEYS.some((k) => k in metadata)) this.writeTrackline(stream, metadata);
    stream.write("##maf");
    for (const [key0, value] of Object.entries(metadata)) {
      if (TRACK_KEYS.includes(key0) || key0 === "Comments") continue;
      let key: string;
      if (key0 === "MAF Version") { if (value !== "1") throw new ValueError("MAF version must be 1"); key = "version"; }
      else if (key0 === "Scoring") key = "scoring";
      else if (key0 === "Program") key = "program";
      else throw new ValueError(`Unexpected key '${key0}' for header`);
      stream.write(` ${key}=${pyStr(value)}`);
    }
    stream.write("\n");
    const comments = metadata["Comments"] as string[] | undefined;
    if (comments !== undefined) {
      for (const comment of comments) stream.write(`# ${comment}\n`);
      stream.write("\n");
    }
  }

  formatAlignment(alignment: Alignment): string {
    if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
    const annotations = alignment.annotations ?? new Map<string, unknown>();
    const lines: string[] = [];
    let head = "a";
    if (alignment.score !== undefined) head = `a score=${pyFormatFixed(alignment.score as number, 6)}`;
    const pass = annotations.get("pass");
    if (pass !== undefined && pass !== null) head += ` pass=${pyStr(pass)}`;
    lines.push(head + "\n");
    let nameWidth = 0, startWidth = 0, sizeWidth = 0, lengthWidth = 0;
    const n = alignment.sequences.length;
    const coordinates = alignment.coordinates!;
    for (let i = 0; i < n; i++) {
      const record = alignment.sequences[i];
      const name = nameOf(record, i);
      let start = coordinates[i]![0]!;
      const end = coordinates[i]![coordinates[i]!.length - 1]!;
      const length = lengthOf(record);
      let size: number;
      if (start < end) size = end - start; else { size = start - end; start = length - start; }
      nameWidth = Math.max(nameWidth, cpLen(name));
      startWidth = Math.max(startWidth, cpLen(String(start)));
      sizeWidth = Math.max(sizeWidth, cpLen(String(size)));
      lengthWidth = Math.max(lengthWidth, cpLen(String(length)));
    }
    const empties = (annotations.get("empty") ?? []) as Empty[];
    empties.forEach(([record], i) => {
      const name = nameOf(record, i + n);
      nameWidth = Math.max(nameWidth, cpLen(name));
    });
    empties.forEach(([record, segment]) => {
      let [start] = segment;
      const end = segment[1];
      const length = record.seq!.length;
      let size: number;
      if (start <= end) size = end - start; else { size = start - end; start = length - start; }
      startWidth = Math.max(startWidth, cpLen(String(start)));
      sizeWidth = Math.max(sizeWidth, cpLen(String(size)));
      lengthWidth = Math.max(lengthWidth, cpLen(String(length)));
    });
    const qualityWidth = nameWidth + startWidth + sizeWidth + lengthWidth + 5;
    const rows = rowsOf(alignment);
    for (let i = 0; i < n; i++) {
      const record = alignment.sequences[i];
      const recordId = nameOf(record, i);
      let start = coordinates[i]![0]!;
      const end = coordinates[i]![coordinates[i]!.length - 1]!;
      const length = lengthOf(record);
      let size: number, strand: string;
      if (start < end) { size = end - start; strand = "+"; } else { size = start - end; start = length - start; strand = "-"; }
      const text = rows[i]!;
      lines.push(`s ${ljust(recordId, nameWidth)} ${rjust(String(start), startWidth)} ${rjust(String(size), sizeWidth)} ${strand} ${rjust(String(length), lengthWidth)} ${text}\n`);
      if (record instanceof SeqRecord) {
        const quality = record.annotations.get("quality") as string | undefined;
        if (quality !== undefined && quality !== null) {
          let gapped = "";
          let j = 0;
          for (const letter of text) {
            if (letter === "-") gapped += "-";
            else { const q = Array.from(quality)[j]; if (q === undefined) throw Object.assign(new Error("string index out of range"), { name: "IndexError" }); gapped += q; j += 1; }
          }
          lines.push(`q ${ljust(recordId, qualityWidth)} ${gapped}\n`);
        }
        const a = record.annotations;
        if (a.has("leftStatus") && a.has("leftCount") && a.has("rightStatus") && a.has("rightCount")) {
          lines.push(`i ${ljust(recordId, nameWidth)} ${a.get("leftStatus")} ${a.get("leftCount")} ${a.get("rightStatus")} ${a.get("rightCount")}\n`);
        }
      }
    }
    empties.forEach(([record, segment, status], i) => {
      const name = ljust(nameOf(record, i + n), nameWidth);
      let [start] = segment;
      const end = segment[1];
      const length = record.seq!.length;
      let size: number, strand: string;
      if (start <= end) { size = end - start; strand = "+"; } else { size = start - end; start = length - start; strand = "-"; }
      lines.push(`e ${name} ${rjust(String(start), startWidth)} ${rjust(String(size), sizeWidth)} ${strand} ${rjust(String(length), lengthWidth)} ${status}\n`);
    });
    lines.push("\n");
    return lines.join("");
  }
}

registerFormat("maf", { AlignmentIterator: MafIterator, AlignmentWriter: MafWriter as never });
