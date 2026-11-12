/** `NeighborSearch`: find atoms (or residues, chains, ...) near a point or near each other, using a KD tree (Biopython's `Bio.PDB.NeighborSearch`). */

import { PDBException } from "./exceptions.js";
import { KDTree } from "./kdtrees.js";
import { entityLevels, unfoldEntities, uniqueify, type Levelled } from "./selection.js";
import type { Atom } from "./atom.js";

/** An atom as the search needs it. */
export type SearchAtom = Atom | (Levelled & { getCoord(): ArrayLike<number> });

/** Python's `AssertionError` (a failed `assert`). */
class AssertionError extends Error {
  override name = "AssertionError";
}

/** Neighbor searches over a fixed list of atoms. */
export class NeighborSearch {
  /** The atoms the queries refer to (a copy of the list is not made). */
  atomList: SearchAtom[];
  /** The coordinates, one row per atom. */
  coords: number[][];
  private kdt: KDTree;

  /**
   * @param atomList - The atoms, possibly from several structures.
   * @param bucketSize - Leaf size of the KD tree (must exceed 1).
   * @throws AssertionError for a bucket size of 1 or less; IndexError ("tuple index out of range") for an empty list.
   */
  constructor(atomList: SearchAtom[], bucketSize = 10) {
    this.atomList = atomList;
    this.coords = atomList.map((a) => Array.from(a.getCoord()));
    if (!(bucketSize > 1)) throw new AssertionError("");
    if (this.coords.length === 0) throw Object.assign(new Error("tuple index out of range"), { name: "IndexError" });
    if (!this.coords.every((c) => c.length === 3)) throw new AssertionError("");
    this.kdt = new KDTree(this.coords, bucketSize);
  }

  /**
   * All atoms (or their residues, chains, models or structures) with an atom within `radius` of `center`.
   *
   * @param center - Three coordinates.
   * @param radius - A positive distance.
   * @param level - What to return: `A`, `R`, `C`, `M` or `S`.
   * @returns Atoms in tree order, or the distinct parents of the level asked for in first-appearance order.
   * @throws PDBException for an unknown level; ValueError for a radius that is not positive.
   */
  search(center: ArrayLike<number>, radius: number, level = "A"): unknown[] {
    if (!entityLevels.includes(level)) throw new PDBException(`${level}: Unknown level`);
    if (center.length !== 3) throw Object.assign(new Error("Expected a 3-dimensional NumPy array"), { name: "Exception" });
    const atoms = this.kdt.search(center, radius).map((p) => this.atomList[p.index]!);
    return level === "A" ? atoms : unfoldEntities(atoms as Levelled[], level);
  }

  /** The distinct pairs of parents, each pair ordered so the smaller comes first; pairs within one parent are dropped. */
  private uniqueParentPairs(pairs: [any, any][]): [any, any][] {
    const out: [any, any][] = [];
    for (const [e1, e2] of pairs) {
      const p1 = e1.getParent(), p2 = e2.getParent();
      if (p1.equals(p2)) continue;
      // Chains define their own `<` (blank ids sort oddly, model numbers are ignored); other entities compare full ids.
      const less = typeof p1.lt === "function" ? p1.lt(p2) : p1.compare(p2) < 0;
      out.push(less ? [p1, p2] : [p2, p1]);
    }
    return uniqueify(out, ([a, b]) => JSON.stringify([a.getFullId(), b.getFullId()]));
  }

  /**
   * All pairs of atoms (or of their residues, chains, ...) that lie within `radius` of each other.
   *
   * @param radius - A positive distance.
   * @param level - `A`, `R`, `C`, `M` or `S`.
   * @returns Atom pairs in tree order; above atom level the distinct parent pairs (Biopython's order there is a hash
   *   order that changes from run to run, so none is promised).
   * @throws PDBException for an unknown level; ValueError for a radius that is not positive.
   */
  searchAll(radius: number, level = "A"): [unknown, unknown][] {
    if (!entityLevels.includes(level)) throw new PDBException(`${level}: Unknown level`);
    const atomPairs: [any, any][] = this.kdt.neighborSearch(radius).map((n) => [this.atomList[n.index1], this.atomList[n.index2]]);
    if (level === "A") return atomPairs;
    let pairs = atomPairs;
    for (const next of ["R", "C", "M", "S"]) {
      pairs = this.uniqueParentPairs(pairs);
      if (level === next) return pairs;
    }
    return pairs;
  }
}
