/** TRANSFAC matrix files (Biopython's `Bio.motifs.transfac`): a motif with annotation fields, a record, `read` and `write`. */

import { IndexError, ValueError, pyInt } from "@biolibs/core";
import { formatG } from "./format.js";
import { splitLines } from "./lines.js";
import { Motif } from "./motif.js";
import type { LetterValues } from "./matrix.js";

/** Python's `UnboundLocalError`. */
class UnboundLocalError extends Error {
  override name = "UnboundLocalError";
}

/** A TRANSFAC annotation: one value, or a list for the keys that may repeat. */
export type Annotation = string | string[];
/** One reference: its `RN`, `RX`, `RA`, `RT` and `RL` lines by key. */
export type Reference = Record<string, string>;

const MULTIPLE_VALUE_KEYS = new Set(["BF", "OV", "HP", "BS", "HC", "DT", "DR", "CC"]);
const REFERENCE_KEYS = new Set(["RX", "RA", "RT", "RL"]);

/** A motif with TRANSFAC's annotation fields (`AC`, `ID`, `NA`, `DE`, ...) and references. */
export class TransfacMotif extends Motif {
  /** The annotation fields by two-letter key. */
  annotations = new Map<string, Annotation>();
  /** The references (`RN` blocks). */
  references: Reference[] = [];
  /** Keys whose value is a list of lines. */
  static readonly multipleValueKeys = MULTIPLE_VALUE_KEYS;
  /** Keys that belong to a reference. */
  static readonly referenceKeys = REFERENCE_KEYS;

  /** @param alphabet - The letters. @param counts - Counts by letter. */
  constructor(alphabet = "ACGT", counts: LetterValues | null = null) { super(alphabet, null, counts); }

  /** Python `dict.get`: the annotation under a key, or null. @param key - A two-letter key. */
  get(key: string): Annotation | null { return this.annotations.get(key) ?? null; }
}

/** The motifs of a TRANSFAC file, with the file's `VV` version. */
export class TransfacRecord extends Array<TransfacMotif> {
  /** The version line. */
  version: string | null = null;
  /** @returns The record written as TRANSFAC text. */
  override toString(): string { return write(this); }
}

const split2 = (line: string): string[] => {
  const m = /^\s*(\S+)(?:\s+([\s\S]*))?$/.exec(line);
  return m ? (m[2] !== undefined ? [m[1]!, m[2]] : [m[1]!]) : [];
};
const hasTwoSpaces = (line: string): boolean => line.includes("  ");

/**
 * Read a TRANSFAC file.
 *
 * @param text - The file contents.
 * @param strict - Insist on two-character keys, two spaces before values and two-digit matrix row numbers.
 * @throws ValueError for the many malformed layouts Biopython checks; UnboundLocalError where it uses a value never read.
 */
export function read(text: string, strict = true): TransfacRecord {
  let annotations = new Map<string, Annotation>();
  let references: Reference[] = [];
  let counts: Map<string, number[]> | null = null;
  const record = new TransfacRecord();
  const lines = splitLines(text);
  let pos = 0;
  let reference: Reference | undefined;
  let value: string | undefined;
  while (pos < lines.length) {
    let line = lines[pos++]!.trim();
    if (!line) continue;
    let keyValue = split2(line);
    let key = keyValue[0]!.trim();
    if (strict && key.length !== 2) throw new ValueError(`The key value of a TRANSFAC motif line should have 2 characters:"${line}"`);
    if (keyValue.length === 2) {
      value = keyValue[1]!.trim();
      if (strict && !hasTwoSpaces(line)) throw new ValueError(`A TRANSFAC motif line should have 2 spaces between key and value columns: "${line}"`);
    }
    const need = (): string => { if (value === undefined) throw new UnboundLocalError("cannot access local variable 'value' where it is not associated with a value"); return value; };
    if (key === "VV") record.version = need();
    else if (key === "P0" || key === "PO") {
      counts = new Map();
      if (JSON.stringify(need().split(/\s+/).filter(Boolean).slice(0, 4)) !== JSON.stringify(["A", "C", "G", "T"])) throw new ValueError(`A TRANSFAC matrix "${key}" line should be followed by "A C G T": ${line}`);
      let length = 0;
      for (const c of "ACGT") counts.set(c, []);
      while (pos < lines.length) {
        line = lines[pos++]!.trim();
        keyValue = split2(line);
        if (keyValue.length === 0) throw new IndexError("list index out of range");
        key = keyValue[0]!.trim();
        if (keyValue.length === 2) {
          value = keyValue[1]!.trim();
          if (strict && !hasTwoSpaces(line)) throw new ValueError(`A TRANSFAC motif line should have 2 spaces between key and value columns: "${line}"`);
        }
        let i: number;
        try { i = pyInt(key); } catch { break; }
        if (length === 0 && i === 0) {
          if (strict) throw new ValueError(`A TRANSFAC matrix should start with "01" as first row of the matrix, but this matrix uses "00": "${line}`);
        } else length += 1;
        if (i !== length) throw new ValueError(`The TRANSFAC matrix row number does not match the position in the matrix: "${line}"`);
        if (strict) {
          if (key.length === 1) throw new ValueError(`A TRANSFAC matrix line should have a 2 digit key at the start of the line ("${String(i).padStart(2, "0")}"), but this matrix uses "${i}": "${line}".`);
          if (keyValue.length !== 2) throw new ValueError(`A TRANSFAC matrix line should have a key and a value: "${line}"`);
        }
        const values = need().split(/\s+/).filter(Boolean).slice(0, 4);
        if (values.length !== 4) throw new ValueError(`A TRANSFAC matrix line should have a value for each nucleotide (A, C, G and T): "${line}"`);
        "ACGT".split("").forEach((c, k) => counts!.get(c)!.push(parseFloatPy(values[k]!)));
      }
    }
    // The line that ended the matrix (or the original line) is then processed as an ordinary field.
    if (line === "XX") { /* separator */ }
    else if (key === "RN") {
      const v = need();
      const semi = v.indexOf(";");
      let index = semi === -1 ? v : v.slice(0, semi);
      if (index.length === 0) throw new IndexError("string index out of range");
      if (index[0] !== "[") throw new ValueError(`The index "${index}" in a TRANSFAC RN line should start with a "[": "${line}"`);
      if (index[index.length - 1] !== "]") throw new ValueError(`The index "${index}" in a TRANSFAC RN line should end with a "]": "${line}"`);
      const n = pyInt(index.slice(1, -1));
      if (references.length !== n - 1) throw new ValueError(`The index "${n}" of the TRANSFAC RN line does not match the current number of seen references "${references.length + 1}": "${line}"`);
      reference = { [key]: v };
      references.push(reference);
      index = "";
    } else if (key === "//") {
      if (counts !== null) {
        const motif = new TransfacMotif("ACGT", counts);
        for (const [k, v] of annotations) motif.annotations.set(k, v);
        motif.references = references;
        record.push(motif);
      }
      annotations = new Map();
      references = [];
    } else if (REFERENCE_KEYS.has(key)) {
      if (reference === undefined) throw new UnboundLocalError("cannot access local variable 'reference' where it is not associated with a value");
      reference[key] = need();
    } else if (MULTIPLE_VALUE_KEYS.has(key)) {
      if (!annotations.has(key)) annotations.set(key, []);
      (annotations.get(key) as string[]).push(need());
    } else annotations.set(key, need());
  }
  return record;
}

/** Python `float(text)` for the matrix values. */
function parseFloatPy(s: string): number {
  const t = s.trim().replaceAll("_", "");
  if (/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?|inf(inity)?|nan)$/i.test(t)) {
    const l = t.toLowerCase();
    if (l.endsWith("nan")) return NaN;
    if (l.endsWith("inf") || l.endsWith("infinity")) return l.startsWith("-") ? -Infinity : Infinity;
    return Number(t);
  }
  throw new ValueError(`could not convert string to float: '${s}'`);
}

/**
 * Write motifs as TRANSFAC text.
 *
 * @param motifs - Motifs (a {@link TransfacRecord} also writes its version).
 */
export function write(motifs: Iterable<Motif> & { version?: string | null }): string {
  const blocks: string[] = [];
  const version = (motifs as { version?: string | null }).version;
  if (version !== undefined && version !== null) blocks.push(`VV  ${version}\nXX\n//\n`);
  const sections = [["AC", "AS"], ["ID"], ["DT", "CO"], ["NA"], ["DE"], ["TY"], ["OS", "OC"], ["HP", "HC"], ["BF"], ["P0"], ["BA"], ["BS"], ["CC"], ["DR"], ["OV", "PV"]];
  for (const motif of motifs) {
    const lines: string[] = [];
    for (const section of sections) {
      let blank = false;
      for (let key of section) {
        if (key === "P0") {
          const length = motif.length;
          if (length === 0) continue;
          const sequence = motif.degenerateConsensus.toString();
          const letters = [...motif.alphabet].sort();
          lines.push(["P0", ...letters].join("      "));
          for (let i = 0; i < length!; i++) {
            lines.push([String(i + 1).padStart(2, "0"), ...letters.map((l) => formatG(motif.counts!.row(l)[i]!, 20).padStart(6))].join(" ") + `      ${sequence[i]}`);
          }
          blank = true;
        } else {
          const value = typeof (motif as TransfacMotif).get === "function" ? (motif as TransfacMotif).get(key) : null;
          if (value !== null) {
            if (MULTIPLE_VALUE_KEYS.has(key)) for (const v of value as string[]) lines.push(`${key}  ${v}`);
            else lines.push(`${key}  ${value}`);
            blank = true;
          }
        }
        if (key === "PV") {
          const references = (motif as TransfacMotif).references;
          if (references !== undefined) {
            for (const reference of references) {
              for (key of ["RN", "RX", "RA", "RT", "RL"]) {
                const v = reference[key];
                if (v === undefined) continue;
                lines.push(`${key}  ${v}`);
                blank = true;
              }
            }
          }
        }
      }
      if (blank) lines.push("XX");
    }
    lines.push("//");
    blocks.push(lines.join("\n") + "\n");
  }
  return blocks.join("");
}

