/** `ShrakeRupley`: solvent accessible surface areas by the Shrake-Rupley "rolling ball" method (Biopython's `Bio.PDB.SASA`). */

import { ValueError, pyFloatRepr } from "@biolibs/core";
import { KDTree } from "./kdtrees.js";
import type { Atom } from "./atom.js";

/** Level code to its height in the hierarchy. */
const ENTITY_HIERARCHY: Readonly<Record<string, number>> = { A: 0, R: 1, C: 2, M: 3, S: 4 };

/** The default atomic radii in Å, by upper-case element symbol; other elements get 2.0. */
export const ATOMIC_RADII: ReadonlyMap<string, number> = new Map(Object.entries({
  H: 1.2, HE: 1.4, C: 1.7, N: 1.55, O: 1.52, F: 1.47, NA: 2.27, MG: 1.73, P: 1.8, S: 1.8, CL: 1.75, K: 2.75, CA: 2.31,
  NI: 1.63, CU: 1.4, ZN: 1.39, SE: 1.9, BR: 1.85, CD: 1.58, I: 1.98, HG: 1.55,
}));

/** The radius used for an element that has none. */
const DEFAULT_RADIUS = 2.0;

/** Python class names of the entities, for the "invalid entity type" message. */
const CLASS_PATHS: Readonly<Record<string, string>> = {
  Atom: "Bio.PDB.Atom.Atom", DisorderedAtom: "Bio.PDB.Atom.DisorderedAtom", Residue: "Bio.PDB.Residue.Residue",
  DisorderedResidue: "Bio.PDB.Residue.DisorderedResidue", Chain: "Bio.PDB.Chain.Chain", Model: "Bio.PDB.Model.Model", Structure: "Bio.PDB.Structure.Structure",
};

/** Something SASA can be computed for or stored on. */
interface Measured { level: string; parent: unknown; sasa?: number; getAtoms(): Iterable<Atom> }

/** Computes solvent accessible surface areas. */
export class ShrakeRupley {
  /** Radius of the probe in Å. */
  probeRadius: number;
  /** Number of points on each atom's sphere. */
  nPoints: number;
  /**
   * Radii by element. As with Python's `defaultdict`, looking up an unknown element adds it with the default radius,
   * so this grows during {@link ShrakeRupley.compute}.
   */
  radiiDict: Map<string, number>;
  private sphere: Float32Array[];

  /**
   * @param probeRadius - Probe radius in Å (default 1.4, a water molecule).
   * @param nPoints - Points on each atom's surface (default 100); more is slower and more precise.
   * @param radiiDict - Radii replacing or adding to {@link ATOMIC_RADII}.
   * @throws ValueError for a probe radius that is not positive or fewer than 1 point.
   */
  constructor(probeRadius = 1.4, nPoints = 100, radiiDict: Record<string, number> | Map<string, number> | null = null) {
    if (probeRadius <= 0.0) throw new ValueError(`Probe radius must be a positive number: ${pyFloatRepr(probeRadius)} <= 0`);
    this.probeRadius = probeRadius;
    if (nPoints < 1) throw new ValueError(`Number of sphere points must be larger than 1: ${nPoints}`);
    this.nPoints = nPoints;
    this.radiiDict = new Map(ATOMIC_RADII);
    if (radiiDict !== null) for (const [k, v] of radiiDict instanceof Map ? radiiDict : Object.entries(radiiDict)) this.radiiDict.set(k, v);
    this.sphere = this.computeSphere();
  }

  /** Points spread over the unit sphere by the golden spiral, as single-precision coordinates. */
  private computeSphere(): Float32Array[] {
    const n = this.nPoints;
    const dl = Math.PI * (3 - 5 ** 0.5);
    const dz = 2.0 / n;
    let longitude = 0;
    let z = 1 - dz / 2;
    const coords: Float32Array[] = [];
    for (let k = 0; k < n; k++) {
      const r = (1 - z * z) ** 0.5;
      coords.push(Float32Array.of(Math.cos(longitude) * r, Math.sin(longitude) * r, z));
      z -= dz;
      longitude += dl;
    }
    return coords;
  }

  /** The radius of an element, adding the default for an unknown one like a `defaultdict`. */
  private radius(element: string): number {
    let r = this.radiiDict.get(element);
    if (r === undefined) { r = DEFAULT_RADIUS; this.radiiDict.set(element, r); }
    return r;
  }

  /**
   * Calculate the surface area of every atom below an entity. Each atom (and each entity of the chosen level) gets a
   * `sasa` property; an entity's value is the sum over its atoms.
   *
   * @param entity - A residue, chain, model or structure.
   * @param level - Where to store the sums: `A`, `R`, `C`, `M` or `S` (not above the entity's own level).
   * @throws ValueError for an invalid entity or level, an entity without atoms, or coordinates outside ±1e6.
   */
  compute(entity: Measured, level = "A"): void {
    const entLevel = (entity as { level?: string }).level;
    if (entLevel === undefined || !["R", "C", "M", "S"].includes(entLevel)) {
      const name = (entity as object).constructor.name;
      throw new ValueError(`Invalid entity type '<class '${CLASS_PATHS[name] ?? name}'>'. Must be Residue, Chain, Model, or Structure`);
    }
    if (!Object.hasOwn(ENTITY_HIERARCHY, level)) throw new ValueError(`Invalid level '${level}'. Must be A, R, C, M, or S.`);
    if (ENTITY_HIERARCHY[level]! > ENTITY_HIERARCHY[entLevel]!) throw new ValueError(`Level '${level}' must be equal or smaller than input entity: ${entLevel}`);

    const atoms = [...entity.getAtoms()] as (Atom & { sasa?: number })[];
    const n = atoms.length;
    if (n === 0) throw new ValueError("Entity has no child atoms.");
    const coords = atoms.map((a) => Array.from(a.coord));
    const kdt = new KDTree(coords, 10);
    const radii = atoms.map((a) => this.radius(a.element) + this.probeRadius);
    const twiceMax = Math.max(...radii) * 2;

    const counts: number[] = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      const rI = radii[i]!;
      // The unit sphere scaled to this atom's radius and moved to its center, in double precision.
      const onI = this.sphere.map((p) => [p[0]! * rI + coords[i]![0]!, p[1]! * rI + coords[i]![1]!, p[2]! * rI + coords[i]![2]!]);
      const available = new Set<number>(Array.from({ length: this.nPoints }, (_, k) => k));
      const kdtSphere = new KDTree(onI, 10);
      for (const jj of kdt.search(coords[i]!, twiceMax)) {
        const j = jj.index;
        if (i === j) continue;
        // Neighbours that touch this atom's sphere cover the points inside their own radius.
        if (jj.radius < rI + radii[j]!) for (const pt of kdtSphere.search(coords[j]!, radii[j]!)) available.delete(pt.index);
      }
      counts[i] = available.size;
    }
    const asa = radii.map((r, i) => counts[i]! * (r * r * ((4 * Math.PI) / this.nPoints)));
    atoms.forEach((a, i) => { a.sasa = asa[i]!; });

    if (level !== "A") {
      let entities = new Set<Measured>(atoms as unknown as Measured[]);
      for (let k = 0; k < ENTITY_HIERARCHY[level]!; k++) entities = new Set([...entities].map((e) => e.parent as Measured));
      const index = new Map(atoms.map((a, idx) => [JSON.stringify(a.getFullId()), idx]));
      for (const e of entities) {
        let sum = 0;
        for (const a of e.getAtoms()) sum += asa[index.get(JSON.stringify(a.getFullId()))!]!;
        e.sasa = sum;
      }
    }
  }
}
