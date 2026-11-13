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

import { AtomKey, FIELDS } from "./atom-key.js";
import { Dihedron, Edron, Hedron } from "./edron.js";
import type { IC_Chain } from "./ic-chain.js";
import { acceptAtoms, acceptResnames, icDataBackbone, icDataSidechainExtras, icDataSidechains } from "./ic-data.js";
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
  /** This residue's hedra, by the `:`-joined ids of their atoms; the objects are the chain's. */
  readonly hedra = new Map<string, Hedron>();
  /** This residue's dihedra, likewise. */
  readonly dihedra = new Map<string, Dihedron>();
  /** The chain that owns the angles, set before they are built. */
  cic?: IC_Chain;
  /** Backing field for {@link IC_Residue.NCaCKey}, unset until the angles are linked. */
  private ncacKey?: readonly AtomKey[][];

  /**
   * The N-CA-C keys of this residue, one list per alternative location.
   *
   * @throws TypeError until {@link IC_Residue.linkDihedra} has run, as Biopython does: it assigns the attribute
   *   there and nowhere else, so a residue whose atoms were all rejected never gets one.
   */
  get NCaCKey(): readonly AtomKey[][] {
    if (this.ncacKey === undefined) throw new TypeError("'IC_Residue' object has no attribute 'NCaCKey'");
    return this.ncacKey;
  }
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
  buildRakCache(): void {
    const sorted = [...this.akSet].sort((a, b) => { const [p, q] = a.compare(b); return p - q; });
    for (const ak of sorted) {
      const name = ak.akl[3] as string;
      if (this.akc.get(name) === undefined) this.akc.set(name, ak);
    }
  }


  /**
   * Make a generic list of atom keys specific to this residue, expanding it over alternative locations.
   *
   * `(N, CA, C)` becomes `(N, CA, C)` for an ordinary residue, but a residue whose CA has two locations gives two
   * lists, one per altloc. A position with fewer locations than the others contributes its first key to every list,
   * since any of them would do.
   *
   * @param lst - The keys to make specific.
   * @param missingOK - Keep going when an atom is not in this residue; by default the result is empty instead.
   * @returns One list per alternative location, sorted by that location, or a single list where there are none.
   *   Biopython returns them in the arbitrary order of a set.
   */
  splitAkl(lst: readonly AtomKey[], missingOK = false): AtomKey[][] {
    const mine = new Map<string, AtomKey>();
    for (const k of this.akSet) mine.set(k.hashKey, k);

    // Step one: for each key, the keys of this residue it could stand for.
    const edraLst: AtomKey[][] = [];
    const altlocs = new Set<string>();
    const posnAltlocs = new Map<string, Set<string>>();
    const akMap = new Map<string, AtomKey>();
    for (const ak of lst) {
      posnAltlocs.set(ak.hashKey, new Set());
      if (mine.has(ak.hashKey) && ak.akl[FIELDS.altloc] === null && ak.akl[FIELDS.occ] === null) {
        edraLst.push([ak]);                      // no altloc and an exact match
        continue;
      }
      const matches: AtomKey[] = [];
      for (const ak2 of this.akSet) {
        if (!ak.altlocMatch(ak2)) continue;
        matches.push(ak2);
        akMap.set(ak2.hashKey, ak);
        const altloc = ak2.akl[FIELDS.altloc] ?? null;
        if (altloc !== null) {
          altlocs.add(altloc);
          posnAltlocs.get(ak.hashKey)!.add(altloc);
        }
      }
      edraLst.push(matches);
    }

    // Step two: an empty position means a missing atom, and more than one means altlocs to expand over.
    let maxc = 0;
    for (const akl of edraLst) {
      if (akl.length === 0 && !missingOK) return [];
      if (maxc < akl.length) maxc = akl.length;
    }
    if (maxc === 1) return [edraLst.filter((akl) => akl.length > 0).map((akl) => akl[0]!)];

    const out: AtomKey[][] = [];
    // Biopython iterates a `set` here, so the order of the lists it returns depends on the interpreter's hash seed
    // and changes between runs. Sorted here, so that this port's answer is at least its own every time.
    for (const al of [...altlocs].sort()) {
      const alhl: AtomKey[] = [];
      for (const akl of edraLst) {
        if (akl.length === 0) continue;
        if (akl.length === 1) { alhl.push(akl[0]!); continue; }   // not every atom has an altloc
        const asked = akMap.get(akl[0]!.hashKey)!;
        if (!posnAltlocs.get(asked.hashKey)!.has(al)) {
          // This position has fewer altlocs than the others and not this one, so any of its keys will do.
          alhl.push([...akl].sort((a, b) => { const [p, q] = a.compare(b); return p - q; })[0]!);
        } else {
          for (const ak of akl) if (ak.akl[FIELDS.altloc] === al) alhl.push(ak);
        }
      }
      out.push(alhl);
    }
    return out;
  }

  /**
   * Build the hedra or dihedron a list of keys describes, and register it with this residue and the chain.
   *
   * Nothing is built when any atom is missing. One copy of each angle is kept on the chain, so a residue that
   * shares an angle with its neighbour shares the object.
   *
   * @param lst - Three keys for a hedron, four for a dihedron.
   */
  genEdra(lst: readonly AtomKey[]): void {
    for (const ak of lst) if (ak.missing) return;
    const wantDihedron = lst.length >= 4;
    const chainSide = wantDihedron ? this.cic!.dihedra : this.cic!.hedra;
    const mySide = wantDihedron ? this.dihedra : this.hedra;
    for (const tnlst of this.splitAkl(lst)) {
      // split_akl may have produced something shorter; such a list is not an angle.
      if (tnlst.length !== lst.length) continue;
      const key = Edron.genKey(tnlst);
      if (!chainSide.has(key)) {
        chainSide.set(key, (wantDihedron ? new Dihedron([tnlst]) : new Hedron([tnlst])) as never);
      }
      if (!mySide.has(key)) mySide.set(key, chainSide.get(key) as never);
      mySide.get(key)!.needsUpdate = true;
    }
  }

  /**
   * Build every hedron and dihedron of this residue, from the tables and from its neighbours.
   *
   * The backbone angles that reach into the next residue come first, since they need that residue's atoms; then the
   * N-CA-C hedron where the chain starts; then the backbone and side-chain tables for this residue's own atoms.
   *
   * @param allBonds - Also build the extra side-chain dihedra Biopython's OpenSCAD output needs.
   * @throws Error when {@link icSettings.glyCbeta} is set, which needs the hedra linking that arrives with the rest
   *   of the chain.
   */
  createEdra(allBonds = false): void {
    if (this.akSet.size === 0) return;
    const sN = this.rak("N"), sCA = this.rak("CA"), sC = this.rak("C");
    if (this.lc !== "G") this.rak("CB");

    if (this.rnext.length > 0 && this.rnext.some((r) => r.akSet.size > 0)) {
      for (const rn of this.rnext) {
        const nN = rn.rak("N"), nCA = rn.rak("CA"), nC = rn.rak("C");
        for (const tpl of rn.splitAkl([nN, nCA, nC], true)) {
          for (const ak of tpl) {
            if ([...rn.akSet].some((k) => k.equals(ak))) this.akSet.add(ak);
            else for (const rnAk of rn.akSet) if (rnAk.altlocMatch(ak)) this.akSet.add(rnAk);
          }
        }
        this.genEdra([sN, sCA, sC, nN]);     // psi
        this.genEdra([sCA, sC, nN, nCA]);    // omega of the next residue
        this.genEdra([sC, nN, nCA, nC]);     // phi of the next residue
        this.genEdra([sCA, sC, nN]);
        this.genEdra([sC, nN, nCA]);
        this.genEdra([nN, nCA, nC]);         // tau of the next residue
        // Without the next residue's O there is no side chain, so C-beta gets an alternative locator.
        if (rn.akc.get("O") === undefined) {
          const nCB = rn.akc.get("CB");
          if (nCB !== undefined && [...rn.akSet].some((k) => k.equals(nCB))) {
            this.akSet.add(nCB);
            this.genEdra([nN, nCA, nCB]);
            this.genEdra([sC, nN, nCA, nCB]);
          }
        }
      }
    }
    // At the start of a chain there is no previous residue to have built this one.
    if (this.rprev.length === 0) this.genEdra([sN, sCA, sC]);

    for (const edra of icDataBackbone) {
      // Only worth building when this residue has every atom the table entry names.
      const atoms = edra.slice(0, 4).filter((a) => !["phi", "psi", "omg", "tau"].includes(a));
      if (atoms.every((atm) => this.akc.has(atm))) this.genEdra(atoms.map((atm) => this.rak(atm)));
    }
    if (this.lc !== null) {
      for (const edraLong of icDataSidechains[this.lc] ?? []) {
        const edra = edraLong.slice(0, 4).filter((a) => !a.startsWith("chi"));
        if (edra.every((atm) => this.akc.has(atm))) this.genEdra(edra.map((atm) => this.rak(atm)));
      }
      if (allBonds) {
        for (const edra of icDataSidechainExtras[this.lc] ?? []) {
          if (edra.every((atm) => this.akc.has(atm))) this.genEdra(edra.map((atm) => this.rak(atm)));
        }
      }
    }
    if (icSettings.glyCbeta && this.lc === "G") {
      throw new Error("glyCbeta needs Dihedron._set_hedra, which comes with the rest of IC_Chain");
    }
    this.linkDihedra();
  }

  /**
   * Housekeeping once the angles are built: point each one back at this residue and the chain, collect the atoms
   * they involve, and work out this residue's N-CA-C keys.
   */
  linkDihedra(): void {
    for (const dh of this.dihedra.values()) {
      dh.ric = this;
      dh.cic = this.cic;
      for (const ak of dh.atomkeys) this.akSet.add(ak);
    }
    for (const h of this.hedra.values()) {
      // Atoms of an orphan hedron count too: the alternative C-beta path has one with no dihedron.
      for (const ak of h.atomkeys) this.akSet.add(ak);
      h.cic = this.cic;
    }
    if (this.akc.size === 0) this.buildRakCache();
    this.ncacKey = this.splitAkl([new AtomKey([this, "N"]), new AtomKey([this, "CA"]), new AtomKey([this, "C"])]);
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
