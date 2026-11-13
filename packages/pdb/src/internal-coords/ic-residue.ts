/**
 * `IC_Residue`: one residue's internal coordinates (Biopython's `Bio.PDB.internal_coords.IC_Residue`).
 *
 * This is the first slice of that class: which atoms a residue keeps, the keys it keeps them under, and the identity
 * it takes from the Biopython `Residue` it extends. The hedra and dihedra it will build from the `ic_data` tables,
 * and the geometry that needs the chain, are still to come.
 *
 * Only some atoms are kept. An atom named anything outside {@link acceptAtoms} is dropped on input, which is how
 * Biopython ignores the waters, ligands and oddities a PDB file carries; `O'` and `O''` are renamed to `O` and `OXT`
 * on the way in, mutating the atom itself as Biopython does.
 */

import { AtomKey } from "./atom-key.js";
import { acceptAtoms, acceptResnames } from "./ic-data.js";
import { icSettings } from "./settings.js";
import { proteinLetters3to1 } from "../pdb-data.js";
import { tupleRepr } from "../util.js";
import type { Atom, DisorderedAtom } from "../atom.js";
import type { Residue } from "../residue.js";

/** The atom-shaped values `IC_Residue` takes keys from. */
type AnyAtom = Atom | DisorderedAtom;

/**
 * One residue's internal coordinates: its atom keys, and the identity it shares with the residue it extends.
 *
 * @example
 * ```ts
 * const ric = new IC_Residue(residue);
 * ric.lc;                  // "G" for a glycine, or the three-letter name when it is not one of the twenty
 * ric.rak("CA").id;        // "52_G_CA"
 * [...ric.akSet].length;   // how many atoms were kept
 * ```
 */
export class IC_Residue {
  /** The Biopython residue this extends. */
  readonly residue: Residue;
  /** Hedra by key; filled when the angles are built. */
  readonly hedra = new Map<string, unknown>();
  /** Dihedra by key; filled when the angles are built. */
  readonly dihedra = new Map<string, unknown>();
  /** Cache of {@link IC_Residue.rak} results, by atom name or atom. */
  readonly akc = new Map<string | AnyAtom, AtomKey>();
  /** The keys of the atoms this residue kept. */
  readonly akSet = new Set<AtomKey>();
  /** The residues before this one in the chain. */
  rprev: IC_Residue[] = [];
  /** The residues after it. */
  rnext: IC_Residue[] = [];
  /** B-factors read from the file, by atom key id. */
  readonly bfactors = new Map<string, number>();
  /** The alternative-location labels seen, or null when altlocs are being ignored. */
  altIds: string[] | null;
  /** Whether the residue is one of the twenty standard amino acids. */
  is20AA = true;
  /** Whether the residue is kept at all: one of the twenty, or named in {@link acceptResnames}. */
  isAccept = true;
  /** Position, insertion code (null for a blank) and residue name — one letter for the twenty, else three. */
  readonly rbase: readonly (string | number | null)[];
  /** The residue name as {@link IC_Residue.rbase} holds it: one letter, or three when it is not a standard residue. */
  readonly lc: string;

  /** @param parent - The residue to extend. */
  constructor(parent: Residue) {
    this.residue = parent;
    this.altIds = icSettings.noAltloc ? null : [];
    const rid = parent.id as [string, number, string];
    const rbase: (string | number | null)[] = [rid[1], rid[2] !== " " ? rid[2] : null, rid[2] === undefined ? "" : parent.resname];
    rbase[2] = parent.resname;
    const oneLetter = proteinLetters3to1[parent.resname];
    if (oneLetter !== undefined) {
      rbase[2] = oneLetter;
    } else {
      this.is20AA = false;
      if (!acceptResnames.includes(parent.resname)) this.isAccept = false;
    }
    this.rbase = rbase;
    this.lc = rbase[2] as string;

    if (this.isAccept) {
      for (const atom of parent.childList) {
        // A disordered atom offers either its selected location or every one of them.
        const wrapper = atom as unknown as { childDict?: Map<string, Atom>; selectedChild?: Atom };
        if (wrapper.childDict !== undefined) {
          if (icSettings.noAltloc) this.addAtom(wrapper.selectedChild as Atom);
          else for (const alt of wrapper.childDict.values()) this.addAtom(alt);
        } else {
          this.addAtom(atom as Atom);
        }
      }
      // Only for coordinate input: the cache is primed so that an altloc cannot hide the selected atom.
      if (this.akSet.size > 0) this.buildRakCache();
    }
  }

  /**
   * Keep an atom, if its name is one this class accepts.
   *
   * `O'` and `O''` are renamed to `O` and `OXT` first — on the atom itself, as Biopython does, so the structure is
   * changed by reading its internal coordinates.
   *
   * @param atm - The atom to consider.
   */
  private addAtom(atm: Atom): void {
    if (atm.name.startsWith("O")) {
      if (atm.name === "O'") atm.name = "O";
      else if (atm.name === "O''") atm.name = "OXT";
    }
    if (!acceptAtoms.includes(atm.name)) return;
    this.akSet.add(this.rak(atm));
  }

  /**
   * This residue's key for an atom, cached.
   *
   * @param atm - An atom, or an atom name for an atom the residue may not have.
   * @returns The key. One built from a name is marked `missing`, since nothing has confirmed the atom is there.
   */
  rak(atm: string | AnyAtom): AtomKey {
    let ak = this.akc.get(atm);
    if (ak === undefined) {
      ak = new AtomKey([this, atm]);
      this.akc.set(atm, ak);
      if (typeof atm === "string") ak.missing = true;
    }
    return ak;
  }

  /**
   * Give every atom name an entry in the cache, so that asking for one altloc first cannot leave the selected atom
   * without one.
   */
  private buildRakCache(): void {
    const sorted = [...this.akSet].sort((a, b) => { const [p, q] = a.compare(b); return p - q; });
    for (const ak of sorted) {
      const name = ak.akl[3] as string;
      if (this.akc.get(name) === undefined) this.akc.set(name, ak);
    }
  }

  /**
   * @param ak - An atom key.
   * @returns Whether this residue kept that atom *and* the key names this residue.
   */
  contains(ak: AtomKey): boolean {
    if (![...this.akSet].some((k) => k.equals(ak))) return false;
    const akl = ak.akl;
    return Number(akl[0]) === Number(this.rbase[0]) && akl[1] === this.rbase[1] && akl[2] === this.rbase[2];
  }

  /** @returns Python's `repr`: the parent residue's full id, as a tuple. */
  repr(): string {
    return tupleRepr(this.residue.getFullId());
  }

  /** @returns A readable residue id: name, chain, position and insertion code. */
  prettyStr(): string {
    const id = this.residue.id as [string, number, string];
    return `${this.residue.resname} ${id[0]}${id[1]}${id[2]}`;
  }
}
