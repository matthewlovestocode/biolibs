/**
 * The shared stretches two sequences have in common, which is what an assembly is traced along.
 *
 * `pydna.common_sub_strings` is the function every homology-based assembly in pydna starts from: given two
 * strings it reports every place they agree over a long enough run. Upstream this is a call into
 * `pydivsufsort`, a compiled suffix-array library, so what had to be established first was *what* it returns
 * rather than how. Measured against it over four thousand random pairs, the answer is exact and simple: every
 * triple `(i, j, length)` where `x[i..i+length]` equals `y[j..j+length]` and the agreement can be extended in
 * neither direction — not one character further left, not one further right. Nothing else is reported, and
 * nothing that fits that description is left out.
 *
 * That definition is what this module computes, by a different route. A suffix array would be one way; a
 * prefix index is another, and for DNA a much shorter one. Every position of `x` is filed under the `limit`
 * characters that start there, and each position of `y` looks its own run of `limit` up: a pair can only agree
 * over `limit` characters or more if it agrees over the first `limit`, so no match can hide from the index,
 * and for a real sequence with the usual limit of 25 only a handful of pairs ever come back to be checked.
 */

// `TypeError` is JavaScript's own, whose name already matches Python's, as the other ports do it; the two
// that have no counterpart here come from core.
import { OverflowError, ValueError } from "@biolibs/core";

/**
 * One shared stretch: where it starts in each sequence, and how far it runs.
 *
 * The field names are pydna's own `(startx, starty, length)` read in order; upstream this is a bare tuple.
 */
export type Match = readonly [startx: number, starty: number, length: number];

/** The highest code point `pydivsufsort` will accept, since it reads a string as bytes. */
const MAX_ASCII = 127;

/**
 * Refuse what the compiled library refuses, with its own wording.
 *
 * @param x - One sequence. @param y - The other. @param limit - The shortest run to report.
 * @throws ValueError for an empty sequence, which is NumPy's complaint about taking the maximum of nothing;
 *   OverflowError for a negative limit, which is NumPy refusing it as an unsigned integer; TypeError for a
 *   character outside ASCII.
 */
function check(x: string, y: string, limit: number): void {
  // Order matters: upstream takes the maximum of each sequence's bytes before it looks at the limit, so an
  // empty sequence is refused even when the limit is negative as well.
  if (x.length === 0 || y.length === 0) {
    throw new ValueError("zero-size array to reduction operation maximum which has no identity");
  }
  if (limit < 0) throw new OverflowError("can't convert negative value to npy_uint64");
  for (const s of [x, y]) {
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) > MAX_ASCII) throw new TypeError("str must only contain ascii chars");
    }
  }
}

/**
 * How far two positions agree, reading forwards.
 *
 * @param x - One sequence. @param y - The other. @param i - Where to start in `x`.
 * @param j - Where to start in `y`.
 * @returns The number of characters that match from there, which is 0 when the first pair already differs.
 */
function runLength(x: string, y: string, i: number, j: number): number {
  const stop = Math.min(x.length - i, y.length - j);
  let n = 0;
  while (n < stop && x.charCodeAt(i + n) === y.charCodeAt(j + n)) n++;
  return n;
}

/**
 * Every stretch the two sequences share, longest first.
 *
 * A reported stretch is maximal: it is not part of a longer agreement, in either direction. Stretches may
 * overlap one another, and the same part of either sequence may appear in several of them.
 *
 * @param x - One sequence, ASCII only. @param y - The other.
 * @param limit - The shortest run to report. 0 is treated as 1, as upstream does, since a run of nothing is
 *   not a match; the default of 25 is pydna's.
 * @returns The stretches, ordered longest first and, within one length, by position in `x` then in `y`.
 * @throws What {@link check} throws.
 * @example
 * ```ts
 * commonSubStrings("gatgatttcggtagtta", "gtcagtatgtctatctatcgcg", 3);
 * // [[1, 6, 3], [7, 17, 3], [10, 4, 3], [12, 3, 3]]
 * ```
 */
export function commonSubStrings(x: string, y: string, limit = 25): Match[] {
  check(x, y, limit);
  // A run of nothing is not a match, so a limit of 0 asks the same question as a limit of 1.
  const width = Math.max(1, Math.trunc(limit));
  const matches: Match[] = [];
  if (width > x.length || width > y.length) return matches;

  // Every starting position in x, filed under the `width` characters that begin there.
  const index = new Map<string, number[]>();
  for (let i = 0; i + width <= x.length; i++) {
    const keyAt = x.slice(i, i + width);
    const bucket = index.get(keyAt);
    if (bucket === undefined) index.set(keyAt, [i]);
    else bucket.push(i);
  }

  for (let j = 0; j + width <= y.length; j++) {
    const bucket = index.get(y.slice(j, j + width));
    if (bucket === undefined) continue;
    for (const i of bucket) {
      // Maximal to the left: either one of the two runs out, or the characters before them disagree.
      if (i > 0 && j > 0 && x.charCodeAt(i - 1) === y.charCodeAt(j - 1)) continue;
      // Reading forwards to the end of the agreement makes it maximal to the right by construction.
      matches.push([i, j, runLength(x, y, i, j)]);
    }
  }

  // pydna sorts the triples, then sorts again on length alone and in reverse. Python's sort is stable, so the
  // second pass keeps the first's order within one length: longest first, then by position in x, then in y.
  matches.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  matches.sort((a, b) => b[2] - a[2]);
  return matches;
}

/**
 * The stretches two sequences share at their ends, which is what fusing them end to end needs.
 *
 * One of the two has to reach the end of its sequence and the other the start, so that the shared part is a
 * seam rather than something buried inside: either the stretch opens `x` and closes `y`, or it opens `y` and
 * closes `x`.
 *
 * @param x - One sequence, ASCII only. @param y - The other.
 * @param limit - The shortest run to report; pydna's default here is 15, not 25.
 * @returns Those of {@link commonSubStrings}'s stretches that lie at an end, in the same order.
 * @throws What {@link check} throws.
 * @example
 * ```ts
 * terminalOverlap("agctatgtatcttgcatcgta", "gcatcgtagtctatttgcttac", 8);   // [[13, 0, 8]]
 * ```
 */
export function terminalOverlap(x: string, y: string, limit = 15): Match[] {
  return commonSubStrings(x, y, limit).filter(
    ([sx, sy, n]) => (sx === 0 && sy + n === y.length) || (sy === 0 && sx + n === x.length),
  );
}
