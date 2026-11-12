/**
 * `PathGenerator`: walks the traceback matrices of the aligner and yields every optimal alignment as a pair of
 * coordinate lists, in the same order as Biopython's C implementation (each call to `next` updates the matrices
 * in place to find the following path).
 */

import { RuntimeError } from "@biolibs/core";
import { DIAGONAL, DONE, ENDPOINT, HORIZONTAL, NONE, SSIZE_MAX, STARTPOINT, TraceMatrix, VERTICAL } from "./trace.js";
import type { Mode } from "./state.js";

/** One alignment path: the coordinates of the target and of the query at each change of direction. */
export type Path = [number[], number[]];

/** Sentinel for a count that does not fit in a signed 64-bit integer (Biopython's `OVERFLOW_ERROR`). */
export const OVERFLOW = -1n;

/** `SAFE_ADD(t, s)`: add `t` to the running count `s` unless it has already overflowed. */
export function safeAdd(t: bigint, s: bigint): bigint {
  if (s === OVERFLOW) return s;
  if (t > SSIZE_MAX - s) return OVERFLOW;
  return s + t;
}

/** Shared state of the three path generator flavours. */
export abstract class PathGeneratorBase {
  /** First row of the next local alignment's end point search. */
  iA = 0;
  /** First column of the next local alignment's end point search. */
  iB = 0;
  /** The number of alignments, once counted. */
  protected cachedLength: bigint | null = null;

  /**
   * @param M - Trace and path matrices.
   * @param nA - Length of the target.
   * @param nB - Length of the query.
   * @param mode - `"global"` or `"local"`.
   * @param strand - `"+"` or `"-"`.
   */
  constructor(readonly M: TraceMatrix, readonly nA: number, readonly nB: number, readonly mode: Mode, readonly strand: string) {}

  /** The next alignment, or null when there are no more. */
  abstract next(): Path | null;
  /** Start again from the first alignment. */
  abstract reset(): void;
  /** Count the alignments (a `bigint`; -1n means more than fit in 64 bits). */
  protected abstract count(): bigint;

  /**
   * The number of alignments.
   *
   * @throws RangeError when the count exceeds the signed 64-bit range (Python raises `OverflowError`).
   */
  length(): bigint {
    if (this.cachedLength === null) this.cachedLength = this.count();
    if (this.cachedLength === OVERFLOW) throw new RangeError(`number of optimal alignments is larger than ${SSIZE_MAX}`);
    return this.cachedLength;
  }

  /** Build the coordinate lists of the path that starts at `(i, j)` and follows the stored `path` marks. */
  protected createPath(i: number, j: number): Path {
    const { M, strand, nB } = this;
    let k = i;
    let l = j;
    let n = 1;
    let direction = 0;
    for (;;) {
      const path = M.path[M.at(k, l)]!;
      if (!path) break;
      if (path !== direction) {
        n++;
        direction = path;
      }
      if (path === HORIZONTAL) l++;
      else if (path === VERTICAL) k++;
      else if (path === DIAGONAL) { k++; l++; }
    }
    direction = 0;
    const target: number[] = [];
    const query: number[] = [];
    for (;;) {
      const path = M.path[M.at(i, j)]!;
      if (path !== direction) {
        target.push(i);
        query.push(strand === "-" ? nB - j : j);
        direction = path;
      }
      if (path === HORIZONTAL) j++;
      else if (path === VERTICAL) i++;
      else if (path === DIAGONAL) { i++; j++; }
      else return [target, query];
    }
  }
}

/** Path generator for Needleman-Wunsch (global) and Smith-Waterman (local) alignments. */
export class LinearPathGenerator extends PathGeneratorBase {
  next(): Path | null {
    return this.mode === "global" ? this.nextGlobal() : this.nextLocal();
  }

  reset(): void {
    if (this.mode === "local") { this.iA = 0; this.iB = 0; }
    if (this.M.path[0] !== NONE) this.M.path[0] = 0;
  }

  /** The next global alignment: prune the current path to the last branch point, then trace back to the origin. */
  private nextGlobal(): Path | null {
    const { M, nA, nB } = this;
    let i = 0;
    let j = 0;
    let trace = 0;
    let path = M.path[M.at(i, j)]!;
    if (path === DONE) return null;
    if (path === 0) {
      // Generate the first path.
      i = nA;
      j = nB;
    } else {
      // We already have a path: prune it to find alternatives.
      for (;;) {
        if (path === HORIZONTAL) {
          trace = M.trace[M.at(i, ++j)]!;
          if (trace & VERTICAL) { M.path[M.at(--i, j)] = VERTICAL; break; }
          if (trace & DIAGONAL) { M.path[M.at(--i, --j)] = DIAGONAL; break; }
        } else if (path === VERTICAL) {
          trace = M.trace[M.at(++i, j)]!;
          if (trace & DIAGONAL) { M.path[M.at(--i, --j)] = DIAGONAL; break; }
        } else {
          i++;
          j++;
        }
        path = M.path[M.at(i, j)]!;
        if (!path) {
          // The end of the alignment was reached without an alternative.
          M.path[0] = DONE;
          return null;
        }
      }
    }
    // Follow the traceback until we reach the origin.
    for (;;) {
      trace = M.trace[M.at(i, j)]!;
      if (trace & HORIZONTAL) M.path[M.at(i, --j)] = HORIZONTAL;
      else if (trace & VERTICAL) M.path[M.at(--i, j)] = VERTICAL;
      else if (trace & DIAGONAL) M.path[M.at(--i, --j)] = DIAGONAL;
      else break;
    }
    return this.createPath(0, 0);
  }

  /** The next local alignment: prune, or search for the next end point, then trace back to a start point. */
  private nextLocal(): Path | null {
    const { M, nA, nB } = this;
    let trace = 0;
    let i = this.iA;
    let j = this.iB;
    let path = M.path[0]!;
    if (path === DONE || path === NONE) return null;
    path = M.path[M.at(i, j)]!;
    if (path) {
      for (;;) {
        if (path === HORIZONTAL) {
          trace = M.trace[M.at(i, ++j)]!;
          if (trace & VERTICAL) { M.path[M.at(--i, j)] = VERTICAL; break; }
          else if (trace & DIAGONAL) { M.path[M.at(--i, --j)] = DIAGONAL; break; }
        } else if (path === VERTICAL) {
          trace = M.trace[M.at(++i, j)]!;
          if (trace & DIAGONAL) { M.path[M.at(--i, --j)] = DIAGONAL; break; }
        } else {
          i++;
          j++;
        }
        path = M.path[M.at(i, j)]!;
        if (!path) break;
      }
    }
    if (path) {
      trace = M.trace[M.at(i, j)]!;
    } else {
      // Find a suitable end point (only end points on the M matrix are allowed).
      for (;;) {
        if (j < nB) j++;
        else if (i < nA) { i++; j = 0; }
        else {
          M.path[0] = DONE;
          return null;
        }
        trace = M.trace[M.at(i, j)]!;
        if (trace & ENDPOINT) {
          trace &= DIAGONAL; // exclude paths ending in a gap
          break;
        }
      }
      M.path[M.at(i, j)] = 0;
    }
    // Follow the traceback until we reach a start point.
    for (;;) {
      if (trace & HORIZONTAL) M.path[M.at(i, --j)] = HORIZONTAL;
      else if (trace & VERTICAL) M.path[M.at(--i, j)] = VERTICAL;
      else if (trace & DIAGONAL) M.path[M.at(--i, --j)] = DIAGONAL;
      else if (trace & STARTPOINT) {
        this.iA = i;
        this.iB = j;
        return this.createPath(i, j);
      } else throw new RuntimeError("Unexpected trace in PathGenerator_next_smithwaterman");
      trace = M.trace[M.at(i, j)]!;
    }
  }

  protected count(): bigint {
    return this.mode === "global" ? this.countGlobal() : this.countLocal();
  }

  private countGlobal(): bigint {
    const { M, nA, nB } = this;
    const counts: bigint[] = new Array<bigint>(nB + 1).fill(0n);
    let count = 0n;
    counts[0] = 1n;
    for (let j = 1; j <= nB; j++) {
      const trace = M.trace[M.at(0, j)]!;
      count = 0n;
      if (trace & HORIZONTAL) count = safeAdd(counts[j - 1]!, count);
      counts[j] = count;
    }
    for (let i = 1; i <= nA; i++) {
      let trace = M.trace[M.at(i, 0)]!;
      count = 0n;
      if (trace & VERTICAL) count = safeAdd(counts[0]!, count);
      let temp = counts[0]!;
      counts[0] = count;
      for (let j = 1; j <= nB; j++) {
        trace = M.trace[M.at(i, j)]!;
        count = 0n;
        if (trace & HORIZONTAL) count = safeAdd(counts[j - 1]!, count);
        if (trace & VERTICAL) count = safeAdd(counts[j]!, count);
        if (trace & DIAGONAL) count = safeAdd(temp, count);
        temp = counts[j]!;
        counts[j] = count;
      }
    }
    return count;
  }

  private countLocal(): bigint {
    const { M, nA, nB } = this;
    const counts: bigint[] = new Array<bigint>(nB + 1).fill(1n);
    let count = 0n;
    let total = 0n;
    for (let i = 1; i <= nA; i++) {
      let temp = counts[0]!;
      counts[0] = 1n;
      for (let j = 1; j <= nB; j++) {
        const trace = M.trace[M.at(i, j)]!;
        count = 0n;
        if (trace & DIAGONAL) count = safeAdd(temp, count);
        if (trace & ENDPOINT) total = safeAdd(count, total);
        if (trace & HORIZONTAL) count = safeAdd(counts[j - 1]!, count);
        if (trace & VERTICAL) count = safeAdd(counts[j]!, count);
        temp = counts[j]!;
        if (count === 0n && trace & STARTPOINT) count = 1n;
        counts[j] = count;
      }
    }
    return total;
  }
}
