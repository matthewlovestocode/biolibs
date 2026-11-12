/** Score-only Needleman-Wunsch (global) and Smith-Waterman (local) for linear gap scores. */

import type { GapScores } from "./state.js";

/** Scores a pair of letter indices. */
export type AlignScore = (kA: number, kB: number) => number;

/** The largest of three scores, evaluated in Biopython's order (`SELECT_SCORE_GLOBAL`). */
function best3(a: number, b: number, c: number): number {
  let score = a;
  if (b > score) score = b;
  if (c > score) score = c;
  return score;
}

/**
 * Needleman-Wunsch global alignment score. The first and last rows and columns use the left and right (end) gap
 * scores; the strand swaps which end is which.
 *
 * @param strand - `"+"` or `"-"`: on the minus strand the left and right end scores are exchanged.
 */
export function needlemanWunschScore(s: GapScores, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): number {
  const nA = sA.length;
  const nB = sB.length;
  const gapExtendA = s.extendInternalInsertionScore;
  const gapExtendB = s.extendInternalDeletionScore;
  const minus = strand === "-";
  const leftA = minus ? s.extendRightInsertionScore : s.extendLeftInsertionScore;
  const rightA = minus ? s.extendLeftInsertionScore : s.extendRightInsertionScore;
  const leftB = minus ? s.extendRightDeletionScore : s.extendLeftDeletionScore;
  const rightB = minus ? s.extendLeftDeletionScore : s.extendRightDeletionScore;
  const row = new Float64Array(nB + 1);
  row[0] = 0.0;
  for (let j = 1; j <= nB; j++) row[j] = j * leftA;
  let score = 0;
  let temp: number;
  for (let i = 1; i < nA; i++) {
    const kA = sA[i - 1]!;
    temp = row[0]!;
    row[0] = i * leftB;
    for (let j = 1; j < nB; j++) {
      const kB = sB[j - 1]!;
      score = best3(temp + align(kA, kB), row[j]! + gapExtendB, row[j - 1]! + gapExtendA);
      temp = row[j]!;
      row[j] = score;
    }
    const kB = sB[nB - 1]!;
    score = best3(temp + align(kA, kB), row[nB]! + rightB, row[nB - 1]! + gapExtendA);
    temp = row[nB]!;
    row[nB] = score;
  }
  const kA = sA[nA - 1]!;
  temp = row[0]!;
  row[0] = nA * rightB;
  for (let j = 1; j < nB; j++) {
    const kB = sB[j - 1]!;
    score = best3(temp + align(kA, kB), row[j]! + gapExtendB, row[j - 1]! + rightA);
    temp = row[j]!;
    row[j] = score;
  }
  const kB = sB[nB - 1]!;
  score = best3(temp + align(kA, kB), row[nB]! + rightB, row[nB - 1]! + rightA);
  return score;
}

/** Smith-Waterman local alignment score (the best-scoring local segment; never below zero). */
export function smithWatermanScore(s: GapScores, sA: Int32Array, sB: Int32Array, align: AlignScore): number {
  const nA = sA.length;
  const nB = sB.length;
  const gapExtendA = s.extendInternalInsertionScore;
  const gapExtendB = s.extendInternalDeletionScore;
  const row = new Float64Array(nB + 1);
  let maximum = 0;
  let score = 0;
  let temp: number;
  /** `SELECT_SCORE_LOCAL`: clamp at zero and track the maximum. */
  const local = (v: number): number => {
    if (v < 0) return 0;
    if (v > maximum) maximum = v;
    return v;
  };
  for (let i = 1; i < nA; i++) {
    const kA = sA[i - 1]!;
    temp = 0;
    for (let j = 1; j < nB; j++) {
      const kB = sB[j - 1]!;
      score = local(best3(temp + align(kA, kB), row[j]! + gapExtendB, row[j - 1]! + gapExtendA));
      temp = row[j]!;
      row[j] = score;
    }
    const kB = sB[nB - 1]!;
    score = local(temp + align(kA, kB));
    temp = row[nB]!;
    row[nB] = score;
  }
  const kA = sA[nA - 1]!;
  temp = 0;
  for (let j = 1; j < nB; j++) {
    const kB = sB[j - 1]!;
    score = local(temp + align(kA, kB));
    temp = row[j]!;
    row[j] = score;
  }
  local(temp + align(kA, sB[nB - 1]!));
  return maximum;
}
