/** Amino acid counting shared by `ProteinAnalysis` and `IsoelectricPoint`. */

import { IUPACData } from "@biolibs/seq";

/** Amino acid counts, in the order of the 20 standard letters. */
export type AminoCounts = Map<string, number>;

/** Occurrences of the single character `ch` in `text`. */
export function countChar(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n++;
  return n;
}

/**
 * Count each of the 20 standard amino acids in an (upper-case) sequence.
 *
 * @example
 * ```ts
 * countAminoAcids("AAC").get("A");   // 2
 * ```
 */
export function countAminoAcids(sequence: string): AminoCounts {
  return new Map([...IUPACData.proteinLetters].map((aa) => [aa, countChar(sequence, aa)]));
}
