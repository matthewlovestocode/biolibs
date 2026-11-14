/**
 * The pieces YN00's own counting shares: the codon list, the arithmetic that has to raise where Python's
 * does, and the base classes that tell a transition from a transversion.
 */

import { KeyError, pyFloatRepr, ValueError, ZeroDivisionError } from "@biolibs/core";
import { CodonTable } from "@biolibs/seq";

/** A codon table, as `@biolibs/seq` types it. */
export type Table = InstanceType<typeof CodonTable.NCBICodonTable>;

/** The two purines and the two pyrimidines, which decide a transition from a transversion. */
export const PURINE = ["A", "G"], PYRIMIDINE = ["T", "C"];
/** The four bases in the order Biopython's dictionaries hold them. */
export const BASES = ["A", "T", "C", "G"] as const;

/** Base frequencies, with the `Y` and `R` sums `_get_kappa_t` adds to them. */
export type Freqs = Map<string, number>;

/**
 * @param x - A number.
 * @returns Its natural logarithm.
 * @throws ValueError with Python's own wording for an argument outside the domain, which this method reaches
 *   whenever the F84 formulae hand it a negative `A` or `B` for a pair of sequences too divergent for them.
 */
export function log(x: number): number {
  // `math.log` passes a NaN straight back out; only a real non-positive number is a domain error.
  if (Number.isNaN(x)) return x;
  if (!(x > 0)) throw new ValueError(`expected a positive input, got ${pyFloatRepr(x)}`);
  return Math.log(x);
}

/** @param a - Numerator. @param b - Denominator. @returns Their quotient, refusing a zero denominator. */
export const div = (a: number, b: number): number => {
  if (b === 0) throw new ZeroDivisionError("division by zero");
  return a / b;
};

/**
 * A division whose left operand may have come out of NumPy.
 *
 * The difference matters: dividing a Python float by zero raises, while dividing a NumPy scalar by zero warns
 * and answers with an infinity or a NaN. The pathway weights `countDiffYN00` reads out of the substitution
 * matrix are NumPy scalars, and they carry that behaviour into every sum they take part in, so the counts have
 * to say where they came from.
 *
 * @param a - Numerator. @param b - Denominator. @param numpy - Whether `a` is a NumPy scalar.
 * @returns Their quotient.
 * @throws ZeroDivisionError for a zero denominator under a plain Python numerator.
 */
export const npDiv = (a: number, b: number, numpy: boolean): number => (numpy ? a / b : div(a, b));

/**
 * One codon's amino acid, as Biopython's `codon_table.forward_table[codon]` gives it.
 *
 * @param table - A codon table. @param codon - A codon.
 * @returns Its amino acid.
 * @throws KeyError for a codon the table does not translate, which is how a stop codon in the alignment stops
 *   the site counting.
 */
export const acid = (table: Table, codon: string): string => {
  const out = table.forwardTable.get(codon);
  if (out === undefined) throw new KeyError(codon);
  return out;
};

/** @param table - A codon table. @returns Its codons in Biopython's order, without the ones spelled with U. */
export function codonList(table: Table): string[] {
  const forward = table.forwardTable as unknown as Map<string, string>;
  return [...forward.keys(), ...table.stopCodons].filter((codon) => !codon.includes("U"));
}
