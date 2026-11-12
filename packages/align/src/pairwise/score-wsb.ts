/** Score-only Waterman-Smith-Beyer algorithm: arbitrary gap score functions, global and local. */

import type { AlignScore } from "./score-linear.js";
import type { GapFunctions, GapScores } from "./state.js";

/** The most negative score, standing for "impossible" (C's `-DBL_MAX`). */
const NEG = -Number.MAX_VALUE;

/** Convert a gap function's result the way `PyFloat_AsDouble` does. @throws TypeError for a non-number. */
function toDouble(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return Number(value);
  throw new TypeError(`must be real number, not ${value === null ? "NoneType" : typeof value}`);
}

/**
 * The score of an insertion of length `j` at position `i` of a sequence of length `n`: the gap function when set,
 * otherwise the affine score of the left (`i = 0`), right (`i = n`) or internal region.
 */
export function insertionScore(s: GapScores & GapFunctions, i: number, j: number, n: number): number {
  const f = s.insertionScoreFunction;
  if (f) return toDouble(f(i, j));
  if (i === 0) return s.openLeftInsertionScore + (j - 1) * s.extendLeftInsertionScore;
  if (i === n) return s.openRightInsertionScore + (j - 1) * s.extendRightInsertionScore;
  return s.openInternalInsertionScore + (j - 1) * s.extendInternalInsertionScore;
}

/** Like {@link insertionScore}, for deletions. */
export function deletionScore(s: GapScores & GapFunctions, i: number, j: number, n: number): number {
  const f = s.deletionScoreFunction;
  if (f) return toDouble(f(i, j));
  if (i === 0) return s.openLeftDeletionScore + (j - 1) * s.extendLeftDeletionScore;
  if (i === n) return s.openRightDeletionScore + (j - 1) * s.extendRightDeletionScore;
  return s.openInternalDeletionScore + (j - 1) * s.extendInternalDeletionScore;
}

/** Allocate the three (nA+1) x (nB+1) score matrices. */
function matrices(nA: number, nB: number): Float64Array[][] {
  const make = (): Float64Array[] => Array.from({ length: nA + 1 }, () => new Float64Array(nB + 1));
  return [make(), make(), make()];
}

/** The largest of three scores in Biopython's comparison order. */
function best3(a: number, b: number, c: number): number {
  let score = a;
  if (b > score) score = b;
  if (c > score) score = c;
  return score;
}

/**
 * Waterman-Smith-Beyer global score. On the minus strand the query-side gap position is mirrored (`nB - j`),
 * which swaps the left and right end scores for deletions.
 */
export function watermanSmithBeyerGlobalScore(s: GapScores & GapFunctions, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): number {
  const nA = sA.length;
  const nB = sB.length;
  const [M, Ix, Iy] = matrices(nA, nB) as [Float64Array[], Float64Array[], Float64Array[]];
  // `query_gap_start` is j for "+" and nB - j for "-", evaluated where C evaluates it.
  const start = (j: number): number => (strand === "-" ? nB - j : j);
  let j = 0;
  M[0]![0] = 0;
  Ix[0]![0] = NEG;
  Iy[0]![0] = NEG;
  for (let i = 1; i <= nA; i++) {
    M[i]![0] = NEG;
    Iy[i]![0] = NEG;
    Ix[i]![0] = deletionScore(s, start(j), i, nB);
  }
  for (j = 1; j <= nB; j++) {
    M[0]![j] = NEG;
    Ix[0]![j] = NEG;
    Iy[0]![j] = insertionScore(s, 0, j, nA);
  }
  let score = 0;
  for (let i = 1; i <= nA; i++) {
    const kA = sA[i - 1]!;
    for (j = 1; j <= nB; j++) {
      const kB = sB[j - 1]!;
      score = best3(M[i - 1]![j - 1]!, Ix[i - 1]![j - 1]!, Iy[i - 1]![j - 1]!);
      M[i]![j] = score + align(kA, kB);
      score = NEG;
      for (let k = 1; k <= i; k++) {
        const gap = deletionScore(s, start(j), k, nB);
        let temp = M[i - k]![j]! + gap;
        if (temp > score) score = temp;
        temp = Iy[i - k]![j]! + gap;
        if (temp > score) score = temp;
      }
      Ix[i]![j] = score;
      score = NEG;
      for (let k = 1; k <= j; k++) {
        const gap = insertionScore(s, i, k, nA);
        let temp = M[i]![j - k]! + gap;
        if (temp > score) score = temp;
        temp = Ix[i]![j - k]! + gap;
        if (temp > score) score = temp;
      }
      Iy[i]![j] = score;
    }
  }
  return best3(M[nA]![nB]!, Ix[nA]![nB]!, Iy[nA]![nB]!);
}

/** Waterman-Smith-Beyer local score (never below zero). */
export function watermanSmithBeyerLocalScore(s: GapScores & GapFunctions, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): number {
  const nA = sA.length;
  const nB = sB.length;
  const [M, Ix, Iy] = matrices(nA, nB) as [Float64Array[], Float64Array[], Float64Array[]];
  const start = (j: number): number => (strand === "-" ? nB - j : j);
  let maximum = 0.0;
  M[0]![0] = 0;
  Ix[0]![0] = NEG;
  Iy[0]![0] = NEG;
  for (let i = 1; i <= nA; i++) {
    M[i]![0] = NEG;
    Ix[i]![0] = 0;
    Iy[i]![0] = NEG;
  }
  for (let j = 1; j <= nB; j++) {
    M[0]![j] = NEG;
    Ix[0]![j] = NEG;
    Iy[0]![j] = 0;
  }
  let score = 0;
  for (let i = 1; i <= nA; i++) {
    const kA = sA[i - 1]!;
    for (let j = 1; j <= nB; j++) {
      const kB = sB[j - 1]!;
      score = best3(M[i - 1]![j - 1]!, Ix[i - 1]![j - 1]!, Iy[i - 1]![j - 1]!);
      score += align(kA, kB);
      if (score < 0) score = 0;
      else if (score > maximum) maximum = score;
      M[i]![j] = score;
      if (i === nA || j === nB) {
        Ix[i]![j] = 0;
        Iy[i]![j] = 0;
        continue;
      }
      score = 0.0;
      for (let k = 1; k <= i; k++) {
        const gap = deletionScore(s, start(j), k, nB);
        let temp = M[i - k]![j]! + gap;
        if (temp > score) score = temp;
        temp = Iy[i - k]![j]! + gap;
        if (temp > score) score = temp;
      }
      if (score > maximum) maximum = score;
      Ix[i]![j] = score;
      score = 0.0;
      for (let k = 1; k <= j; k++) {
        const gap = insertionScore(s, i, k, nA);
        let temp = M[i]![j - k]! + gap;
        if (temp > score) score = temp;
        temp = Ix[i]![j - k]! + gap;
        if (temp > score) score = temp;
      }
      if (score > maximum) maximum = score;
      Iy[i]![j] = score;
    }
  }
  score = best3(M[nA]![nB]!, Ix[nA]![nB]!, Iy[nA]![nB]!);
  if (score > maximum) maximum = score;
  return maximum;
}
