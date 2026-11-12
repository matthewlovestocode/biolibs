/**
 * Path generator for the Waterman-Smith-Beyer algorithm, where a gap can have any length and its score comes from a
 * function. Instead of one trace bit per state, each gap state keeps the lists of gap lengths that lead to the
 * best score from each predecessor state.
 */

import { RuntimeError } from "@biolibs/core";
import { PathGeneratorBase, safeAdd, type Path } from "./path-generator.js";
import { DIAGONAL, DONE, ENDPOINT, HORIZONTAL, Iy_MATRIX, Ix_MATRIX, M_MATRIX, STARTPOINT, TraceMatrix, VERTICAL } from "./trace.js";
import type { Mode } from "./state.js";

/** The gap-length lists of one cell (null where Biopython leaves a null pointer). */
export interface WsbGaps {
  /** Lengths of vertical gaps entered from the M state. */
  MIx: number[] | null;
  /** Lengths of vertical gaps entered from the Iy state. */
  IyIx: number[] | null;
  /** Lengths of horizontal gaps entered from the M state. */
  MIy: number[] | null;
  /** Lengths of horizontal gaps entered from the Ix state. */
  IxIy: number[] | null;
}

/** Python/C style `*p` on a list whose terminator is implicit: past the end reads 0. */
const at = (list: number[] | null, k: number): number => (list ? list[k] ?? 0 : 0);

/** Walks the Waterman-Smith-Beyer trace data in the same order as Biopython. */
export class WsbPathGenerator extends PathGeneratorBase {
  /** Per-cell gap lists, row-major like the trace matrix. */
  readonly gaps: WsbGaps[];

  /** @param M - Trace matrix. @param nA - Target length. @param nB - Query length. @param mode - Global or local. @param strand - `"+"` or `"-"`. */
  constructor(M: TraceMatrix, nA: number, nB: number, mode: Mode, strand: string) {
    super(M, nA, nB, mode, strand);
    this.gaps = Array.from({ length: (nA + 1) * (nB + 1) }, () => ({ MIx: null, IyIx: null, MIy: null, IxIy: null }));
    // Initial traces (PathGenerator_create_WSB).
    for (let i = 0; i <= nA; i++) {
      M.path[M.at(i, 0)] = 0;
      if (mode === "global") {
        M.trace[M.at(i, 0)] = 0;
        this.gaps[M.at(i, 0)]!.MIx = i > 0 ? [i] : [];
        this.gaps[M.at(i, 0)]!.IyIx = [];
      } else M.trace[M.at(i, 0)] = STARTPOINT;
    }
    for (let i = 1; i <= nB; i++) {
      if (mode === "global") {
        M.trace[M.at(0, i)] = 0;
        this.gaps[M.at(0, i)]!.MIy = [i];
        this.gaps[M.at(0, i)]!.IxIy = [];
      } else M.trace[M.at(0, i)] = STARTPOINT;
    }
    M.path[0] = 0;
  }

  next(): Path | null {
    return this.mode === "global" ? this.nextGlobal() : this.nextLocal();
  }

  reset(): void {
    this.M.path[0] = 0;
    if (this.mode === "local") { this.iA = 0; this.iB = 0; }
  }

  /** The gap lists of cell `(i, j)`. */
  private g(i: number, j: number): WsbGaps {
    return this.gaps[this.M.at(i, j)]!;
  }

  /**
   * Prune the current horizontal or vertical run: look for another gap length (or another source state) for the gap
   * that ends at `(iA, iB)`.
   *
   * @returns The new `m`, and whether an alternative was found (the caller then stops pruning).
   */
  private pruneGap(horizontal: boolean, m: number, i: number, j: number, iA: number, iB: number): { m: number; found: boolean; i: number; j: number; iA: number; iB: number } {
    const { M } = this;
    const lists = this.g(iA, iB);
    const viaM = horizontal ? lists.MIy : lists.MIx;
    const viaXY = horizontal ? lists.IxIy : lists.IyIx;
    const otherState = horizontal ? Ix_MATRIX : Iy_MATRIX;
    const thisState = horizontal ? Iy_MATRIX : Ix_MATRIX;
    const run = horizontal ? iB - j : iA - i;
    let pM = 0;
    let pXY = 0;
    if (m === M_MATRIX) {
      pM = viaM!.indexOf(run) + 1;
      const gap = at(viaM, pM);
      if (gap) {
        if (horizontal) { j = iB - gap; while (j < iB) M.path[M.at(i, --iB)] = HORIZONTAL; }
        else { i = iA - gap; while (i < iA) M.path[M.at(--iA, j)] = VERTICAL; }
        return { m, found: true, i, j, iA, iB };
      }
    } else if (m === otherState) {
      pXY = viaXY!.indexOf(run) + 1;
    }
    const gap = at(viaXY, pXY);
    if (gap) {
      m = otherState;
      if (horizontal) { j = iB - gap; while (j < iB) M.path[M.at(i, --iB)] = HORIZONTAL; }
      else { i = iA - gap; while (i < iA) M.path[M.at(--iA, j)] = VERTICAL; }
      return { m, found: true, i, j, iA, iB };
    }
    // No alternative found: continue pruning.
    m = thisState;
    if (horizontal) j = iB; else i = iA;
    return { m, found: false, i, j, iA, iB };
  }

  private nextGlobal(): Path | null {
    const { M, nA, nB } = this;
    let i = 0;
    let j = 0;
    let iA = 0;
    let iB = 0;
    let trace: number;
    let m = M_MATRIX;
    let path = M.path[0]!;
    if (path === DONE) return null;
    if (path) {
      // We already have a path: prune it to see if there are alternatives.
      for (;;) {
        if (!path) {
          m <<= 1;
          break;
        }
        if (path === HORIZONTAL) { iA = i; iB = j; while (M.path[M.at(i, iB)] === HORIZONTAL) iB++; }
        else if (path === VERTICAL) { iA = i; while (M.path[M.at(iA, j)] === VERTICAL) iA++; iB = j; }
        else if (path === DIAGONAL) { iA = i + 1; iB = j + 1; }
        else throw new RuntimeError("Unexpected path in PathGenerator_next_waterman_smith_beyer_global");
        if (i === iA || j === iB) {
          const r = this.pruneGap(i === iA, m, i, j, iA, iB);
          ({ m, i, j, iA, iB } = r);
          if (r.found) break;
        } else {
          i = iA - 1;
          j = iB - 1;
          trace = M.trace[M.at(iA, iB)]!;
          let found = false;
          if (m === M_MATRIX && trace & Ix_MATRIX) { m = Ix_MATRIX; M.path[M.at(i, j)] = DIAGONAL; found = true; }
          else if ((m === M_MATRIX || m === Ix_MATRIX) && trace & Iy_MATRIX) { m = Iy_MATRIX; M.path[M.at(i, j)] = DIAGONAL; found = true; }
          if (!found) {
            m = M_MATRIX;
            i = iA;
            j = iB;
            path = M.path[M.at(i, j)]!;
            continue;
          }
          break;
        }
        path = M.path[M.at(i, j)]!;
      }
    }
    if (!path) {
      // Find a suitable end point for a path.
      const end = this.g(nA, nB);
      let chosen = false;
      if (m === M_MATRIX && M.trace[M.at(nA, nB)]) chosen = true;
      if (!chosen && (m === M_MATRIX || m === Ix_MATRIX) && (at(end.MIx, 0) || at(end.IyIx, 0))) { m = Ix_MATRIX; chosen = true; }
      if (!chosen && (m === M_MATRIX || m === Ix_MATRIX || m === Iy_MATRIX) && (at(end.MIy, 0) || at(end.IxIy, 0))) { m = Iy_MATRIX; chosen = true; }
      if (!chosen) {
        M.path[0] = DONE;
        return null;
      }
      i = nA;
      j = nB;
    }
    // Follow the traceback until we reach the origin.
    for (;;) {
      if (m === M_MATRIX) {
        trace = M.trace[M.at(i, j)]!;
        if (trace & M_MATRIX) m = M_MATRIX;
        else if (trace & Ix_MATRIX) m = Ix_MATRIX;
        else if (trace & Iy_MATRIX) m = Iy_MATRIX;
        else return this.createPath(i, j);
        i--;
        j--;
        M.path[M.at(i, j)] = DIAGONAL;
      } else if (m === Ix_MATRIX) {
        const lists = this.g(i, j);
        let gap = at(lists.MIx, 0);
        if (gap) m = M_MATRIX;
        else { gap = at(lists.IyIx, 0); m = Iy_MATRIX; }
        iA = i - gap;
        while (iA < i) M.path[M.at(--i, j)] = VERTICAL;
        M.path[M.at(i, j)] = VERTICAL;
      } else {
        const lists = this.g(i, j);
        let gap = at(lists.MIy, 0);
        if (gap) m = M_MATRIX;
        else { gap = at(lists.IxIy, 0); m = Ix_MATRIX; }
        iB = j - gap;
        while (iB < j) M.path[M.at(i, --j)] = HORIZONTAL;
        M.path[M.at(i, j)] = HORIZONTAL;
      }
    }
  }

  private nextLocal(): Path | null {
    const { M, nA, nB } = this;
    let i = 0;
    let j = 0;
    let m = 0;
    let trace: number;
    let iA = this.iA;
    let iB = this.iB;
    let path = M.path[0]!;
    if (path === DONE) return null;
    m = 0;
    path = M.path[M.at(iA, iB)]!;
    if (path) {
      // We already have a path: prune it to see if there are alternatives.
      m = M_MATRIX;
      i = iA;
      j = iB;
      for (;;) {
        path = M.path[M.at(i, j)]!;
        if (path === HORIZONTAL) { iA = i; iB = j; while (M.path[M.at(i, iB)] === HORIZONTAL) iB++; }
        else if (path === VERTICAL) { iA = i; iB = j; while (M.path[M.at(iA, j)] === VERTICAL) iA++; }
        else if (path === DIAGONAL) { iA = i + 1; iB = j + 1; }
        else iA = -1;
        if (iA < 0) {
          m = 0;
          iA = i;
          iB = j;
          break;
        }
        if (i === iA || j === iB) {
          const r = this.pruneGap(i === iA, m, i, j, iA, iB);
          ({ m, i, j, iA, iB } = r);
          if (r.found) break;
        } else {
          i = iA - 1;
          j = iB - 1;
          trace = M.trace[M.at(iA, iB)]!;
          let found = false;
          if (m === M_MATRIX && trace & Ix_MATRIX) { m = Ix_MATRIX; M.path[M.at(i, j)] = DIAGONAL; found = true; }
          else if ((m === M_MATRIX || m === Ix_MATRIX) && trace & Iy_MATRIX) { m = Iy_MATRIX; M.path[M.at(i, j)] = DIAGONAL; found = true; }
          if (!found) {
            m = M_MATRIX;
            i = iA;
            j = iB;
            continue;
          }
          break;
        }
      }
    }
    if (m === 0) {
      // We are at [nA][nB]. Find a suitable end point for a path.
      for (;;) {
        if (iB < nB) iB++;
        else if (iA < nA) { iA++; iB = 0; }
        else {
          M.path[0] = DONE;
          return null;
        }
        if (M.trace[M.at(iA, iB)]! & ENDPOINT) break;
      }
      M.path[M.at(iA, iB)] = 0;
      m = M_MATRIX;
      i = iA;
      j = iB;
    }
    // Follow the traceback until we reach a start point.
    for (;;) {
      if (m === Ix_MATRIX) {
        const lists = this.g(i, j);
        iB = j;
        let gap = at(lists.MIx, 0);
        if (gap) m = M_MATRIX;
        else { gap = at(lists.IyIx, 0); m = Iy_MATRIX; }
        iA = i - gap;
        while (i > iA) M.path[M.at(--i, iB)] = VERTICAL;
      } else if (m === Iy_MATRIX) {
        const lists = this.g(i, j);
        iA = i;
        let gap = at(lists.MIy, 0);
        if (gap) m = M_MATRIX;
        else { gap = at(lists.IxIy, 0); m = Ix_MATRIX; }
        iB = j - gap;
        while (j > iB) M.path[M.at(iA, --j)] = HORIZONTAL;
      } else {
        iA = i - 1;
        iB = j - 1;
        trace = M.trace[M.at(i, j)]!;
        if (trace & M_MATRIX) m = M_MATRIX;
        else if (trace & Ix_MATRIX) m = Ix_MATRIX;
        else if (trace & Iy_MATRIX) m = Iy_MATRIX;
        else if (trace === STARTPOINT) {
          this.iA = i;
          this.iB = j;
          return this.createPath(i, j);
        } else throw new RuntimeError("Unexpected trace in PathGenerator_next_waterman_smith_beyer_local");
        M.path[M.at(iA, iB)] = DIAGONAL;
      }
      i = iA;
      j = iB;
    }
  }

  protected count(): bigint {
    const { M, nA, nB } = this;
    const grid = (): bigint[][] => Array.from({ length: nA + 1 }, () => new Array<bigint>(nB + 1).fill(0n));
    const Mc = grid();
    const Ixc = grid();
    const Iyc = grid();
    const global = this.mode === "global";
    let total = 0n;
    for (let i = 0; i <= nA; i++) {
      for (let j = 0; j <= nB; j++) {
        let count = 0n;
        const trace = M.trace[M.at(i, j)]!;
        if (trace & M_MATRIX) count = safeAdd(Mc[i - 1]![j - 1]!, count);
        if (trace & Ix_MATRIX) count = safeAdd(Ixc[i - 1]![j - 1]!, count);
        if (trace & Iy_MATRIX) count = safeAdd(Iyc[i - 1]![j - 1]!, count);
        if (global) { if (count === 0n) count = 1n; /* happens at M[0][0] only */ }
        else if (count === 0n && trace & STARTPOINT) count = 1n;
        Mc[i]![j] = count;
        if (!global && trace & ENDPOINT) total = safeAdd(count, total);
        const lists = this.g(i, j);
        count = 0n;
        for (const gap of lists.MIx ?? []) count = safeAdd(Mc[i - gap]![j]!, count);
        for (const gap of lists.IyIx ?? []) count = safeAdd(Iyc[i - gap]![j]!, count);
        Ixc[i]![j] = count;
        count = 0n;
        for (const gap of lists.MIy ?? []) count = safeAdd(Mc[i]![j - gap]!, count);
        for (const gap of lists.IxIy ?? []) count = safeAdd(Ixc[i]![j - gap]!, count);
        Iyc[i]![j] = count;
      }
    }
    if (!global) return total;
    const end = this.g(nA, nB);
    let count = 0n;
    if (M.trace[M.at(nA, nB)]) count = safeAdd(Mc[nA]![nB]!, count);
    if (at(end.MIx, 0) || at(end.IyIx, 0)) count = safeAdd(Ixc[nA]![nB]!, count);
    if (at(end.MIy, 0) || at(end.IxIy, 0)) count = safeAdd(Iyc[nA]![nB]!, count);
    return count;
  }
}
