/**
 * `Edron`, `Hedron` and `Dihedron`: the angles a protein is described by in internal coordinates
 * (Biopython's `Bio.PDB.internal_coords`).
 *
 * A hedron is three bonded atoms — two bond lengths and the angle between them — and a dihedron is four, the angle
 * between the two planes. Both are identified by their {@link AtomKey}s, and both sort by those keys, which is what
 * gives a residue's angles a canonical order. The classification strings (`eClass`, `reClass`, `creClass`) are how
 * Biopython gathers statistics over many structures: the same three atoms in the same three residues anywhere in
 * any chain produce the same string.
 *
 * The *values* of a hedron (its lengths and angle) do not live here. Biopython keeps them in arrays on the chain and
 * reaches them by index, so a hedron with no chain reads 0 for all three; {@link EdronArrays} is the contract the
 * chain will satisfy when that part of the port lands.
 */

import { pyFloatRepr } from "@biolibs/core";
import { primaryAngles } from "./ic-data.js";
import { AtomKey, FIELDS } from "./atom-key.js";

/**
 * What a hedron reads from the chain that holds it.
 *
 * Biopython stores every hedron's two lengths and angle in three arrays on `IC_Chain` and gives each hedron an
 * index into them, so that the whole chain can be recomputed with array arithmetic. Every field is optional because
 * a chain that has not built them yet is a real state: Biopython reads them through `self.cic.hedraAngle` and
 * catches the `AttributeError`, which is the same thing.
 */
export interface EdronArrays {
  /** Angle of each hedron, in degrees, by hedron index. */
  hedraAngle?: ArrayLike<number>;
  /** Length between the first and second atoms of each hedron. */
  hedraL12?: ArrayLike<number>;
  /** Length between the second and third atoms of each hedron. */
  hedraL23?: ArrayLike<number>;
  /** Angle of each dihedron, in degrees, by dihedron index. */
  dihedraAngle?: ArrayLike<number>;
}

/** What a di/hedron can be built from: its keys as an array, as separate arguments, or as named `a1`…`a4`. */
export type EdronFields = { a1?: string; a2?: string; a3?: string; a4?: string | null };

/** The base of {@link Hedron} and {@link Dihedron}: the atom keys, the identity they give, and their order. */
export class Edron {
  /** The three or four atoms, in order. */
  readonly atomkeys: readonly AtomKey[];
  /** The keys joined with `:`, which identifies this di/hedron. */
  readonly id: string;
  /** Whether the local atom coordinates still reflect the current lengths and angle. */
  needsUpdate = true;
  /** The atom names alone, joined: `NCAC`. Two di/hedra of the same shape share it wherever they occur. */
  readonly eClass: string;
  /** Residue and atom name per position, joined: `GNGCAGC`. */
  readonly reClass: string;
  /** The covalent-radius class per position, joined: `NsbCsbCsb`. */
  readonly creClass: string;
  /** How many residues the atoms come from: 1, or 2 where the di/hedron crosses a residue boundary. */
  readonly rc: number;
  /** The chain that holds the lengths and angles, once there is one. */
  cic?: EdronArrays;
  /** This di/hedron's index into the chain's arrays. */
  ndx = 0;

  /**
   * @param args - The keys: an array of them (which replaces whatever came before, as in Biopython), or one key per
   *   argument. `null` arguments are ignored.
   * @param named - `a1`, `a2`, `a3` and optionally `a4` as key strings, used only when no key came positionally.
   * @throws TypeError for an atom whose covalent-radius class is unknown, which Biopython reaches by concatenating
   *   `None` to the classification string.
   */
  constructor(args: readonly unknown[] = [], named: EdronFields = {}) {
    let atomkeys: AtomKey[] = [];
    for (const arg of args) {
      // An array argument replaces the keys so far; Biopython assigns rather than extends.
      if (Array.isArray(arg)) atomkeys = [...(arg as AtomKey[])];
      else if (arg !== null && arg !== undefined) atomkeys.push(arg as AtomKey);
    }
    if (atomkeys.length === 0 && named.a1 !== undefined && named.a2 !== undefined && named.a3 !== undefined) {
      atomkeys = [new AtomKey(named.a1), new AtomKey(named.a2), new AtomKey(named.a3)];
      if (named.a4 !== undefined && named.a4 !== null) atomkeys.push(new AtomKey(named.a4));
    }
    this.atomkeys = atomkeys;
    this.id = Edron.genKey(atomkeys);

    let eClass = "", reClass = "", creClass = "";
    const residues = new Set<string>();
    for (const ak of atomkeys) {
      const atm = ak.akl[FIELDS.atm] as string;
      eClass += atm;
      reClass += (ak.akl[FIELDS.resname] as string) + atm;
      residues.add((ak.akl[FIELDS.respos] as string) + (ak.akl[FIELDS.icode] ?? ""));
      // Biopython builds this string with `+=`, so an atom whose covalent class is unknown -- `CD1` in a glycine,
      // say -- fails here rather than producing a classification with a hole in it.
      const cr = ak.crClass();
      if (cr === null) throw new TypeError('can only concatenate str (not "NoneType") to str');
      creClass += cr;
    }
    this.eClass = eClass;
    this.reClass = reClass;
    this.creClass = creClass;
    this.rc = residues.size;
  }

  /**
   * @param keys - Three or four atom keys.
   * @returns Their ids joined with `:`, e.g. `2_A_C:3_P_N:3_P_CA`.
   */
  static genKey(keys: readonly AtomKey[]): string {
    const ids = keys.map((k) => k.id);
    return keys.length === 4 ? ids.slice(0, 4).join(":") : ids.slice(0, 3).join(":");
  }

  /**
   * @param akstr - Atom key ids joined with `:`.
   * @returns The keys, e.g. `2_A_C:3_P_N:3_P_CA` to three keys.
   */
  static genTuple(akstr: string): AtomKey[] {
    return akstr.split(":").map((s) => new AtomKey(s));
  }

  /** @param ak - An atom key. @returns Whether this di/hedron is made of it. */
  contains(ak: AtomKey): boolean {
    return this.atomkeys.some((k) => k.equals(ak));
  }

  /** @returns Whether every atom is a backbone atom. */
  isBackbone(): boolean {
    return this.atomkeys.every((k) => k.isBackbone());
  }

  /** @returns Python's `repr`: the tuple of atom keys. */
  repr(): string {
    return this.atomkeys.length === 1
      ? `(${this.atomkeys[0]!.id},)`
      : `(${this.atomkeys.map((k) => k.id).join(", ")})`;
  }

  /** @param other - Another di/hedron. @returns Whether they have the same id. */
  equals(other: unknown): boolean {
    return other instanceof Edron && this.id === other.id;
  }

  /**
   * The first pair of atom keys that differ, which is what decides the order.
   *
   * @param other - The di/hedron to rank against.
   * @returns The differing keys, or null when every key agrees — Biopython's `False`.
   */
  compare(other: Edron): [AtomKey, AtomKey] | null {
    const n = Math.min(this.atomkeys.length, other.atomkeys.length);
    for (let i = 0; i < n; i++) {
      const s = this.atomkeys[i]!;
      const o = other.atomkeys[i]!;
      if (!s.equals(o)) return [s, o];
    }
    return null;
  }

  /** @param other - Another di/hedron. @returns Whether this sorts before it; false when they agree. */
  lt(other: Edron): boolean { const r = this.compare(other); return r === null ? false : r[0].lt(r[1]); }
  /** @param other - Another di/hedron. @returns Whether this sorts before it or they agree. */
  le(other: Edron): boolean { const r = this.compare(other); return r === null ? true : r[0].le(r[1]); }
  /** @param other - Another di/hedron. @returns Whether this sorts after it; false when they agree. */
  gt(other: Edron): boolean { const r = this.compare(other); return r === null ? false : r[0].gt(r[1]); }
  /** @param other - Another di/hedron. @returns Whether this sorts after it or they agree. */
  ge(other: Edron): boolean { const r = this.compare(other); return r === null ? true : r[0].ge(r[1]); }
}

/**
 * Three bonded atoms: two bond lengths and the angle between them.
 *
 * @example
 * ```ts
 * const h = new Hedron(Edron.genTuple("52_G_N:52_G_CA:52_G_C"));
 * h.eClass;      // "NCAC"
 * h.angle;       // 0 until a chain holds its value
 * ```
 */
export class Hedron extends Edron {
  /**
   * For a hedron spanning two residues, its {@link Edron.reClass} with `X` standing in for the residue that
   * contributes only one atom — so that the statistics gather such hedra together whatever the neighbour is.
   */
  readonly xrhClass?: string;

  /**
   * @param args - As {@link Edron}.
   * @param named - As {@link Edron}; Biopython also accepts `len12`, `angle` and `len23` here, which it stores on
   *   the chain rather than the hedron, so they are not accepted until that part of the port lands.
   */
  constructor(args: readonly unknown[] = [], named: EdronFields = {}) {
    super(args, named);
    if (this.rc === 2) {
      const akl0 = this.atomkeys[0]!.akl;
      const akl1 = this.atomkeys[1]!.akl;
      if (akl0[FIELDS.respos] !== akl1[FIELDS.respos] || akl0[FIELDS.icode] !== akl1[FIELDS.icode]) {
        this.xrhClass = `X${this.reClass.slice(1)}`;
      } else {
        let xrhc = "";
        for (let i = 0; i < 2; i++) {
          xrhc += (this.atomkeys[i]!.akl[FIELDS.resname] as string) + (this.atomkeys[i]!.akl[FIELDS.atm] as string);
        }
        this.xrhClass = `${xrhc}X${this.atomkeys[2]!.akl[FIELDS.atm] as string}`;
      }
    }
  }

  /** The angle in degrees, from the chain that holds it; 0 while there is none. */
  get angle(): number { return this.cic?.hedraAngle === undefined ? 0 : this.cic.hedraAngle[this.ndx]!; }
  /** The length between the first and second atoms; 0 while no chain holds it. */
  get len12(): number { return this.cic?.hedraL12 === undefined ? 0 : this.cic.hedraL12[this.ndx]!; }
  /** The length between the second and third atoms; 0 while no chain holds it. */
  get len23(): number { return this.cic?.hedraL23 === undefined ? 0 : this.cic.hedraL23[this.ndx]!; }

  /** @returns Python's `repr`: `3-` then the id, the classification and the three values. */
  override repr(): string {
    // The values are Python floats, so `0` prints as `0.0`.
    return `3-${this.id} ${this.reClass} ${pyFloatRepr(this.len12)} ${pyFloatRepr(this.angle)} ${pyFloatRepr(this.len23)}`;
  }
}

/**
 * Four bonded atoms: the angle between the plane of the first three and the plane of the last three.
 *
 * The named angles of a protein are dihedra: `phi`, `psi`, `omega` and the side-chain `chi` angles. Which ones are
 * measured directly rather than derived is decided here, by the atoms involved.
 *
 * @example
 * ```ts
 * const d = new Dihedron(Edron.genTuple("52_G_C:53_P_N:53_P_CA:53_P_C"));
 * d.primary;    // true: this is a phi angle
 * d.pclass;     // its classification among the primary angles
 * ```
 */
export class Dihedron extends Edron {
  /** The first three atoms, which make up this dihedron's first hedron. */
  readonly id3: readonly AtomKey[];
  /** The last three atoms, which make up its second hedron. */
  readonly id32: readonly AtomKey[];
  /** Whether this angle is measured directly rather than derived from another. */
  readonly primary: boolean;
  /** Its classification among the primary angles, where it is one. */
  readonly pclass?: string;
  /** Set instead of {@link Dihedron.pclass} for the dihedron that locates C-beta by an alternative route. */
  readonly altCBClass?: string;
  /** Whether the atoms run opposite to the order of the hedra they are made of; set when the hedra are linked. */
  reverse = false;
  /** The residue that holds this dihedron, set when the hedra are linked. */
  ric?: object;
  /** An angle set on the dihedron itself, before a chain holds it. */
  private dihedralValue?: number;

  /**
   * The dihedral angle in degrees: from the chain if one holds it, then from a value set here, and failing both
   * **360**, which Biopython uses as "no value" for this angle (a hedron's missing values read 0 instead).
   */
  get angle(): number {
    if (this.cic?.dihedraAngle !== undefined) return this.cic.dihedraAngle[this.ndx]!;
    return this.dihedralValue ?? 360;
  }

  /**
   * @returns Python's `repr`: `4-` then the id, the classification, the angle and the residue.
   * @throws TypeError (Python's AttributeError) while no residue holds this dihedron, which is what Biopython's
   *   own repr does — it reads `self.ric`, and that is only set when the hedra are linked.
   */
  override repr(): string {
    if (this.ric === undefined) throw new TypeError("'Dihedron' object has no attribute 'ric'");
    return `4-${this.id} ${this.reClass} ${pyFloatRepr(this.angle)} ${String(this.ric)}`;
  }

  /**
   * @param args - As {@link Edron}.
   * @param named - As {@link Edron}; Biopython also accepts `dihedral` here, which lives on the chain.
   */
  constructor(args: readonly unknown[] = [], named: EdronFields = {}) {
    super(args, named);
    this.id3 = this.atomkeys.slice(0, 3);
    this.id32 = this.atomkeys.slice(1, 4);
    // Which angle this is, from the atoms alone: the three backbone angles have names of their own, and the rest
    // are primary when `ic_data` lists them.
    const dhc = this.eClass;
    if (dhc === "NCACN") { this.pclass = `${this.reClass.slice(0, 7)}XN`; this.primary = true; }          // psi
    else if (dhc === "CACNCA") { this.pclass = `XCAXC${this.reClass.slice(5)}`; this.primary = true; }    // omega
    else if (dhc === "CNCAC") { this.pclass = `XC${this.reClass.slice(2)}`; this.primary = true; }        // phi
    else if (dhc === "CNCACB") { this.altCBClass = `XC${this.reClass.slice(2)}`; this.primary = false; }
    else if (primaryAngles.includes(dhc)) { this.primary = true; this.pclass = this.reClass; }
    else this.primary = false;
  }
}
