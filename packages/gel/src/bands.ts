/**
 * Turning a list of fragment sizes into the bands a gel would show.
 *
 * Over the range a gel separates, the distance a fragment migrates is very nearly a straight line in the logarithm
 * of its length — the standard first approximation, and the reason a gel photograph is read against a log scale.
 * So {@link bandPosition} interpolates in `log10(size)` between the gel's largest and smallest resolved fragment,
 * giving 0 at the wells and 1 at the running front.
 *
 * Two fragments of nearly the same size cannot be told apart by eye, so {@link bandsOf} merges sizes that fall
 * within a tolerance of each other into a single band and records how many fragments it holds. Fragments outside
 * the gel's range are not separated at all, so they are merged regardless of tolerance: the small ones pile up
 * together at the front, and the large ones stay bunched at the wells.
 */

import { ValueError } from "@biolibs/core";
import type { Resolving } from "./gels.js";

/** Default band-merging tolerance: fragments within 3% of each other run as one band. */
export const DEFAULT_TOLERANCE = 0.03;

/**
 * How far down the gel a fragment of `size` runs, as a fraction of the distance from the wells to the front.
 *
 * @param size - Fragment length in base pairs, or a protein's mass in kilodaltons.
 * @param gel - The range the gel separates.
 * @returns 0 at the wells, 1 at the front. Fragments larger than {@link Resolving.largest} clamp to 0 and ones
 *   smaller than {@link Resolving.smallest} clamp to 1, since the gel does not separate them.
 * @throws {@link ValueError} for a size that is not a positive finite number.
 * @example
 * ```ts
 * const gel = { id: "1.0", percent: 1, largest: 10000, smallest: 250 };
 * bandPosition(10000, gel); // 0
 * bandPosition(250, gel);   // 1
 * bandPosition(1581, gel);  // ~0.5 (the geometric mean of the two ends)
 * ```
 */
export function bandPosition(size: number, gel: Resolving): number {
  if (!Number.isFinite(size) || size <= 0) throw new ValueError(`fragment size must be a positive number, got ${size}`);
  const high = Math.log10(gel.largest);
  const low = Math.log10(gel.smallest);
  // A gel whose ends coincide separates nothing; put everything at the front rather than dividing by zero.
  if (high <= low) return 1;
  const fraction = (high - Math.log10(size)) / (high - low);
  return Math.min(1, Math.max(0, fraction));
}

/**
 * Whether a gel separates a fragment of this size from its neighbours, i.e. whether it falls inside the gel's
 * resolving range.
 *
 * @param size - Fragment length in base pairs.
 * @param gel - The gel being run.
 * @returns `true` when `gel.smallest <= size <= gel.largest`.
 */
export const resolves = (size: number, gel: Resolving): boolean => size <= gel.largest && size >= gel.smallest;

/** One visible band: the fragments that run together at a single place on the gel. */
export interface Band {
  /** Representative size — the largest in the band, in whatever the gel sorts by: base pairs for DNA, kilodaltons for protein. */
  size: number;
  /** Every size merged into this band, largest first. */
  sizes: readonly number[];
  /** Distance from the wells, 0 to 1, as {@link bandPosition} gives it. */
  position: number;
  /** The sizes in the band added up; a band holding more of what is stained shows more brightly. */
  totalBases: number;
  /** Brightness from 0 to 1, the band's share of the lane's total, scaled so the heaviest band is 1. */
  intensity: number;
  /**
   * True when every fragment in the band is outside the gel's resolving range, so the gel does not separate them:
   * below it they sit together at the running front, above it they stay bunched at the wells.
   */
  unresolved: boolean;
}

/**
 * The bands a lane would show, given the sizes of the fragments loaded into it.
 *
 * @param sizes - Fragment lengths in base pairs, in any order. Sizes of zero or less are rejected.
 * @param gel - The gel being run.
 * @param tolerance - Relative size difference below which two fragments run as one band. Defaults to
 *   {@link DEFAULT_TOLERANCE}; pass 0 to keep every distinct size apart.
 * @returns The bands, largest fragment first. An empty lane gives an empty array.
 * @throws {@link ValueError} for a non-positive size or a negative tolerance.
 * @example
 * ```ts
 * const gel = gelById("1.0");
 * bandsOf([2000, 2010, 500], gel).length; // 2 — 2000 and 2010 run together
 * ```
 */
export function bandsOf(sizes: readonly number[], gel: Resolving, tolerance = DEFAULT_TOLERANCE): Band[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new ValueError(`tolerance must be zero or more, got ${tolerance}`);
  for (const size of sizes) {
    if (!Number.isFinite(size) || size <= 0) throw new ValueError(`fragment size must be a positive number, got ${size}`);
  }
  if (sizes.length === 0) return [];

  const descending = [...sizes].sort((a, b) => b - a);

  // Walk down the sizes, starting a new group whenever the next fragment is further than `tolerance` from the
  // group's representative size. Comparing against the group's representative rather than the previous fragment is
  // what stops a run of near-neighbours chaining into one unbounded band.
  const groups: number[][] = [];
  for (const size of descending) {
    const current = groups[groups.length - 1];
    const representative = current?.[0];
    // Fragments the gel does not separate belong in one band however far apart they are: everything above the
    // range stays bunched at the wells, and everything below it runs off together at the front.
    const bothUnresolved = representative !== undefined
      && ((representative < gel.smallest && size < gel.smallest)
        || (representative > gel.largest && size > gel.largest));
    const closeEnough = representative !== undefined && representative - size <= representative * tolerance;
    if (current && (bothUnresolved || closeEnough)) current.push(size);
    else groups.push([size]);
  }

  const weights = groups.map((group) => group.reduce((sum, size) => sum + size, 0));
  const heaviest = Math.max(...weights);
  return groups.map((group, i) => ({
    size: group[0]!,
    sizes: group,
    position: bandPosition(group[0]!, gel),
    totalBases: weights[i]!,
    intensity: heaviest > 0 ? weights[i]! / heaviest : 0,
    unresolved: group.every((size) => !resolves(size, gel)),
  }));
}

/**
 * The bands a ladder would show on a gel, as a lane of single fragments.
 *
 * @param ladderSizes - The ladder's band sizes.
 * @param gel - The gel being run.
 * @returns One band per marker size, largest first, each of equal intensity. Markers the gel does not resolve are
 *   marked `unresolved` but, unlike a sample lane, are never merged: a ladder's bands are known sizes and worth
 *   showing individually even where the gel would not separate them.
 */
export function ladderBands(ladderSizes: readonly number[], gel: Resolving): Band[] {
  return [...ladderSizes]
    .sort((a, b) => b - a)
    .map((size) => ({
      size,
      sizes: [size],
      position: bandPosition(size, gel),
      totalBases: size,
      intensity: 1,
      unresolved: !resolves(size, gel),
    }));
}
