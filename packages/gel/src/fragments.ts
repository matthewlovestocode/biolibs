/**
 * Fragment sizes from cut positions, so a digest can be loaded onto a gel without pulling in an enzyme library.
 *
 * Positions are 0-based offsets into the sequence, counted as boundaries between bases: a cut at `n` separates the
 * base at index `n - 1` from the base at index `n`. This is the half-open convention used across biolibs, so a cut
 * list is directly usable as slice boundaries. (Biopython's `RestrictionType.search` returns 1-based positions;
 * subtract one from each before passing them here.)
 */

import { ValueError } from "@biolibs/core";

/** Whether a sequence is a line with two ends or a closed circle. */
export type Topology = "linear" | "circular";

/**
 * The lengths of the pieces a set of cuts divides a sequence into.
 *
 * A linear sequence with `n` cuts falls into `n + 1` pieces, including the two uncut ends. A circular sequence with
 * `n` cuts falls into `n` pieces, one of which spans the origin; an uncut circle stays whole.
 *
 * @param length - Sequence length in bases.
 * @param topology - `"linear"` or `"circular"`.
 * @param cuts - 0-based cut positions, in any order. Duplicates count once, since two enzymes cutting the same
 *   bond produce one break.
 * @returns The piece lengths, largest first. Cuts at 0 or at `length` on a linear sequence are the existing ends and
 *   add no piece; zero-length pieces are never returned.
 * @throws {@link ValueError} for a negative or non-integer length, or a cut outside `[0, length]`.
 * @example
 * ```ts
 * fragmentSizes(1000, "linear", [100, 400]);   // [600, 300, 100]
 * fragmentSizes(1000, "circular", [100, 400]); // [700, 300]
 * fragmentSizes(1000, "circular", []);         // [1000]
 * ```
 */
export function fragmentSizes(length: number, topology: Topology, cuts: readonly number[]): number[] {
  if (!Number.isInteger(length) || length < 0) throw new ValueError(`sequence length must be a non-negative integer, got ${length}`);
  for (const cut of cuts) {
    if (!Number.isInteger(cut) || cut < 0 || cut > length) throw new ValueError(`cut position ${cut} is outside a sequence of ${length} bases`);
  }

  const ordered = [...new Set(cuts)].sort((a, b) => a - b);
  if (length === 0) return [];
  if (ordered.length === 0) return [length];

  const sizes: number[] = [];
  if (topology === "linear") {
    // The two ends are pieces too: from the start to the first cut, and from the last cut to the end.
    let previous = 0;
    for (const cut of ordered) {
      sizes.push(cut - previous);
      previous = cut;
    }
    sizes.push(length - previous);
  } else {
    // On a circle every piece runs from one cut to the next, and the last wraps through the origin.
    for (let i = 0; i < ordered.length - 1; i++) sizes.push(ordered[i + 1]! - ordered[i]!);
    sizes.push(length - ordered[ordered.length - 1]! + ordered[0]!);
  }
  return sizes.filter((size) => size > 0).sort((a, b) => b - a);
}
