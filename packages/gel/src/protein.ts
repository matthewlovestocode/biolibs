/**
 * Polyacrylamide gels for protein, and the markers run beside them.
 *
 * A protein gel is read the same way an agarose one is, and for the same reason: a mesh holds large
 * molecules back more than small ones, so over the range a gel resolves the distance run is close to
 * a straight line against the logarithm of size. The one difference is what is being measured.
 * Agarose sorts DNA by length in base pairs; SDS-PAGE sorts protein by mass in kilodaltons, because
 * the detergent coats every chain with much the same charge per unit mass and undoes its shape, so
 * what is left to tell two proteins apart is how big they are. That is why {@link bandPosition} and
 * {@link bandsOf} are the functions used here too: they take a resolving range, not a kind of gel.
 *
 * The percentages and ranges are the conventional working figures printed in supplier guides for
 * SDS-PAGE in Tris-glycine. They say which proteins a gel would *tell apart*, and are not
 * measurements. Two things to keep in mind when reading a real gel against them: a prestained
 * marker's bands are calibrated against unstained standards and run a little off their printed
 * weights, and a protein that is glycosylated, or that has not been fully reduced, runs at a size
 * that is not the mass its sequence comes to.
 */

import { ValueError } from "@biolibs/core";
import { bandPosition, bandsOf, ladderBands, type Band } from "./bands.js";

/** One acrylamide concentration and the protein sizes it resolves, in kilodaltons. */
export interface ProteinGel {
  /** Short identifier, e.g. `"12"`. */
  id: string;
  /** Acrylamide concentration as a percentage (w/v). */
  percent: number;
  /** Largest protein, in kilodaltons, the gel still separates. */
  largest: number;
  /** Smallest protein, in kilodaltons, the gel still separates. */
  smallest: number;
}

/**
 * The four acrylamide concentrations in common use, from the one that resolves the largest proteins
 * to the one that resolves the smallest.
 *
 * @example
 * ```ts
 * PROTEIN_GELS.find((g) => g.percent === 12)?.largest; // 100
 * ```
 */
export const PROTEIN_GELS: readonly ProteinGel[] = [
  { id: "7.5", percent: 7.5, largest: 200, smallest: 40 },
  { id: "10", percent: 10, largest: 150, smallest: 20 },
  { id: "12", percent: 12, largest: 100, smallest: 10 },
  { id: "15", percent: 15, largest: 60, smallest: 5 },
];

/**
 * Look a protein gel up by its {@link ProteinGel.id}.
 *
 * @param id - An id from {@link PROTEIN_GELS}, e.g. `"12"`.
 * @returns The matching gel.
 * @throws {@link ValueError} if no protein gel has that id.
 */
export function proteinGelById(id: string): ProteinGel {
  const gel = PROTEIN_GELS.find((one) => one.id === id);
  if (!gel) throw new ValueError(`unknown protein gel '${id}'; known protein gels are ${PROTEIN_GELS.map((one) => one.id).join(", ")}`);
  return gel;
}

/** A set of protein marker bands of known mass. */
export interface ProteinLadder {
  /** Short identifier, e.g. `"broad"`. */
  id: string;
  /** Display name. */
  name: string;
  /** Band masses in kilodaltons, largest first. */
  sizes: readonly number[];
}

/**
 * The generic broad-range and low-range protein markers.
 *
 * These are the nominal weights printed on the tube. A prestained marker runs a little off them,
 * which is why a band is read against the marker in the lane beside it rather than off a distance.
 */
export const PROTEIN_LADDERS: readonly ProteinLadder[] = [
  { id: "broad", name: "Broad-range marker", sizes: [250, 150, 100, 75, 50, 37, 25, 20, 15, 10] },
  { id: "low", name: "Low-range marker", sizes: [100, 75, 50, 37, 25, 20, 15, 10] },
];

/**
 * Look a protein marker up by its {@link ProteinLadder.id}.
 *
 * @param id - An id from {@link PROTEIN_LADDERS}, e.g. `"broad"`.
 * @returns The matching marker.
 * @throws {@link ValueError} if no marker has that id.
 */
export function proteinLadderById(id: string): ProteinLadder {
  const ladder = PROTEIN_LADDERS.find((one) => one.id === id);
  if (!ladder) throw new ValueError(`unknown protein ladder '${id}'; known protein ladders are ${PROTEIN_LADDERS.map((one) => one.id).join(", ")}`);
  return ladder;
}

/**
 * How far down a protein gel a band of a given mass runs, as a fraction of the way from the wells to
 * the front.
 *
 * @param kilodaltons - The protein's mass.
 * @param gel - The gel being run.
 * @returns 0 at the wells, 1 at the front, clamped outside the range the gel separates.
 * @throws {@link ValueError} for a mass that is not a positive finite number.
 * @example
 * ```ts
 * proteinBandPosition(100, proteinGelById("12")); // 0 — at the top of what 12% separates
 * ```
 */
export const proteinBandPosition = (kilodaltons: number, gel: ProteinGel): number => bandPosition(kilodaltons, gel);

/**
 * The bands a lane of protein would show.
 *
 * @param kilodaltons - The masses in the lane, in any order.
 * @param gel - The gel being run.
 * @param tolerance - Relative difference below which two proteins run as one band.
 * @returns The bands, heaviest first. {@link Band.size} and {@link Band.sizes} are in kilodaltons.
 */
export const proteinBands = (kilodaltons: readonly number[], gel: ProteinGel, tolerance?: number): Band[] =>
  bandsOf(kilodaltons, gel, tolerance);

/**
 * The bands a protein marker would show, as a lane of single known masses.
 *
 * @param sizes - The marker's band masses, in kilodaltons.
 * @param gel - The gel being run.
 * @returns One band per marker, heaviest first.
 */
export const proteinLadderBands = (sizes: readonly number[], gel: ProteinGel): Band[] => ladderBands(sizes, gel);
