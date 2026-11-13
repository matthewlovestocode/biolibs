/**
 * Size markers (ladders) run alongside a sample so band sizes can be read off.
 *
 * The two ladders here are the generic 1 kb and 100 bp sets sold by every supplier. Their band sizes are the
 * nominal ones printed on the tube.
 */

import { ValueError } from "@biolibs/core";

/** A set of marker bands of known size. */
export interface Ladder {
  /** Short identifier, e.g. `"1kb"`. */
  id: string;
  /** Display name. */
  name: string;
  /** Band sizes in base pairs, largest first. */
  sizes: readonly number[];
}

/**
 * The generic 1 kb and 100 bp ladders.
 *
 * @example
 * ```ts
 * LADDERS[0]!.sizes[0]; // 10000
 * ```
 */
export const LADDERS: readonly Ladder[] = [
  { id: "1kb", name: "1 kb ladder", sizes: [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500] },
  { id: "100bp", name: "100 bp ladder", sizes: [1500, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100] },
];

/**
 * Look a ladder up by its {@link Ladder.id}.
 *
 * @param id - An id from {@link LADDERS}, e.g. `"100bp"`.
 * @returns The matching ladder.
 * @throws {@link ValueError} if no ladder has that id.
 */
export function ladderById(id: string): Ladder {
  const ladder = LADDERS.find((l) => l.id === id);
  if (!ladder) throw new ValueError(`unknown ladder '${id}'; known ladders are ${LADDERS.map((l) => l.id).join(", ")}`);
  return ladder;
}
