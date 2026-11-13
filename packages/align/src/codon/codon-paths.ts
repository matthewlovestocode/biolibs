/** The path generator of the codon aligner (the `PathGenerator` of Biopython's `_codonaligner.c`). */

import { OVERFLOW, safeAdd, type Path } from "../pairwise/path-generator.js";
import { SSIZE_MAX } from "../pairwise/trace.js";

const MINUS_TWO = 0x1, MINUS_ONE = 0x2, NONE = 0x4, PLUS_ONE = 0x8, PLUS_TWO = 0x10;
const DONE = 6, NONE_MARK = 7;

/** Walks the traceback matrix and yields every optimal alignment as `[targetCoordinates, queryCoordinates]`. */
export class CodonPaths {
  /** The `path` field of every cell (what Biopython packs next to `trace` in one byte). */
  private readonly path: Uint8Array[];
  private cached: bigint | null = null;

  /**
   * @param trace - Per-cell traceback flags, `nA + 1` rows of `nB + 1`.
   * @param nA - Protein length.
   * @param nB - Number of query positions.
   * @param _row - Unused (kept so callers can hand over the last score row).
   */
  constructor(private readonly trace: Uint8Array[], private readonly nA: number, private readonly nB: number, _row: Float64Array) {
    this.path = trace.map((r) => new Uint8Array(r.length));
    // Biopython clears the path of the end points that carry a trace (`M[nA][j].path = 0` for the best ones).
  }

  /** The number of optimal alignments. @throws RangeError past the 64-bit range. */
  length(): bigint {
    if (this.cached === null) {
      const { nA, nB, trace } = this;
      let counts2: bigint[] = new Array<bigint>(nB + 1).fill(1n);
      for (let i = 1; i <= nA; i++) {
        const counts1 = counts2;
        counts2 = new Array<bigint>(nB + 1).fill(0n);
        for (let j = 0; j <= nB; j++) {
          const t = trace[i]![j]!;
          let count = 0n;
          if (t & MINUS_TWO) count = safeAdd(counts1[j - 1]!, count);
          if (t & MINUS_ONE) count = safeAdd(counts1[j - 2]!, count);
          if (t & NONE) count = safeAdd(counts1[j - 3]!, count);
          if (t & PLUS_ONE) count = safeAdd(counts1[j - 4]!, count);
          if (t & PLUS_TWO) count = safeAdd(counts1[j - 5]!, count);
          counts2[j] = count;
        }
      }
      let total = 0n;
      for (let j = 0; j <= nB; j++) total += counts2[j]!;
      this.cached = total;
    }
    if (this.cached === OVERFLOW) throw new RangeError(`number of optimal alignments is larger than ${SSIZE_MAX}`);
    return this.cached;
  }

  /** Start again from the first alignment. */
  reset(): void {
    if (this.path[0]![0] !== NONE_MARK) this.path[0]![0] = 0;
  }

  /** The next alignment's coordinates, or null when there are none left. */
  next(): Path | null {
    const { nA, nB, trace, path: P } = this;
    let i = 0, j: number, path = 0;
    if (P[0]![0] === DONE) return null;
    for (j = 0; j <= nB; j++) {
      path = P[0]![j]!;
      if (path) {
        // We already have a path: prune it to see if there is an alternative.
        P[0]![j] = 0;
        for (;;) {
          j += path;
          const t = trace[i + 1]![j]!;
          if (path === 1 && t & MINUS_ONE) { path = 2; break; }
          else if (path <= 2 && t & NONE) { path = 3; break; }
          else if (path <= 3 && t & PLUS_ONE) { path = 4; break; }
          else if (path <= 4 && t & PLUS_TWO) { path = 5; break; }
          i++;
          path = P[i]![j]!;
          if (!path) break;
        }
        if (path) { j -= path; P[i]![j] = path; }
        break;
      }
    }
    if (path === 0) {
      // Find the next end point.
      if (i === 0) { j = 0; i = nA; } else j++;
      for (; j <= nB; j++) if (trace[nA]![j]) break;
      if (j > nB) { P[0]![0] = DONE; return null; }
    }
    // Follow the traceback until the origin.
    for (;;) {
      const t = trace[i]![j!]!;
      if (t & MINUS_TWO) path = 1;
      else if (t & MINUS_ONE) path = 2;
      else if (t & NONE) path = 3;
      else if (t & PLUS_ONE) path = 4;
      else if (t & PLUS_TWO) path = 5;
      else break;
      j! -= path;
      i--;
      P[i]![j!] = path;
    }
    return this.createPath(j!);
  }

  private createPath(j0: number): Path {
    const P = this.path;
    let j = j0;
    // First pass: count the coordinates.
    let n = 1, direction = 0, k = 0, l = j;
    for (;;) {
      const path = P[k]![l]!;
      if (!path) break;
      if (path % 3 !== 0) { n += 2; direction = 3; }
      else if (path !== direction) { n++; direction = path; }
      l += path; k++;
    }
    const target: number[] = [], query: number[] = [];
    let i = 0;
    direction = 0;
    for (;;) {
      const path = P[i]![j]!;
      if (path % 3 !== 0) {
        target.push(i); query.push(j);
        j += path - 3;
        target.push(i); query.push(j);
        direction = 3;
      } else if (path !== direction) {
        target.push(i); query.push(j);
        direction = path;
        if (path === 0) return [target, query];
      }
      i++; j += 3;
    }
  }
}
