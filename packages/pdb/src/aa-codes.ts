/** Amino-acid and nucleotide residue-name helpers of Biopython's `Bio.PDB.Polypeptide`: index lookups, `isAa`, `isNucleic`. */

import { KeyError } from "@biolibs/core";
import { nucleicLetters3to1, nucleicLetters3to1Extended, proteinLetters3to1, proteinLetters3to1Extended } from "./pdb-data.js";
import { padRight } from "./pyformat.js";

/** Anything with a residue name. */
export interface HasResname { getResname(): string }

/** The 20 standard residue names sorted by their one-letter codes (`ALA`, `CYS`, `ASP`, ...). */
export const standardAaNames: readonly string[] = Object.entries(proteinLetters3to1)
  .sort(([, a], [, b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([three]) => three);

const aa1: string[] = Object.entries(proteinLetters3to1).sort(([, a], [, b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, one]) => one);
const d1ToIndex = new Map(aa1.map((l, i) => [l, i]));
const d3ToIndex = new Map(standardAaNames.map((l, i) => [l, i]));

/**
 * One-letter code of the amino acid at an index in the sorted order.
 *
 * @param index - 0 to 19.
 * @throws KeyError for any other index.
 */
export function indexToOne(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 19) throw new KeyError(String(index));
  return aa1[index]!;
}

/**
 * Index of a one-letter code in the sorted order.
 *
 * @param s - A standard one-letter code.
 * @throws KeyError when it is not one of the 20.
 */
export function oneToIndex(s: string): number {
  const i = d1ToIndex.get(s);
  if (i === undefined) throw new KeyError(s);
  return i;
}

/**
 * Three-letter name of the amino acid at an index in the sorted order.
 *
 * @param i - 0 to 19.
 * @throws KeyError for any other index.
 */
export function indexToThree(i: number): string {
  if (!Number.isInteger(i) || i < 0 || i > 19) throw new KeyError(String(i));
  return standardAaNames[i]!;
}

/**
 * Index of a three-letter name in the sorted order.
 *
 * @param s - A standard upper-case three-letter name.
 * @throws KeyError when it is not one of the 20.
 */
export function threeToIndex(s: string): number {
  const i = d3ToIndex.get(s);
  if (i === undefined) throw new KeyError(s);
  return i;
}

/** The residue name as the lookups want it: padded to 3 characters, upper case. */
function nameOf(residue: string | HasResname): string {
  return (typeof residue === "string" ? residue : padRight(residue.getResname(), 3)).toUpperCase();
}

/**
 * Whether a residue (or a three-letter name) is an amino acid.
 *
 * @param residue - A residue or its name.
 * @param standard - Only accept the 20 standard amino acids.
 */
export function isAa(residue: string | HasResname, standard = false): boolean {
  return Object.hasOwn(standard ? proteinLetters3to1 : proteinLetters3to1Extended, nameOf(residue));
}

/**
 * Whether a residue (or a three-character name) is a nucleotide.
 *
 * @param residue - A residue or its name (`"DA "`, `"A  "`).
 * @param standard - Only accept the 8 canonical DNA and RNA bases.
 */
export function isNucleic(residue: string | HasResname, standard = false): boolean {
  return Object.hasOwn(standard ? nucleicLetters3to1 : nucleicLetters3to1Extended, nameOf(residue));
}
