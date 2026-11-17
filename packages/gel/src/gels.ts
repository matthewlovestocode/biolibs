/**
 * Agarose gel types and the size range each one separates.
 *
 * The percentages and ranges are the conventional working figures for agarose in TAE buffer, as printed in supplier
 * guides: a low-percentage gel spreads large fragments out and runs small ones off the bottom together, a
 * high-percentage gel does the reverse. They describe which fragments a gel would *tell apart*, and are not
 * measurements of migration distance — a real gel depends on buffer, voltage, run time and the dye used.
 */

import { ValueError } from "@biolibs/core";

/**
 * The range of sizes a gel separates, whatever is being run on it.
 *
 * It is this and not a kind of gel because the arithmetic of a band's position is the same
 * arithmetic either way: the two ends bracket the range over which the log-linear model in
 * {@link bandPosition} holds, and the unit they are in is whatever the gel sorts by — base pairs for
 * DNA on agarose, kilodaltons for protein on acrylamide.
 */
export interface Resolving {
  /** The largest the gel still separates. */
  largest: number;
  /** The smallest the gel still separates. */
  smallest: number;
}

/**
 * One agarose concentration and the fragment sizes it resolves.
 *
 * `largest` and `smallest` bracket the range over which the log-linear model in {@link bandPosition} holds. Outside
 * it, fragments still migrate but are not separated: above `largest` they stay bunched near the wells, below
 * `smallest` they run off together at the front.
 */
export interface GelType extends Resolving {
  /** Short identifier, e.g. `"1.0"`. */
  id: string;
  /** Agarose concentration as a percentage (w/v). */
  percent: number;
  /** Largest fragment, in base pairs, the gel still separates. */
  largest: number;
  /** Smallest fragment, in base pairs, the gel still separates. */
  smallest: number;
}

/**
 * The four agarose concentrations in common use, from the one that resolves the largest fragments to the one that
 * resolves the smallest.
 *
 * @example
 * ```ts
 * GELS.find((g) => g.percent === 1)?.largest; // 10000
 * ```
 */
export const GELS: readonly GelType[] = [
  { id: "0.8", percent: 0.8, largest: 15000, smallest: 500 },
  { id: "1.0", percent: 1.0, largest: 10000, smallest: 250 },
  { id: "1.5", percent: 1.5, largest: 4000, smallest: 100 },
  { id: "2.0", percent: 2.0, largest: 2000, smallest: 50 },
];

/**
 * Look a gel up by its {@link GelType.id}.
 *
 * @param id - An id from {@link GELS}, e.g. `"1.5"`.
 * @returns The matching gel.
 * @throws {@link ValueError} if no gel has that id.
 * @example
 * ```ts
 * gelById("2.0").smallest; // 50
 * ```
 */
export function gelById(id: string): GelType {
  const gel = GELS.find((g) => g.id === id);
  if (!gel) throw new ValueError(`unknown gel '${id}'; known gels are ${GELS.map((g) => g.id).join(", ")}`);
  return gel;
}
