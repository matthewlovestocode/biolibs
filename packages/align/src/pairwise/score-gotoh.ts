/** Score-only Gotoh algorithm (affine gaps), global and local. */

import type { AlignScore } from "./score-linear.js";
import type { GapScores } from "./state.js";

/** The most negative score, standing for "impossible" (C's `-DBL_MAX`). */
const NEG = -Number.MAX_VALUE;

/** The largest of three scores in Biopython's comparison order. */
function best3(a: number, b: number, c: number): number {
  let score = a;
  if (b > score) score = b;
  if (c > score) score = c;
  return score;
}

/**
 * Gotoh global alignment score with three states (match, gap in A, gap in B). End gaps use the left and right
 * open and extend scores; `strand` `"-"` exchanges left and right.
 */
export function gotohGlobalScore(s: GapScores, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): number {
  const nA = sA.length;
  const nB = sB.length;
  const gapOpenA = s.openInternalInsertionScore;
  const gapOpenB = s.openInternalDeletionScore;
  const gapExtendA = s.extendInternalInsertionScore;
  const gapExtendB = s.extendInternalDeletionScore;
  const minus = strand === "-";
  const leftOpenA = minus ? s.openRightInsertionScore : s.openLeftInsertionScore;
  const leftOpenB = minus ? s.openRightDeletionScore : s.openLeftDeletionScore;
  const leftExtendA = minus ? s.extendRightInsertionScore : s.extendLeftInsertionScore;
  const leftExtendB = minus ? s.extendRightDeletionScore : s.extendLeftDeletionScore;
  const rightOpenA = minus ? s.openLeftInsertionScore : s.openRightInsertionScore;
  const rightOpenB = minus ? s.openLeftDeletionScore : s.openRightDeletionScore;
  const rightExtendA = minus ? s.extendLeftInsertionScore : s.extendRightInsertionScore;
  const rightExtendB = minus ? s.extendLeftDeletionScore : s.extendRightDeletionScore;
  const M = new Float64Array(nB + 1);
  const Ix = new Float64Array(nB + 1);
  const Iy = new Float64Array(nB + 1);
  let score = 0;
  M[0] = 0;
  Ix[0] = NEG;
  Iy[0] = NEG;
  for (let j = 1; j <= nB; j++) {
    M[j] = NEG;
    Ix[j] = NEG;
    Iy[j] = leftOpenA + leftExtendA * (j - 1);
  }
  let Mt: number;
  let Ixt: number;
  let Iyt: number;
  for (let i = 1; i < nA; i++) {
    Mt = M[0]!;
    Ixt = Ix[0]!;
    Iyt = Iy[0]!;
    M[0] = NEG;
    Ix[0] = leftOpenB + leftExtendB * (i - 1);
    Iy[0] = NEG;
    const kA = sA[i - 1]!;
    for (let j = 1; j < nB; j++) {
      const kB = sB[j - 1]!;
      score = best3(Mt, Ixt, Iyt);
      Mt = M[j]!;
      M[j] = score + align(kA, kB);
      score = best3(Mt + gapOpenB, Ix[j]! + gapExtendB, Iy[j]! + gapOpenB);
      Ixt = Ix[j]!;
      Ix[j] = score;
      score = best3(M[j - 1]! + gapOpenA, Ix[j - 1]! + gapOpenA, Iy[j - 1]! + gapExtendA);
      Iyt = Iy[j]!;
      Iy[j] = score;
    }
    const kB = sB[nB - 1]!;
    score = best3(Mt, Ixt, Iyt);
    Mt = M[nB]!;
    M[nB] = score + align(kA, kB);
    score = best3(Mt + rightOpenB, Ix[nB]! + rightExtendB, Iy[nB]! + rightOpenB);
    Ix[nB] = score;
    score = best3(M[nB - 1]! + gapOpenA, Iy[nB - 1]! + gapExtendA, Ix[nB - 1]! + gapOpenA);
    Iy[nB] = score;
  }
  // The last row: `i` is nA here in C, so the left end gap is open + extend * (nA - 1).
  Mt = M[0]!;
  Ixt = Ix[0]!;
  Iyt = Iy[0]!;
  M[0] = NEG;
  Ix[0] = leftOpenB + leftExtendB * (Math.max(nA, 1) - 1);
  Iy[0] = NEG;
  const kA = sA[nA - 1]!;
  for (let j = 1; j < nB; j++) {
    const kB = sB[j - 1]!;
    score = best3(Mt, Ixt, Iyt);
    Mt = M[j]!;
    M[j] = score + align(kA, kB);
    score = best3(Mt + gapOpenB, Ix[j]! + gapExtendB, Iy[j]! + gapOpenB);
    Ixt = Ix[j]!;
    Ix[j] = score;
    score = best3(M[j - 1]! + rightOpenA, Iy[j - 1]! + rightExtendA, Ix[j - 1]! + rightOpenA);
    Iyt = Iy[j]!;
    Iy[j] = score;
  }
  const kB = sB[nB - 1]!;
  score = best3(Mt, Ixt, Iyt);
  Mt = M[nB]!;
  M[nB] = score + align(kA, kB);
  score = best3(Mt + rightOpenB, Ix[nB]! + rightExtendB, Iy[nB]! + rightOpenB);
  Ixt = Ix[nB]!;
  Ix[nB] = score;
  score = best3(M[nB - 1]! + rightOpenA, Ix[nB - 1]! + rightOpenA, Iy[nB - 1]! + rightExtendA);
  Iyt = Iy[nB]!;
  Iy[nB] = score;
  return best3(M[nB]!, Ix[nB]!, Iy[nB]!);
}

/** Gotoh local alignment score (never below zero). */
export function gotohLocalScore(s: GapScores, sA: Int32Array, sB: Int32Array, align: AlignScore): number {
  const nA = sA.length;
  const nB = sB.length;
  const gapOpenA = s.openInternalInsertionScore;
  const gapOpenB = s.openInternalDeletionScore;
  const gapExtendA = s.extendInternalInsertionScore;
  const gapExtendB = s.extendInternalDeletionScore;
  const M = new Float64Array(nB + 1);
  const Ix = new Float64Array(nB + 1);
  const Iy = new Float64Array(nB + 1);
  let maximum = 0.0;
  let score = 0;
  /** `SELECT_SCORE_LOCAL3`: clamp at zero, track the maximum. */
  const local = (v: number): number => {
    if (v < 0) return 0;
    if (v > maximum) maximum = v;
    return v;
  };
  /** `SELECT_SCORE_GOTOH_LOCAL_ALIGN`: best incoming state plus the match score, clamped. */
  const localAlign = (a: number, b: number, c: number, add: number): number => local(best3(a, b, c) + add);
  M[0] = 0;
  Ix[0] = NEG;
  Iy[0] = NEG;
  for (let j = 1; j <= nB; j++) {
    M[j] = NEG;
    Ix[j] = NEG;
    Iy[j] = 0;
  }
  let Mt: number;
  let Ixt: number;
  let Iyt: number;
  for (let i = 1; i < nA; i++) {
    Mt = M[0]!;
    Ixt = Ix[0]!;
    Iyt = Iy[0]!;
    M[0] = NEG;
    Ix[0] = 0;
    Iy[0] = NEG;
    const kA = sA[i - 1]!;
    for (let j = 1; j < nB; j++) {
      const kB = sB[j - 1]!;
      score = localAlign(Mt, Ixt, Iyt, align(kA, kB));
      Mt = M[j]!;
      M[j] = score;
      score = local(best3(Mt + gapOpenB, Ix[j]! + gapExtendB, Iy[j]! + gapOpenB));
      Ixt = Ix[j]!;
      Ix[j] = score;
      score = local(best3(M[j - 1]! + gapOpenA, Ix[j - 1]! + gapOpenA, Iy[j - 1]! + gapExtendA));
      Iyt = Iy[j]!;
      Iy[j] = score;
    }
    const kB = sB[nB - 1]!;
    Ix[nB] = 0;
    Iy[nB] = 0;
    score = localAlign(Mt, Ixt, Iyt, align(kA, kB));
    Mt = M[nB]!;
    M[nB] = score;
  }
  Mt = M[0]!;
  Ixt = Ix[0]!;
  Iyt = Iy[0]!;
  M[0] = NEG;
  Ix[0] = 0;
  Iy[0] = NEG;
  const kA = sA[nA - 1]!;
  for (let j = 1; j < nB; j++) {
    const kB = sB[j - 1]!;
    score = localAlign(Mt, Ixt, Iyt, align(kA, kB));
    Mt = M[j]!;
    M[j] = score;
    Ixt = Ix[j]!;
    Iyt = Iy[j]!;
    Ix[j] = 0;
    Iy[j] = 0;
  }
  localAlign(Mt, Ixt, Iyt, align(kA, sB[nB - 1]!));
  return maximum;
}
