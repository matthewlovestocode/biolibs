/** Position frequency matrices in four columns or four rows (Biopython's `Bio.motifs.pfm`). */

import { ValueError, pyFloat } from "@biolibs/core";
import { fixedWidth } from "./format.js";
import { splitLines } from "./lines.js";
import { Motif } from "./motif.js";

/** The motifs of a PFM file. */
export class PfmRecord extends Array<Motif> {
  /** @returns The motifs' texts joined by newlines. */
  override toString(): string { return Array.from(this, (m) => m.toString()).join("\n"); }
}

const DEFAULT_ORDER = ["A", "C", "G", "T"];
const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);
const fresh = (): Map<string, number[]> => new Map([["A", []], ["C", []], ["G", []], ["T", []]]);
const sameSet = (a: string[], b: string[]): boolean => new Set(a).size === new Set(b).size && [...new Set(a)].every((x) => new Set(b).has(x));

/**
 * Read position frequency matrices.
 *
 * @param text - The file contents.
 * @param pfmFormat - `pfm-four-columns` or `pfm-four-rows` (case and `_` / `-` do not matter).
 * @throws ValueError for another format name or for numbers that cannot be read.
 */
export function read(text: string, pfmFormat: string): PfmRecord {
  const f = pfmFormat.toLowerCase().replaceAll("_", "-");
  if (f === "pfm-four-columns") return readFourColumns(text);
  if (f === "pfm-four-rows") return readFourRows(text);
  throw new ValueError(`Unknown Position Frequency matrix format '${f}'`);
}

function readFourColumns(text: string): PfmRecord {
  const record = new PfmRecord();
  let motifName: string | null = null;
  let motifNbr = 0, motifNbrAdded = 0;
  let order = DEFAULT_ORDER;
  let counts = fresh();
  const flush = (): void => {
    if (motifNbr !== 0 && motifNbrAdded !== motifNbr) {
      const motif = new Motif("GATC", null, counts);
      motif.name = motifName ? motifName : "";
      record.push(motif);
      motifNbrAdded = motifNbr;
    }
  };
  for (const raw of splitLines(text)) {
    const line = raw.trim();
    if (line) {
      const columns = words(line);
      const n = columns.length;
      if (line.startsWith("#")) continue;
      else if (line.startsWith(">")) { flush(); motifName = line.slice(1).trim(); order = DEFAULT_ORDER; }
      else if (columns[0] === "Gene" || columns[0] === "Motif") {
        flush();
        if (columns[1] === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
        motifName = columns[1];
        order = DEFAULT_ORDER;
      } else if (columns[0] === "Pos") {
        if (n === 5) { flush(); order = DEFAULT_ORDER; if (sameSet(columns.slice(1), DEFAULT_ORDER)) order = columns.slice(1); }
      } else if (DEFAULT_ORDER.includes(columns[0]!)) {
        if (n === 4) { order = DEFAULT_ORDER; if (sameSet(columns, DEFAULT_ORDER)) order = columns; }
      } else {
        let matrixColumns: string[];
        if (n === 4) matrixColumns = columns;
        else if (n === 5) matrixColumns = columns.slice(1);
        else continue;
        if (motifNbr === motifNbrAdded) { counts = fresh(); motifNbr += 1; }
        order.forEach((nuc, k) => { if (k < matrixColumns.length) counts.get(nuc)!.push(pyFloat(matrixColumns[k]!)); });
      }
    } else {
      flush();
      motifName = null;
      order = DEFAULT_ORDER;
    }
  }
  if (motifNbr !== 0 && motifNbrAdded !== motifNbr) {
    const motif = new Motif("GATC", null, counts);
    motif.name = motifName ? motifName : "";
    record.push(motif);
  }
  return record;
}

function readFourRows(text: string): PfmRecord {
  const record = new PfmRecord();
  let motifName: string | null = null;
  let counts = new Map<string, number[]>();
  let rowCount = 0;
  const nucleotides = ["A", "C", "G", "T"];
  const finish = (): void => {
    const motif = new Motif("GATC", null, counts);
    motif.name = motifName ? motifName : "";
    record.push(motif);
    motifName = null; counts = new Map(); rowCount = 0;
  };
  for (const raw of splitLines(text)) {
    const line = raw.trim();
    if (line.startsWith("Ent=")) continue;
    const nameMatch = /^>\s*(.+)\s*/.exec(line);
    const withLetter = /^\s*([ACGTacgt])\s*[\[|]*\s*([0-9.\-eE\s]+)\s*\]*\s*/.exec(line);
    const without = /^\s*([0-9.\-eE\s]+)\s*/.exec(line);
    if (nameMatch) motifName = nameMatch[1]!;
    else if (withLetter) {
      counts.set(withLetter[1]!.toUpperCase(), words(withLetter[2]!).map(pyFloat));
      rowCount += 1;
      if (rowCount === 4) finish();
    } else if (without) {
      counts.set(nucleotides[rowCount]!, words(without[1]!).map(pyFloat));
      rowCount += 1;
      if (rowCount === 4) finish();
    }
  }
  return record;
}

/**
 * Write motifs as `>name` followed by four tab-separated integer columns (A, C, G, T) per position.
 *
 * @param motifs - Motifs over a DNA alphabet (an RNA motif raises KeyError for `T`).
 */
export function write(motifs: Iterable<Motif>): string {
  const lines: string[] = [];
  for (const m of motifs) {
    lines.push(`>${m.name ?? "None"}\n`);
    const c = m.counts;
    if (c === null) throw new TypeError("'NoneType' object is not subscriptable");
    const [a, cc, g, t] = [c.row("A"), c.row("C"), c.row("G"), c.row("T")];
    const n = Math.min(a.length, cc.length, g.length, t.length);
    for (let i = 0; i < n; i++) lines.push([a[i]!, cc[i]!, g[i]!, t[i]!].map((v) => fixedWidth(v, 0, 0)).join("\t") + "\n");
  }
  return lines.join("");
}
