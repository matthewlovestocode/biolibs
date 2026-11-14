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
