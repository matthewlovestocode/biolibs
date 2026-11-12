/** Molecular weight of DNA, RNA and protein sequences (Biopython's `molecular_weight`). */

import { ValueError, pyRepr, pySplit, pyStr, pySum } from "@biolibs/core";
import { IUPACData, complement, complementRna } from "@biolibs/seq";

/** Sequence kinds accepted by {@link molecularWeight}. */
export type SeqType = "DNA" | "RNA" | "protein";

/** The weight table for a kind of sequence. */
function weightTable(seqType: string, monoisotopic: boolean): Record<string, number> {
  if (seqType === "DNA") return monoisotopic ? IUPACData.monoisotopicUnambiguousDnaWeights : IUPACData.unambiguousDnaWeights;
  if (seqType === "RNA") return monoisotopic ? IUPACData.monoisotopicUnambiguousRnaWeights : IUPACData.unambiguousRnaWeights;
  if (seqType === "protein") return monoisotopic ? IUPACData.monoisotopicProteinWeights : IUPACData.proteinWeights;
  throw new ValueError(`Allowed seq_types are DNA, RNA or protein, not ${pyRepr(seqType)}`);
}

/**
 * Molecular weight of a sequence: the residue weights minus one water per bond.
 *
 * @param seq - Text, `Seq`, or an object with a `seq` property such as a `SeqRecord`. Whitespace is ignored; case does not matter.
 * @param seqType - `"DNA"` (default), `"RNA"` or `"protein"`.
 * @param doubleStranded - Add the complementary strand (not for proteins).
 * @param circular - Remove one more water for the closing bond.
 * @param monoisotopic - Use monoisotopic instead of average masses.
 * @throws {@link ValueError} for an unknown `seqType`, an ambiguous or invalid letter, or a double-stranded protein.
 * @example
 * ```ts
 * molecularWeight("ACGT", "DNA");   // 1253.8027
 * ```
 */
export function molecularWeight(seq: unknown, seqType: SeqType | string = "DNA", doubleStranded = false, circular = false, monoisotopic = false): number {
  if (typeof seq === "object" && seq !== null && "seq" in seq) seq = (seq as { seq: unknown }).seq;
  let text = pySplit(pyStr(seq)).join("").toUpperCase();
  const table = weightTable(seqType, monoisotopic);
  const water = monoisotopic ? 18.010565 : 18.0153;
  const total = (letters: string): number => {
    const weights: number[] = [];
    for (const x of letters) {
      const w = Object.hasOwn(table, x) ? table[x] : undefined;
      if (w === undefined) throw new ValueError(`'${pyRepr(x)}' is not a valid unambiguous letter for ${seqType}`);
      weights.push(w);
    }
    return pySum(weights);
  };
  let weight = total(text) - (text.length - 1) * water;
  if (circular) weight -= water;
  if (doubleStranded) {
    if (seqType === "protein") throw new ValueError("protein sequences cannot be double-stranded");
    text = seqType === "DNA" ? complement(text) : complementRna(text);
    weight += total(text) - (text.length - 1) * water;
    if (circular) weight -= water;
  }
  return weight;
}
