/**
 * The codon adaptation index, and the shape of the expression summary built on it.
 *
 * `pydna.seq.Seq.cai` is a call into `cai2`, a small package of its own, which in turn asks SciPy for a
 * geometric mean — so this is a port of a fourth upstream rather than of pydna. The index is Sharp and Li's
 * (1987): every codon carries a weight saying how close it is to the organism's preferred synonym, and the
 * sequence's score is the geometric mean of those weights, so a sequence of entirely preferred codons
 * scores 1 however long it is.
 *
 * Two codons are left out of the mean rather than counted as perfect. `ATG` and `TGG` have no synonyms, so
 * their weight is fixed at 1 and would only pull every score towards it; `cai2` drops them, citing the
 * paper's own remark that their count is subtracted from the length. A sequence of nothing but those codons
 * therefore has an empty list to average, and SciPy answers NaN and warns rather than raising.
 */

import { KeyError, pyRoundTo, ValueError, warn } from "@biolibs/core";
import { CODON_WEIGHTS } from "./data/codon.js";

/**
 * Codons with no synonym under genetic code 11, which `cai2` uses by default.
 *
 * Code 11 is the bacterial one; for these two codons it agrees with the standard code, so the choice makes
 * no difference to what is dropped here.
 */
const NON_SYNONYMOUS = ["ATG", "TGG"];

/** Stop codons under genetic code 11. A weight missing for one of these is skipped, not an error. */
const STOPS = ["TAA", "TAG", "TGA"];

/** What SciPy says when it is asked for the geometric mean of nothing. */
const SMALL_SAMPLE =
  "One or more sample arguments is too small; all returned values will be NaN. " +
  "See documentation for sample size requirements.";

/**
 * The geometric mean, as `scipy.stats.gmean` computes it: the exponential of the mean of the logarithms.
 *
 * @param values - The numbers to average.
 * @returns Their geometric mean; NaN for an empty list, and 0 when any value is 0, whose logarithm is
 *   negative infinity.
 */
export function gmean(values: readonly number[]): number {
  if (values.length === 0) {
    warn(SMALL_SAMPLE, "SmallSampleWarning");
    return NaN;
  }
  let total = 0;
  for (const v of values) total += Math.log(v);
  return Math.exp(total / values.length);
}

/**
 * The codon weights pydna ships for one organism.
 *
 * @param organism - Which organism.
 * @returns Its weights.
 * @throws KeyError naming the organism. Only `"sce"` has weights: `"eco"` has rare codons and start, stop
 *   and N-end tables, so it reaches this even though the other methods accept it.
 */
export function weightsFor(organism: string): ReadonlyMap<string, number> {
  const found = CODON_WEIGHTS.get(organism);
  if (found === undefined) throw new KeyError(organism);
  return found;
}

/**
 * The codon adaptation index of a coding sequence.
 *
 * @param sequence - The sequence; read in upper case.
 * @param weights - Each codon's weight, from {@link weightsFor}.
 * @returns The index, rounded to three decimals, or NaN when every codon was one without synonyms.
 * @throws ValueError for an empty sequence or one whose length is not a multiple of three; KeyError, worded
 *   as `cai2` words it, for a codon the weights do not cover and that is not a stop codon. A
 *   `SmallSampleWarning` is emitted, not thrown, when there is nothing to average.
 */
export function cai(sequence: string, weights: ReadonlyMap<string, number>): number {
  if (sequence === "") throw new ValueError("Sequence cannot be empty");
  if (sequence.length % 3 !== 0) throw new ValueError("Input sequence not divisible by three");
  const s = sequence.toUpperCase();
  const used: number[] = [];
  for (let i = 0; i < s.length; i += 3) {
    const codon = s.slice(i, i + 3);
    if (NON_SYNONYMOUS.includes(codon)) continue;
    const weight = weights.get(codon);
    if (weight !== undefined) used.push(weight);
    // A stop codon the table does not list is simply not scored; anything else is a broken table.
    else if (!STOPS.includes(codon)) {
      throw new KeyError(`Bad weights dictionary passed: missing weight for codon ${codon}.`);
    }
  }
  return pyRoundTo(gmean(used), 3);
}

/**
 * The one-row summary `express` builds: the column names, and the row under them.
 *
 * Upstream this is a `prettytable.PrettyTable`, so the *rendering* belongs to that library and is not
 * ported; what pydna computes is these cells. {@link lol} gives them back the way pydna's own `lol()` does,
 * which is how a caller reads the table without a renderer.
 */
export interface ExpressionTable {
  /** The column names, in order: the fixed seven, then one per rare codon, then `"rare"`. */
  fieldNames: readonly string[];
  /** The single row of values, lined up with {@link ExpressionTable.fieldNames}. */
  row: ReadonlyArray<string | number | null>;
}

/**
 * @param table - An expression summary.
 * @returns Its names and row as one list of lists, as pydna's `PrettyTable.lol()` returns them.
 */
export const lol = (table: ExpressionTable): Array<ReadonlyArray<string | number | null>> =>
  [table.fieldNames, table.row];
