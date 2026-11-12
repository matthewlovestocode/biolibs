/**
 * The traceback matrices of the aligner and the constants that describe them. Biopython packs a 5-bit `trace` and a
 * 3-bit `path` into one byte per cell; here they are two byte arrays.
 */

/** A step to the left in the matrix (a gap in the target). */
export const HORIZONTAL = 0x1;
/** A step up in the matrix (a gap in the query). */
export const VERTICAL = 0x2;
/** A diagonal step (a match or mismatch). */
export const DIAGONAL = 0x4;
/** The cell may start a local alignment. */
export const STARTPOINT = 0x8;
/** The cell may end a local alignment. */
export const ENDPOINT = 0x10;
/** Gotoh state: the main (match/mismatch) matrix. */
export const M_MATRIX = 0x1;
/** Gotoh state: a gap in the query. */
export const Ix_MATRIX = 0x2;
/** Gotoh state: a gap in the target. */
export const Iy_MATRIX = 0x4;
/** Path marker: all paths have been generated. */
export const DONE = 0x3;
/** Path marker: there are no alignments at all (local alignment of unrelated sequences). */
export const NONE = 0x7;

/** The 32-bit-style integer-matrix counter limit: Python's `PY_SSIZE_T_MAX`. */
export const SSIZE_MAX = (1n << 63n) - 1n;

/** A (nA+1) x (nB+1) matrix of trace and path bytes. */
export class TraceMatrix {
  /** Number of columns (nB + 1). */
  readonly width: number;
  /** The `trace` field of each cell. */
  readonly trace: Uint8Array;
  /** The `path` field of each cell. */
  readonly path: Uint8Array;

  /** @param nA - Rows minus one. @param nB - Columns minus one. */
  constructor(nA: number, nB: number) {
    this.width = nB + 1;
    this.trace = new Uint8Array((nA + 1) * (nB + 1));
    this.path = new Uint8Array((nA + 1) * (nB + 1));
  }

  /** Index of cell `(i, j)`. */
  at(i: number, j: number): number {
    return i * this.width + j;
  }
}
