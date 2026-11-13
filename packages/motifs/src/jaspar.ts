/** JASPAR matrices: the `jaspar.Motif` with its metadata, and the `pfm`, `sites` and `jaspar` text formats. */

import { Alignment } from "@biolibs/align";
import { ValueError, pyFloat, pySum } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { PythonException } from "./errors.js";
import { fixedWidth } from "./format.js";
import { Motif } from "./motif.js";
import type { LetterValues } from "./matrix.js";
import { splitLines } from "./lines.js";

/** Extra information a JASPAR motif carries. */
export interface JasparInfo {
  collection?: string | null; tfClass?: string | null; tfFamily?: string | null; species?: string[] | null; taxGroup?: string | null;
  acc?: string | null; dataType?: string | null; medline?: string | null; pazarId?: string | null; comment?: string | null;
}

/** A motif with a matrix id and the metadata of the JASPAR database. */
export class JasparMotif extends Motif {
  matrixId: string | null;
  collection: string | null; tfClass: string | null; tfFamily: string | null; species: string[] | null; taxGroup: string | null;
  acc: string | null; dataType: string | null; medline: string | null; pazarId: string | null; comment: string | null;

  /**
   * @param matrixId - The matrix id, e.g. `MA0004.1`.
   * @param name - The transcription factor name.
   * @param alphabet - The letters.
   * @param alignment - Instances (this or `counts`).
   * @param counts - Counts by letter.
   * @param info - The remaining metadata.
   */
  constructor(matrixId: string | null, name: string | null, alphabet = "ACGT", alignment: Alignment | null = null, counts: LetterValues | null = null, info: JasparInfo = {}) {
    super(alphabet, alignment, counts);
    this.name = name;
    this.matrixId = matrixId;
    this.collection = info.collection ?? null; this.tfClass = info.tfClass ?? null; this.tfFamily = info.tfFamily ?? null; this.species = info.species ?? null;
    this.taxGroup = info.taxGroup ?? null; this.acc = info.acc ?? null; this.dataType = info.dataType ?? null; this.medline = info.medline ?? null;
    this.pazarId = info.pazarId ?? null; this.comment = info.comment ?? null;
  }

  /** The id without its version. */
  get baseId(): string | null { return splitJasparId(this.matrixId!)[0]; }
  /** The version part of the id (null if there is none). */
  get version(): string | null { return splitJasparId(this.matrixId!)[1]; }

  /** @returns The JASPAR text description: the metadata lines (only those set) and the counts matrix. */
  override toString(): string {
    let s = `TF name\t${this.name ?? "None"}\nMatrix ID\t${this.matrixId ?? "None"}\n`;
    if (this.collection) s += `Collection\t${this.collection}\n`;
    if (this.tfClass) s += `TF class\t${this.tfClass}\n`;
    if (this.tfFamily) s += `TF family\t${this.tfFamily}\n`;
    if (this.species && this.species.length) s += `Species\t${this.species.join(",")}\n`;
    if (this.taxGroup) s += `Taxonomic group\t${this.taxGroup}\n`;
    if (this.acc) s += `Accession\t${this.acc}\n`;
    if (this.dataType) s += `Data type used\t${this.dataType}\n`;
    if (this.medline) s += `Medline\t${this.medline}\n`;
    if (this.pazarId) s += `PAZAR ID\t${this.pazarId}\n`;
    if (this.comment) s += `Comments\t${this.comment}\n`;
    return s + `Matrix:\n${this.counts}\n\n`;
  }

  /** @param other - Another JASPAR motif. @returns Whether the matrix ids are equal (Python `==`). */
  equals(other: JasparMotif): boolean { return this.matrixId === other.matrixId; }
}

/** The motifs read from a JASPAR file. */
export class JasparRecord extends Array<JasparMotif> {
  /** The version (unused by the readers; kept for API parity). */
  version: string | null = null;
  /** @returns The motifs' texts joined by newlines. */
  override toString(): string { return Array.from(this, (m) => m.toString()).join("\n"); }
  /** @returns A map from matrix id to motif. */
  toDict(): Map<string, JasparMotif> { return new Map(Array.from(this, (m) => [m.matrixId!, m])); }
}

/** Split `MA0001.1` into `["MA0001", "1"]` (version null without a dot or with more than one). @param id - A matrix id. */
export function splitJasparId(id: string): [string | null, string | null] {
  const parts = id.split(".");
  return parts.length === 2 ? [parts[0]!, parts[1]!] : [id, null];
}

/** Python's `StopIteration`, raised by `next()` on an exhausted file. */
class StopIteration extends Error {
  override name = "StopIteration";
}

const floats = (words: string[]): number[] => words.map(pyFloat);
const words = (s: string): string[] => s.split(/\s+/).filter((w) => w.length > 0);

function readPfm(text: string): JasparRecord {
  const counts = new Map<string, number[]>();
  const lines = splitLines(text);
  "ACGT".split("").forEach((letter, k) => {
    const line = lines[k];
    if (line === undefined) return;
    let w = words(line);
    if (w.length === 0) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
    if (w[0] === letter) w = w.slice(1);
    counts.set(letter, floats(w));
  });
  const motif = new JasparMotif(null, null, "ACGT", null, counts);
  motif.mask = "*".repeat(motif.length ?? 0);
  const record = new JasparRecord();
  record.push(motif);
  return record;
}

function readSites(text: string): JasparRecord {
  const lines = splitLines(text);
  const instances: Seq[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith(">")) break;
    i += 1;
    const line = lines[i];
    if (line === undefined) throw new StopIteration("");
    instances.push(new Seq([...line.trim()].filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).join("")));
  }
  const motif = new JasparMotif(null, null, "ACGT", new Alignment(instances));
  motif.mask = "*".repeat(motif.length ?? 0);
  const record = new JasparRecord();
  record.push(motif);
  return record;
}

function readJaspar(text: string): JasparRecord {
  let counts = new Map<string, number[]>();
  const record = new JasparRecord();
  let identifier: string | null = null, name: string | null = null, rowCount = 0;
  const nucleotides = ["A", "C", "G", "T"];
  const flush = (): void => { record.push(new JasparMotif(identifier, name, "ACGT", null, counts)); identifier = null; name = null; counts = new Map(); rowCount = 0; };
  for (const raw of splitLines(text)) {
    const line = raw.trim();
    const head = /^>\s*(\S+)(\s+(\S+))?/.exec(line);
    const long = /^\s*([ACGT])\s*\[\s*(.*)\s*\]/.exec(line);
    const short = /^\s*(.+)\s*/.exec(line);
    if (head) { identifier = head[1]!; name = head[3] ? head[3] : identifier; }
    else if (long) {
      counts.set(long[1]!, floats(words(long[2]!)));
      rowCount += 1;
      if (rowCount === 4) flush();
    } else if (short) {
      counts.set(nucleotides[rowCount]!, floats(words(short[1]!)));
      rowCount += 1;
      if (rowCount === 4) flush();
    }
  }
  return record;
}

/**
 * Read motifs from text.
 *
 * @param text - The file contents.
 * @param format - `pfm`, `sites` or `jaspar`.
 * @throws ValueError for another format name; ValueError / IndexError for malformed numbers or rows.
 */
export function read(text: string, format: string): JasparRecord {
  const f = format.toLowerCase();
  if (f === "pfm") return readPfm(text);
  if (f === "sites") return readSites(text);
  if (f === "jaspar") return readJaspar(text);
  throw new ValueError(`Unknown JASPAR format ${format}`);
}

/**
 * Write motifs as `pfm` (the first motif's four rows) or `jaspar` (`>id name` and one bracketed row per letter).
 *
 * @throws ValueError for another format; IndexError for `pfm` of an empty list.
 */
export function write(motifs: Motif[], format: string): string {
  const letters = "ACGT";
  const lines: string[] = [];
  if (format === "pfm") {
    const motif = motifs[0];
    if (motif === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
    if (motif.counts === null) throw new TypeError("'NoneType' object is not subscriptable");
    for (const letter of letters) lines.push(motif.counts.row(letter).map((v) => fixedWidth(v, 6, 2)).join(" ") + "\n");
  } else if (format === "jaspar") {
    for (const m of motifs) {
      const id = (m as JasparMotif).matrixId;
      lines.push(`>${id === undefined || id === null ? "None" : id} ${m.name ?? "None"}\n`);
      if (m.counts === null) throw new TypeError("'NoneType' object is not subscriptable");
      for (const letter of letters) lines.push(`${letter} [${m.counts!.row(letter).map((v) => fixedWidth(v, 6, 2)).join(" ")}]\n`);
    }
  } else throw new ValueError(`Unknown JASPAR format ${format}`);
  return lines.join("");
}

/**
 * Pseudocounts of the square root of the average number of instances, spread over the letters by the background.
 *
 * @param motif - A motif with counts.
 * @returns Letter to pseudocount.
 */
export function calculatePseudocounts(motif: Motif): Map<string, number> {
  const alphabet = motif.alphabet;
  let total = 0;
  for (let i = 0; i < (motif.length ?? 0); i++) total += pySum([...alphabet].map((l) => motif.counts!.row(l)[i]!));
  if (!motif.length) throw Object.assign(new Error("division by zero"), { name: "ZeroDivisionError" });
  const sq = Math.sqrt(total / motif.length);
  const bg = motif.background.size > 0 ? new Map(motif.background) : new Map([...alphabet].sort().map((l) => [l, 1.0] as [string, number]));
  const bgTotal = pySum(bg.values());
  const out = new Map<string, number>();
  for (const l of alphabet) { bg.set(l, bg.get(l)! / bgTotal); out.set(l, sq * bg.get(l)!); }
  return out;
}


