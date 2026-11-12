/** `Alignment.counts`: count identities, mismatches and gaps over every pair of sequences of an alignment. */

import { ValueError, pyRepr } from "@biolibs/core";
import { MutableSeq, Seq, UndefinedSequenceError } from "@biolibs/seq";
import type { GapScoreFunction } from "../pairwise/gap-properties.js";
import type { GapFunctions, GapScores } from "../pairwise/state.js";
import { SubstitutionArray } from "../substitution-matrices/index.js";
import { AlignmentCounts } from "./alignment-counts.js";
import { alignedColumns, diffRows, select } from "./coords.js";
import { lengthOf, reverseComplementOf, unwrap } from "./sequence-utils.js";
import type { Alignment } from "./alignment.js";

/** The parts of a `PairwiseAligner` that counting uses (the class itself is not imported, to avoid a cycle). */
export interface CountingAligner {
  /** The substitution matrix, or null. */
  substitutionMatrix: SubstitutionArray | null;
  /** The wildcard letter, or null. */
  wildcard: string | null;
  /** Match score (null while a substitution matrix is set). */
  matchScore: number | null;
  /** Mismatch score (null while a substitution matrix is set). */
  mismatchScore: number | null;
  /** The gap scores and gap functions. */
  gaps: GapScores & GapFunctions;
}

/** What `counts` accepts: an aligner, a wildcard letter, a substitution matrix, or nothing. */
export type CountScoring = CountingAligner | SubstitutionArray | string | null;

/** The letters of one sequence as numbers: code points, bytes (signed, like C's `char`), or alphabet indices. */
type Row = { data: ArrayLike<number> } | null;

const HORIZONTAL = 1;
const VERTICAL = 2;
const DIAGONAL = 4;

/** Convert one sequence to the numeric row the counting loop reads. */
function toRow(sequence: unknown, matrix: SubstitutionArray | null, alphabet: unknown[]): Row {
  const data = unwrap(sequence);
  if (data === null || data === undefined) return null;
  if (typeof data === "string") return { data: Array.from(data, (c) => c.codePointAt(0)!) };
  if (data instanceof Seq || data instanceof MutableSeq) {
    try {
      return { data: Array.from(data.toBytes(), (b) => (b > 127 ? b - 256 : b)) };
    } catch (e) {
      if (e instanceof UndefinedSequenceError) return null; // letters are unknown: nothing to compare
      throw e;
    }
  }
  if (data instanceof Uint8Array) return { data: Array.from(data, (b) => (b > 127 ? b - 256 : b)) };
  if (data instanceof Int32Array) return { data };
  const items = Array.from(data as Iterable<unknown>);
  if (matrix === null) {
    for (const item of items) if (!alphabet.some((letter) => letter === item)) alphabet.push(item);
    return { data: items.map((item) => alphabet.findIndex((letter) => letter === item)) };
  }
  const letters = matrix.alphabet;
  return { data: items.map((item) => {
    const i = typeof letters === "string" ? (typeof item === "string" ? letters.indexOf(item) : -1) : letters.indexOf(item as string);
    if (i < 0) throw new ValueError(typeof letters === "string" ? "substring not found" : "tuple.index(x): x not in tuple");
    return i;
  }) };
}

/**
 * Count identities, mismatches and gaps of `alignment` for each pair of sequences.
 *
 * @param scoring - An aligner (its matrix, wildcard and gap scores are used, and the total score is computed), a
 *   single wildcard letter, a substitution matrix, or null.
 * @throws {@link ValueError} for an unexpected argument, inconsistent coordinates, or letters missing from the matrix.
 */
export function countAlignment(alignment: Alignment, scoring: CountScoring = null): AlignmentCounts {
  let aligner: CountingAligner | null = null;
  let wildcard = -1;
  let wildcardText: string | null = null;
  let matrix: SubstitutionArray | null = null;
  if (scoring === null) { /* defaults */ }
  else if (typeof scoring === "string") wildcardText = scoring;
  else if (scoring instanceof SubstitutionArray) matrix = scoring;
  else if (typeof scoring === "object" && "gaps" in scoring) {
    aligner = scoring;
    matrix = aligner.substitutionMatrix;
    wildcard = aligner.wildcard === null ? -1 : aligner.wildcard.codePointAt(0)!;
  } else throw new ValueError(`unexpected argument ${pyRepr(scoring)}`);
  const alphabet: unknown[] = [];
  const n = alignment.sequences.length;
  const coordinates = alignment.coordinates!.map((r) => [...r]);
  const strands = new Array<boolean>(n).fill(false);
  const steps = diffRows(coordinates);
  const aligned = alignedColumns(steps);
  const rows: Row[] = alignment.sequences.map((sequence, i) => {
    const as = select(steps[i]!, aligned);
    if (as.filter((v) => v > 0).length < as.filter((v) => v < 0).length) {
      sequence = reverseComplementOf(sequence);
      const len = lengthOf(sequence);
      coordinates[i] = coordinates[i]!.map((v) => len - v);
      strands[i] = true;
    }
    return toRow(sequence, matrix, alphabet);
  });

  // The C code validates its argument only after the sequences have been converted.
  if (wildcardText !== null) {
    const chars = Array.from(wildcardText);
    if (chars.length !== 1) throw new ValueError("wildcard should be a single character, or None");
    wildcard = chars[0]!.codePointAt(0)!;
  }
  if (matrix !== null && matrix.ndim !== 2) throw new ValueError(`substitution matrix has incorrect rank (${matrix.ndim} expected 2)`);

  // Letter lookup in the matrix: indices must be in range, and a string alphabet maps code points to rows.
  let m = matrix?.shape[0] ?? 0;
  let mapping: Map<number, number> | null = null;
  if (matrix !== null && typeof matrix.alphabet === "string") {
    const widest = Math.max(0, ...Array.from(matrix.alphabet, (c) => c.codePointAt(0)!));
    m = widest < 256 ? 256 : widest < 65536 ? 65536 : 0x110000;
    mapping = new Map(Array.from(matrix.alphabet, (c, i) => [c.codePointAt(0)!, i]));
  }
  const checkIndex = (c: number, j: number, l: number): void => {
    if (c < 0) throw new ValueError(`sequences[${j}][${l}] is negative (${c})`);
    if (c >= m) throw new ValueError(`sequence[${j}][${l}] is out of bound (${c}, should be < ${m})`);
  };

  const raw = {
    openLeftInsertions: 0, extendLeftInsertions: 0, openLeftDeletions: 0, extendLeftDeletions: 0,
    openInternalInsertions: 0, extendInternalInsertions: 0, openInternalDeletions: 0, extendInternalDeletions: 0,
    openRightInsertions: 0, extendRightInsertions: 0, openRightDeletions: 0, extendRightDeletions: 0,
    aligned: 0, identities: 0, mismatches: 0, positives: matrix ? 0 : -1, gapScore: 0.0, substitutionScore: 0.0,
  };
  const insertionFn: GapScoreFunction | null = aligner?.gaps.insertionScoreFunction ?? null;
  const deletionFn: GapScoreFunction | null = aligner?.gaps.deletionScoreFunction ?? null;
  let path = 0; // carried over from pair to pair, as in the C code

  /** Record one gap of `gapsize` letters: an extension of the open gap, or a new gap (scored by the function, if any). */
  const addGaps = (direction: number, strand: boolean, fn: GapScoreFunction | null, start: number, end: number, left: number, right: number, gapsize: number, kind: "Insertions" | "Deletions"): void => {
    const region = start === left ? "Left" : end === right ? "Right" : "Internal";
    const extend = `extend${region}${kind}` as keyof typeof raw;
    const open = `open${region}${kind}` as keyof typeof raw;
    if (path === direction) raw[extend] += gapsize;
    else {
      raw[open] += 1;
      raw[extend] += gapsize - 1;
      if (fn) {
        const value = fn(strand ? right - start : start, gapsize) as unknown;
        if (typeof value !== "number" && typeof value !== "boolean") throw new TypeError(`must be real number, not ${value === null ? "NoneType" : typeof value}`);
        raw.gapScore += Number(value);
      }
      path = direction;
    }
  };

  for (let jA = 0; jA < n; jA++) {
    for (let jB = jA + 1; jB < n; jB++) {
      const rowA = coordinates[jA]!;
      const rowB = coordinates[jB]!;
      const leftA = rowA[0]!;
      const leftB = rowB[0]!;
      const rightA = rowA[rowA.length - 1]!;
      const rightB = rowB[rowB.length - 1]!;
      let startA = leftA;
      let startB = leftB;
      for (let k = 1; k < rowA.length; k++) {
        const endA = rowA[k]!;
        const endB = rowB[k]!;
        if (startA === endA && startB === endB) { /* nothing moves */ }
        else if (startA === endA) addGaps(HORIZONTAL, strands[jA]!, insertionFn, startA, endA, leftA, rightA, endB - startB, "Insertions");
        else if (startB === endB) addGaps(VERTICAL, strands[jB]!, deletionFn, startB, endB, leftB, rightB, endA - startA, "Deletions");
        else if (rows[jA] === null || rows[jB] === null) {
          path = DIAGONAL;
          raw.aligned += endA - startA;
        } else {
          path = DIAGONAL;
          raw.aligned += endA - startA;
          const a = rows[jA]!.data;
          const b = rows[jB]!.data;
          for (let lA = startA, lB = startB; lA < endA && lB < endB; lA++, lB++) {
            let cA = a[lA]!;
            let cB = b[lB]!;
            if (matrix === null) {
              if (cA === wildcard || cB === wildcard) continue;
              if (cA === cB) raw.identities++;
              else raw.mismatches++;
              continue;
            }
            checkIndex(cA, jA, lA);
            checkIndex(cB, jB, lB);
            if (mapping !== null) {
              const mA = mapping.get(cA);
              const mB = mapping.get(cB);
              if (mA === undefined || mB === undefined) throw new ValueError("sequence contains letters not in the alphabet");
              cA = mA;
              cB = mB;
            }
            const value = matrix.data[cA * matrix.shape[0]! + cB]!;
            if (cA === cB) raw.identities++;
            else raw.mismatches++;
            if (value > 0) raw.positives++;
            raw.substitutionScore += value;
          }
        }
        startA = endA;
        startB = endB;
      }
    }
  }
  if (matrix === null) raw.substitutionScore = aligner ? (aligner.matchScore ?? 0) * raw.identities + (aligner.mismatchScore ?? 0) * raw.mismatches : NaN;
  if (aligner) {
    const g = aligner.gaps;
    if (insertionFn === null) {
      raw.gapScore += raw.openLeftInsertions * g.openLeftInsertionScore + raw.extendLeftInsertions * g.extendLeftInsertionScore
        + raw.openInternalInsertions * g.openInternalInsertionScore + raw.extendInternalInsertions * g.extendInternalInsertionScore
        + raw.openRightInsertions * g.openRightInsertionScore + raw.extendRightInsertions * g.extendRightInsertionScore;
    }
    if (deletionFn === null) {
      raw.gapScore += raw.openLeftDeletions * g.openLeftDeletionScore + raw.extendLeftDeletions * g.extendLeftDeletionScore
        + raw.openInternalDeletions * g.openInternalDeletionScore + raw.extendInternalDeletions * g.extendInternalDeletionScore
        + raw.openRightDeletions * g.openRightDeletionScore + raw.extendRightDeletions * g.extendRightDeletionScore;
    }
  } else raw.gapScore = NaN;
  return new AlignmentCounts(raw);
}
