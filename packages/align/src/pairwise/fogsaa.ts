/**
 * The Fast Optimal Global Sequence Alignment Algorithm (FOGSAA): a global alignment found by a best-first search
 * with score bounds, ported from Biopython's C code. It returns one optimal alignment (not all of them), and it can
 * give wrong results when the match score is below the mismatch score or a gap score exceeds the mismatch score
 * (Biopython warns about this, and so does this port).
 */

import { RuntimeError, warn } from "@biolibs/core";
import { PathGeneratorBase, type Path } from "./path-generator.js";
import type { AlignResult } from "./align-linear.js";
import type { AlignScore } from "./score-linear.js";
import type { GapScores } from "./state.js";
import { DIAGONAL, DONE, HORIZONTAL, STARTPOINT, TraceMatrix, VERTICAL } from "./trace.js";

/** A node of the search queue: a cell with the child still to be explored and its bounds. */
interface QueueNode {
  pA: number;
  pB: number;
  typeUptoNext: number;
  nextType: number;
  nextLower: number;
  nextUpper: number;
}

/** Whether node `a` has higher priority than `b`: higher upper bound, or equal upper bound and higher lower bound. */
const higher = (a: QueueNode, b: QueueNode): boolean => a.nextUpper > b.nextUpper || (a.nextUpper === b.nextUpper && a.nextLower > b.nextLower);

/** A max-heap of {@link QueueNode}s, with Biopython's tie-breaking. */
class Queue {
  readonly array: QueueNode[] = [];
  get size(): number { return this.array.length; }

  insert(node: QueueNode): void {
    const a = this.array;
    let i = a.length;
    a.push(node);
    while (i !== 0 && !higher(a[Math.floor((i - 1) / 2)]!, a[i]!)) {
      const parent = Math.floor((i - 1) / 2);
      [a[i], a[parent]] = [a[parent]!, a[i]!];
      i = parent;
    }
  }

  pop(): QueueNode {
    const a = this.array;
    const root = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        let largest = i;
        if (2 * i + 1 < a.length && !higher(a[i]!, a[2 * i + 1]!)) largest = 2 * i + 1;
        if (2 * i + 2 < a.length && !higher(a[largest]!, a[2 * i + 2]!)) largest = 2 * i + 2;
        if (largest === i) break;
        [a[i], a[largest]] = [a[largest]!, a[i]!];
        i = largest;
      }
    }
    return root;
  }
}

/** Warn the way Biopython does when the scores can make FOGSAA return a non-optimal alignment. */
export function checkFogsaaScores(s: GapScores, match: number, mismatch: number): void {
  if (mismatch >= match) warn("Match score is less than mismatch score. Algorithm may return incorrect results.", "BiopythonWarning");
  if (s.openLeftDeletionScore > mismatch || s.openInternalDeletionScore > mismatch || s.openRightDeletionScore > mismatch
    || s.openLeftInsertionScore > mismatch || s.openInternalInsertionScore > mismatch || s.openRightInsertionScore > mismatch
    || s.extendLeftDeletionScore > mismatch || s.extendInternalDeletionScore > mismatch || s.extendRightDeletionScore > mismatch
    || s.extendLeftInsertionScore > mismatch || s.extendInternalInsertionScore > mismatch || s.extendRightInsertionScore > mismatch) {
    warn("One or more gap scores are greater than mismatch score. Algorithm may return incorrect results.", "BiopythonWarning");
  }
}

/** What the search leaves behind: the score and, per cell, how its best path arrived. */
interface Search {
  /** Score of the optimal alignment. */
  score: number;
  /** Per cell: the move that reached it (`DIAGONAL`, `HORIZONTAL`, `VERTICAL`, `STARTPOINT` or 0). */
  type: Int32Array;
}

/**
 * Run the search.
 *
 * @param match - Best letter score, used for the bounds (the largest matrix entry when a matrix is in use).
 * @param mismatch - Worst letter score, used for the bounds (the smallest matrix entry).
 * @param align - The score of aligning two letters.
 * @throws {@link RuntimeError} if the search ends before the bounds meet.
 */
function search(s: GapScores, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore, match: number, mismatch: number): Search {
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

  const size = (nA + 1) * (nB + 1);
  const present = new Float64Array(size);
  const lowerOf = new Float64Array(size);
  const upperOf = new Float64Array(size);
  const type = new Int32Array(size);
  const filled = new Uint8Array(size);
  const leftGap = new Uint8Array(size);
  const at = (a: number, b: number): number => a * (nB + 1) + b;

  /** `FOGSAA_CALCULATE_SCORE`: lower and upper bounds on the final score from cell `(pA, pB)` reached by `currType`. */
  const bounds = (curr: number, currType: number, pA: number, pB: number): [number, number] => {
    let lower: number;
    let upper: number;
    if (nA - pA <= nB - pB) {
      if (pA === nA && currType === HORIZONTAL) {
        lower = curr + rightExtendA * (nB - pB);
        upper = curr + rightExtendA * (nB - pB);
      } else {
        lower = curr + (nA - pA) * mismatch;
        upper = curr + (nA - pA) * match;
        const t = rightOpenA + rightExtendA * (nB - pB - (nA - pA) - 1);
        const t2 = gapExtendA * (nB - pB - (nA - pA));
        if (currType === HORIZONTAL && t2 > t) { lower += t2; upper += t2; }
        else { lower += t; upper += t; }
      }
    } else if (pB === nB && currType === VERTICAL) {
      lower = curr + rightExtendB * (nA - pA);
      upper = curr + rightExtendB * (nA - pA);
    } else {
      lower = curr + (nB - pB) * mismatch;
      upper = curr + (nB - pB) * match;
      const t = rightOpenB + rightExtendB * (nA - pA - (nB - pB) - 1);
      const t2 = gapExtendB * (nA - pA - (nB - pB));
      if (currType === VERTICAL && t2 > t) { lower += t2; upper += t2; }
      else { lower += t; upper += t; }
    }
    return [lower, upper];
  };

  present[0] = 0;
  type[0] = STARTPOINT;
  [lowerOf[0]!, upperOf[0]!] = bounds(0, STARTPOINT, 0, 0);
  leftGap[0] = 1;
  const initialLower = lowerOf[0]!;
  let lowerBound = initialLower;
  const queue = new Queue();
  let curpA = 0;
  let curpB = 0;
  let typeTotal = 1;
  let newType = 0;
  let npA = 0;
  let npB = 0;
  let newScore = 0;
  let newLower = 0;
  let newUpper = 0;
  let nextLower = 0;
  let nextUpper = 0;
  let pathend = 1;

  do {
    pathend = 1;
    while (curpA < nA || curpB < nB) {
      const curr = at(curpA, curpB);
      const currScore = present[curr]!;
      const currType = type[curr]!;
      const currLeft = leftGap[curr] === 1;
      if (typeTotal === DIAGONAL || typeTotal === HORIZONTAL || typeTotal === VERTICAL) {
        // The current cell is being expanded for the first time.
        if (curpA <= nA - 1 && curpB <= nB - 1) {
          const p = align(sA[curpA]!, sB[curpB]!);
          const childL = [0, 0, 0];
          const childU = [0, 0, 0];
          [childL[0]!, childU[0]!] = bounds(currScore + p, DIAGONAL, curpA + 1, curpB + 1);
          if (currType === DIAGONAL || currType === STARTPOINT) {
            if (!currLeft) {
              [childL[1]!, childU[1]!] = bounds(currScore + gapOpenA, HORIZONTAL, curpA, curpB + 1);
              [childL[2]!, childU[2]!] = bounds(currScore + gapOpenB, VERTICAL, curpA + 1, curpB);
            } else {
              [childL[1]!, childU[1]!] = bounds(currScore + leftOpenA, HORIZONTAL, curpA, curpB + 1);
              [childL[2]!, childU[2]!] = bounds(currScore + leftOpenB, VERTICAL, curpA + 1, curpB);
            }
          } else if (currType === HORIZONTAL) {
            if (!currLeft) {
              [childL[1]!, childU[1]!] = bounds(currScore + gapExtendA, HORIZONTAL, curpA, curpB + 1);
              [childL[2]!, childU[2]!] = bounds(currScore + gapOpenB, VERTICAL, curpA + 1, curpB);
            } else {
              [childL[1]!, childU[1]!] = bounds(currScore + leftExtendA, HORIZONTAL, curpA, curpB + 1);
              [childL[2]!, childU[2]!] = bounds(currScore + leftOpenB, VERTICAL, curpA + 1, curpB);
            }
          } else if (!currLeft) {
            [childL[1]!, childU[1]!] = bounds(currScore + gapOpenA, HORIZONTAL, curpA, curpB + 1);
            [childL[2]!, childU[2]!] = bounds(currScore + gapExtendB, VERTICAL, curpA + 1, curpB);
          } else {
            [childL[1]!, childU[1]!] = bounds(currScore + leftOpenA, HORIZONTAL, curpA, curpB + 1);
            [childL[2]!, childU[2]!] = bounds(currScore + leftExtendB, VERTICAL, curpA + 1, curpB);
          }
          // Sort the three children (two bubble passes) and take the best as the new cell.
          const childT = [DIAGONAL, HORIZONTAL, VERTICAL];
          for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2 - i; j++) {
              if (childL[j]! < childL[j + 1]! || (childL[j] === childL[j + 1] && childU[j]! < childU[j + 1]!)) {
                [childL[j], childL[j + 1]] = [childL[j + 1]!, childL[j]!];
                [childT[j], childT[j + 1]] = [childT[j + 1]!, childT[j]!];
                [childU[j], childU[j + 1]] = [childU[j + 1]!, childU[j]!];
              }
            }
          }
          newType = childT[0]!;
          if (newType === DIAGONAL) {
            npA = curpA + 1;
            npB = curpB + 1;
            newScore = currScore + p;
          } else if (newType === HORIZONTAL) {
            npA = curpA;
            npB = curpB + 1;
            newScore = currLeft ? currScore + (currType === HORIZONTAL ? leftExtendA : leftOpenA) : currScore + (currType === HORIZONTAL ? gapExtendA : gapOpenA);
          } else {
            npA = curpA + 1;
            npB = curpB;
            newScore = currLeft ? currScore + (currType === VERTICAL ? leftExtendB : leftOpenB) : currScore + (currType === VERTICAL ? gapExtendB : gapOpenB);
          }
          if (childU[1]! >= initialLower) queue.insert({ pA: curpA, pB: curpB, typeUptoNext: newType + childT[1]!, nextType: childT[1]!, nextLower: childL[1]!, nextUpper: childU[1]! });
        } else if (curpA <= nA - 1) {
          // At the end of B: a gap in B is forced.
          newType = VERTICAL;
          npA = curpA + 1;
          npB = curpB;
          newScore = currScore + (currType === VERTICAL ? rightExtendB : rightOpenB);
        } else {
          newType = HORIZONTAL;
          npA = curpA;
          npB = curpB + 1;
          newScore = currScore + (currType === HORIZONTAL ? rightExtendA : rightOpenA);
        }
      } else if (typeTotal === DIAGONAL + HORIZONTAL || typeTotal === DIAGONAL + VERTICAL || typeTotal === HORIZONTAL + VERTICAL) {
        // The current cell comes back from the queue as a second child.
        if (newType === DIAGONAL) {
          npA = curpA + 1;
          npB = curpB + 1;
          newScore = currScore + (sA[curpA] === sB[curpB] ? match : mismatch);
          if (7 - typeTotal === HORIZONTAL) {
            if (currType !== HORIZONTAL) [nextLower, nextUpper] = bounds(currScore + (currLeft ? leftOpenA : gapOpenA), HORIZONTAL, curpA, curpB + 1);
            else [nextLower, nextUpper] = bounds(currScore + (currLeft ? leftExtendA : gapExtendA), HORIZONTAL, curpA, curpB + 1);
          } else if (currType !== VERTICAL) [nextLower, nextUpper] = bounds(currScore + (currLeft ? leftOpenB : gapOpenB), VERTICAL, curpA, curpB + 1);
          else [nextLower, nextUpper] = bounds(currScore + (currLeft ? leftExtendB : gapExtendB), VERTICAL, curpA, curpB + 1);
        } else if (newType === HORIZONTAL) {
          npA = curpA;
          npB = curpB + 1;
          newScore = currScore + (currType === HORIZONTAL ? gapExtendA : gapOpenA);
          if (7 - typeTotal === DIAGONAL) [nextLower, nextUpper] = bounds(currScore + align(sA[curpA]!, sB[curpB]!), DIAGONAL, curpA + 1, curpB + 1);
          else if (currType !== VERTICAL) [nextLower, nextUpper] = bounds(currScore + (currLeft ? leftOpenB : gapOpenB), VERTICAL, curpA, curpB + 1);
          else [nextLower, nextUpper] = bounds(currScore + (currLeft ? leftExtendB : gapExtendB), VERTICAL, curpA, curpB + 1);
        } else {
          npA = curpA + 1;
          npB = curpB;
          newScore = currScore + (currType === VERTICAL ? gapExtendB : gapOpenB);
          if (7 - typeTotal === DIAGONAL) [nextLower, nextUpper] = bounds(currScore + align(sA[curpA]!, sB[curpB]!), DIAGONAL, curpA + 1, curpB + 1);
          else if (currType !== HORIZONTAL) [nextLower, nextUpper] = bounds(currScore + (currLeft ? leftOpenA : gapOpenA), HORIZONTAL, curpA, curpB + 1);
          else [nextLower, nextUpper] = bounds(currScore + (currLeft ? leftExtendA : gapExtendA), HORIZONTAL, curpA, curpB + 1);
        }
        if (nextUpper >= initialLower) queue.insert({ pA: curpA, pB: curpB, typeUptoNext: 7, nextType: 7 - typeTotal, nextLower, nextUpper });
      } else if (typeTotal === DIAGONAL + HORIZONTAL + VERTICAL) {
        // The current cell comes back as the third (last) child.
        if (newType === DIAGONAL) {
          npA = curpA + 1;
          npB = curpB + 1;
          newScore = currScore + align(sA[curpA]!, sB[curpB]!);
        } else if (newType === HORIZONTAL) {
          npA = curpA;
          npB = curpB + 1;
          newScore = currType !== HORIZONTAL ? currScore + (currLeft ? leftOpenA : gapOpenA) : currScore + (currLeft ? leftExtendA : gapExtendA);
        } else {
          npA = curpA + 1;
          npB = curpB;
          newScore = currType !== VERTICAL ? currScore + (currLeft ? leftOpenB : gapOpenB) : currScore + (currLeft ? leftExtendB : gapExtendB);
        }
      }
      // Biopython indexes its matrix without a bounds check here and can crash the interpreter; refuse instead.
      if (npA > nA || npB > nB || npA < 0 || npB < 0) throw new RuntimeError("FOGSAA stepped outside the score matrix (Biopython reads out of bounds at this point)");
      // Write the new cell, unless a better path already reaches it.
      const target = at(npA, npB);
      if (filled[target] === 1 && type[target]! <= 4 && present[target]! >= newScore) {
        pathend = 0;
        break;
      }
      [newLower, newUpper] = bounds(newScore, newType, npA, npB);
      present[target] = newScore;
      lowerOf[target] = newLower;
      upperOf[target] = newUpper;
      type[target] = newType;
      filled[target] = 1;
      leftGap[target] = newType === HORIZONTAL || newType === VERTICAL ? (currLeft ? 1 : 0) : 0;
      curpA = npA;
      curpB = npB;
      typeTotal = 1;
      if (upperOf[target]! < lowerBound && lowerBound - upperOf[target]! > epsilon) {
        pathend = 0;
        break;
      }
    }
    const here = at(curpA, curpB);
    if (present[here]! > lowerBound && present[here]! - lowerBound > epsilon && pathend === 1) lowerBound = present[here]!;
    if (queue.size > 0) {
      const root = queue.pop();
      curpA = root.pA;
      curpB = root.pB;
      typeTotal = root.typeUptoNext;
      newLower = root.nextLower;
      newUpper = root.nextUpper;
      newType = root.nextType;
    } else break;
  } while (lowerBound < newUpper && newUpper - lowerBound > epsilon);
  if (lowerBound < newUpper && newUpper - lowerBound > epsilon) throw new RuntimeError("Algorithm ended incomplete. Report this as a bug.");
  return { score: present[at(nA, nB)]!, type };
}

/** FOGSAA score. @throws {@link RuntimeError} if the search ends incomplete. */
export function fogsaaScore(s: GapScores, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore, match: number, mismatch: number): number {
  checkFogsaaScores(s, match, mismatch);
  return search(s, epsilon, sA, sB, strand, align, match, mismatch).score;
}

/** The single alignment FOGSAA finds. */
export class FogsaaPathGenerator extends PathGeneratorBase {
  next(): Path | null {
    const idx = this.M.at(this.nA, this.nB);
    if (this.M.path[idx] === DONE) return null;
    const path = this.createPath(0, 0);
    this.M.path[idx] = DONE;
    return path;
  }

  reset(): void {
    this.M.path[this.M.at(this.nA, this.nB)] = 0;
  }

  protected count(): bigint {
    return 1n;
  }
}

/** FOGSAA alignment: the score and a generator yielding the one optimal alignment found. */
export function fogsaaAlign(s: GapScores, epsilon: number, sA: Int32Array, sB: Int32Array, strand: string, align: AlignScore, match: number, mismatch: number): AlignResult<FogsaaPathGenerator> {
  checkFogsaaScores(s, match, mismatch);
  const nA = sA.length;
  const nB = sB.length;
  const found = search(s, epsilon, sA, sB, strand, align, match, mismatch);
  const M = new TraceMatrix(nA, nB);
  M.path[0] = 0;
  // Copy only the cells of the optimal path into trace and path.
  let i = nA;
  let j = nB;
  for (;;) {
    const t = found.type[i * (nB + 1) + j]!;
    if (t === 0 || t === STARTPOINT) {
      M.trace[M.at(i, j)] = 0;
      break;
    }
    if (t === DIAGONAL) { M.trace[M.at(i, j)] = DIAGONAL; M.path[M.at(--i, --j)] = DIAGONAL; }
    else if (t === HORIZONTAL) { M.trace[M.at(i, j)] = HORIZONTAL; M.path[M.at(i, --j)] = HORIZONTAL; }
    else if (t === VERTICAL) { M.trace[M.at(i, j)] = VERTICAL; M.path[M.at(--i, j)] = VERTICAL; }
    else throw new RuntimeError("Unexpected FOGSAA cell type. Report this as a bug.");
  }
  M.path[M.at(nA, nB)] = 0;
  return { score: found.score, paths: new FogsaaPathGenerator(M, nA, nB, "global", strand) };
}
