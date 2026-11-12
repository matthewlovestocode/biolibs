/** Path generator for the Gotoh algorithm (affine gaps): three states M, Ix (gap in the query) and Iy (gap in the target). */

import { RuntimeError } from "@biolibs/core";
import { PathGeneratorBase, safeAdd, type Path } from "./path-generator.js";
import { DIAGONAL, DONE, ENDPOINT, HORIZONTAL, Iy_MATRIX, Ix_MATRIX, M_MATRIX, NONE, STARTPOINT, TraceMatrix, VERTICAL } from "./trace.js";
import type { Mode } from "./state.js";

/** Walks the Gotoh trace matrices, in the same order as Biopython. */
export class GotohPathGenerator extends PathGeneratorBase {
  /** Traces of the Ix state (4 bits per cell in C). */
  readonly gapsIx: Uint8Array;
  /** Traces of the Iy state. */
  readonly gapsIy: Uint8Array;

  /** @param M - Trace matrix. @param nA - Target length. @param nB - Query length. @param mode - Global or local. @param strand - `"+"` or `"-"`. */
  constructor(M: TraceMatrix, nA: number, nB: number, mode: Mode, strand: string) {
    super(M, nA, nB, mode, strand);
    this.gapsIx = new Uint8Array((nA + 1) * (nB + 1));
    this.gapsIy = new Uint8Array((nA + 1) * (nB + 1));
  }

  next(): Path | null {
    return this.mode === "global" ? this.nextGlobal() : this.nextLocal();
  }

  reset(): void {
    if (this.mode === "local") { this.iA = 0; this.iB = 0; }
    if (this.M.path[0] !== NONE) this.M.path[0] = 0;
  }

  /** Trace of cell `(i, j)` in a state: the M matrix, Ix or Iy. */
  private gap(state: number, i: number, j: number): number {
    return state === Ix_MATRIX ? this.gapsIx[this.M.at(i, j)]! : this.gapsIy[this.M.at(i, j)]!;
  }

  private nextGlobal(): Path | null {
    const { M, nA, nB } = this;
    let i = 0;
    let j = 0;
    let m = M_MATRIX;
    let trace = 0;
    let path = M.path[M.at(i, j)]!;
    if (path === DONE) return null;
    if (path === 0) {
      i = nA;
      j = nB;
    } else {
      // We already have a path: prune it to find alternatives.
      for (;;) {
        path = M.path[M.at(i, j)]!;
        if (path === 0) {
          // The origin was reached: move on to the next state at the end point.
          if (m === M_MATRIX) m = Ix_MATRIX;
          else if (m === Ix_MATRIX) m = Iy_MATRIX;
          else if (m === Iy_MATRIX) m = 0;
          break;
        }
        if (path === HORIZONTAL) trace = this.gapsIy[M.at(i, ++j)]!;
        else if (path === VERTICAL) trace = this.gapsIx[M.at(++i, j)]!;
        else if (path === DIAGONAL) trace = M.trace[M.at(++i, ++j)]!;
        // C's switch on `m` falls through from M to Ix to Iy.
        let found = false;
        if (m === M_MATRIX && trace & Ix_MATRIX) { m = Ix_MATRIX; found = true; }
        else if ((m === M_MATRIX || m === Ix_MATRIX) && trace & Iy_MATRIX) { m = Iy_MATRIX; found = true; }
        if (!found) {
          if (path === HORIZONTAL) m = Iy_MATRIX;
          else if (path === VERTICAL) m = Ix_MATRIX;
          else if (path === DIAGONAL) m = M_MATRIX;
          continue;
        }
        if (path === HORIZONTAL) j--;
        else if (path === VERTICAL) i--;
        else if (path === DIAGONAL) { i--; j--; }
        M.path[M.at(i, j)] = path;
        break;
      }
    }
    if (path === 0) {
      // Generate a new path: pick the state at the end point (fallthrough M -> Ix -> Iy).
      let chosen = false;
      if (m === M_MATRIX && M.trace[M.at(nA, nB)]) chosen = true;
      if (!chosen && (m === M_MATRIX || m === Ix_MATRIX) && this.gapsIx[M.at(nA, nB)]) { m = Ix_MATRIX; chosen = true; }
      if (!chosen && (m === M_MATRIX || m === Ix_MATRIX || m === Iy_MATRIX) && this.gapsIy[M.at(nA, nB)]) { m = Iy_MATRIX; chosen = true; }
      if (!chosen) {
        // Exhausted this generator.
        M.path[0] = DONE;
        return null;
      }
    }
    if (m === M_MATRIX) {
      trace = M.trace[M.at(i, j)]!;
      path = DIAGONAL;
      i--; j--;
    } else if (m === Ix_MATRIX) {
      trace = this.gapsIx[M.at(i, j)]!;
      path = VERTICAL;
      i--;
    } else if (m === Iy_MATRIX) {
      trace = this.gapsIy[M.at(i, j)]!;
      path = HORIZONTAL;
      j--;
    }
    for (;;) {
      if (trace & M_MATRIX) {
        trace = M.trace[M.at(i, j)]!;
        M.path[M.at(i, j)] = path;
        path = DIAGONAL;
        i--; j--;
      } else if (trace & Ix_MATRIX) {
        M.path[M.at(i, j)] = path;
        trace = this.gapsIx[M.at(i, j)]!;
        path = VERTICAL;
        i--;
      } else if (trace & Iy_MATRIX) {
        M.path[M.at(i, j)] = path;
        trace = this.gapsIy[M.at(i, j)]!;
        path = HORIZONTAL;
        j--;
      } else break;
    }
    return this.createPath(0, 0);
  }

  private nextLocal(): Path | null {
    const { M, nA, nB } = this;
    let trace = 0;
    let i: number;
    let j: number;
    let m = M_MATRIX;
    let iA = this.iA;
    let iB = this.iB;
    let path = M.path[0]!;
    if (path === DONE) return null;
    path = M.path[M.at(iA, iB)]!;
    i = iA;
    j = iB;
    if (path) {
      for (;;) {
        // We already have a path: prune it to find alternatives.
        path = M.path[M.at(i, j)]!;
        if (path === 0) {
          m = M_MATRIX;
          iA = i;
          iB = j;
          break;
        }
        if (path === HORIZONTAL) trace = this.gapsIy[M.at(i, ++j)]!;
        else if (path === VERTICAL) trace = this.gapsIx[M.at(++i, j)]!;
        else if (path === DIAGONAL) trace = M.trace[M.at(++i, ++j)]!;
        let found = false;
        if (m === M_MATRIX && trace & Ix_MATRIX) { m = Ix_MATRIX; found = true; }
        else if ((m === M_MATRIX || m === Ix_MATRIX) && trace & Iy_MATRIX) { m = Iy_MATRIX; found = true; }
        if (!found) {
          if (path === HORIZONTAL) m = Iy_MATRIX;
          else if (path === VERTICAL) m = Ix_MATRIX;
          else if (path === DIAGONAL) m = M_MATRIX;
          continue;
        }
        if (path === HORIZONTAL) j--;
        else if (path === VERTICAL) i--;
        else if (path === DIAGONAL) { i--; j--; }
        M.path[M.at(i, j)] = path;
        break;
      }
    }
    if (path === 0) {
      // Find the end point of a new path.
      for (;;) {
        if (iB < nB) iB++;
        else if (iA < nA) { iA++; iB = 0; }
        else {
          M.path[0] = DONE;
          return null;
        }
        if (M.trace[M.at(iA, iB)]! & ENDPOINT) {
          M.path[M.at(iA, iB)] = 0;
          break;
        }
      }
      m = M_MATRIX;
      i = iA;
      j = iB;
    }
    for (;;) {
      if (m === M_MATRIX) trace = M.trace[M.at(i, j)]!;
      else if (m === Ix_MATRIX) trace = this.gapsIx[M.at(i, j)]!;
      else trace = this.gapsIy[M.at(i, j)]!;
      if (trace === STARTPOINT) {
        this.iA = i;
        this.iB = j;
        return this.createPath(i, j);
      }
      if (m === M_MATRIX) { path = DIAGONAL; i--; j--; }
      else if (m === Ix_MATRIX) { path = VERTICAL; i--; }
      else { path = HORIZONTAL; j--; }
      if (trace & M_MATRIX) m = M_MATRIX;
      else if (trace & Ix_MATRIX) m = Ix_MATRIX;
      else if (trace & Iy_MATRIX) m = Iy_MATRIX;
      else throw new RuntimeError("Unexpected trace in PathGenerator_next_gotoh_local");
      M.path[M.at(i, j)] = path;
    }
  }

  protected count(): bigint {
    return this.mode === "global" ? this.countGlobal() : this.countLocal();
  }

  private countGlobal(): bigint {
    const { M, nA, nB } = this;
    const Mc = new Array<bigint>(nB + 1).fill(0n);
    const Ixc = new Array<bigint>(nB + 1).fill(0n);
    const Iyc = new Array<bigint>(nB + 1).fill(0n);
    Mc[0] = 1n;
    for (let j = 1; j <= nB; j++) Iyc[j] = 1n;
    for (let i = 1; i <= nA; i++) {
      let Mt = Mc[0]!;
      Mc[0] = 0n;
      let Ixt = Ixc[0]!;
      Ixc[0] = 1n;
      let Iyt = Iyc[0]!;
      Iyc[0] = 0n;
      for (let j = 1; j <= nB; j++) {
        let count = 0n;
        let trace = M.trace[M.at(i, j)]!;
        if (trace & M_MATRIX) count = safeAdd(Mt, count);
        if (trace & Ix_MATRIX) count = safeAdd(Ixt, count);
        if (trace & Iy_MATRIX) count = safeAdd(Iyt, count);
        Mt = Mc[j]!;
        Mc[j] = count;
        count = 0n;
        trace = this.gapsIx[M.at(i, j)]!;
        if (trace & M_MATRIX) count = safeAdd(Mt, count);
        if (trace & Ix_MATRIX) count = safeAdd(Ixc[j]!, count);
        if (trace & Iy_MATRIX) count = safeAdd(Iyc[j]!, count);
        Ixt = Ixc[j]!;
        Ixc[j] = count;
        count = 0n;
        trace = this.gapsIy[M.at(i, j)]!;
        if (trace & M_MATRIX) count = safeAdd(Mc[j - 1]!, count);
        if (trace & Ix_MATRIX) count = safeAdd(Ixc[j - 1]!, count);
        if (trace & Iy_MATRIX) count = safeAdd(Iyc[j - 1]!, count);
        Iyt = Iyc[j]!;
        Iyc[j] = count;
      }
    }
    let count = 0n;
    if (M.trace[M.at(nA, nB)]) count = safeAdd(Mc[nB]!, count);
    if (this.gapsIx[M.at(nA, nB)]) count = safeAdd(Ixc[nB]!, count);
    if (this.gapsIy[M.at(nA, nB)]) count = safeAdd(Iyc[nB]!, count);
    return count;
  }

  private countLocal(): bigint {
    const { M, nA, nB } = this;
    const Mc = new Array<bigint>(nB + 1).fill(1n);
    const Ixc = new Array<bigint>(nB + 1).fill(0n);
    const Iyc = new Array<bigint>(nB + 1).fill(0n);
    let total = 0n;
    for (let i = 1; i <= nA; i++) {
      let Mt = Mc[0]!;
      Mc[0] = 1n;
      let Ixt = Ixc[0]!;
      Ixc[0] = 0n;
      let Iyt = Iyc[0]!;
      Iyc[0] = 0n;
      for (let j = 1; j <= nB; j++) {
        let count = 0n;
        let trace = M.trace[M.at(i, j)]!;
        if (trace & M_MATRIX) count = safeAdd(Mt, count);
        if (trace & Ix_MATRIX) count = safeAdd(Ixt, count);
        if (trace & Iy_MATRIX) count = safeAdd(Iyt, count);
        if (count === 0n && trace & STARTPOINT) count = 1n;
        Mt = Mc[j]!;
        Mc[j] = count;
        if (M.trace[M.at(i, j)]! & ENDPOINT) total = safeAdd(count, total);
        count = 0n;
        trace = this.gapsIx[M.at(i, j)]!;
        if (trace & M_MATRIX) count = safeAdd(Mt, count);
        if (trace & Ix_MATRIX) count = safeAdd(Ixc[j]!, count);
        if (trace & Iy_MATRIX) count = safeAdd(Iyc[j]!, count);
        Ixt = Ixc[j]!;
        Ixc[j] = count;
        count = 0n;
        trace = this.gapsIy[M.at(i, j)]!;
        if (trace & M_MATRIX) count = safeAdd(Mc[j - 1]!, count);
        if (trace & Ix_MATRIX) count = safeAdd(Ixc[j - 1]!, count);
        if (trace & Iy_MATRIX) count = safeAdd(Iyc[j - 1]!, count);
        Iyt = Iyc[j]!;
        Iyc[j] = count;
      }
    }
    return total;
  }
}
