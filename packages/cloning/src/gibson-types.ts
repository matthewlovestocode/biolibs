/**
 * What a Gibson assembly is made of: the fragments going in, the rings coming out, and the overlap search that
 * decides which fragments can follow which.
 *
 * Gibson assembly needs no enzymes and no cut sites. An exonuclease chews back each fragment's 5' ends, the overlaps
 * — identical stretches at the end of one fragment and the start of the next — anneal, and a polymerase and ligase
 * fill and seal. So the whole method rests on {@link overlapLength}: which fragment ends share a long enough
 * identical stretch.
 */

import { ValueError } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";

/** Most fragments one assembly may use. */
export const MAX_FRAGMENTS = 8;

/** Most rings reported for one call. */
export const MAX_GIBSON_PRODUCTS = 20;

/** Shortest overlap that anneals dependably. */
export const MIN_OVERLAP = 15;

/** Longest overlap worth designing; beyond this the primers get unwieldy. */
export const MAX_OVERLAP = 60;

/** One fragment going into an assembly. */
export interface GibsonFragment {
  /** What to call it in a result. */
  name: string;
  /** Its sequence, 5' to 3', unambiguous DNA. */
  residues: string;
  /** The record it came from, so its features can be carried into the ring. Optional. */
  record?: SeqRecord;
}

/** How an assembly is searched for. */
export interface GibsonOptions {
  /** Shortest overlap accepted. Defaults to {@link MIN_OVERLAP}. */
  minOverlap?: number;
  /** Longest overlap looked for. Defaults to {@link MAX_OVERLAP}. */
  maxOverlap?: number;
  /** Whether a fragment may be turned over. Defaults to true. */
  allowFlips?: boolean;
}

/** The defaults: overlaps of 15 to 60 bases, fragments may be turned over. */
export const DEFAULT_GIBSON: Required<GibsonOptions> = { minOverlap: MIN_OVERLAP, maxOverlap: MAX_OVERLAP, allowFlips: true };

/** One junction in a ring. */
export interface GibsonJunction {
  /** The fragment before the junction. */
  from: string;
  /** The fragment after it. */
  to: string;
  /** The overlapping sequence, which appears once in the product. */
  overlap: string;
  /** Its length in bases. */
  length: number;
  /** Its melting temperature in °C, which is what decides whether it anneals. */
  tm: number;
}

/** One ring an assembly can make. */
export interface GibsonProduct {
  /** The ring as a record, with the features of every fragment. Its `topology` annotation is `"circular"`. */
  record: SeqRecord;
  /** Length in base pairs. */
  length: number;
  /** The fragments in the order they go round, with `flipped` saying which were turned over. */
  order: { name: string; flipped: boolean }[];
  /** The junctions, in the same order: `junctions[i]` joins `order[i]` to `order[i + 1]`, the last closing the ring. */
  junctions: GibsonJunction[];
  /** A sentence describing the product, suitable for a list. */
  description: string;
}

/** What came of an assembly. */
export type GibsonResult =
  | { ok: true; products: GibsonProduct[] }
  | { ok: false; error: string };

/**
 * The length of the longest overlap between the end of `a` and the start of `b`.
 *
 * @param a - The sequence on the left.
 * @param b - The sequence on the right.
 * @param min - Shortest overlap accepted.
 * @param max - Longest overlap looked for.
 * @returns The overlap length, or 0 when there is none in range. The longest is preferred, since that is the one the
 *   annealing would actually use. An overlap can never be the whole of either sequence: a junction where one
 *   fragment lies entirely inside the overlap contributes nothing to the ring, and taking it would also make every
 *   sequence overlap itself completely.
 * @throws {@link ValueError} for a `min` above `max`, or a `min` below 1.
 * @example
 * ```ts
 * overlapLength("AAAGGTACC", "GGTACCTTT", 6, 60); // 6
 * overlapLength("CCCGGG", "AAACCC", 3, 60);       // 0 — not symmetric
 * overlapLength("ACGTACGT", "ACGTACGT", 3, 60);   // 0 — not the whole of either sequence
 * ```
 */
export function overlapLength(a: string, b: string, min: number, max: number): number {
  if (min < 1) throw new ValueError(`the shortest overlap must be at least 1, got ${min}`);
  if (min > max) throw new ValueError(`the shortest overlap ${min} is longer than the longest ${max}`);
  // Stopping one short of each length is what keeps a sequence from overlapping itself end to end, which would
  // make a single fragment close into a ring of nothing.
  const limit = Math.min(max, a.length - 1, b.length - 1);
  for (let size = limit; size >= min; size--) {
    if (a.slice(a.length - size) === b.slice(0, size)) return size;
  }
  return 0;
}
