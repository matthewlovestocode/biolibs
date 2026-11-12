/** Column frequencies and substitution counts of an alignment (`Alignment.frequencies`, `Alignment.substitutions`). */

import { ValueError } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import { SubstitutionArray } from "../substitution-matrices/index.js";
import { alignedColumns, allNonNegative, allNonPositive, columnMax, diffRows, select } from "./coords.js";
import { itemsOf, lengthOf, reverseComplementOf, sliceText, unwrap as unwrapSequence } from "./sequence-utils.js";
import type { Alignment } from "./alignment.js";

/** The letters of a sequence as a list of characters (strings, `Seq`, `MutableSeq`, `SeqRecord`). */
function letters(sequence: unknown): string[] {
  const items = itemsOf(sequence);
  return "text" in items ? Array.from(items.text) : (items.list as string[]);
}

/**
 * The frequency of each letter in each alignment column, weighted by each sequence's `annotations["weight"]`
 * (default 1). Gaps are counted under `"-"`.
 *
 * @returns A map from letter to an array with one count per alignment column.
 * @throws {@link ValueError} for inconsistent or unequal steps.
 */
export function frequencies(alignment: Alignment): Map<string, Float64Array> {
  const coordinates = alignment.coordinates!.map((r) => [...r]);
  const sequences = [...alignment.sequences];
  const steps = diffRows(coordinates);
  const aligned = alignedColumns(steps);
  sequences.forEach((sequence, i) => {
    const row = select(steps[i]!, aligned);
    if (allNonNegative(row)) return;
    if (allNonPositive(row)) {
      const len = lengthOf(sequence);
      sequences[i] = reverseComplementOf(sequence);
      coordinates[i] = coordinates[i]!.map((v) => len - v);
      steps[i] = steps[i]!.map((v) => -v);
    } else throw new ValueError(`Inconsistent steps in row ${i}`);
  });
  const gaps = columnMax(steps);
  for (const row of steps) row.forEach((v, k) => { if (!(v === gaps[k] || v <= 0)) throw new ValueError("Unequal step sizes in alignment"); });
  const length = gaps.reduce((a, b) => a + b, 0);
  const counts = new Map<string, Float64Array>();
  const rowFor = (character: string): Float64Array => {
    let row = counts.get(character);
    if (row === undefined) { row = new Float64Array(length); counts.set(character, row); }
    return row;
  };
  for (let i = 0; i < steps.length; i++) {
    const sequence = sequences[i];
    const weight = sequence instanceof SeqRecord ? ((sequence.annotations.get("weight") as number | undefined) ?? 1.0) : 1.0;
    // Python converts each piece to bytes (UTF-8 for `str`), counting one letter per byte.
    const text = "text" in itemsOf(sequence) ? (itemsOf(sequence) as { text: string }).text : null;
    let k = coordinates[i]![0]!;
    let m = 0;
    steps[i]!.forEach((step, q) => {
      if (step > 0) {
        const j = k + step;
        // `str` pieces are encoded to UTF-8 bytes first; only the first `step` bytes are counted (Python's `zip`).
        const raw = unwrapSequence(sequence);
        if (Array.isArray(raw) && !raw.slice(k, j).every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 256)) throw new TypeError("encoding without a string argument");
        const piece = text === null ? Uint8Array.from(letters(sequence).slice(k, j).map((c) => (typeof c === "number" ? c : c.charCodeAt(0)))) : new TextEncoder().encode(sliceText(text, k, j));
        for (let t = 0; t < Math.min(step, piece.length); t++) rowFor(String.fromCharCode(piece[t]!))[m + t]! += weight;
        k = j;
        m += step;
      } else if (step < 0) k += step;
      else {
        const row = rowFor("-");
        for (let t = m; t < m + gaps[q]!; t++) row[t]! += weight;
        m += gaps[q]!;
      }
    });
  }
  return counts;
}

/**
 * The matrix of substitution counts: entry `[a, b]` counts how often letter `a` of one sequence is aligned to
 * letter `b` of a later one, over all pairs of sequences.
 *
 * @throws {@link ValueError} for inconsistent steps or unequal segments.
 */
export function substitutions(alignment: Alignment): SubstitutionArray {
  const coordinates = alignment.coordinates!.map((r) => [...r]);
  const sequences = [...alignment.sequences];
  const steps = diffRows(coordinates);
  const aligned = alignedColumns(steps);
  sequences.forEach((sequence, i) => {
    const row = select(steps[i]!, aligned);
    if (allNonNegative(row)) return;
    if (allNonPositive(row)) {
      sequences[i] = reverseComplementOf(sequence);
      const len = lengthOf(sequence);
      coordinates[i] = coordinates[i]!.map((v) => len - v);
    } else throw new ValueError(`Inconsistent steps in row ${i}`);
  });
  const all = new Set<string>();
  for (const sequence of sequences) for (const c of letters(sequence)) all.add(c);
  const alphabet = [...all].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join("");
  const m = new SubstitutionArray({ alphabet, dims: 2 });
  const n = sequences.length;
  for (let i1 = 0; i1 < n; i1++) {
    const items1 = letters(sequences[i1]);
    for (let i2 = i1 + 1; i2 < n; i2++) {
      const items2 = letters(sequences[i2]);
      let start1 = Number.MAX_SAFE_INTEGER;
      let start2 = Number.MAX_SAFE_INTEGER;
      coordinates[i1]!.forEach((end1, k) => {
        const end2 = coordinates[i2]![k]!;
        if (start1 < end1 && start2 < end2) {
          const seg1 = items1.slice(start1, end1);
          const seg2 = items2.slice(start2, end2);
          if (seg1.length !== seg2.length) throw new ValueError("Unequal step sizes in alignment");
          seg1.forEach((c1, t) => m.set([c1, seg2[t]!], (m.get([c1, seg2[t]!]) as number) + 1.0));
        }
        start1 = end1;
        start2 = end2;
      });
    }
  }
  return m;
}
