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

import { pyFloatRepr, pyFormatFixed } from "@biolibs/core";
import { icDataSidechains, primaryAngles } from "./ic-data.js";
import { AtomKey, FIELDS } from "./atom-key.js";
import type { Matrix } from "../vectors.js";

/**
 * What setting an angle invalidates on the chain, beyond the value arrays themselves.
 *
 * Kept separate from {@link EdronArrays} because a hedron can read its values from a chain that has not built
 * these yet, and Biopython's setters reach them through `self.cic` and let the `AttributeError` fall where it
 * may.
 */
export interface EdronInvalidation {
  /** Per-hedron flag: its atoms need recomputing. */
  hAtomsNeedsUpdate?: Uint8Array;
  /** Per-dihedron flag, likewise. */
  dAtomsNeedsUpdate?: Uint8Array;
  /** Per-dihedron angle in radians, kept alongside the degrees. */
  dihedraAngleRads?: ArrayLike<number>;
  /** Per-atom validity, indexed through {@link EdronInvalidation.atomArrayIndex}. */
  atomArrayValid?: Uint8Array;
  /** Row of each atom key in the chain's atom array, by the key's hash. */
  atomArrayIndex?: Map<string, number>;
}

/**
 * Mark one atom's coordinates stale, which is what changing an angle does to the atom it places.
 *
 * @param cic - The chain, which may not have built its arrays yet. @param ak - The atom to invalidate.
 */
function invalidateAtom(cic: EdronInvalidation | undefined, ak: AtomKey): void {
  const ndx = cic?.atomArrayIndex?.get(ak.hashKey);
  if (ndx !== undefined && cic?.atomArrayValid !== undefined) cic.atomArrayValid[ndx] = 0;
}

/**
 * Python's `%` on two floats, which keeps the sign of the divisor where JavaScript's keeps the dividend.
 *
 * {@link Dihedron.angleDif} depends on this: `(180 - a2 + a1) % 360` has to land in [0, 360) for a negative
 * numerator too, or angles on opposite sides of the wrap come out with the wrong sign.
 *
 * @param a - The dividend. @param b - The divisor.
 * @returns `a mod b`, with the sign of `b`.
 */
function pyMod(a: number, b: number): number {
  return a >= 0 ? a % b : ((a % b) + b) % b;
}

/**
 * The bitmasks `Bio.PDB.PICIO.write_PIC` uses to say which classes of value to default.
 *
 * The names and the bit positions are Biopython's `IC_Residue.pic_flags`, reproduced here because
 * {@link Dihedron.bits} returns them and a caller has to be able to test the result.
 */
export const PIC_FLAGS = {
  /** The psi backbone angle. */ psi: 1 << 0,
  /** The omega backbone angle. */ omg: 1 << 1,
  /** The phi backbone angle. */ phi: 1 << 2,
  /** The tau angle (N-CA-C). */ tau: 1 << 3,
  /** The first side-chain angle; the rest follow it, so `chi1 << 1` is `chi2`. */ chi1: 1 << 4,
  /** The second. */ chi2: 1 << 5,
  /** The third. */ chi3: 1 << 6,
  /** The fourth. */ chi4: 1 << 7,
  /** The fifth. */ chi5: 1 << 8,
  /** A proline's preceding omega. */ pomg: 1 << 9,
  /** Every chi angle. */ chi: (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7) | (1 << 8),
  /** psi, phi, tau and pomg. */ classic_b: (1 << 0) | (1 << 2) | (1 << 3) | (1 << 9),
  /** Those four and every chi. */ classic: (1 << 0) | (1 << 2) | (1 << 3) | (1 << 9)
    | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7) | (1 << 8),
  /** Every hedron. */ hedra: 1 << 10,
  /** Every primary dihedron. */ primary: 1 << 11,
  /** Every secondary dihedron. */ secondary: 1 << 12,
  /** Hedra and both kinds of dihedra. */ all: (1 << 10) | (1 << 11) | (1 << 12),
  /** The coordinates of the initial N-CA-C. */ initAtoms: 1 << 13,
  /** The B-factors. */ bFactors: 1 << 14,
} as const;

/**
 * Python's `str()` of a tuple of {@link AtomKey}s, which is what Biopython's two `set_length` complaints quote.
 *
 * `str` of a tuple calls `repr` on its elements, and an AtomKey's repr is its id, so there are no quotes — and a
 * one-element tuple keeps Python's trailing comma.
 *
 * @param keys - The keys to print.
 * @returns `(a, b)`, or `(a,)` for one.
 */
function pyTupleStr(keys: readonly AtomKey[]): string {
  const inner = keys.map((k) => k.id).join(", ");
  return keys.length === 1 ? `(${inner},)` : `(${inner})`;
}

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

  /**
   * A string that stands in for Python's `hash()` of this edron, which is its atomkeys tuple's.
   *
   * CPython's hash of a tuple of strings is salted per process, so the *number* cannot be reproduced and is
   * not worth trying to; what a port has to match is which edra collapse together in a set or a dict. Two
   * edra share this key exactly when Python would hash them alike, and {@link Edron.equals} agrees with it,
   * which is the invariant a hash has to keep.
   *
   * @returns The key, for use with a `Map` or a `Set`.
   */
  get hashKey(): string { return this.atomkeys.map((k) => k.hashKey).join("\u0000"); }

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
   * The OpenSCAD markers {@link IC_Residue.setFlexible} and {@link IC_Residue.setHbond} set, which
   * `Bio.PDB.SCADIO` reads when it emits a printable model: which bonds are flexible joints, which are
   * hydrogen bonds (magnets, in the model), and which hedron has to be printed thin to clear a joint.
   */
  flexFemale1 = false;
  /** @see {@link Hedron.flexFemale1} */ flexFemale2 = false;
  /** @see {@link Hedron.flexFemale1} */ flexMale1 = false;
  /** @see {@link Hedron.flexFemale1} */ flexMale2 = false;
  /** @see {@link Hedron.flexFemale1} */ skinny1 = false;
  /** @see {@link Hedron.flexFemale1} */ hbond1 = false;
  /** @see {@link Hedron.flexFemale1} */ hbond2 = false;

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

  /**
   * Set the angle in degrees, invalidating what depends on it.
   *
   * The third atom's position is computed from this angle, so it stops being valid; the chain's `hAtoms` for
   * this hedron have to be recomputed too.
   *
   * @param angleDeg - The new angle.
   */
  set angle(angleDeg: number) {
    const cic = this.cic as (EdronArrays & EdronInvalidation) | undefined;
    if (cic?.hedraAngle !== undefined) (cic.hedraAngle as unknown as number[])[this.ndx] = angleDeg;
    if (cic?.hAtomsNeedsUpdate !== undefined) cic.hAtomsNeedsUpdate[this.ndx] = 1;
    invalidateAtom(cic, this.atomkeys[2]!);
    this.needsUpdate = true;
  }
  /** The length between the first and second atoms; 0 while no chain holds it. */
  get len12(): number { return this.cic?.hedraL12 === undefined ? 0 : this.cic.hedraL12[this.ndx]!; }
  /** The length between the second and third atoms; 0 while no chain holds it. */
  get len23(): number { return this.cic?.hedraL23 === undefined ? 0 : this.cic.hedraL23[this.ndx]!; }

  /**
   * The bond length between a pair of this hedron's atoms, whichever way round the pair is given.
   *
   * @param akTpl - Two of this hedron's keys. The order does not matter, but which *pair* does: the first two
   *   atoms give `len12` and the last two `len23`.
   * @returns The length, or null when the pair is not a bonded pair of this hedron — including a tuple of fewer
   *   than two keys, and the first-to-third pair, which is not a bond at all.
   */
  getLength(akTpl: readonly AtomKey[]): number | null {
    if (akTpl.length < 2) return null;
    const inFirst = akTpl.every((ak) => this.atomkeys.slice(0, 2).some((k) => k.equals(ak)));
    if (inFirst) return this.len12;
    const inLast = akTpl.every((ak) => this.atomkeys.slice(1).some((k) => k.equals(ak)));
    if (inLast) return this.len23;
    return null;
  }

  /**
   * Set the bond length between a pair of this hedron's atoms, and mark the hedron for recomputation.
   *
   * @param akTpl - Two of this hedron's keys, as {@link Hedron.getLength} takes them.
   * @param newLength - The length to store on the chain.
   * @throws TypeError for fewer than two keys, or for a pair this hedron does not bond — Biopython's two
   *   messages, which differ: the first quotes the tuple, the second quotes the tuple *and* the hedron.
   */
  setLength(akTpl: readonly AtomKey[], newLength: number): void {
    if (akTpl.length < 2) throw new TypeError(`Require exactly 2 AtomKeys: ${pyTupleStr(akTpl)}`);
    const write = (a: ArrayLike<number> | undefined): void => {
      if (a !== undefined) (a as unknown as number[])[this.ndx] = newLength;
      this.needsUpdate = true;
    };
    if (akTpl.every((ak) => this.atomkeys.slice(0, 2).some((k) => k.equals(ak)))) write(this.cic?.hedraL12);
    else if (akTpl.every((ak) => this.atomkeys.slice(1).some((k) => k.equals(ak)))) write(this.cic?.hedraL23);
    else throw new TypeError(`${pyTupleStr(akTpl)} not found in ${this.repr()}`);
  }

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
  /** The key of the first hedron, set when the chain builds its index maps. */
  h1key?: string;
  /** The key of the second hedron, likewise. */
  h2key?: string;
  /** The first hedron itself. */
  hedron1?: Hedron;
  /** The second hedron. */
  hedron2?: Hedron;
  /**
   * The transform into the coordinate space of this dihedron's first three atoms, once something has set it.
   *
   * Biopython binds this to a row of {@link IC_Chain.dCoordSpace} when the chain's arrays are built, so writing
   * that array updates this too; the serial assembly then *rebinds* it to a pair of its own, leaving the chain's
   * array stale. The port assigns in both places to the same effect.
   */
  cst?: Matrix;
  /** The transform out of that space, the companion of {@link Dihedron.cst}. */
  rcst?: Matrix;
  /** This dihedron's four atoms in its own coordinate space, as the assembly last computed them. */
  initialCoords?: number[][];
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
   * Set the dihedral angle in degrees, wrapped into ±180 and invalidating what depends on it.
   *
   * The wrap is a single ±360 step rather than a modulus, which is Biopython's: a value more than 540° out
   * stays out, and that is the behaviour a port has to keep.
   *
   * @param dangleDegIn - The new angle.
   */
  set angle(dangleDegIn: number) {
    const dangleDeg = dangleDegIn > 180 ? dangleDegIn - 360 : dangleDegIn < -180 ? dangleDegIn + 360 : dangleDegIn;
    this.dihedralValue = dangleDeg;
    this.needsUpdate = true;
    const cic = this.cic as (EdronArrays & EdronInvalidation) | undefined;
    if (cic?.dihedraAngle !== undefined) (cic.dihedraAngle as unknown as number[])[this.ndx] = dangleDeg;
    if (cic?.dihedraAngleRads !== undefined) {
      (cic.dihedraAngleRads as unknown as number[])[this.ndx] = (dangleDeg * Math.PI) / 180;
    }
    if (cic?.dAtomsNeedsUpdate !== undefined) cic.dAtomsNeedsUpdate[this.ndx] = 1;
    invalidateAtom(cic, this.atomkeys[3]!);
  }

  /**
   * The signed difference between two angles that each wrap at ±180°.
   *
   * @param a1 - The first angle, in degrees. @param a2 - The second.
   * @returns `a2 - a1` taken the short way round, so that 170° and −170° are 20° apart rather than 340°.
   */
  static angleDif(a1: number, a2: number): number {
    // Biopython's one-liner, kept as it is: the modulus has to act on the sum, not on the difference.
    return 180.0 - pyMod(180.0 - a2 + a1, 360.0);
  }

  /**
   * The circular mean of a list of angles.
   *
   * A plain average of 170° and −170° is 0°, which is the opposite side of the circle from the answer. This
   * averages the unit vectors instead, as Biopython does.
   *
   * @param alst - The angles. @param options - `inRads` if they are radians, `outRads` for a radian answer.
   * @returns The mean angle, in degrees unless `outRads`.
   */
  static angleAvg(alst: readonly number[], options: { inRads?: boolean; outRads?: boolean } = {}): number {
    const w = options.inRads === true ? alst : alst.map((a) => (a * Math.PI) / 180);
    let sin = 0;
    let cos = 0;
    for (const a of w) { sin += Math.sin(a); cos += Math.cos(a); }
    const ravg = Math.atan2(sin, cos);
    return options.outRads === true ? ravg : (ravg * 180) / Math.PI;
  }

  /**
   * The population standard deviation of a list of angles about a given mean, measured the short way round.
   *
   * @param alst - The angles in degrees. @param avg - The mean to measure against, as from {@link
   *   Dihedron.angleAvg}.
   * @returns The deviation in degrees. Biopython divides by the count rather than count − 1 — a population
   *   rather than a sample standard deviation — to avoid dividing by zero for a single angle.
   */
  static anglePopSd(alst: readonly number[], avg: number): number {
    let sum = 0;
    for (const a of alst) { const d = Dihedron.angleDif(a, avg); sum += d * d; }
    return Math.sqrt(sum / alst.length);
  }

  /**
   * The difference between this dihedral angle and another's, the short way round.
   *
   * @param other - The dihedron to compare with.
   * @returns The signed difference in degrees.
   */
  difference(other: Dihedron): number {
    return Dihedron.angleDif(this.angle, other.angle);
  }

  /**
   * Which of {@link PIC_FLAGS} this dihedron is, as a bitmask.
   *
   * @returns The flag for `psi`, `omg`, `phi`, a proline's `omg | pomg`, or the right `chiN` — and 0 for a
   *   dihedron that is none of them, which is most of the hydrogens.
   */
  bits(): number {
    if (this.eClass === "NCACN") return PIC_FLAGS.psi;
    // A proline's preceding omega counts as both: `omg` because it is one, and `pomg` so that the PIC writer
    // can default prolines separately.
    if (this.pclass === "XCAXCPNPCA") return PIC_FLAGS.omg | PIC_FLAGS.pomg;
    if (this.eClass === "CACNCA") return PIC_FLAGS.omg;
    if (this.eClass === "CNCAC") return PIC_FLAGS.phi;
    // Whatever is left is a chi angle, so the residue's side-chain table decides which. A residue with no
    // table at all -- glycine and alanine have none -- makes Biopython iterate `None` and raise, and that is
    // reproduced rather than smoothed over: a backbone dihedron of an alanine reaches here.
    const ric = this.ric as { lc?: string } | undefined;
    const scList = ric?.lc === undefined ? undefined : icDataSidechains[ric.lc];
    if (scList === undefined) throw new TypeError("'NoneType' object is not iterable");
    const names = this.atomkeys.map((ak) => ak.akl[FIELDS.atm] as string);
    for (const e of scList) {
      // Only a chi entry carries its label in the fifth slot; the rest are hedra and hydrogen dihedra.
      if (e.length !== 5) continue;
      if (e.slice(0, 4).every((n, i) => n === names[i])) {
        return PIC_FLAGS.chi1 << (Number(e[4]!.slice(-1)) - 1);
      }
    }
    return 0;
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
