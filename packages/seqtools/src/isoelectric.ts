/** Isoelectric point and charge of a protein (Biopython's `Bio.SeqUtils.IsoelectricPoint`). */

import { IndexError, KeyError, OverflowError } from "@biolibs/core";
import { asText, type SeqLike } from "./args.js";
import { countAminoAcids, type AminoCounts } from "./amino-counts.js";

/** pK values of the groups that carry a positive charge when protonated. */
const POSITIVE_PKS: [string, number][] = [["Nterm", 7.5], ["K", 10.0], ["R", 12.0], ["H", 5.98]];
/** pK values of the groups that carry a negative charge when deprotonated. */
const NEGATIVE_PKS: [string, number][] = [["Cterm", 3.55], ["D", 4.05], ["E", 4.45], ["C", 9.0], ["Y", 10.0]];
/** pK of the C-terminus when the last residue is D or E. */
const PK_CTERMINAL: Record<string, number> = { D: 4.55, E: 4.75 };
/** pK of the N-terminus for some first residues. */
const PK_NTERMINAL: Record<string, number> = { A: 7.59, M: 7.0, S: 6.93, P: 8.36, T: 6.82, V: 7.44, E: 7.7 };
/** Residues whose side chains are charged. */
const CHARGED_AAS = ["K", "R", "H", "D", "E", "C", "Y"];

/** Counts as a `Map` or a plain object. */
export type AminoContent = Map<string, number> | Record<string, number>;

/** `10 ** x` with Python's overflow error. */
function pow10(x: number): number {
  const r = 10 ** x;
  if (!Number.isFinite(r) && Number.isFinite(x)) throw new OverflowError("(34, 'Result too large')");
  return r;
}

/** Whether Python would treat a counts argument as empty (`None`, `{}`). */
const isEmpty = (c: AminoContent | null | undefined): boolean => c === null || c === undefined || (c instanceof Map ? c.size === 0 : Object.keys(c).length === 0);

/**
 * Charge and isoelectric point of a protein from its charged residues and terminal groups.
 *
 * @example
 * ```ts
 * new IsoelectricPoint("MKVLAAGIVG").pi();
 * ```
 */
export class IsoelectricPoint {
  /** The upper-cased sequence. */
  readonly sequence: string;
  /** Counts of the charged residues (plus 1 for each terminus). */
  readonly chargedAasContent: Map<string, number>;
  /** pK values of the positive groups, after terminal adjustments. */
  readonly posPKs: Map<string, number>;
  /** pK values of the negative groups, after terminal adjustments. */
  readonly negPKs: Map<string, number>;

  /**
   * @param proteinSequence - Amino acid text or sequence.
   * @param aaContent - Precomputed amino acid counts; counted from the sequence if omitted or empty.
   * @throws {@link KeyError} if `aaContent` lacks a charged residue.
   * @throws {@link IndexError} for an empty sequence.
   */
  constructor(proteinSequence: SeqLike, aaContent: AminoContent | null = null) {
    this.sequence = asText(proteinSequence, "upper").toUpperCase();
    const content: AminoContent = isEmpty(aaContent) ? (countAminoAcids(this.sequence) as AminoCounts) : aaContent!;
    this.chargedAasContent = new Map();
    for (const aa of CHARGED_AAS) {
      const v = content instanceof Map ? content.get(aa) : Object.hasOwn(content, aa) ? content[aa] : undefined;
      if (v === undefined) throw new KeyError(aa);
      this.chargedAasContent.set(aa, Number(v));
    }
    this.chargedAasContent.set("Nterm", 1.0);
    this.chargedAasContent.set("Cterm", 1.0);
    this.posPKs = new Map(POSITIVE_PKS);
    this.negPKs = new Map(NEGATIVE_PKS);
    if (this.sequence.length === 0) throw new IndexError(typeof proteinSequence === "string" ? "string index out of range" : "index out of range");
    const nterm = this.sequence[0]!;
    const cterm = this.sequence[this.sequence.length - 1]!;
    if (Object.hasOwn(PK_NTERMINAL, nterm)) this.posPKs.set("Nterm", PK_NTERMINAL[nterm]!);
    if (Object.hasOwn(PK_CTERMINAL, cterm)) this.negPKs.set("Cterm", PK_CTERMINAL[cterm]!);
  }

  /**
   * Net charge of the protein at a given pH.
   *
   * @throws {@link OverflowError} for a pH so far from the pK values that `10 ** x` overflows.
   */
  chargeAtPH(pH: number): number {
    let positive = 0.0;
    for (const [aa, pK] of this.posPKs) positive += this.chargedAasContent.get(aa)! * (1.0 / (pow10(pH - pK) + 1.0));
    let negative = 0.0;
    for (const [aa, pK] of this.negPKs) negative += this.chargedAasContent.get(aa)! * (1.0 / (pow10(pK - pH) + 1.0));
    return positive - negative;
  }

  /**
   * Isoelectric point by bisection: the pH at which the charge is zero.
   *
   * @param pH - Starting pH. Default 7.775.
   * @param min - Lower bound. Default 4.05.
   * @param max - Upper bound. Default 12.
   */
  pi(pH = 7.775, min = 4.05, max = 12): number {
    // Biopython recurses; a loop gives the same sequence of values.
    while (max - min > 0.0001) {
      if (this.chargeAtPH(pH) > 0.0) min = pH;
      else max = pH;
      pH = (min + max) / 2;
    }
    return pH;
  }
}
