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

import { pyFormatFixed, pyInt, RuntimeError } from "@biolibs/core";
import { AtomKey, FIELDS } from "./atom-key.js";
import { Dihedron, Edron, Hedron } from "./edron.js";
import type { IC_Chain } from "./ic-chain.js";
import { acceptAtoms, acceptResnames, icDataBackbone, icDataSidechainExtras, icDataSidechains } from "./ic-data.js";
import { icSettings } from "./settings.js";
import { proteinLetters3to1 } from "../pdb-data.js";
import { tupleRepr } from "../util.js";
import type { Matrix } from "../vectors.js";
import type { Atom, DisorderedAtom } from "../atom.js";
import type { Residue } from "../residue.js";

/** The atom-shaped values `IC_Residue` takes keys from. */
type AnyAtom = Atom | DisorderedAtom;


/**
 * One atom as a PDB ATOM record, the way `Bio.PDB.internal_coords` writes it.
 *
 * This is `IC_Residue._pdb_atom_string`, not `PDBIO`'s writer: the two lay their columns out differently,
 * and Biopython's own comment admits this one ought to move. A disordered atom expands to one record per
 * altloc, unless {@link icSettings.noAltloc} says to keep only the selected one.
 *
 * @param atm - The atom.
 * @returns The record, ending in a newline — or several, for a disordered atom.
 */
function pdbAtomString(atm: Atom): string {
  if (atm.isDisordered() === 2) {
    const dis = atm as unknown as DisorderedAtom;
    if (icSettings.noAltloc) return pdbAtomString(dis.disorderedGet() as Atom);
    return [...dis.childDict.values()].map((a) => pdbAtomString(a as Atom)).join("");
  }
  const res = atm.getParent() as unknown as { resname: string; id: [string, number, string];
                                              getParent(): { id: string } | null } | null;
  const chn = res?.getParent() ?? null;
  const left = (v: string, w: number): string => v.padEnd(w);
  const right = (v: string, w: number): string => v.padStart(w);
  const f = (v: number | null, w: number, p: number): string => right(pyFormatFixed(v ?? 0, p), w);
  const serial = icSettings.atomSernum ?? atm.serialNumber;
  return [
    left("ATOM", 6),
    right(String(serial), 5),
    " ", left(atm.fullname, 4), left(atm.altloc, 1), left(res?.resname ?? "", 3),
    " ", left(icSettings.atomChain ?? chn?.id ?? "", 1),
    // A residue's sequence number is an int, and Python right-aligns numbers in a plain width field.
    right(String(res?.id[1] ?? ""), 4), left(res?.id[2] ?? "", 1), "   ",
    f(atm.coord[0]!, 8, 3), f(atm.coord[1]!, 8, 3), f(atm.coord[2]!, 8, 3),
    f(atm.occupancy, 6, 2), f(atm.bfactor, 6, 2), "        ", right(atm.element ?? "", 4), "\n",
  ].join("");
}

/**
 * One residue's internal coordinates: its atom keys, and the identity it shares with the residue it extends.
 *
 * @example
 * ```ts
 * const ric = new IC_Residue(residue);
 * ric.lc;                  // "G" for a glycine, or the three-letter name when it is not one of the twenty
 * ric.rak("CA").id;        // "52_G_CA"
 * [...ric.akSet!].length;   // how many atoms were kept
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
  akc: Map<string | AnyAtom, AtomKey> | null = new Map<string | AnyAtom, AtomKey>();
  /**
   * The keys of the atoms this residue kept.
   *
   * Null once the serial assembly has dropped this residue, which is how Biopython marks one left outside a
   * `start`/`fin` range: reading it then raises there, and the `!` at this class's own uses says the same.
   */
  akSet: Set<AtomKey> | null = new Set<AtomKey>();
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
      if (this.akSet!.size > 0) this.buildRakCache();
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
    this.akSet!.add(this.rak(atm));
  }

  /**
   * This residue's key for an atom, cached.
   *
   * @param atm - An atom, or an atom name for an atom the residue may not have.
   * @returns The key. One built from a name is marked `missing`, since nothing has confirmed the atom is there.
   */
  rak(atm: string | AnyAtom): AtomKey {
    let ak = this.akc!.get(atm);
    if (ak === undefined) {
      ak = new AtomKey([this, atm]);
      this.akc!.set(atm, ak);
      if (typeof atm === "string") ak.missing = true;
    }
    return ak;
  }

  /**
   * Give every atom name an entry in the cache, so that asking for one altloc first cannot leave the selected atom
   * without one.
   */
  buildRakCache(): void {
    const sorted = [...this.akSet!].sort((a, b) => { const [p, q] = a.compare(b); return p - q; });
    for (const ak of sorted) {
      const name = ak.akl[3] as string;
      if (this.akc!.get(name) === undefined) this.akc!.set(name, ak);
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
    for (const k of this.akSet!) mine.set(k.hashKey, k);

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
      for (const ak2 of this.akSet!) {
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
    if (this.akSet!.size === 0) return;
    const sN = this.rak("N"), sCA = this.rak("CA"), sC = this.rak("C");
    if (this.lc !== "G") this.rak("CB");

    if (this.rnext.length > 0 && this.rnext.some((r) => r.akSet!.size > 0)) {
      for (const rn of this.rnext) {
        const nN = rn.rak("N"), nCA = rn.rak("CA"), nC = rn.rak("C");
        for (const tpl of rn.splitAkl([nN, nCA, nC], true)) {
          for (const ak of tpl) {
            if ([...rn.akSet!].some((k) => k.equals(ak))) this.akSet!.add(ak);
            else for (const rnAk of rn.akSet!) if (rnAk.altlocMatch(ak)) this.akSet!.add(rnAk);
          }
        }
        this.genEdra([sN, sCA, sC, nN]);     // psi
        this.genEdra([sCA, sC, nN, nCA]);    // omega of the next residue
        this.genEdra([sC, nN, nCA, nC]);     // phi of the next residue
        this.genEdra([sCA, sC, nN]);
        this.genEdra([sC, nN, nCA]);
        this.genEdra([nN, nCA, nC]);         // tau of the next residue
        // Without the next residue's O there is no side chain, so C-beta gets an alternative locator.
        if (rn.akc!.get("O") === undefined) {
          const nCB = rn.akc!.get("CB");
          if (nCB !== undefined && [...rn.akSet!].some((k) => k.equals(nCB))) {
            this.akSet!.add(nCB);
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
      if (atoms.every((atm) => this.akc!.has(atm))) this.genEdra(atoms.map((atm) => this.rak(atm)));
    }
    if (this.lc !== null) {
      for (const edraLong of icDataSidechains[this.lc] ?? []) {
        const edra = edraLong.slice(0, 4).filter((a) => !a.startsWith("chi"));
        if (edra.every((atm) => this.akc!.has(atm))) this.genEdra(edra.map((atm) => this.rak(atm)));
      }
      if (allBonds) {
        for (const edra of icDataSidechainExtras[this.lc] ?? []) {
          if (edra.every((atm) => this.akc!.has(atm))) this.genEdra(edra.map((atm) => this.rak(atm)));
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
      for (const ak of dh.atomkeys) this.akSet!.add(ak);
    }
    for (const h of this.hedra.values()) {
      // Atoms of an orphan hedron count too: the alternative C-beta path has one with no dihedron.
      for (const ak of h.atomkeys) this.akSet!.add(ak);
      h.cic = this.cic;
    }
    if (this.akc!.size === 0) this.buildRakCache();
    this.ncacKey = this.splitAkl([new AtomKey([this, "N"]), new AtomKey([this, "CA"]), new AtomKey([this, "C"])]);
  }

  /**
   * @param ak - An atom key.
   * @returns Whether this residue kept that atom *and* the key names this residue.
   */
  contains(ak: AtomKey): boolean {
    if (![...this.akSet!].some((k) => k.equals(ak))) return false;
    const akl = ak.akl;
    return Number(akl[0]) === Number(this.rbase[0]) && akl[1] === this.rbase[1] && akl[2] === this.rbase[2];
  }

  /** @returns Python's `repr`: the parent residue's full id, as a tuple. */
  repr(): string {
    return tupleRepr(this.residue.getFullId());
  }

  /** @returns A readable residue id: name, chain, position and insertion code. */

  /**
   * The {@link AtomKey}s a `:`-separated atom-name string names, resolved against this residue.
   *
   * A name on its own means this residue's atom. A name prefixed `-1`, `0` or `1` means the previous, this,
   * or the next residue's — which is how a caller reaches across the peptide bond (`-1C:N` is the bond
   * itself).
   *
   * @param akStr - The string, e.g. `"N:CA"` or `"-1C:N:CA:C"`.
   * @returns The keys, or null when a relative position has no residue there: Biopython drops the key
   *   silently and then notices the tuple came out short, which is the only signal.
   */
  private getAkTuple(akStr: string): AtomKey[] | null {
    const parts = akStr.split(":");
    const keys: AtomKey[] = [];
    for (const a of parts) {
      const m = /^(-?[10])([A-Z]+)$/.exec(a);
      if (m === null) { keys.push(this.rak(a)); continue; }
      if (m[1] === "-1") { if (this.rprev.length > 0) keys.push(new AtomKey([this.rprev[0]!, m[2]!])); }
      else if (m[1] === "1") { if (this.rnext.length > 0) keys.push(new AtomKey([this.rnext[0]!, m[2]!])); }
      else keys.push(this.rak(m[2]!));
    }
    return keys.length === parts.length ? keys : null;
  }

  /**
   * The di/hedron a tuple of keys names, from this residue's own registries.
   *
   * @param angleKey - Three keys for a hedron, four for a dihedron.
   * @returns The angle, or null for neither length or no such angle here.
   */
  private getAngleForTuple(angleKey: readonly AtomKey[]): Hedron | Dihedron | null {
    if (angleKey.length === 4) return this.dihedra.get(Edron.genKey(angleKey)) ?? null;
    if (angleKey.length === 3) return this.hedra.get(Edron.genKey(angleKey)) ?? null;
    return null;
  }

  /**
   * The di/hedron a key names, in any of the five grammars Biopython accepts.
   *
   * The key may be a tuple of {@link AtomKey}s (the only way to reach a disordered angle), a `:`-separated
   * string of atom names, the same with `-1`/`0`/`1` position prefixes, a named backbone angle (`psi`,
   * `phi`, `omg`, `omega`, `tau`) or a side-chain angle (`chi1`…`chi5`).
   *
   * **Where an angle lives is not where you would guess.** A residue's `phi` and `omega`, and the hedra
   * under them, are stored on the *previous* residue, because they span the peptide bond; `tau` may be on
   * either. This looks in both places, as Biopython does.
   *
   * @param angleKey - The key.
   * @returns The angle, or null when this residue has no such angle — including when the neighbour it would
   *   need is not there.
   */
  pickAngle(angleKey: readonly AtomKey[] | string): Hedron | Dihedron | null {
    if (typeof angleKey !== "string") {
      return this.getAngleForTuple(angleKey)
        ?? (this.rprev.length > 0 ? this.rprev[0]!.getAngleForTuple(angleKey) : null);
    }
    if (angleKey.includes(":")) {
      const keys = this.getAkTuple(angleKey);
      if (keys === null) return null;
      return this.getAngleForTuple(keys)
        ?? (this.rprev.length > 0 ? this.rprev[0]!.getAngleForTuple(keys) : null);
    }
    if (angleKey === "psi") {
      if (this.rnext.length === 0) return null;
      const keys = [this.rak("N"), this.rak("CA"), this.rak("C"), this.rnext[0]!.rak("N")];
      return this.dihedra.get(Edron.genKey(keys)) ?? null;
    }
    if (angleKey === "phi") {
      if (this.rprev.length === 0) return null;
      const rp = this.rprev[0]!;
      const keys = [rp.rak("C"), this.rak("N"), this.rak("CA"), this.rak("C")];
      return rp.dihedra.get(Edron.genKey(keys)) ?? null;
    }
    if (angleKey === "omg" || angleKey === "omega") {
      if (this.rprev.length === 0) return null;
      const rp = this.rprev[0]!;
      const keys = [rp.rak("CA"), rp.rak("C"), this.rak("N"), this.rak("CA")];
      return rp.dihedra.get(Edron.genKey(keys)) ?? null;
    }
    if (angleKey === "tau") {
      const keys = [this.rak("N"), this.rak("CA"), this.rak("C")];
      const own = this.hedra.get(Edron.genKey(keys));
      if (own !== undefined) return own;
      // Every residue but the first keeps its tau on the one before.
      if (this.rprev.length > 0) return this.rprev[0]!.hedra.get(Edron.genKey(keys)) ?? null;
      return null;
    }
    if (angleKey.startsWith("chi")) {
      const scList = icDataSidechains[this.lc];
      if (scList === undefined) return null;
      // The side-chain table alternates hedron, dihedron, so chiN is at 2N-1. The number comes off the end
      // of the key with Python's `int()`, which means a bare "chi" raises rather than missing -- Biopython
      // reads `angle_key[-1]`, and that is the "i".
      const ndx = 2 * pyInt(angleKey.slice(-1)) - 1;
      const akl = scList[ndx];
      if (akl === undefined || akl[4] !== angleKey) return null;
      const keys = akl.slice(0, 4).map((a) => this.rak(a));
      return this.dihedra.get(Edron.genKey(keys)) ?? null;
    }
    return null;
  }

  /**
   * The value of the angle a key names.
   *
   * @param angleKey - As {@link IC_Residue.pickAngle} takes it.
   * @returns The angle in degrees, or null when there is no such angle.
   */
  getAngle(angleKey: readonly AtomKey[] | string): number | null {
    const edron = this.pickAngle(angleKey);
    // Biopython tests the edron for truth, and a di/hedron is always truthy, so only null is skipped.
    return edron === null ? null : edron.angle;
  }

  /**
   * Set the angle a key names, moving the dihedra that overlap it with it.
   *
   * The overlap is real geometry, not bookkeeping: `psi` (N-CA-C-N) shares its first three atoms with
   * N-CA-C-O, so turning one without the other would put the carbonyl oxygen through the next residue.
   *
   * @param angleKey - As {@link IC_Residue.pickAngle} takes it.
   * @param v - The new angle in degrees, wrapped into ±180.
   * @param overlap - False to move only this angle. A hedron has no overlap and ignores it.
   */
  setAngle(angleKey: readonly AtomKey[] | string, v: number, overlap = true): void {
    const edron = this.pickAngle(angleKey);
    if (edron === null) return;
    if (edron instanceof Hedron || !overlap) { edron.angle = v; return; }
    this.doBondRotate(edron, Dihedron.angleDif(edron.angle, v));
  }

  /**
   * Turn a dihedron and everything that overlaps it by the same delta.
   *
   * @param base - The dihedron to turn. @param delta - Degrees to add.
   * @throws RuntimeError with Biopython's wording when the chain has no dihedron index — which is what
   *   happens if this is reached for a hedron.
   */
  private doBondRotate(base: Dihedron, delta: number): void {
    const index = this.cic?.id3DhIndex;
    // Biopython reaches for `base.id3`, which a hedron has not got, and turns the AttributeError into this.
    if (index === undefined || !(base instanceof Dihedron)) {
      throw new RuntimeError("bond_rotate, bond_set only for dihedral angles");
    }
    for (const dk of index.get(Edron.genKey(base.id3)) ?? []) {
      const dihed = this.cic!.dihedra.get(dk);
      if (dihed === undefined) continue;
      dihed.angle = dihed.angle + delta;
      // Anything sharing this dihedron's *second* hedron reversed moves too: turning N-CA-C-N has to
      // carry O-CA-C-CB round with it.
      const reversed = Edron.genKey([...dihed.id32].reverse());
      for (const d2rk of index.get(reversed) ?? []) {
        const d2 = this.cic!.dihedra.get(d2rk);
        if (d2 !== undefined) d2.angle = d2.angle + delta;
      }
    }
  }

  /**
   * Turn a dihedral angle by a number of degrees, carrying its overlapping dihedra with it.
   *
   * @param angleKey - As {@link IC_Residue.pickAngle} takes it. @param delta - Degrees to add.
   */
  bondRotate(angleKey: readonly AtomKey[] | string, delta: number): void {
    const base = this.pickAngle(angleKey);
    if (base !== null) this.doBondRotate(base as Dihedron, delta);
  }

  /**
   * Set a dihedral angle, carrying its overlapping dihedra with it.
   *
   * Biopython keeps this alongside {@link IC_Residue.setAngle} for compatibility; it is that method with
   * `overlap` forced true and no hedron case.
   *
   * @param angleKey - As {@link IC_Residue.pickAngle} takes it. @param val - The new angle in degrees.
   */
  bondSet(angleKey: readonly AtomKey[] | string, val: number): void {
    const base = this.pickAngle(angleKey);
    if (base !== null) this.doBondRotate(base as Dihedron, Dihedron.angleDif(base.angle, val));
  }

  /**
   * Every hedron containing a given pair of atoms, and the pair itself.
   *
   * A bond belongs to more than one hedron — `CA:C` is in both N-CA-C and CA-C-O — so this returns a list,
   * and the caller takes the first that answers. The previous residue's hedra are searched too, which is
   * what makes a glycine's `N:CA` reachable: it is kept there.
   *
   * @param akSpec - Two atom names as a `:`-separated string, or two {@link AtomKey}s.
   * @returns The hedra and the resolved pair, or `[null, null]` when the string names an atom that is not
   *   there.
   */
  pickLength(akSpec: string | readonly AtomKey[]): [Hedron[] | null, readonly AtomKey[] | null] {
    const spec = typeof akSpec === "string" ? this.getAkTuple(akSpec) : akSpec;
    if (spec === null) return [null, null];
    const rlst: Hedron[] = [];
    const holds = (h: Hedron): boolean => spec.every((ak) => h.atomkeys.some((k) => k.equals(ak)));
    for (const h of this.hedra.values()) if (holds(h)) rlst.push(h);
    for (const rp of this.rprev) for (const h of rp.hedra.values()) if (holds(h)) rlst.push(h);
    return [rlst, spec];
  }

  /**
   * The length of a bond.
   *
   * @param akSpec - As {@link IC_Residue.pickLength} takes it.
   * @returns The length in ångströms, or null when no hedron here holds that pair.
   */
  getLength(akSpec: string | readonly AtomKey[]): number | null {
    const [hedLst, spec] = this.pickLength(akSpec);
    if (hedLst === null || spec === null) return null;
    for (const hed of hedLst) {
      const val = hed.getLength(spec);
      if (val !== null) return val;
    }
    return null;
  }

  /**
   * Set the length of a bond, in every hedron that holds it.
   *
   * All of them, not just the first: the same bond in two hedra has to stay one length, or the two
   * disagree about where the atom is.
   *
   * @param akSpec - As {@link IC_Residue.pickLength} takes it. @param val - The new length.
   */
  setLength(akSpec: string | readonly AtomKey[], val: number): void {
    const [hedLst, spec] = this.pickLength(akSpec);
    if (hedLst === null || spec === null) return;
    for (const hed of hedLst) hed.setLength(spec, val);
  }

  /**
   * Transform this residue's atoms by a 4×4 matrix, in place.
   *
   * Every atom whose key reports this residue's position moves — which includes the atoms a neighbouring
   * residue contributed to a shared angle, since they carry their own position in their key and so are
   * left alone.
   *
   * @param mtx - The homogeneous transform.
   */
  applyMtx(mtx: Matrix): void {
    const cic = this.cic;
    if (cic === undefined) return;
    const rp = String(this.rbase[0]);
    for (const [hash, ndx] of cic.atomArrayIndex) {
      const ak = cic.aktuple.find((k) => k.hashKey === hash);
      if (ak === undefined || ak.akl[FIELDS.respos] !== rp) continue;
      const row = cic.atomArray.subarray(ndx * 4, ndx * 4 + 4);
      const out = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) {
        let v = 0;
        for (let j = 0; j < 4; j++) v += mtx[i]![j]! * row[j]!;
        out[i] = v;
      }
      for (let i = 0; i < 4; i++) row[i] = out[i]!;
    }
  }

  /**
   * Mark every one of this residue's dihedra as having no valid coordinate space.
   *
   * {@link IC_Residue.assemble} rebuilds those spaces, so this is what makes it start again rather than
   * trusting what a previous assembly left.
   */
  clearTransforms(): void {
    const cic = this.cic;
    if (cic?.dcsValid === undefined) return;
    for (const d of this.dihedra.values()) cic.dcsValid[d.ndx] = 0;
  }

  /**
   * Mark the N-CA and CA-C bonds as flexible joints, for the OpenSCAD writer.
   *
   * These are plain flags on the hedra; `Bio.PDB.SCADIO` reads them when it emits a printable model.
   */
  setFlexible(): void {
    for (const h of this.hedra.values()) {
      if (h.eClass === "NCAC") { h.flexFemale1 = true; h.flexFemale2 = true; }
      else if (h.eClass.endsWith("NCA")) h.flexMale2 = true;
      else if (h.eClass.startsWith("CAC") && h.atomkeys[1]!.akl[FIELDS.atm] === "C") h.flexMale1 = true;
      // The CA-CB bond runs into the flex joint, so that hedron is printed thin instead.
      else if (h.eClass === "CBCAC") h.skinny1 = true;
    }
  }

  /** Mark the H-N and C-O bonds as hydrogen bonds — magnets, in the OpenSCAD model. */
  setHbond(): void {
    for (const h of this.hedra.values()) {
      if (h.eClass === "HNCA") h.hbond1 = true;
      else if (h.eClass === "CACO") h.hbond2 = true;
    }
  }

  /**
   * This residue's atoms as PDB ATOM records.
   *
   * Only this residue's own atoms: a key reporting a different residue position is one a neighbour
   * contributed to a shared angle, and belongs to that residue's records.
   *
   * @returns The records, each ending in a newline.
   * @throws TypeError when the chain has not built its atom array, which is Biopython's `AttributeError`.
   */
  pdbResidueString(): string {
    const cic = this.cic;
    if (cic === undefined) throw new TypeError("'IC_Residue' object has no attribute 'cic'");
    let out = "";
    const respos = this.rbase[0];
    for (const ak of [...(this.akSet ?? [])].sort((a, b) => (a.lt(b) ? -1 : a.equals(b) ? 0 : 1))) {
      if (Number(ak.akl[FIELDS.respos]) !== Number(respos)) continue;
      const ndx = cic.atomArrayIndex.get(ak.hashKey);
      const atm = ndx === undefined ? null : cic.bpAtomArray[ndx];
      if (atm == null) continue;
      out += pdbAtomString(atm);
      if (icSettings.atomSernum !== null) icSettings.atomSernum += 1;
    }
    return out;
  }

  /** @returns A short label for the residue: its name and position, as Biopython's `pretty_str`. */
  prettyStr(): string {
    const id = this.residue.id as [string, number, string];
    return `${this.residue.resname} ${id[0]}${id[1]}${id[2]}`;
  }
}
