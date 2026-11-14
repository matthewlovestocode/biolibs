/**
 * `IC_Chain`: a chain's internal coordinates (Biopython's `Bio.PDB.internal_coords.IC_Chain`).
 *
 * Two jobs so far. It decides which of a chain's residues can be built — amino acids and the accepted hetero
 * residues, linked to their neighbours wherever a peptide bond is short enough to be real — and it owns the
 * coordinate array: one row per atom key, in key order, which is what lets a whole chain be recomputed at once.
 *
 * The coordinate array is also where the Biopython atoms' coordinates *live* once it is built: each atom's `coord`
 * becomes a view into the row for its key, so moving a row moves the atom. The arrays of angle values, and the
 * assembly that uses them, are still to come.
 */

import { AtomKey } from "./atom-key.js";
import { buildEdraArrays, initEdra, measureChain } from "./ic-measure.js";
import { assembleResidues, buildChainAtoms, initAtomCoords, propagateChanges, updateDCoordSpace } from "./ic-assemble.js";
import { assembleResiduesSer } from "./ic-serial.js";
import type { Matrix } from "../vectors.js";
import type { Dihedron, EdronArrays, EdronInvalidation, Hedron } from "./edron.js";
import { IC_Residue } from "./ic-residue.js";
import { acceptResnames } from "./ic-data.js";
import { icSettings } from "./settings.js";
import type { Atom, DisorderedAtom } from "../atom.js";
import type { Chain } from "../chain.js";
import type { Residue } from "../residue.js";

/** Longest peptide bond, in angstroms, that counts as joining two residues. */
export const MAX_PEPTIDE_BOND = 1.4;

/** The selected location of a possibly-disordered atom, or the atom itself. */
const selected = (atm: Atom | DisorderedAtom): Atom => {
  const wrapper = atm as unknown as { selectedChild?: Atom };
  return wrapper.selectedChild ?? (atm as Atom);
};

/** Every location of a possibly-disordered atom, or just the atom. */
function locations(atm: Atom | DisorderedAtom): Atom[] {
  const wrapper = atm as unknown as { childDict?: Map<string, Atom> };
  return wrapper.childDict === undefined ? [atm as Atom] : [...wrapper.childDict.values()];
}

/** Whether an atom holds more than one location. */
const isDisordered = (atm: Atom | DisorderedAtom): boolean =>
  (atm as unknown as { childDict?: unknown }).childDict !== undefined;

/**
 * A chain's internal coordinates: the residues that can be built, and the coordinates of their atoms.
 *
 * @example
 * ```ts
 * const cic = new IC_Chain(chain);
 * cic.orderedAaIcList.length;   // residues that can be built
 * cic.buildAtomArray();
 * cic.atomArray.length;         // four numbers per atom: x, y, z and 1
 * ```
 */
export class IC_Chain implements EdronArrays, EdronInvalidation {
  /** The chain this extends. */
  readonly chain: Chain;
  /** The residues that can be built, in chain order. */
  readonly orderedAaIcList: IC_Residue[] = [];
  /** The N-CA-C keys to restart from, at the chain's start and after every break. */
  initNCaCs: AtomKey[][] = [];
  /** Every hedron of the chain, by the `:`-joined ids of its three atoms. */
  readonly hedra = new Map<string, Hedron>();
  /** Every dihedron of the chain, likewise. */
  readonly dihedra = new Map<string, Dihedron>();
  /** Every atom key of the chain's buildable residues, by {@link AtomKey.hashKey}. */
  akset = new Map<string, AtomKey>();
  /** Glycine C-beta atoms to add after the angles are built, by the dihedron that places each one. */
  gcb?: Map<string, readonly AtomKey[]>;

  /** How many atoms the chain has: the size of {@link IC_Chain.akset}. */
  AAsiz = 0;
  /** The atom keys in sort order, which is the order of the rows of {@link IC_Chain.atomArray}. */
  aktuple: AtomKey[] = [];
  /** Each atom key's row, by {@link AtomKey.hashKey}. */
  atomArrayIndex = new Map<string, number>();
  /** Whether each row's coordinates agree with the internal coordinates. */
  atomArrayValid = new Uint8Array(0);
  /** Homogeneous coordinates, four numbers per atom: `x, y, z, 1`. */
  atomArray = new Float64Array(0);
  /** The Biopython atom in each row, where there is one. */
  bpAtomArray: (Atom | null)[] = [];

  /** Angle of each hedron; not built yet, so every hedron reads 0. */
  hedraAngle?: ArrayLike<number>;
  /** First length of each hedron; not built yet. */
  hedraL12?: ArrayLike<number>;
  /** Second length of each hedron; not built yet. */
  hedraL23?: ArrayLike<number>;
  /**
   * Length between the *first and third* atoms of each hedron — the side the angle opens onto.
   *
   * Only {@link IC_Chain.distplotToDhArrays} fills this: measuring a chain from its atoms computes the
   * angle directly and never needs it, while going the other way, from distances, has nothing else to work
   * from.
   */
  hedraL13?: ArrayLike<number>;
  /** Length between the first and fourth atoms of each dihedron, likewise. */
  dihedraL14?: ArrayLike<number>;
  /**
   * The sign (+1 or −1) each dihedral angle had, from {@link IC_Chain.dihedralSigns}.
   *
   * A distance plot cannot tell a structure from its mirror image, so the signs have to be carried
   * separately and multiplied back in at the end of {@link IC_Chain.distanceToInternalCoordinates}.
   */
  dihedraSigns?: readonly number[];
  /** Angle of each dihedron, in degrees, once measured. */
  dihedraAngle?: ArrayLike<number>;
  /** The same angles in radians. */
  dihedraAngleRads?: ArrayLike<number>;
  /** How many hedra the chain has. */
  hedraLen = 0;
  /** How many dihedra. */
  dihedraLen = 0;
  /** Each hedron's index into the angle arrays, by its key. */
  hedraNdx?: Map<string, number>;
  /** Each dihedron's index, by its key. */
  dihedraNdx?: Map<string, number>;
  /** The atom rows of every hedron's three atoms, in hedron order. */
  a2haMap?: number[];
  /** The atom rows of every dihedron's four atoms, in dihedron order. */
  a2daMap?: number[];
  /** For each atom row, the hedra that use it. */
  a2hMap?: number[][];
  /** For each hedron, the atom rows of its atoms. */
  h2aa?: number[][];
  /** Whether each dihedron's atoms run opposite to its hedra. */
  dRev?: Uint8Array;
  /** The first hedron of each dihedron, as an index. */
  dH1ndx?: Int32Array;
  /** The second hedron of each dihedron. */
  dH2ndx?: Int32Array;
  /** For each hedron, the dihedra whose first hedron it is. */
  h1dMap?: number[][];
  /** Dihedron keys by the key of their first three atoms. */
  id3DhIndex?: Map<string, string[]>;
  /** Dihedron keys by the key of their last three atoms. */
  id32DhIndex?: Map<string, string[]>;
  /** Forward and reverse transforms into each dihedron's own coordinate space. */
  dCoordSpace?: [Matrix[], Matrix[]];
  /** Whether each dihedron's transforms are current. */
  dcsValid?: Uint8Array;
  /** Each hedron's three atoms in its own coordinate space; the assembly fills these in. */
  hAtoms?: number[][][];
  /** The same three atoms in reverse order, which the assembly also wants. */
  hAtomsR?: number[][][];
  /** Whether each hedron's own atoms need recomputing. */
  hAtomsNeedsUpdate?: Uint8Array;
  /** Whether each dihedron's atoms need recomputing. */
  dAtomsNeedsUpdate?: Uint8Array;
  /** Each dihedron's four atoms in its own coordinate space, which the assembly places in the chain's. */
  dAtoms?: number[][][];
  /** Each dihedron's fourth atom before the rotation by the dihedral angle. */
  a4PreRotation?: number[][];
  /** The chain coordinates of every dihedron's four atoms, as the assembly last read them. */
  dSet?: number[][][];
  /** Which of those four are up to date. */
  dSetValid?: boolean[][];
  /** For each atom row, the dihedra that use it and its position within each. */
  a2dMap?: [number[], number[]][];
  /** The complement of {@link IC_Chain.dRev}. */
  dFwd?: Uint8Array;

  /** @param parent - The chain to extend. @param verbose - Report chain breaks as Biopython does. */
  constructor(parent: Chain, verbose = false) {
    this.chain = parent;
    this.setResidues(verbose);
  }

  /**
   * Give every buildable residue an `IC_Residue`, link each to its neighbours, and note where the chain breaks.
   *
   * A residue is buildable when it is not a hetero residue, or is one of {@link acceptResnames}. Two consecutive
   * residues are linked when {@link IC_Chain.peptideCheck} finds a peptide bond between them; otherwise the chain
   * breaks there and, if the residue has N, CA and C, it becomes somewhere to restart from.
   *
   * @param verbose - Print the reason for each chain break, as Biopython does.
   */
  private setResidues(verbose = false): void {
    let lastRes: IC_Residue[] = [];
    let lastOrdRes: IC_Residue[] = [];
    const akset = new Map<string, AtomKey>();
    for (const wrapperOrRes of this.chain.getResidues()) {
      // A chain's children are residues or the wrappers of point-mutated ones; both answer `id` and `isDisordered`.
      const res = wrapperOrRes as unknown as Residue;
      const id = res.id as [string, number, string];
      if (id[0] !== " " && !acceptResnames.includes(id[0])) continue;
      const thisRes: IC_Residue[] = [];
      const disordered = (res as unknown as { childDict?: Map<string, Residue> }).childDict;
      const candidates = res.isDisordered() === 2 && !icSettings.noAltloc && disordered !== undefined
        ? [...disordered.values()] : [res];
      for (const r of candidates) {
        if (!this.addResidue(r, lastRes, lastOrdRes, verbose)) continue;
        const ric = (r as unknown as { internalCoord: IC_Residue }).internalCoord;
        thisRes.push(ric);
        for (const ak of ric.akSet!) akset.set(ak.hashKey, ak);
      }
      if (thisRes.length > 0) {
        this.orderedAaIcList.push(...thisRes);
        lastOrdRes = thisRes;
      }
      lastRes = thisRes;
    }
    this.akset = akset;
    this.initNCaCs = this.initNCaCs
      .map((t) => t)
      .sort((a, b) => {
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          const [p, q] = a[i]!.compare(b[i]!);
          if (p !== q) return p - q;
        }
        return a.length - b.length;
      });
  }

  /**
   * Attach an `IC_Residue` to one residue and link it to the chain so far.
   *
   * @param res - The residue.
   * @param lastRes - The residues of the previous position.
   * @param lastOrdRes - The last position that produced buildable residues.
   * @param verbose - Print the reason for a chain break.
   * @returns Whether the chain can be extended or restarted here. False means the residue has neither a peptide
   *   bond to the previous one nor the N, CA and C needed to start afresh.
   */
  private addResidue(res: Residue, lastRes: IC_Residue[], lastOrdRes: IC_Residue[], verbose = false): boolean {
    const ric = new IC_Residue(res);
    (res as unknown as { internalCoord: object | null }).internalCoord = ric;
    ric.cic = this;
    if (lastRes.length > 0 && lastOrdRes === lastRes && this.peptideCheck(lastOrdRes[0]!.residue, res) === null) {
      for (const prev of lastOrdRes) {
        prev.rnext.push(ric);
        ric.rprev.push(prev);
      }
      return true;
    }
    if (["N", "CA", "C"].every((atm) => res.has(atm))) {
      if (verbose && lastRes.length !== 0) {
        const reason = lastOrdRes !== lastRes
          ? `disordered residues after ${lastOrdRes[0]!.prettyStr()}`
          : this.peptideCheck(lastOrdRes[0]!.residue, res);
        // eslint-disable-next-line no-console
        console.log(`chain break at ${ric.prettyStr()} due to ${reason}`);
      }
      this.initNCaCs.push(...ric.splitAkl([new AtomKey([ric, "N"]), new AtomKey([ric, "CA"]), new AtomKey([ric, "C"])]));
      return true;
    }
    return false;
  }

  /**
   * Whether two consecutive residues are joined by a peptide bond.
   *
   * @param prev - The earlier residue.
   * @param curr - The later one.
   * @returns null when they are joined, otherwise why they are not.
   */
  private peptideCheck(prev: Residue, curr: Residue): string | null {
    if (curr.childList.length === 0) return null;                       // a residue with no atoms: PIC input
    if (prev.childList.length === 0) return "PIC data missing atoms";
    const prevIc = (prev as unknown as { internalCoord?: IC_Residue }).internalCoord;
    if (prevIc !== undefined && !prevIc.isAccept) return "previous residue not standard/accepted amino acid";

    let nAtom = curr.has("N") ? (curr.get("N") as Atom | DisorderedAtom) : null;
    let pCatom = prev.has("C") ? (prev.get("C") as Atom | DisorderedAtom) : null;
    if (nAtom === null || pCatom === null) return `missing ${pCatom === null ? "previous C" : "N"} atom`;
    if (!prev.has("CA") || !prev.has("N")) return "previous residue missing N or Ca";

    if (icSettings.noAltloc) {
      nAtom = selected(nAtom);
      pCatom = selected(pCatom);
    }
    const tooFar = `MaxPeptideBond (${MAX_PEPTIDE_BOND} angstroms) exceeded`;
    if (icSettings.noAltloc || (!isDisordered(nAtom) && !isDisordered(pCatom))) {
      return this.closeEnough(selected(nAtom), selected(pCatom)) ? null : tooFar;
    }
    // Either end may be disordered: any pair of locations close enough makes a bond.
    for (const n of locations(nAtom)) {
      for (const c of locations(pCatom)) if (this.closeEnough(n, c)) return null;
    }
    return tooFar;
  }

  /**
   * @param a0 - One atom.
   * @param a1 - Another.
   * @returns Whether they are within {@link MAX_PEPTIDE_BOND}, compared as squares to avoid a square root.
   */
  private closeEnough(a0: Atom, a1: Atom): boolean {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
      const d = a0.coord[i]! - a1.coord[i]!;
      sum += d * d;
    }
    return MAX_PEPTIDE_BOND * MAX_PEPTIDE_BOND > sum;
  }

  /**
   * Build the chain's coordinate array: one row of `x, y, z, 1` per atom key, in key order.
   *
   * Every Biopython atom's `coord` becomes a **view** into its row afterwards, so the structure and the array are
   * the same numbers from then on — writing a row moves the atom. Biopython's rows are 64-bit, so an atom whose
   * coordinates were 32-bit widens.
   */
  buildAtomArray(): void {
    this.AAsiz = this.akset.size;
    this.aktuple = [...this.akset.values()].sort((a, b) => { const [p, q] = a.compare(b); return p - q; });
    this.atomArrayIndex = new Map(this.aktuple.map((ak, i) => [ak.hashKey, i]));
    this.atomArrayValid = new Uint8Array(this.AAsiz);
    this.atomArray = new Float64Array(this.AAsiz * 4);
    for (let i = 0; i < this.AAsiz; i++) this.atomArray[i * 4 + 3] = 1.0;
    this.bpAtomArray = new Array<Atom | null>(this.AAsiz).fill(null);

    for (const ric of this.orderedAaIcList) {
      for (const atm of ric.residue.childList) {
        const each = isDisordered(atm) && !icSettings.noAltloc ? locations(atm) : [selected(atm)];
        for (const a of each) this.setAtom(ric, a);
      }
      if (ric.akc!.size === 0) ric.buildRakCache();
    }
  }



  /**
   * Allocate the chain's angle arrays and give every hedron and dihedron its index into them.
   *
   * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
   */
  initEdra(verbose = false): void { initEdra(this, verbose); }

  /**
   * Build the index maps between the atom array and the angle arrays, and link each dihedron to its two hedra.
   */
  buildEdraArrays(): void { buildEdraArrays(this); }

  /**
   * Measure every bond length, bond angle and dihedral angle from the atom coordinates.
   *
   * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
   */
  atomToInternalCoordinates(verbose = false): void { measureChain(this, verbose); }

  /**
   * Invalidate every atom that depends on one already invalid.
   */
  propagateChanges(): void { propagateChanges(this); }

  /**
   * Place each hedron's and dihedron's atoms in its own coordinate space, from the measured values.
   */
  initAtomCoords(): void { initAtomCoords(this); }

  /**
   * Place every atom in chain coordinates, by transforming each dihedron out of its own coordinate space.
   */
  assembleResidues(): void { assembleResidues(this); }

  /**
   * Recompute the coordinate-space transforms of the dihedra whose atoms have moved.
   *
   * @param workSelector - Which dihedra to refresh; by default, every one whose transforms went stale.
   */
  updateDCoordSpace(workSelector?: boolean[]): void { updateDCoordSpace(this, workSelector); }

  /**
   * Build every residue of this chain in turn, dropping the residues outside a `start`/`fin` range.
   *
   * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
   * @param start - First sequence position to build, or null for no lower bound.
   * @param fin - Last sequence position to build, or null for no upper bound.
   */
  assembleResiduesSer(verbose = false, start: number | null = null, fin: number | null = null): void {
    assembleResiduesSer(this, verbose, start, fin);
  }

  /**
   * Compute atom coordinates for this chain from its internal coordinates.
   *
   * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
   * @param start - First sequence position to build; selects Biopython's serial assembly, which is not ported.
   * @param fin - Last sequence position to build, likewise.
   */
  internalToAtomCoordinates(verbose = false, start: number | null = null, fin: number | null = null): void {
    buildChainAtoms(this, verbose, start, fin);
  }


  /**
   * The pairwise distances between this chain's atoms, as a square matrix.
   *
   * @param filter - Rows of {@link IC_Chain.atomArray} to include, as indices; all of them by default.
   *   The classic C-alpha plot is the indices of the atoms whose key names `CA`.
   * @returns `n × n` distances, in the order of the rows given.
   */
  distancePlot(filter: readonly number[] | null = null): number[][] {
    const rows = filter ?? [...Array(this.AAsiz).keys()];
    const pts = rows.map((r) => Array.from(this.atomArray.subarray(r * 4, r * 4 + 4)));
    return pts.map((a) => pts.map((b) => {
      let sum = 0;
      // The homogeneous fourth component is 1 in both, so its difference adds nothing.
      for (let i = 0; i < 4; i++) { const d = a[i]! - b[i]!; sum += d * d; }
      return Math.sqrt(sum);
    }));
  }

  /**
   * The sign of every dihedral angle, which a distance plot cannot carry.
   *
   * @returns +1, −1 or 0 per dihedron, in `dihedraAngle` order.
   */
  dihedralSigns(): number[] {
    return Array.from(this.dihedraAngle ?? [], (a) => Math.sign(a));
  }

  /**
   * Fill the di/hedra distance arrays from a distance plot.
   *
   * Kept separate from {@link IC_Chain.distanceToInternalCoordinates} deliberately, as Biopython keeps it:
   * a caller may have the distances from somewhere other than a plot.
   *
   * @param distplot - A full all-atom plot, as {@link IC_Chain.distancePlot} with no filter gives.
   * @param dihedraSigns - The signs to restore, from {@link IC_Chain.dihedralSigns}.
   */
  distplotToDhArrays(distplot: readonly (readonly number[])[], dihedraSigns: readonly number[]): void {
    const ha = this.a2haMap!;
    const l12 = new Float64Array(this.hedraLen);
    const l23 = new Float64Array(this.hedraLen);
    const l13 = new Float64Array(this.hedraLen);
    for (let h = 0; h < this.hedraLen; h++) {
      const a0 = ha[h * 3]!, a1 = ha[h * 3 + 1]!, a2 = ha[h * 3 + 2]!;
      l12[h] = distplot[a0]![a1]!;
      l23[h] = distplot[a1]![a2]!;
      l13[h] = distplot[a0]![a2]!;
    }
    this.hedraL12 = l12;
    this.hedraL23 = l23;
    this.hedraL13 = l13;
    const da = this.a2daMap!;
    const l14 = new Float64Array(this.dihedraLen);
    for (let d = 0; d < this.dihedraLen; d++) l14[d] = distplot[da[d * 4]!]![da[d * 4 + 3]!]!;
    this.dihedraL14 = l14;
    this.dihedraSigns = dihedraSigns;
  }

  /**
   * Compute every angle of the chain from the distances alone, plus the chirality signs.
   *
   * Each dihedron with its two hedra is a tetrahedron, and the dihedral angle along one edge follows from
   * the six edge lengths — Blue the Hedronometer's answer to "the dihedral angles of a tetrahedron in
   * terms of its edge lengths". The hedra angles then come from the law of cosines.
   *
   * A chain break leaves each fragment starting at the origin, since a distance plot says nothing about
   * where anything is; {@link IC_Chain.copyInitNCaCs} is how to avoid that.
   *
   * @param resetAtoms - True (the default) marks every atom and di/hedron for rebuilding. Pass false to
   *   manage the validity flags yourself and save the work.
   */
  distanceToInternalCoordinates(resetAtoms = true): void {
    const h1 = this.dH1ndx!, h2 = this.dH2ndx!, fwd = this.dFwd!;
    const L12 = this.hedraL12!, L23 = this.hedraL23!, L13 = this.hedraL13!;
    const rads = this.dihedraAngleRads as Float64Array;
    const degs = this.dihedraAngle as Float64Array;
    const signs = this.dihedraSigns!;
    for (let d = 0; d < this.dihedraLen; d++) {
      const i1 = h1[d]!, i2 = h2[d]!;
      const reversed = fwd[d] === 0;
      // The labels are Biopython's: o is the dihedron's second atom, a its third.
      const oa = reversed ? L12[i1]! : L23[i1]!;
      const ob = reversed ? L23[i1]! : L12[i1]!;
      const ac = reversed ? L12[i2]! : L23[i2]!;
      const ab = L13[i1]!;
      const oc = L13[i2]!;
      const bc = this.dihedraL14![d]!;
      const ys = (oa + ac + oc) / 2;
      const zs = (oa + ob + ab) / 2;
      const ysqr = ys * (ys - oa) * (ys - ac) * (ys - oc);
      const zsqr = zs * (zs - oa) * (zs - ob) * (zs - ab);
      const hsqr = (4 * oa * oa * bc * bc - (ob * ob + ac * ac - (oc * oc + ab * ab)) ** 2) / 16;
      const cos = (ysqr + zsqr - hsqr) / (2 * Math.sqrt(ysqr) * Math.sqrt(zsqr));
      // Rounding can push the cosine a hair outside its range, and `acos` would give NaN.
      rads[d] = Math.acos(cos < -1 ? -1 : cos > 1 ? 1 : cos) * signs[d]!;
      degs[d] = (rads[d]! * 180) / Math.PI;
    }
    const angle = this.hedraAngle as Float64Array;
    for (let h = 0; h < this.hedraLen; h++) {
      const a = L12[h]!, b = L23[h]!, c = L13[h]!;
      angle[h] = (Math.acos((a * a + b * b - c * c) / (2 * a * b)) * 180) / Math.PI;
    }
    if (resetAtoms) {
      this.atomArrayValid.fill(0);
      this.dAtomsNeedsUpdate?.fill(1);
      this.hAtomsNeedsUpdate?.fill(1);
    }
  }

  /**
   * Copy another chain's chain-start atoms into this one, and mark them valid.
   *
   * The atoms are the initial N-CA-C and the one after every chain break, which is exactly what
   * {@link IC_Chain.distanceToInternalCoordinates} cannot recover from distances.
   *
   * Angle and length changes invalidate their own atoms, so make those first and copy afterwards.
   *
   * @param other - The chain to copy from; the two must index their atoms alike.
   */
  copyInitNCaCs(other: IC_Chain): void {
    for (const iNCaC of other.initNCaCs) {
      for (const ak of iNCaC) {
        const ndx = this.atomArrayIndex.get(ak.hashKey);
        if (ndx === undefined) continue;
        for (let i = 0; i < 4; i++) this.atomArray[ndx * 4 + i] = other.atomArray[ndx * 4 + i]!;
        this.atomArrayValid[ndx] = 1;
      }
    }
  }

  /** Put every residue into the extended conformation: psi 123°, phi −104°. */
  makeExtended(): void {
    for (const ric of this.orderedAaIcList) {
      ric.setAngle("psi", 123);
      ric.setAngle("phi", -104);
    }
  }

  /** Forget this chain's internal coordinates, residue by residue. */
  clearIc(): void {
    for (const res of this.chain.getResidues()) res.internalCoord = null;
  }

  /**
   * Copy one atom's coordinates into its row and leave the atom looking at them.
   *
   * @param ric - The residue the atom belongs to.
   * @param atm - The atom.
   */
  private setAtom(ric: IC_Residue, atm: Atom): void {
    const ak = new AtomKey([ric, atm]);
    const ndx = this.atomArrayIndex.get(ak.hashKey);
    if (ndx === undefined) return;                       // an atom with no key in this chain
    for (let i = 0; i < 3; i++) this.atomArray[ndx * 4 + i] = atm.coord[i]!;
    atm.coord = this.atomArray.subarray(ndx * 4, ndx * 4 + 3);
    this.atomArrayValid[ndx] = 1;
    this.bpAtomArray[ndx] = atm;
  }
}
