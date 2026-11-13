/**
 * The settings `Bio.PDB.internal_coords` keeps as class attributes, which change how a structure is read.
 *
 * Biopython puts these on `IC_Residue` and `AtomKey`, where setting one affects every instance from then on. They
 * live in one place here because both `AtomKey` and `IC_Residue` consult them, and a module each would make them
 * import one another.
 */

/** How internal coordinates read a structure; Biopython's `IC_Residue` class attributes. */
export const icSettings = {
  /**
   * Ignore alternative locations: keep only the selected atom of a disordered one, and leave the altloc and
   * occupancy fields of its {@link AtomKey} empty. Biopython's `IC_Residue.no_altloc`.
   */
  noAltloc: false,
  /** Compute a C-beta position for glycine, which has none. Biopython's `IC_Residue.gly_Cbeta`. */
  glyCbeta: false,
  /** The format Biopython writes internal-coordinate values with in a `.pic` file. */
  picAccuracy: "17.13f",
};
