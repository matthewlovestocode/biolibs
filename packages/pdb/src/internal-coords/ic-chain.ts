/**
 * `IC_Chain`: a chain's internal coordinates (Biopython's `Bio.PDB.internal_coords.IC_Chain`).
 *
 * This is the first slice: the registries a residue needs when it builds its angles. Biopython keeps one copy of
 * every hedron and dihedron on the chain, so that two residues sharing an angle across their boundary share the
 * object, and every residue's own dictionary points into these. The coordinate arrays that make a chain
 * recomputable — and everything built on them — are still to come.
 */

import type { AtomKey } from "./atom-key.js";
import type { Dihedron, EdronArrays, Hedron } from "./edron.js";

/**
 * A chain's hedra and dihedra, keyed by the atom keys that define them.
 *
 * @example
 * ```ts
 * const cic = new IC_Chain();
 * // residues add their angles here as they build them
 * cic.hedra.size;
 * ```
 */
export class IC_Chain implements EdronArrays {
  /** Every hedron of the chain, by the `:`-joined ids of its three atoms. */
  readonly hedra = new Map<string, Hedron>();
  /** Every dihedron of the chain, by the `:`-joined ids of its four atoms. */
  readonly dihedra = new Map<string, Dihedron>();
  /** Every atom key the chain's residues kept, by {@link AtomKey.hashKey}. */
  readonly akset = new Map<string, AtomKey>();
  /** Glycine C-beta atoms to add after the angles are built, by the dihedron that places each one. */
  gcb?: Map<string, readonly AtomKey[]>;

  /** Angle of each hedron; not built yet, so every hedron reads 0. */
  hedraAngle?: ArrayLike<number>;
  /** First length of each hedron; not built yet. */
  hedraL12?: ArrayLike<number>;
  /** Second length of each hedron; not built yet. */
  hedraL23?: ArrayLike<number>;
  /** Angle of each dihedron; not built yet, so every dihedron reads 360. */
  dihedraAngle?: ArrayLike<number>;
}
