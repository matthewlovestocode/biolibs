/** The Waterman-Smith-Beyer algorithm with traceback: arbitrary gap functions, recording every best gap length. */

import { WsbPathGenerator } from "./path-wsb.js";
import type { AlignResult } from "./align-linear.js";
import type { AlignScore } from "./score-linear.js";
import { deletionScore, insertionScore } from "./score-wsb.js";
import type { GapFunctions, GapScores } from "./state.js";
import { DONE, ENDPOINT, Iy_MATRIX, Ix_MATRIX, M_MATRIX, STARTPOINT, TraceMatrix } from "./trace.js";

/** The most negative score, standing for "impossible" (C's `-DBL_MAX`). */
const NEG = -Number.MAX_VALUE;

const grid = (nA: number, nB: number): Float64Array[] => Array.from({ length: nA + 1 }, () => new Float64Array(nB + 1));

/** Waterman-Smith-Beyer global alignment with traceback. */
export function watermanSmithBeyerGlobalAlign(s: GapScores & GapFunctions, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): AlignResult<WsbPathGenerator> {
  const nA = sA.length;
  const nB = sB.length;
  const M = new TraceMatrix(nA, nB);
  const paths = new WsbPathGenerator(M, nA, nB, "global", strand);
  const Mr = grid(nA, nB);
  const Ixr = grid(nA, nB);
  const Iyr = grid(nA, nB);
  const start = (j: number): number => (strand === "-" ? nB - j : j);
  let score = 0;
  let gapscore = 0;
  let temp = 0;
  let trace = 0;
  let j = 0;
  Mr[0]![0] = 0;
  Ixr[0]![0] = NEG;
  Iyr[0]![0] = NEG;
  for (let i = 1; i <= nA; i++) {
    Mr[i]![0] = NEG;
    Iyr[i]![0] = NEG;
    Ixr[i]![0] = deletionScore(s, start(j), i, nB);
  }
  for (j = 1; j <= nB; j++) {
    Mr[0]![j] = NEG;
    Ixr[0]![j] = NEG;
    Iyr[0]![j] = insertionScore(s, 0, j, nA);
  }
  /** The best-scoring gap lengths into a gap state, from the M state and from the other gap state. */
  const scanGaps = (count: number, gapOf: (gap: number) => number, fromM: (gap: number) => number, fromXY: (gap: number) => number): { gapM: number[]; gapXY: number[] } => {
    const gapM: number[] = [];
    const gapXY: number[] = [];
    score = NEG;
    for (let gap = 1; gap <= count; gap++) {
      gapscore = gapOf(gap);
      temp = fromM(gap) + gapscore;
      if (temp > score - epsilon) {
        if (temp > score + epsilon) { score = temp; gapM.length = 0; gapXY.length = 0; }
        gapM.push(gap);
      }
      temp = fromXY(gap) + gapscore;
      if (temp > score - epsilon) {
        if (temp > score + epsilon) { score = temp; gapM.length = 0; gapXY.length = 0; }
        gapXY.push(gap);
      }
    }
    return { gapM, gapXY };
  };
  for (let i = 1; i <= nA; i++) {
    const kA = sA[i - 1]!;
    for (j = 1; j <= nB; j++) {
      const kB = sB[j - 1]!;
      // `SELECT_TRACE_WATERMAN_SMITH_BEYER_GLOBAL_ALIGN`
      trace = M_MATRIX;
      score = Mr[i - 1]![j - 1]!;
      temp = Ixr[i - 1]![j - 1]!;
      if (temp > score + epsilon) { score = temp; trace = Ix_MATRIX; }
      else if (temp > score - epsilon) trace |= Ix_MATRIX;
      temp = Iyr[i - 1]![j - 1]!;
      if (temp > score + epsilon) { score = temp; trace = Iy_MATRIX; }
      else if (temp > score - epsilon) trace |= Iy_MATRIX;
      Mr[i]![j] = score + align(kA, kB);
      M.trace[M.at(i, j)] = trace;
      const cell = paths.gaps[M.at(i, j)]!;
      const jj = j;
      const ix = scanGaps(i, (gap) => deletionScore(s, start(jj), gap, nB), (gap) => Mr[i - gap]![jj]!, (gap) => Iyr[i - gap]![jj]!);
      cell.MIx = ix.gapM;
      cell.IyIx = ix.gapXY;
      Ixr[i]![j] = score;
      const iy = scanGaps(j, (gap) => insertionScore(s, i, gap, nA), (gap) => Mr[i]![jj - gap]!, (gap) => Ixr[i]![jj - gap]!);
      cell.MIy = iy.gapM;
      cell.IxIy = iy.gapXY;
      Iyr[i]![j] = score;
    }
  }
  // Traceback: keep only the end states within epsilon of the best.
  score = Mr[nA]![nB]!;
  if (Ixr[nA]![nB]! > score) score = Ixr[nA]![nB]!;
  if (Iyr[nA]![nB]! > score) score = Iyr[nA]![nB]!;
  M.path[M.at(nA, nB)] = 0;
  const end = paths.gaps[M.at(nA, nB)]!;
  if (Mr[nA]![nB]! < score - epsilon) M.trace[M.at(nA, nB)] = 0;
  if (Ixr[nA]![nB]! < score - epsilon) { end.MIx = []; end.IyIx = []; }
  if (Iyr[nA]![nB]! < score - epsilon) { end.MIy = []; end.IxIy = []; }
  return { score, paths };
}

/** Waterman-Smith-Beyer local alignment with traceback. */
export function watermanSmithBeyerLocalAlign(s: GapScores & GapFunctions, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore): AlignResult<WsbPathGenerator> {
  const nA = sA.length;
  const nB = sB.length;
  const M = new TraceMatrix(nA, nB);
  const paths = new WsbPathGenerator(M, nA, nB, "local", strand);
  const Mr = grid(nA, nB);
  const Ixr = grid(nA, nB);
  const Iyr = grid(nA, nB);
  const start = (j: number): number => (strand === "-" ? nB - j : j);
  let im = nA;
  let jm = nB;
  let maximum = 0.0;
  let score = 0;
  let temp = 0;
  let trace = 0;
  Mr[0]![0] = 0;
  Ixr[0]![0] = NEG;
  Iyr[0]![0] = NEG;
  for (let i = 1; i <= nA; i++) { Mr[i]![0] = 0; Ixr[i]![0] = NEG; Iyr[i]![0] = NEG; }
  for (let i = 1; i <= nB; i++) { Mr[0]![i] = 0; Ixr[0]![i] = NEG; Iyr[0]![i] = NEG; }
  /** Gap scan as in the global case, with local clamping afterwards. */
  const scanGaps = (count: number, gapOf: (gap: number) => number, fromM: (gap: number) => number, fromXY: (gap: number) => number): { gapM: number[]; gapXY: number[] } => {
    const gapM: number[] = [];
    const gapXY: number[] = [];
    score = NEG;
    for (let gap = 1; gap <= count; gap++) {
      const gapscore = gapOf(gap);
      temp = fromM(gap) + gapscore;
      if (temp > score - epsilon) {
        if (temp > score + epsilon) { score = temp; gapM.length = 0; gapXY.length = 0; }
        gapM.push(gap);
      }
      temp = fromXY(gap) + gapscore;
      if (temp > score - epsilon) {
        if (temp > score + epsilon) { score = temp; gapM.length = 0; gapXY.length = 0; }
        gapXY.push(gap);
      }
    }
    if (score < epsilon) { score = NEG; gapM.length = 0; gapXY.length = 0; }
    else if (score > maximum) maximum = score;
    return { gapM, gapXY };
  };
  for (let i = 1; i <= nA; i++) {
    const kA = sA[i - 1]!;
    for (let j = 1; j <= nB; j++) {
      const kB = sB[j - 1]!;
      // `SELECT_TRACE_WATERMAN_SMITH_BEYER_ALIGN`
      trace = M_MATRIX;
      score = Mr[i - 1]![j - 1]!;
      const ixPrev = Ixr[i - 1]![j - 1]!;
      const iyPrev = Iyr[i - 1]![j - 1]!;
      if (ixPrev > score + epsilon) { score = ixPrev; trace = Ix_MATRIX; }
      else if (ixPrev > score - epsilon) trace |= Ix_MATRIX;
      if (iyPrev > score + epsilon) { score = iyPrev; trace = Iy_MATRIX; }
      else if (iyPrev > score - epsilon) trace |= Iy_MATRIX;
      score += align(kA, kB);
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
      Mr[i]![j] = score;
      M.trace[M.at(i, j)] = trace;
      M.path[M.at(i, j)] = 0;
      if (i === nA || j === nB) {
        Ixr[i]![j] = score;
        Iyr[i]![j] = score;
        const cell = paths.gaps[M.at(i, j)]!;
        cell.MIx = cell.IyIx = cell.MIy = cell.IxIy = null;
        continue;
      }
      const cell = paths.gaps[M.at(i, j)]!;
      const ix = scanGaps(i, (gap) => deletionScore(s, start(j), gap, nB), (gap) => Mr[i - gap]![j]!, (gap) => Iyr[i - gap]![j]!);
      cell.MIx = ix.gapM;
      cell.IyIx = ix.gapXY;
      Ixr[i]![j] = score;
      M.path[M.at(i, j)] = 0;
      const iy = scanGaps(j, (gap) => insertionScore(s, i, gap, nA), (gap) => Mr[i]![j - gap]!, (gap) => Ixr[i]![j - gap]!);
      cell.MIy = iy.gapM;
      cell.IxIy = iy.gapXY;
      Iyr[i]![j] = score;
      M.path[M.at(i, j)] = 0;
    }
  }
  // Zero-score extensions are not allowed: drop traces towards an ENDPOINT, and use `path` as a per-state
  // "reachable from a STARTPOINT" flag, removing traces and gap lengths from unreachable states.
  for (let j = 0; j <= nB; j++) M.path[M.at(0, j)] = M_MATRIX;
  for (let i = 1; i <= nA; i++) {
    M.path[M.at(i, 0)] = M_MATRIX;
    for (let j = 1; j <= nB; j++) {
      const here = M.at(i, j);
      const diag = M.path[M.at(i - 1, j - 1)]!;
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
      if (i === nA || j === nB) continue;
      const cell = paths.gaps[here]!;
      cell.MIx = cell.MIx!.filter((gap) => M.path[M.at(i - gap, j)]! & M_MATRIX);
      cell.IyIx = cell.IyIx!.filter((gap) => M.path[M.at(i - gap, j)]! & Iy_MATRIX);
      if (cell.MIx.length === 0 && cell.IyIx.length === 0) M.path[here]! &= ~Ix_MATRIX; // not reachable
      else M.path[here]! |= Ix_MATRIX; // reachable
      cell.MIy = cell.MIy!.filter((gap) => M.path[M.at(i, j - gap)]! & M_MATRIX);
      cell.IxIy = cell.IxIy!.filter((gap) => M.path[M.at(i, j - gap)]! & Ix_MATRIX);
      if (cell.MIy.length === 0 && cell.IxIy.length === 0) M.path[here]! &= ~Iy_MATRIX; // not reachable
      else M.path[here]! |= Iy_MATRIX; // reachable
    }
  }
  M.path[0] = maximum === 0 ? DONE : 0;
  return { score: maximum, paths };
}
