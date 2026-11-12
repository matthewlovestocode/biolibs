/** `Superimposer`: rotate and translate one list of atoms onto another with minimal RMSD (Biopython's `Bio.PDB.Superimposer`). */

import { SVDSuperimposer, type Points } from "@biolibs/svdsuperimposer";
import { PDBException } from "./exceptions.js";

/** An atom as the superimposer needs it. */
export interface CoordAtom {
  /** The coordinates. */
  getCoord(): ArrayLike<number>;
  /** Apply `coord @ rot + tran`. */
  transform(rot: ArrayLike<ArrayLike<number>>, tran: ArrayLike<number>): void;
}

/** Finds and applies the transformation that puts atoms on top of other atoms with least RMSD. */
export class Superimposer {
  /** The rotation and translation (double precision), or null before {@link Superimposer.setAtoms}. */
  rotran: [Points, ArrayLike<number>] | null = null;
  /** The RMSD after superposition, or null before {@link Superimposer.setAtoms}. */
  rms: number | null = null;

  /**
   * Compute the transformation that puts the moving atoms on the fixed ones.
   *
   * @param fixed - The atoms to stay in place.
   * @param moving - The atoms to be moved, in the same order.
   * @throws PDBException when the lists differ in length.
   */
  setAtoms(fixed: CoordAtom[], moving: CoordAtom[]): void {
    if (fixed.length !== moving.length) throw new PDBException("Fixed and moving atom lists differ in size");
    // Python fills np.zeros((n, 3)) rows from the coordinates: double precision, and a row must fit in 3 slots.
    const fill = (atoms: CoordAtom[]): number[][] => atoms.map((a) => {
      const c = Array.from(a.getCoord());
      if (c.length !== 3 && c.length !== 1) throw Object.assign(new Error(`could not broadcast input array from shape (${c.length},) into shape (3,)`), { name: "ValueError" });
      return c.length === 1 ? [c[0]!, c[0]!, c[0]!] : c;
    });
    const sup = new SVDSuperimposer();
    sup.set(fill(fixed), fill(moving));
    sup.run();
    this.rms = sup.getRms();
    this.rotran = sup.getRotran();
  }

  /**
   * Rotate and translate atoms by the computed transformation (in single precision, like their coordinates).
   *
   * @param atomList - The atoms to move.
   * @throws PDBException before a transformation was computed.
   */
  apply(atomList: CoordAtom[]): void {
    if (this.rotran === null) throw new PDBException("No transformation has been calculated yet");
    const rot = Array.from(this.rotran[0], (r) => Float32Array.from(r));
    const tran = Float32Array.from(this.rotran[1]);
    for (const atom of atomList) atom.transform(rot, tran);
  }
}
