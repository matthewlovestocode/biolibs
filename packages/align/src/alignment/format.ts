/**
 * The text form of a pairwise alignment (`Alignment.format()` and `str(alignment)`): the default "pretty" layout of
 * the target and query lines with a match pattern between them, plus the unicode and generalised fallbacks.
 */

import { IndexError, ValueError, pyStr } from "@biolibs/core";
import { MutableSeq, Seq, UndefinedSequenceError, reverseComplement } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { alignedColumns, columnMax, columnMin, diffRows, pad, select, type Matrix } from "./coords.js";
import type { SubstitutionArray } from "../substitution-matrices/index.js";

/** A substitution matrix that marks similar letters with `:` in the pattern line. */
export type PatternMatrix = SubstitutionArray | null;

/** Python slicing of a string by code point. */
const sliceCp = (s: string, a: number, b?: number): string => Array.from(s).slice(a, b).join("");

/** Whether every character is ASCII (`str.isascii`). */
const isAscii = (s: string): boolean => !/[^\x00-\x7f]/.test(s);

/** The text of a sequence for the unicode layout (`_convert_sequence_string`), or null when it is not text-like. */
function convertSequenceString(sequence: unknown): string | null {
  if (sequence instanceof Uint8Array) return new TextDecoder().decode(sequence);
  if (typeof sequence === "string") return sequence;
  if (sequence instanceof Seq || sequence instanceof MutableSeq) return sequence.toString();
  if (sequence instanceof SeqRecord && sequence.seq) return sequence.seq.toString();
  return null;
}

/** The id of a record-like, or undefined when it has none (Python `seq.id` raising AttributeError). */
function idOf(seq: unknown): string | undefined {
  if (seq instanceof SeqRecord && seq.id !== null) return seq.id;
  return undefined;
}

/** Reverse complement of a string or `Seq`-like (Biopython's `reverse_complement` function). */
function revcomp<T extends string | Seq | MutableSeq>(seq: T): T {
  return (seq instanceof MutableSeq || seq instanceof Seq ? reverseComplement(seq as Seq) : reverseComplement(seq as string)) as T;
}

/** The pattern character for a pair of aligned letters. */
function patternChar(c1: string, c2: string, matrix: PatternMatrix, spaces: boolean): string {
  if (c1 === c2) return "|";
  if (c1 === "-" || c2 === "-") return "-";
  let c = ".";
  if (matrix !== null && (!spaces || (c1 !== " " && c2 !== " ")) && (matrix.get([c1.toUpperCase(), c2.toUpperCase()]) as number) > 0) c = ":";
  return c;
}

/**
 * The default layout: blocks of up to 80 columns showing the target, a pattern line (`|` match, `.` mismatch,
 * `-` gap, `:` similar), and the query; each line starts with its name and coordinate.
 *
 * @param sequences - The aligned sequences.
 * @param coordinates - The alignment coordinates.
 * @param matrix - Optional matrix: positive scores get `:` instead of `.`.
 * @throws {@link ValueError} for inconsistent coordinates.
 */
export function formatPretty(sequences: unknown[], coordinates: Matrix, matrix: PatternMatrix = null): string {
  const n = sequences.length;
  let writePattern = n === 2;
  let steps = diffRows(coordinates);
  const aligned = alignedColumns(steps);
  const nameWidth = 10;
  const names: string[] = [];
  const seqs: string[] = [];
  const indices: Matrix = coordinates.map((r) => r.map(() => 0));
  for (let i = 0; i < n; i++) {
    let seq: unknown = sequences[i];
    const positions = coordinates[i]!;
    const row = indices[i]!;
    let name = idOf(seq);
    if (name === undefined) name = n === 2 ? (i === 0 ? "target" : "query") : "";
    else name = name.slice(0, nameWidth - 1);
    names.push(name.padEnd(nameWidth));
    if (seq instanceof SeqRecord) seq = seq.seq;
    let start = Math.min(...positions);
    let end = Math.max(...positions);
    seq = sliceAny(seq, start, end);
    let alignedSteps = select(steps[i]!, aligned);
    if (alignedSteps.length === 0) alignedSteps = steps[i]!;
    if (alignedSteps.filter((v) => v > 0).length >= alignedSteps.filter((v) => v < 0).length) {
      start = Math.min(...positions);
      positions.forEach((p, k) => (row[k] = p - start));
    } else {
      steps[i] = steps[i]!.map((v) => -v);
      seq = revcompAny(seq);
      end = Math.max(...positions);
      positions.forEach((p, k) => (row[k] = end - p));
    }
    if (typeof seq === "string") {
      if (!isAscii(seq)) return formatUnicode(sequences, coordinates, matrix);
    } else if (seq instanceof Seq || seq instanceof MutableSeq) {
      seq = seqText(seq, end - start);
    } else return formatGeneralized(sequences, coordinates, matrix);
    seqs.push(seq as string);
  }
  if (n === 0) throw new ValueError("zero-size array to reduction operation minimum which has no identity");
  const minstep = columnMin(steps);
  const maxstep = columnMax(steps);
  const merged = maxstep.map((mx, k) => (-minstep[k]! > mx ? minstep[k]! : mx));
  for (let i = 0; i < indices.length; i++) {
    const row = indices[i]!;
    const rowSteps = row.slice(1).map((v, k) => v - row[k]!);
    const mask = rowSteps.map((v, k) => v > 0 && aligned[k]!);
    const rs = select(rowSteps, mask);
    const as = select(merged, mask);
    if (rs.every((v, k) => v === as[k])) { /* consistent */ }
    else if (rs.every((v, k) => 3 * v === as[k])) {
      for (let k = 0; k < row.length; k++) row[k]! *= 3;
      seqs[i] = Array.from(seqs[i]!).join("  ") + "  ";
      writePattern = false;
    } else throw new ValueError("Inconsistent coordinates");
  }
  const prefixWidth = 10;
  const positionWidth = 10;
  const lineWidth = 80;
  const lines: string[] = [];
  const idxSteps = diffRows(indices);
  const mn = columnMin(idxSteps);
  const mx = columnMax(idxSteps);
  steps = [mx.map((v, k) => (-mn[k]! > v ? mn[k]! : v))];
  const stepRow = steps[0]!;
  let column = lineWidth;
  /** `lines[index] += text`, with Python's IndexError for a missing line (negative indices count from the end). */
  const append = (index: number, text: string): void => {
    const k = index < 0 ? lines.length + index : index;
    if (k < 0 || k >= lines.length) throw new IndexError("list index out of range");
    lines[k] += text;
  };
  const positionText = (p: number): string => {
    const text = String(p);
    const offset = positionWidth - text.length - 1;
    return offset < 0 ? " .." + text.slice(-offset + 3) : " ".repeat(offset) + text;
  };
  for (let i = 0; i < n; i++) {
    const name = names[i]!;
    const seq = seqs[i]!;
    const positions = coordinates[i]!;
    const row = indices[i]!;
    let start = positions[0]!;
    column = lineWidth;
    let startIndex = row[0]!;
    for (let k = 0; k < stepRow.length; k++) {
      let step = stepRow[k]!;
      const end = positions[k + 1]!;
      const endIndex = row[k + 1]!;
      if (step < 0) {
        if (prefixWidth + positionWidth < column) {
          const text = String(start);
          const offset = positionWidth - text.length - 1;
          if (offset < 0) append(-1, " .." + text.slice(-offset + 3));
          else append(-1, " " + text);
        }
        column = lineWidth;
        start = end;
        startIndex = endIndex;
        continue;
      }
      let s = endIndex === startIndex ? "-".repeat(step) : seq.slice(startIndex, endIndex);
      while (column + s.length >= lineWidth) {
        const rest = lineWidth - column;
        if (rest > 0) {
          append(-1, s.slice(0, rest));
          s = s.slice(rest);
          if (start !== end) {
            step = endIndex - startIndex === Math.abs(end - start) ? rest : Math.ceil(rest / 3);
            if (start < end) start += step;
            else start -= step;
          }
          startIndex += rest;
        }
        lines.push(name + positionText(start) + " ");
        column = nameWidth + positionWidth;
      }
      append(-1, s);
      if (startIndex !== endIndex) {
        startIndex = endIndex;
        start = end;
      }
      column += s.length;
    }
  }
  const lastCoords = coordinates.map((r) => r[r.length - 1]!);
  if (writePattern) {
    let position = 0;
    const m = Math.floor(lines.length / 2);
    const lines1 = lines.slice(0, m);
    const lines2 = lines.slice(m);
    const patternLines: string[] = [];
    for (let k = 0; k < Math.min(lines1.length, lines2.length); k++) {
      const a1 = lines1[k]!.slice(nameWidth + positionWidth);
      const a2 = lines2[k]!.slice(nameWidth + positionWidth);
      let pattern = "";
      for (let q = 0; q < Math.min(a1.length, a2.length); q++) {
        const c1 = a1[q]!;
        const c2 = a2[q]!;
        if (c1 === c2 && c1 === " ") break;
        pattern += patternChar(c1, c2, matrix, true);
      }
      patternLines.push(`          ${pad(position, 9)} ${pattern}`);
      position += pattern.length;
    }
    const finalWidth = String(Math.max(Math.max(...lastCoords), position)).length;
    if (column + finalWidth <= lineWidth) {
      if (prefixWidth + positionWidth < column) {
        lines1[lines1.length - 1] += " " + pad(lastCoords[0]!, finalWidth);
        lines2[lines2.length - 1] += " " + pad(lastCoords[1]!, finalWidth);
        patternLines[patternLines.length - 1] += " " + pad(position, finalWidth);
      }
    } else {
      const [name1, name2] = names as [string, string];
      lines1.push(name1 + pad(lastCoords[0]!, 9));
      patternLines.push("          " + pad(position, 9));
      lines2.push(name2 + pad(lastCoords[1]!, 9));
    }
    return lines1.map((l1, k) => `${l1}\n${patternLines[k]!}\n${lines2[k]!}\n`).join("\n");
  }
  const m = Math.floor(lines.length / n);
  const finalWidth = String(Math.max(...lastCoords)).length;
  let blocks: string[];
  if (column + finalWidth < lineWidth) {
    if (prefixWidth + positionWidth < column) for (let i = 0; i < n; i++) append(m - 1 + i * m, " " + pad(lastCoords[i]!, finalWidth));
    blocks = Array.from({ length: m }, (_, j) => lines.filter((_, q) => q % m === j).join("\n") + "\n");
  } else {
    blocks = Array.from({ length: m }, (_, j) => lines.filter((_, q) => q % m === j).join("\n") + "\n");
    blocks.push(names.map((nm, i) => nm + pad(lastCoords[i]!, 9)).join("\n") + "\n");
  }
  return blocks.join("\n");
}

/** `seq[start:end]` for a string (by code point) or a `Seq`/`MutableSeq`; anything else is sliced as an array. */
function sliceAny(seq: unknown, start: number, end: number): unknown {
  if (typeof seq === "string") return sliceCp(seq, start, end);
  if (seq instanceof Seq || seq instanceof MutableSeq) return seq.get({ start, stop: end });
  if (seq instanceof Uint8Array || Array.isArray(seq)) return seq.slice(start, end);
  return seq;
}

/** Reverse complement of a sliced sequence (strings and `Seq`s; other kinds fail like Python). */
function revcompAny(seq: unknown): unknown {
  if (typeof seq === "string" || seq instanceof Seq || seq instanceof MutableSeq) return revcomp(seq as string);
  throw new TypeError("'object' has no attribute 'encode'");
}

/** The text of a sliced `Seq`; positions whose content is undefined print as `?`. */
function seqText(seq: Seq | MutableSeq, length: number): string {
  try {
    return new TextDecoder().decode(seq.toBytes());
  } catch (e) {
    if (!(e instanceof UndefinedSequenceError)) throw e;
    let out = "";
    for (let k = 0; k < length; k++) {
      try { out += String(seq.get(k)); } catch { out += "?"; }
    }
    return out;
  }
}

/** The layout for text sequences with non-ASCII characters: just the aligned sequences and a pattern, no blocks. */
export function formatUnicode(sequences: unknown[], coordinates: Matrix, matrix: PatternMatrix = null): string {
  const seqs: string[] = [];
  const coords = coordinates.map((r) => [...r]);
  for (let i = 0; i < sequences.length; i++) {
    let seq = convertSequenceString(sequences[i]);
    if (seq === null) return formatGeneralized(sequences, coordinates, matrix);
    const row = coords[i]!;
    if (row[0]! > row[row.length - 1]!) {
      const len = Array.from(seq).length;
      for (let k = 0; k < row.length; k++) row[k] = len - row[k]!;
      seq = reverseComplement(seq);
    }
    seqs.push(seq);
  }
  const steps = columnMax(diffRows(coords));
  const alignedSeqs: string[] = [];
  coords.forEach((row, i) => {
    let aligned = "";
    let start = row[0]!;
    for (let k = 0; k < steps.length; k++) {
      const end = row[k + 1]!;
      aligned += end === start ? "-".repeat(steps[k]!) : sliceCp(seqs[i]!, start, end);
      start = end;
    }
    alignedSeqs.push(aligned);
  });
  if (seqs.length > 2) return alignedSeqs.join("\n") + "\n";
  const [a1, a2] = alignedSeqs as [string, string];
  const c1s = Array.from(a1);
  const c2s = Array.from(a2);
  let pattern = "";
  for (let k = 0; k < Math.min(c1s.length, c2s.length); k++) pattern += patternChar(c1s[k]!, c2s[k]!, matrix, true);
  return `${a1}\n${pattern}\n${a2}\n`;
}

/** The layout for arbitrary sequence items (lists, bytes, ...): items joined by spaces, padded to equal width. */
export function formatGeneralized(sequences: unknown[], coordinates: Matrix, matrix: PatternMatrix = null): string {
  if (sequences.length !== 2) throw new ValueError(`${sequences.length < 2 ? "not enough" : "too many"} values to unpack (expected 2, got ${sequences.length})`);
  const [seq1, seq2] = sequences as [ArrayLike<unknown>, ArrayLike<unknown>];
  const items = (s: ArrayLike<unknown>, a: number, b: number): unknown[] => Array.from(s as ArrayLike<unknown>).slice(a, b);
  const aligned1: string[] = [];
  const aligned2: string[] = [];
  const pattern: string[] = [];
  let [end1, end2] = [coordinates[0]![0]!, coordinates[1]![0]!];
  if (end1 > 0 || end2 > 0) {
    if (end1 <= end2) {
      for (const c2 of items(seq2, 0, end2 - end1)) {
        const s2 = pyStr(c2);
        const s1 = " ".repeat(s2.length);
        aligned1.push(s1); aligned2.push(s2); pattern.push(s1);
      }
    } else {
      for (const c1 of items(seq1, 0, end1 - end2)) {
        const s1 = pyStr(c1);
        const s2 = " ".repeat(s1.length);
        aligned1.push(s1); aligned2.push(s2); pattern.push(s2);
      }
    }
  }
  let start1 = end1;
  let start2 = end2;
  for (let k = 1; k < coordinates[0]!.length; k++) {
    end1 = coordinates[0]![k]!;
    end2 = coordinates[1]![k]!;
    if (end1 === start1) {
      for (const c2 of items(seq2, start2, end2)) {
        const s2 = pyStr(c2);
        const s1 = "-".repeat(s2.length);
        aligned1.push(s1); aligned2.push(s2); pattern.push(s1);
      }
      start2 = end2;
    } else if (end2 === start2) {
      for (const c1 of items(seq1, start1, end1)) {
        const s1 = pyStr(c1);
        const s2 = "-".repeat(s1.length);
        aligned1.push(s1); aligned2.push(s2); pattern.push(s2);
      }
      start1 = end1;
    } else {
      const t1 = items(seq1, start1, end1);
      const t2 = items(seq2, start2, end2);
      if (t1.length !== t2.length) throw new ValueError("Unequal step sizes in alignment");
      t1.forEach((c1, q) => {
        const c2 = t2[q];
        let s1 = pyStr(c1);
        let s2 = pyStr(c2);
        const m1 = s1.length;
        const m2 = s2.length;
        let p = "|";
        if (c1 !== c2) {
          p = ".";
          if (matrix !== null) {
            const up = (x: unknown): string => {
              if (typeof x !== "string") throw new TypeError(`'${typeof x === "number" ? "int" : typeof x}' object has no attribute 'upper'`);
              return x.toUpperCase();
            };
            if ((matrix.get([up(c1), up(c2)]) as number) > 0) p = ":";
          }
        }
        if (m1 < m2) {
          const space = " ".repeat(m2 - m1);
          s1 += space;
          pattern.push(p.repeat(m1) + space);
        } else if (m1 > m2) {
          const space = " ".repeat(m1 - m2);
          s2 += space;
          pattern.push(p.repeat(m2) + space);
        } else pattern.push(p.repeat(m1));
        aligned1.push(s1);
        aligned2.push(s2);
      });
      start1 = end1;
      start2 = end2;
    }
  }
  return `${aligned1.join(" ")}\n${pattern.join(" ")}\n${aligned2.join(" ")}\n`;
}
