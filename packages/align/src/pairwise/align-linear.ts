/** Needleman-Wunsch and Smith-Waterman with traceback: fill the trace matrix and return the path generator. */

import { LinearPathGenerator } from "./path-generator.js";
import type { AlignScore } from "./score-linear.js";
import type { GapScores } from "./state.js";
import { DIAGONAL, ENDPOINT, HORIZONTAL, NONE, STARTPOINT, TraceMatrix, VERTICAL } from "./trace.js";

/** The result of an alignment: the optimal score and the generator of the optimal paths. */
export interface AlignResult<G> {
  /** The optimal alignment score. */
  score: number;
  /** Yields the alignments. */
  paths: G;
}

/** Needleman-Wunsch alignment: scores as in {@link needlemanWunschScore}, remembering which moves tie for the best. */
export function needlemanWunschAlign(s: GapScores, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): AlignResult<LinearPathGenerator> {
  const nA = sA.length;
  const nB = sB.length;
  const gapExtendA = s.extendInternalInsertionScore;
  const gapExtendB = s.extendInternalDeletionScore;
  const minus = strand === "-";
  const leftA = minus ? s.extendRightInsertionScore : s.extendLeftInsertionScore;
  const rightA = minus ? s.extendLeftInsertionScore : s.extendRightInsertionScore;
  const leftB = minus ? s.extendRightDeletionScore : s.extendLeftDeletionScore;
  const rightB = minus ? s.extendLeftDeletionScore : s.extendRightDeletionScore;
  const M = new TraceMatrix(nA, nB);
  // Global mode: the first column can only be reached vertically, the first row horizontally.
  for (let i = 0; i <= nA; i++) M.trace[M.at(i, 0)] = VERTICAL;
  M.trace[0] = 0;
  for (let j = 1; j <= nB; j++) M.trace[M.at(0, j)] = HORIZONTAL;
  M.path[0] = 0;
  const row = new Float64Array(nB + 1);
  row[0] = 0;
  for (let j = 1; j <= nB; j++) row[j] = j * leftA;
  let score = 0;
  let temp: number;
  let trace: number;
  /** `SELECT_TRACE_NEEDLEMAN_WUNSCH`: best of diagonal, horizontal and vertical, keeping ties within epsilon. */
  const select = (i: number, j: number, hgap: number, vgap: number, kA: number, kB: number): void => {
    score = temp + align(kA, kB);
    trace = DIAGONAL;
    temp = row[j - 1]! + hgap;
    if (temp > score + epsilon) { score = temp; trace = HORIZONTAL; }
    else if (temp > score - epsilon) trace |= HORIZONTAL;
    temp = row[j]! + vgap;
    if (temp > score + epsilon) { score = temp; trace = VERTICAL; }
    else if (temp > score - epsilon) trace |= VERTICAL;
    temp = row[j]!;
    row[j] = score;
    M.trace[M.at(i, j)] = trace;
  };
  let i: number;
  temp = 0;
  for (i = 1; i < nA; i++) {
    temp = row[0]!;
    row[0] = i * leftB;
    const kA = sA[i - 1]!;
    let j: number;
    for (j = 1; j < nB; j++) select(i, j, gapExtendA, gapExtendB, kA, sB[j - 1]!);
    select(i, j, gapExtendA, rightB, kA, sB[j - 1]!);
  }
  temp = row[0]!;
  row[0] = i * leftB;
  const kA = sA[nA - 1]!;
  let j: number;
  for (j = 1; j < nB; j++) select(nA, j, rightA, gapExtendB, kA, sB[j - 1]!);
  select(nA, j, rightA, rightB, kA, sB[j - 1]!);
  M.path[M.at(nA, nB)] = 0;
  return { score, paths: new LinearPathGenerator(M, nA, nB, "global", strand) };
}

/** Smith-Waterman alignment: scores as in {@link smithWatermanScore}, with start and end points for the local paths. */
export function smithWatermanAlign(s: GapScores, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): AlignResult<LinearPathGenerator> {
  const nA = sA.length;
  const nB = sB.length;
  const gapExtendA = s.extendInternalInsertionScore;
  const gapExtendB = s.extendInternalDeletionScore;
  const M = new TraceMatrix(nA, nB);
  for (let i = 0; i <= nA; i++) M.trace[M.at(i, 0)] = STARTPOINT;
  for (let j = 1; j <= nB; j++) M.trace[M.at(0, j)] = STARTPOINT;
  M.path[0] = 0;
  const row = new Float64Array(nB + 1);
  let im = nA;
  let jm = nB;
  let maximum = 0;
  let score = 0;
  let temp = 0;
  let trace = 0;
  /** Drop the ENDPOINT flag from every cell before `(i, j)` when a new best score is found. */
  const clearEndpoints = (i: number, j: number): void => {
    for (; im < i; im++, jm = 0) for (; jm <= nB; jm++) M.trace[M.at(im, jm)]! &= ~ENDPOINT;
    for (; jm < j; jm++) M.trace[M.at(im, jm)]! &= ~ENDPOINT;
    im = i;
    jm = j;
  };
  /** `SELECT_TRACE_SMITH_WATERMAN_HVD`: all three moves are possible. */
  const hvd = (i: number, j: number, kA: number, kB: number): void => {
    trace = DIAGONAL;
    score = temp + align(kA, kB);
    temp = row[j - 1]! + gapExtendA;
    if (temp > score + epsilon) { score = temp; trace = HORIZONTAL; }
    else if (temp > score - epsilon) trace |= HORIZONTAL;
    temp = row[j]! + gapExtendB;
    if (temp > score + epsilon) { score = temp; trace = VERTICAL; }
    else if (temp > score - epsilon) trace |= VERTICAL;
    if (score < epsilon) { score = 0; trace = STARTPOINT; }
    else if (trace & DIAGONAL && score > maximum - epsilon) {
      if (score > maximum + epsilon) clearEndpoints(i, j);
      trace |= ENDPOINT;
    }
    M.trace[M.at(i, j)] = trace;
    if (score > maximum) maximum = score;
    temp = row[j]!;
    row[j] = score;
  };
  /** `SELECT_TRACE_SMITH_WATERMAN_D`: only the diagonal move (last row and column, where gaps cannot end). */
  const d = (i: number, j: number, kA: number, kB: number): void => {
    score = temp + align(kA, kB);
    trace = DIAGONAL;
    if (score < epsilon) score = 0;
    else if (trace & DIAGONAL && score > maximum - epsilon) {
      if (score > maximum + epsilon) clearEndpoints(i, j);
      trace |= ENDPOINT;
    }
    M.trace[M.at(i, j)] = trace;
    if (score > maximum) maximum = score;
    temp = row[j]!;
    row[j] = score;
  };
  let i: number;
  for (i = 1; i < nA; i++) {
    temp = 0;
    const kA = sA[i - 1]!;
    for (let j = 1; j < nB; j++) hvd(i, j, kA, sB[j - 1]!);
    d(i, nB, kA, sB[nB - 1]!);
  }
  temp = 0;
  const kA = sA[nA - 1]!;
  for (let j = 1; j < nB; j++) d(nA, j, kA, sB[j - 1]!);
  d(nA, nB, kA, sB[nB - 1]!);
  // Zero-score extensions are not allowed, so drop traces towards an ENDPOINT, and use `path` as a temporary flag
  // for "reachable from a STARTPOINT"; unreachable cells lose all their traces.
  for (let j = 0; j <= nB; j++) M.path[M.at(0, j)] = 1;
  for (i = 1; i <= nA; i++) {
    M.path[M.at(i, 0)] = 1;
    for (let j = 1; j <= nB; j++) {
      trace = M.trace[M.at(i, j)]!;
      if (!M.path[M.at(i - 1, j - 1)]) trace &= ~DIAGONAL;
      if (!M.path[M.at(i, j - 1)]) trace &= ~HORIZONTAL;
      if (!M.path[M.at(i - 1, j)]) trace &= ~VERTICAL;
      if (trace & (STARTPOINT | HORIZONTAL | VERTICAL | DIAGONAL)) {
        M.path[M.at(i, j)] = trace & ENDPOINT ? 0 : 1; // no extensions after an ENDPOINT
      } else {
        M.path[M.at(i, j)] = 0;
        trace = 0;
      }
      M.trace[M.at(i, j)] = trace;
    }
  }
  M.path[0] = maximum === 0 ? NONE : 0;
  return { score: maximum, paths: new LinearPathGenerator(M, nA, nB, "local", strand) };
}
