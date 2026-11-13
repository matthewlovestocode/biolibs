/** `PairwiseAlignments`: the alignments found by the aligner, as a lazily evaluated, indexable sequence. */

import { IndexError } from "@biolibs/core";
import type { Path } from "../pairwise/path-generator.js";

/** What {@link PairwiseAlignments} needs from a path generator. */
export interface PathSource {
  /** The next path, or null. */
  next(): Path | null;
  /** Start again. */
  reset(): void;
  /** The number of paths. */
  length(): bigint;
}
import { Alignment } from "./alignment.js";

/**
 * Iterates over the pairwise alignments returned by the aligner. Indexing is fast for increasing indices and may
 * be slow for random access to many alignments. The number of alignments, {@link PairwiseAlignments.length}, is
 * calculated without generating them and can be astronomically large for poorly aligning sequences.
 */
export class PairwiseAlignments implements Iterable<Alignment> {
  /** The two sequences, as given to the aligner. */
  sequences: unknown[];
  /** The optimal alignment score, shared by all the alignments. */
  score: number;
  private index = -1;
  private current: Alignment | null = null;

  /** @param seqA - Target. @param seqB - Query. @param score - The optimal score. @param paths - Generator of the paths. */
  constructor(seqA: unknown, seqB: unknown, score: number, private readonly paths: PathSource) {
    this.sequences = [seqA, seqB];
    this.score = score;
  }

  /**
   * The number of optimal alignments.
   *
   * @throws RangeError when the number does not fit in 64 bits (Python raises `OverflowError`).
   */
  get length(): bigint {
    return this.paths.length();
  }

  /** The next alignment (advancing the internal position), or null when there are no more. */
  next(): Alignment | null {
    const path = this.paths.next();
    if (path === null) return null;
    this.index++;
    const alignment = new Alignment(this.sequences, path);
    alignment.score = this.score;
    this.current = alignment;
    return alignment;
  }

  /** Start again from the first alignment. */
  rewind(): void {
    this.paths.reset();
    this.index = -1;
  }

  /**
   * The alignment at `index` (negative counts from the end), re-running the generator when going backwards.
   *
   * @throws {@link IndexError} when out of range.
   * @throws TypeError when `index` is not an integer.
   */
  get(index: number): Alignment {
    if (!Number.isInteger(index)) throw new TypeError(`index must be an integer, not ${typeof index === "number" ? "float" : typeof index}`);
    if (index < 0) index += Number(this.paths.length());
    if (index === this.index) return this.current!;
    if (index < this.index) {
      this.paths.reset();
      this.index = -1;
    }
    for (;;) {
      const alignment = this.next();
      if (alignment === null) throw new IndexError("index out of range");
      if (this.index === index) return alignment;
    }
  }

  /** Iterate over all the alignments from the beginning. */
  [Symbol.iterator](): Iterator<Alignment> {
    this.rewind();
    return { next: (): IteratorResult<Alignment> => {
      const a = this.next();
      return a === null ? { done: true, value: undefined } : { done: false, value: a };
    } };
  }
}
