/**
 * The algebra of DNA ends: what an end looks like and which ends will ligate.
 *
 * A double-stranded end is described by the single-stranded overhang it leaves, read along the top strand. The two
 * strands are cut at different places, and which strand sticks out decides the kind:
 *
 * ```
 *   5' overhang (EcoRI, G^AATTC)      3' overhang (PstI, CTGCA^G)      blunt (SmaI, CCC^GGG)
 *     5'-G      AATTC-3'                5'-CTGCA      G-3'              5'-CCC   GGG-3'
 *     3'-CTTAA      G-5'                3'-G      ACGTC-5'              3'-GGG   CCC-5'
 * ```
 *
 * Two ends ligate when they leave overhangs of the same kind whose sequences, read along the top strand, are
 * identical — which is what it means for them to pair. BamHI (GGATCC, overhang GATC) and BglII (AGATCT, overhang
 * GATC) therefore join, though they are different enzymes, while two 5' overhangs of different sequence do not.
 *
 * Turning a fragment over exchanges its ends and reverse-complements each overhang; the kind is a property of the
 * molecule and does not change.
 */

import { ValueError } from "@biolibs/core";

/** Which strand sticks out at an end. */
export type EndKind = "blunt" | "5'" | "3'";

/** One end of a double-stranded fragment. */
export interface End {
  /** Which strand sticks out. */
  kind: EndKind;
  /** The overhang read along the top strand, 5' to 3'. Empty for a blunt end. */
  overhang: string;
  /** The enzyme that made the end, or `null` for an end the fragment already had. */
  enzyme: string | null;
}

/** A blunt end a fragment already had, not made by any enzyme here. */
export const NATURAL_END: End = { kind: "blunt", overhang: "", enzyme: null };

/**
 * The reverse complement of unambiguous DNA; other characters are reversed but left as they are.
 *
 * @param dna - The sequence.
 * @returns The reverse complement.
 */
export function reverseComplement(dna: string): string {
  const complement: Record<string, string> = {
    A: "T", T: "A", G: "C", C: "G", N: "N", a: "t", t: "a", g: "c", c: "g", n: "n",
  };
  let result = "";
  for (let i = dna.length - 1; i >= 0; i--) result += complement[dna[i]!] ?? dna[i]!;
  return result;
}

/**
 * The end a cut leaves, from where each strand is cut.
 *
 * @param topCut - Where the top strand is cut, as a 0-based boundary.
 * @param bottomCut - Where the bottom strand is cut, in the same top-strand coordinates.
 * @param residues - The sequence, so the overhang's bases can be read.
 * @param enzyme - The enzyme's name, for the record.
 * @returns The end. A cut whose two strands are cut at the same place is blunt.
 * @throws {@link ValueError} if the overhang runs outside the sequence.
 * @example
 * ```ts
 * // EcoRI in ...G^AATTC... cuts the top strand at 1 and the bottom at 5.
 * endAt(1, 5, "GAATTC", "EcoRI"); // { kind: "5'", overhang: "AATT", enzyme: "EcoRI" }
 * ```
 */
export function endAt(topCut: number, bottomCut: number, residues: string, enzyme: string | null): End {
  const low = Math.min(topCut, bottomCut);
  const high = Math.max(topCut, bottomCut);
  if (low < 0 || high > residues.length) throw new ValueError(`the overhang ${low}..${high} runs outside a sequence of ${residues.length} bases`);
  if (topCut === bottomCut) return { kind: "blunt", overhang: "", enzyme };
  // The bottom strand cut further along leaves the top strand sticking out at its 5' side.
  return { kind: bottomCut > topCut ? "5'" : "3'", overhang: residues.slice(low, high), enzyme };
}

/**
 * Whether two ends will ligate: the left-hand fragment's right end against the right-hand fragment's left end.
 *
 * @param left - The end on the left.
 * @param right - The end on the right.
 * @returns Whether they pair. Two blunt ends always do.
 * @example
 * ```ts
 * const bamHI = { kind: "5'", overhang: "GATC", enzyme: "BamHI" } as const;
 * const bglII = { kind: "5'", overhang: "GATC", enzyme: "BglII" } as const;
 * compatible(bamHI, bglII); // true — different enzymes, same overhang
 * ```
 */
export const compatible = (left: End, right: End): boolean =>
  left.kind === right.kind && left.overhang === right.overhang;

/**
 * The same end seen from the other strand, as turning a fragment over gives.
 *
 * @param end - The end.
 * @returns The end with its overhang reverse-complemented; the kind is unchanged.
 */
export const flipEnd = (end: End): End => ({ kind: end.kind, overhang: reverseComplement(end.overhang), enzyme: end.enzyme });

/**
 * A short description of an end, for a message.
 *
 * @param end - The end.
 * @returns For example `"EcoRI (5' AATT)"`, `"SmaI (blunt)"` or `"blunt"` for an end no enzyme made.
 */
export function describeEnd(end: End): string {
  const shape = end.kind === "blunt" ? "blunt" : `${end.kind} ${end.overhang}`;
  return end.enzyme === null ? shape : `${end.enzyme} (${shape})`;
}
