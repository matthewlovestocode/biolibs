/**
 * The settings `Bio.PDB.internal_coords` keeps as class attributes, which change how a structure is read.
 *
 * Biopython puts these on `IC_Residue` and `AtomKey`, where setting one affects every instance from then on. They
 * live in one place here because both `AtomKey` and `IC_Residue` consult them, and a module each would make them
 * import one another.
 */

import { pyFormatFixed } from "@biolibs/core";

/** How internal coordinates read a structure; Biopython's `IC_Residue` class attributes. */
export const icSettings = {
  /**
   * Override the serial number written by {@link IC_Residue.pdbResidueString}, incrementing as it goes;
   * null leaves each atom's own. Biopython keeps this on the class, so setting it changes every residue.
   */
  atomSernum: null as number | null,
  /** Override the chain id those records carry; null leaves the atom's own chain. */
  atomChain: null as string | null,
  /**
   * Ignore alternative locations: keep only the selected atom of a disordered one, and leave the altloc and
   * occupancy fields of its {@link AtomKey} empty. Biopython's `IC_Residue.no_altloc`.
   */
  noAltloc: false,
  /** Compute a C-beta position for glycine, which has none. Biopython's `IC_Residue.gly_Cbeta`. */
  glyCbeta: false,
  /**
   * Assemble a chain's atoms with the vectorised algorithm rather than residue by residue. Biopython's
   * `IC_Chain.ParallelAssembleResidues`; turning it off selects `ic-serial.ts`, as a start/fin range does.
   */
  parallelAssembleResidues: true,
  /** The format Biopython writes internal-coordinate values with in a `.pic` file. */
  picAccuracy: "17.13f",
};

/**
 * Reduce a number to the accuracy a PIC or SCAD file carries: five decimal places, nine columns wide.
 *
 * This is Biopython's `set_accuracy_95`, and it is a formatting round rather than an arithmetic one —
 * `float(f"{num:9.5f}")` — so it rounds half to even on the decimal, exactly as writing the file would.
 *
 * @param num - The number to reduce.
 * @returns The same number with no more than five decimal places.
 * @example
 * ```ts
 * setAccuracy95(0.123456789);   // 0.12346
 * ```
 */
export function setAccuracy95(num: number): number {
  return Number(pyFormatFixed(num, 5));
}
