/** The Gotoh algorithm with traceback: fill the three-state trace matrices and return the path generator. */

import { GotohPathGenerator } from "./path-gotoh.js";
import type { AlignResult } from "./align-linear.js";
import type { AlignScore } from "./score-linear.js";
import type { GapScores } from "./state.js";
import { ENDPOINT, Iy_MATRIX, Ix_MATRIX, M_MATRIX, STARTPOINT, TraceMatrix, DONE } from "./trace.js";

/** The most negative score, standing for "impossible" (C's `-DBL_MAX`). */
const NEG = -Number.MAX_VALUE;

/**
 * Gotoh global alignment with traceback. The scores follow {@link gotohGlobalScore}; each cell records which
 * previous states tie (within `epsilon`) for the best score.
 */
export function gotohGlobalAlign(s: GapScores, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): AlignResult<GotohPathGenerator> {
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

  const M = new TraceMatrix(nA, nB);
  const paths = new GotohPathGenerator(M, nA, nB, "global", strand);
  // Initial traces (PathGenerator_create_Gotoh, global): the first column is a run of Ix, the first row of Iy.
  for (let i = 0; i <= nA; i++) M.trace[M.at(i, 0)] = 0;
  paths.gapsIx[M.at(0, 0)] = 0;
  paths.gapsIy[M.at(0, 0)] = 0;
  for (let i = 1; i <= nA; i++) {
    paths.gapsIx[M.at(i, 0)] = Ix_MATRIX;
    paths.gapsIy[M.at(i, 0)] = 0;
  }
  paths.gapsIx[M.at(1, 0)] = M_MATRIX;
  for (let i = 1; i <= nB; i++) {
    M.trace[M.at(0, i)] = 0;
    paths.gapsIx[M.at(0, i)] = 0;
    paths.gapsIy[M.at(0, i)] = Iy_MATRIX;
  }
  paths.gapsIy[M.at(0, 1)] = M_MATRIX;
  M.path[0] = 0;

  const Mr = new Float64Array(nB + 1);
  const Ixr = new Float64Array(nB + 1);
  const Iyr = new Float64Array(nB + 1);
  let score = 0;
  let temp = 0;
  let Mt: number;
  let Ixt: number;
  let Iyt: number;
  let trace = 0;
  Mr[0] = 0;
  Ixr[0] = NEG;
  Iyr[0] = NEG;
  for (let j = 1; j <= nB; j++) {
    Mr[j] = NEG;
    Ixr[j] = NEG;
    Iyr[j] = leftOpenA + leftExtendA * (j - 1);
  }
  /** `SELECT_TRACE_GOTOH_GLOBAL_ALIGN`: which of M, Ix, Iy precede this match cell. */
  const selectAlign = (i: number, j: number): void => {
    trace = M_MATRIX;
    score = Mt;
    temp = Ixt;
    if (temp > score + epsilon) { score = Ixt; trace = Ix_MATRIX; }
    else if (temp > score - epsilon) trace |= Ix_MATRIX;
    temp = Iyt;
    if (temp > score + epsilon) { score = temp; trace = Iy_MATRIX; }
    else if (temp > score - epsilon) trace |= Iy_MATRIX;
    M.trace[M.at(i, j)] = trace;
  };
  /** `SELECT_TRACE_GOTOH_GLOBAL_GAP`: the three ways into a gap state, recorded in `gaps`. */
  const selectGap = (gaps: Uint8Array, i: number, j: number, s1: number, s2: number, s3: number): void => {
    trace = M_MATRIX;
    score = s1;
    temp = s2;
    if (temp > score + epsilon) { score = temp; trace = Ix_MATRIX; }
    else if (temp > score - epsilon) trace |= Ix_MATRIX;
    temp = s3;
    if (temp > score + epsilon) { score = temp; trace = Iy_MATRIX; }
    else if (temp > score - epsilon) trace |= Iy_MATRIX;
    gaps[M.at(i, j)] = trace;
  };
  const { gapsIx, gapsIy } = paths;
  /** One interior cell of a row, for a given choice of the horizontal end-gap scores. */
  const cell = (i: number, j: number, kA: number, kB: number, openB: number, extendB: number, openA: number, extendA: number): void => {
    selectAlign(i, j);
    Mt = Mr[j]!;
    Mr[j] = score + align(kA, kB);
    selectGap(gapsIx, i, j, Mt + openB, Ixr[j]! + extendB, Iyr[j]! + openB);
    Ixt = Ixr[j]!;
    Ixr[j] = score;
    selectGap(gapsIy, i, j, Mr[j - 1]! + openA, Ixr[j - 1]! + openA, Iyr[j - 1]! + extendA);
    Iyt = Iyr[j]!;
    Iyr[j] = score;
  };
  for (let i = 1; i < nA; i++) {
    const kA = sA[i - 1]!;
    Mt = Mr[0]!;
    Ixt = Ixr[0]!;
    Iyt = Iyr[0]!;
    Mr[0] = NEG;
    Ixr[0] = leftOpenB + leftExtendB * (i - 1);
    Iyr[0] = NEG;
    for (let j = 1; j < nB; j++) cell(i, j, kA, sB[j - 1]!, gapOpenB, gapExtendB, gapOpenA, gapExtendA);
    // Last column of a middle row: the vertical gap uses the right end scores.
    const kB = sB[nB - 1]!;
    selectAlign(i, nB);
    Mt = Mr[nB]!;
    Mr[nB] = score + align(kA, kB);
    selectGap(gapsIx, i, nB, Mt + rightOpenB, Ixr[nB]! + rightExtendB, Iyr[nB]! + rightOpenB);
    Ixt = Ixr[nB]!;
    Ixr[nB] = score;
    selectGap(gapsIy, i, nB, Mr[nB - 1]! + gapOpenA, Ixr[nB - 1]! + gapOpenA, Iyr[nB - 1]! + gapExtendA);
    Iyt = Iyr[nB]!;
    Iyr[nB] = score;
  }
  // The last row.
  const kA = sA[nA - 1]!;
  Mt = Mr[0]!;
  Ixt = Ixr[0]!;
  Iyt = Iyr[0]!;
  Mr[0] = NEG;
  Ixr[0] = leftOpenB + leftExtendB * (nA - 1);
  Iyr[0] = NEG;
  for (let j = 1; j < nB; j++) cell(nA, j, kA, sB[j - 1]!, gapOpenB, gapExtendB, rightOpenA, rightExtendA);
  const kB = sB[nB - 1]!;
  selectAlign(nA, nB);
  Mt = Mr[nB]!;
  Mr[nB] = score + align(kA, kB);
  selectGap(gapsIx, nA, nB, Mt + rightOpenB, Ixr[nB]! + rightExtendB, Iyr[nB]! + rightOpenB);
  Ixr[nB] = score;
  selectGap(gapsIy, nA, nB, Mr[nB - 1]! + rightOpenA, Ixr[nB - 1]! + rightOpenA, Iyr[nB - 1]! + rightExtendA);
  Iyr[nB] = score;
  M.path[M.at(nA, nB)] = 0;

  // Traceback: keep only the end states within epsilon of the best.
  score = Mr[nB]!;
  if (Ixr[nB]! > score) score = Ixr[nB]!;
  if (Iyr[nB]! > score) score = Iyr[nB]!;
  if (Mr[nB]! < score - epsilon) M.trace[M.at(nA, nB)] = 0;
  if (Ixr[nB]! < score - epsilon) gapsIx[M.at(nA, nB)] = 0;
  if (Iyr[nB]! < score - epsilon) gapsIy[M.at(nA, nB)] = 0;
  return { score, paths };
}

/**
 * Gotoh local alignment with traceback. Start and end points are recorded per cell, and unreachable states are
 * pruned in a final pass (using `path` as a per-state "reachable from a start point" flag).
 */
export function gotohLocalAlign(s: GapScores, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): AlignResult<GotohPathGenerator> {
  const nA = sA.length;
  const nB = sB.length;
  const gapOpenA = s.openInternalInsertionScore;
  const gapOpenB = s.openInternalDeletionScore;
  const gapExtendA = s.extendInternalInsertionScore;
  const gapExtendB = s.extendInternalDeletionScore;
  const M = new TraceMatrix(nA, nB);
  const paths = new GotohPathGenerator(M, nA, nB, "local", strand);
  const { gapsIx, gapsIy } = paths;
  // Initial traces (PathGenerator_create_Gotoh, local).
  for (let i = 0; i <= nA; i++) M.trace[M.at(i, 0)] = STARTPOINT;
  gapsIx[0] = 0;
  gapsIy[0] = 0;
  for (let i = 1; i < nA; i++) {
    gapsIx[M.at(i, 0)] = 0;
    gapsIy[M.at(i, 0)] = 0;
  }
  for (let i = 1; i <= nB; i++) {
    M.trace[M.at(0, i)] = STARTPOINT;
    gapsIx[M.at(0, i)] = 0;
    gapsIy[M.at(0, i)] = 0;
  }
  M.path[0] = 0;

  let im = nA;
  let jm = nB;
  let maximum = 0.0;
  let score = 0;
  let temp = 0;
  let trace = 0;
  let Mt: number;
  let Ixt: number;
  let Iyt: number;
  const Mr = new Float64Array(nB + 1);
  const Ixr = new Float64Array(nB + 1);
  const Iyr = new Float64Array(nB + 1);
  Mr[0] = 0;
  Ixr[0] = NEG;
  Iyr[0] = NEG;
  for (let j = 1; j <= nB; j++) {
    Mr[j] = 0;
    Ixr[j] = NEG;
    Iyr[j] = NEG;
  }
  /** `SELECT_TRACE_GOTOH_LOCAL_ALIGN`: the match cell, with start and end points. */
  const selectAlign = (i: number, j: number, add: number): void => {
    trace = M_MATRIX;
    score = Mt;
    if (Ixt > score + epsilon) { score = Ixt; trace = Ix_MATRIX; }
    else if (Ixt > score - epsilon) trace |= Ix_MATRIX;
    if (Iyt > score + epsilon) { score = Iyt; trace = Iy_MATRIX; }
    else if (Iyt > score - epsilon) trace |= Iy_MATRIX;
    score += add;
    if (score < epsilon) { score = 0; trace = STARTPOINT; }
    else if (score > maximum - epsilon) {
      if (score > maximum + epsilon) {
        maximum = score;
        for (; im < i; im++, jm = 0) for (; jm <= nB; jm++) M.trace[M.at(im, jm)]! &= ~ENDPOINT;
        for (; jm < j; jm++) M.trace[M.at(im, jm)]! &= ~ENDPOINT;
        im = i;
        jm = j;
      }
      trace |= ENDPOINT;
    }
    M.trace[M.at(i, j)] = trace;
  };
  /** `SELECT_TRACE_GOTOH_LOCAL_GAP`: a gap state; scores below epsilon are impossible. */
  const selectGap = (gaps: Uint8Array, i: number, j: number, s1: number, s2: number, s3: number): void => {
    trace = M_MATRIX;
    score = s1;
    temp = s2;
    if (temp > score + epsilon) { score = temp; trace = Ix_MATRIX; }
    else if (temp > score - epsilon) trace |= Ix_MATRIX;
    temp = s3;
    if (temp > score + epsilon) { score = temp; trace = Iy_MATRIX; }
    else if (temp > score - epsilon) trace |= Iy_MATRIX;
    if (score < epsilon) { score = NEG; trace = 0; }
    gaps[M.at(i, j)] = trace;
  };
  let j: number;
  for (let i = 1; i < nA; i++) {
    Mt = Mr[0]!;
    Ixt = Ixr[0]!;
    Iyt = Iyr[0]!;
    Mr[0] = 0;
    Ixr[0] = NEG;
    Iyr[0] = NEG;
    const kA = sA[i - 1]!;
    for (j = 1; j < nB; j++) {
      selectAlign(i, j, align(kA, sB[j - 1]!));
      Mt = Mr[j]!;
      Mr[j] = score;
      selectGap(gapsIx, i, j, Mt + gapOpenB, Ixr[j]! + gapExtendB, Iyr[j]! + gapOpenB);
      Ixt = Ixr[j]!;
      Ixr[j] = score;
      selectGap(gapsIy, i, j, Mr[j - 1]! + gapOpenA, Ixr[j - 1]! + gapOpenA, Iyr[j - 1]! + gapExtendA);
      Iyt = Iyr[j]!;
      Iyr[j] = score;
    }
    selectAlign(i, nB, align(kA, sB[nB - 1]!));
    Mt = Mr[nB]!;
    Mr[nB] = score;
    Ixt = Ixr[nB]!;
    Ixr[nB] = 0;
    gapsIx[M.at(i, nB)] = 0;
    Iyt = Iyr[nB]!;
    Iyr[nB] = 0;
    gapsIy[M.at(i, nB)] = 0;
  }
  Mt = Mr[0]!;
  Mr[0] = 0;
  M.trace[M.at(nA, 0)] = 0;
  Ixt = Ixr[0]!;
  Ixr[0] = NEG;
  gapsIx[M.at(nA, 0)] = 0;
  gapsIy[M.at(nA, 0)] = 0;
  Iyt = Iyr[0]!;
  Iyr[0] = NEG;
  const kA = sA[nA - 1]!;
  for (j = 1; j < nB; j++) {
    selectAlign(nA, j, align(kA, sB[j - 1]!));
    Mt = Mr[j]!;
    Mr[j] = score;
    Ixt = Ixr[j]!;
    Ixr[j] = 0;
    gapsIx[M.at(nA, j)] = 0;
    Iyt = Iyr[j]!;
    Iyr[j] = 0;
    gapsIy[M.at(nA, j)] = 0;
  }
  selectAlign(nA, nB, align(kA, sB[nB - 1]!));
  gapsIx[M.at(nA, nB)] = 0;
  gapsIy[M.at(nA, nB)] = 0;

  // Zero-score extensions are not allowed, so drop traces towards an ENDPOINT. `path` temporarily holds, per state,
  // whether the cell is reachable from a STARTPOINT; unreachable states lose all their traces.
  for (let jj = 0; jj <= nB; jj++) M.path[M.at(0, jj)] = M_MATRIX;
  for (let i = 1; i <= nA; i++) {
    M.path[M.at(i, 0)] = M_MATRIX;
    for (let jj = 1; jj <= nB; jj++) {
      const here = M.at(i, jj);
      const diag = M.path[M.at(i - 1, jj - 1)]!;
      trace = M.trace[here]!;
      if (!(diag & M_MATRIX)) trace &= ~M_MATRIX;
      if (!(diag & Ix_MATRIX)) trace &= ~Ix_MATRIX;
      if (!(diag & Iy_MATRIX)) trace &= ~Iy_MATRIX;
      if (trace & (STARTPOINT | M_MATRIX | Ix_MATRIX | Iy_MATRIX)) {
        if (trace & ENDPOINT) M.path[here] = 0; // no extensions after an ENDPOINT
        else M.path[here]! |= M_MATRIX;
      } else {
        M.path[here]! &= ~M_MATRIX;
        trace = 0;
      }
      M.trace[here] = trace;
      const up = M.path[M.at(i - 1, jj)]!;
      trace = gapsIx[here]!;
      if (!(up & M_MATRIX)) trace &= ~M_MATRIX;
      if (!(up & Ix_MATRIX)) trace &= ~Ix_MATRIX;
      if (!(up & Iy_MATRIX)) trace &= ~Iy_MATRIX;
      if (trace & (M_MATRIX | Ix_MATRIX | Iy_MATRIX)) M.path[here]! |= Ix_MATRIX;
      else {
        M.path[here]! &= ~Ix_MATRIX;
        trace = 0;
      }
      gapsIx[here] = trace;
      const left = M.path[M.at(i, jj - 1)]!;
      trace = gapsIy[here]!;
      if (!(left & M_MATRIX)) trace &= ~M_MATRIX;
      if (!(left & Ix_MATRIX)) trace &= ~Ix_MATRIX;
      if (!(left & Iy_MATRIX)) trace &= ~Iy_MATRIX;
      if (trace & (M_MATRIX | Ix_MATRIX | Iy_MATRIX)) M.path[here]! |= Iy_MATRIX;
      else {
        M.path[here]! &= ~Iy_MATRIX;
        trace = 0;
      }
      gapsIy[here] = trace;
    }
  }
  M.path[0] = maximum === 0 ? DONE : 0;
  return { score: maximum, paths };
}
