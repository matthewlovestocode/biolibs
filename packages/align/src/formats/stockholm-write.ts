/** Stockholm files: the writer (Biopython's `Bio.Align.stockholm.AlignmentWriter`). */

import { AssertionError, IndexError, KeyError, ValueError, pyStr, pyTextwrapFill } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import type { Alignment } from "../alignment/alignment.js";
import { AlignmentWriter } from "./interfaces.js";
import { rowsOf } from "./rows.js";
import { registerFormat } from "./registry.js";
import { MissingAttribute } from "./tabular-errors.js";
import { GC_MAPPING, GF_MAPPING, GR_MAPPING, GS_MAPPING, invert } from "./stockholm-maps.js";
import { StockholmIterator } from "./stockholm-read.js";

const GF_BY_NAME = invert(GF_MAPPING), GS_BY_NAME = invert(GS_MAPPING), GR_BY_NAME = invert(GR_MAPPING), GC_BY_NAME = invert(GC_MAPPING);

type Dict = Record<string, unknown>;

/** `textwrap.fill(text, width=79, break_long_words=False, indents=prefix)` plus a newline; nothing for `None`. */
function formatLongText(prefix: string, text: unknown): string {
  if (text === null || text === undefined) return "";
  return pyTextwrapFill(text as string, { width: 79, breakLongWords: false, initialIndent: prefix, subsequentIndent: prefix }) + "\n";
}

/** `dict[key]` with Python's `KeyError`. */
function need(d: Dict, key: string): unknown {
  if (!(key in d)) throw new KeyError(key);
  return d[key];
}

const cpLen = (s: string): number => Array.from(s).length;
const ljust = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - cpLen(s)));

/** One record's sequence line and its letter-annotation lines. */
function formatRecord(width: number, start: number, aligned: string, record: SeqRecord): string[] {
  const lines = [ljust(record.id as string, start) + aligned + "\n"];
  const name = ljust(record.id as string, width);
  const chars = Array.from(aligned);
  for (const [key, value] of record.letterAnnotations) {
    const feature = GR_BY_NAME.get(key) ?? key;
    let j = 0;
    const out = chars.map((letter) => {
      if (letter === "." || letter === "-") return ".";
      const item = (value as string)[j];
      if (item === undefined) throw new IndexError("string index out of range");
      j += 1;
      return item;
    });
    lines.push(ljust(`#=GR ${name}  ${feature} `, start) + out.join("") + "\n");
  }
  return lines;
}

/** Writes alignments as Stockholm files, one `# STOCKHOLM 1.0` block each. */
export class StockholmWriter extends AlignmentWriter {
  static override fmt: string | null = "Stockholm";

  formatAlignment(alignment: Alignment): string {
    const [rows, columns] = alignment.shape;
    if (rows === 0) throw new ValueError("Must have at least one sequence");
    if (columns === 0) throw new ValueError("Non-empty sequences are required");
    const annotations = alignment.annotations ?? new Map<string, unknown>();
    const lines: string[] = ["# STOCKHOLM 1.0\n"];
    for (const [key, feature] of GF_BY_NAME) {
      if (key === "comment") continue;
      const value = annotations.get(key);
      if (value === undefined || value === null) continue;
      if (key === "author" || key === "wikipedia") for (const item of value as Iterable<unknown>) lines.push(`#=GF ${feature}   ${pyStr(item)}\n`);
      else lines.push(`#=GF ${feature}   ${pyStr(value)}\n`);
    }
    const nested = annotations.get("nested domains") as Dict[] | undefined | null;
    if (nested !== undefined && nested !== null) {
      for (const domain of nested) {
        if (domain["accession"] !== undefined && domain["accession"] !== null) lines.push(`#=GF NE   ${pyStr(domain["accession"])}\n`);
        if (domain["location"] !== undefined && domain["location"] !== null) lines.push(`#=GF NL   ${pyStr(domain["location"])}\n`);
      }
    }
    const references = annotations.get("references") as Dict[] | undefined | null;
    if (references !== undefined && references !== null) {
      for (const reference of references) {
        lines.push(formatLongText("#=GF RC   ", reference["comment"]));
        lines.push(`#=GF RN   [${pyStr(need(reference, "number"))}]\n`);
        lines.push(`#=GF RM   ${pyStr(need(reference, "medline"))}\n`);
        lines.push(formatLongText("#=GF RT   ", need(reference, "title")));
        lines.push(`#=GF RA   ${pyStr(need(reference, "author"))}\n`);
        lines.push(`#=GF RL   ${pyStr(need(reference, "location"))}\n`);
      }
    }
    const dbrefs = annotations.get("database references") as Dict[] | undefined | null;
    if (dbrefs !== undefined && dbrefs !== null) {
      for (const d of dbrefs) {
        lines.push(`#=GF DR   ${pyStr(need(d, "reference"))}\n`);
        if (d["comment"] !== undefined && d["comment"] !== null) lines.push(`#=GF DC   ${pyStr(d["comment"])}\n`);
      }
    }
    const comment = annotations.get("comment");
    if (comment !== undefined && comment !== null) lines.push(formatLongText(`#=GF ${GF_BY_NAME.get("comment")}   `, comment));
    for (const key of annotations.keys()) {
      if (GF_BY_NAME.has(key) || key === "nested domains" || key === "references" || key === "database references") continue;
      throw new ValueError(`Unknown annotation ${key} found in alignment.annotations`);
    }
    lines.push(`#=GF SQ   ${rows}\n`);
    const records = alignment.sequences as SeqRecord[];
    for (const r of records) if (!(r instanceof SeqRecord)) throw new MissingAttribute();
    for (const r of records) if (r.id === null) throw new TypeError("object of type 'NoneType' has no len()");
    const width = Math.max(...records.map((r) => cpLen(r.id as string)));
    const start = Math.max(width, 20) + 12;
    for (const record of records) {
      const name = ljust(record.id as string, width);
      for (const [key, value] of record.annotations) lines.push(`#=GS ${name}  ${GS_BY_NAME.get(key) ?? key} ${pyStr(value)}\n`);
      if (record.description) lines.push(`#=GS ${name}  DE ${record.description}\n`);
      for (const value of record.dbxrefs) lines.push(`#=GS ${name}  DR ${value}\n`);
    }
    let operations: number[];
    if (alignment.operations === undefined) operations = new Array<number>(columns).fill(77);
    else { operations = Array.from(alignment.operations); if (operations.length !== columns) throw new AssertionError(""); }
    const aligned = rowsOf(alignment);
    records.forEach((record, i) => {
      const letters = Array.from(aligned[i]!);
      const n = Math.min(operations.length, letters.length);
      const text = letters.slice(0, n).map((letter, k) => (letter === "-" && operations[k] === 73 ? "." : letter)).join("");
      lines.push(...formatRecord(width, start, text, record));
    });
    if (alignment.columnAnnotations === undefined) throw new MissingAttribute();
    for (const [key, value] of alignment.columnAnnotations) lines.push(ljust(`#=GC ${GC_BY_NAME.get(key) ?? key} `, start) + String(value) + "\n");
    lines.push("//\n");
    return lines.join("");
  }
}

registerFormat("stockholm", { AlignmentIterator: StockholmIterator, AlignmentWriter: StockholmWriter as never });
