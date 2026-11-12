/** `Atom` and `DisorderedAtom` (Biopython's `Bio.PDB.Atom`). Coordinates are single-precision, like NumPy's `"f"` arrays. */

import { pyRepr, warn } from "@biolibs/core";
import { IUPACData } from "@biolibs/seq";
import { DisorderedEntityWrapper, type Child, type Entity } from "./entity.js";
import { PDB_CONSTRUCTION_WARNING } from "./exceptions.js";
import { compareIds, idsEqual, type EntityId } from "./util.js";

/** Python `str.capitalize()`: first character upper case, the rest lower case. */
const capitalize = (s: string): string => (s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1).toLowerCase());

/** `str.isalpha()` for one character (letters of any script). */
const isAlpha = (c: string): boolean => /^\p{L}$/u.test(c);
/** `str.isdigit()` for a whole string (non-empty, all digits). */
const isDigit = (s: string): boolean => s.length > 0 && /^\p{Nd}+$/u.test(s);

/** Order of the backbone atoms when sorting atoms of a residue. */
const SORTING_KEYS: Record<string, number> = { N: 0, CA: 1, C: 2, O: 3 };

/** A single atom of a structure. */
export class Atom implements Child {
  /** Level code, `"A"`. */
  readonly level = "A";
  /** The residue (or null). */
  parent: Entity<Child> | null = null;
  /** The atom name without spaces, e.g. `"CA"`. */
  name: string;
  /** The name as written in the file, spaces included, e.g. `" CA "`. */
  fullname: string;
  /** Coordinates (single precision). */
  coord: Float32Array;
  /** B-factor. */
  bfactor: number | null;
  /** Occupancy. */
  occupancy: number | null;
  /** Alternative location indicator, `" "` when none. */
  altloc: string;
  /** `(structure, model, chain, residue, (name, altloc))`, or null until the atom has a parent. */
  fullId: EntityId[] | null = null;
  /** The id: the atom name. */
  id: string;
  /** 1 when the atom has alternative locations (set by `flagDisorder`). */
  disorderedFlag = 0;
  /** Anisotropic temperature factors, if present. */
  anisouArray: Float32Array | null = null;
  /** Standard deviations of the anisotropic factors. */
  siguijArray: Float32Array | null = null;
  /** Standard deviations of the position. */
  sigatmArray: Float32Array | null = null;
  /** Serial number from the file. */
  serialNumber: number | string | null;
  /** Free-form extra data. */
  xtra: Record<string, unknown> = {};
  /** Upper-case element symbol (`"X"` when unknown). */
  element: string;
  /** Atomic mass (NaN when unknown). */
  mass: number;
  /** Partial charge (PQR files). */
  pqrCharge: number | null;
  /** Radius (PQR files). */
  radius: number | null;

  /**
   * @param name - Atom name without spaces.
   * @param coord - The three coordinates.
   * @param bfactor - B-factor.
   * @param occupancy - Occupancy.
   * @param altloc - Alternative location, `" "` for none.
   * @param fullname - Name with its spaces.
   * @param serialNumber - Serial number.
   * @param element - Element symbol (upper case); guessed from the name when missing or unknown (with a warning).
   * @param pqrCharge - Charge (PQR).
   * @param radius - Radius (PQR).
   * @throws Error (AssertionError) when `element` is not upper case.
   */
  constructor(name: string, coord: ArrayLike<number>, bfactor: number | null, occupancy: number | null, altloc: string, fullname: string,
    serialNumber: number | string | null, element: string | null = null, pqrCharge: number | null = null, radius: number | null = null) {
    this.name = name;
    this.fullname = fullname;
    this.coord = Float32Array.from(coord);
    this.bfactor = bfactor;
    this.occupancy = occupancy;
    this.altloc = altloc;
    this.id = name;
    this.serialNumber = serialNumber;
    if (element && element !== element.toUpperCase()) throw Object.assign(new Error(element), { name: "AssertionError" });
    this.element = this.assignElement(element);
    this.mass = this.assignAtomMass();
    this.pqrCharge = pqrCharge;
    this.radius = radius;
  }

  /** The element: the given one if known, else guessed from the atom name (warning), else `"X"`. */
  private assignElement(element: string | null): string {
    if (!element || !Object.hasOwn(IUPACData.atomWeights, capitalize(element))) {
      let putative: string;
      if (isAlpha(this.fullname[0] ?? "") && !isDigit(this.fullname.slice(2))) putative = this.name.trim();
      else putative = /^\p{Nd}$/u.test(this.name[0] ?? "") ? this.name[1]! : this.name[0]!;
      const shown = (s: string | null): string => pyRepr(s);
      let message: string;
      if (Object.hasOwn(IUPACData.atomWeights, capitalize(putative))) {
        message = `Used element ${shown(putative)} for Atom (name=${this.name}) with given element ${shown(element)}`;
        element = putative;
      } else {
        message = `Could not assign element ${shown(putative)} for Atom (name=${this.name}) with given element ${shown(element)}`;
        element = "X";
      }
      warn(message, PDB_CONSTRUCTION_WARNING);
    }
    return element;
  }

  /** The atomic mass of the element, or NaN. */
  private assignAtomMass(): number {
    const key = capitalize(this.element);
    return Object.hasOwn(IUPACData.atomWeights, key) ? IUPACData.atomWeights[key]! : NaN;
  }

  /** Python `repr`. */
  repr(): string {
    return `<Atom ${this.getId()}>`;
  }

  /**
   * The distance between two atoms (`atom1 - atom2`), computed in single precision as NumPy does.
   */
  minus(other: Atom): number {
    const d = this.coord.map((v, k) => Math.fround(v - other.coord[k]!));
    return Math.fround(Math.sqrt(Math.fround(Math.fround(Math.fround(d[0]! * d[0]!) + Math.fround(d[1]! * d[1]!)) + Math.fround(d[2]! * d[2]!))));
  }

  /** Equality (`==`): same full id below the structure level. */
  equals(other: Atom): boolean {
    if (!(other instanceof Atom)) return false;
    return idsEqual(this.fullId!.slice(1), other.fullId!.slice(1));
  }

  /** Ordering (`<` etc.): by parent, then backbone order (N, CA, C, O), then name, then altloc. Negative, zero or positive. */
  compare(other: Atom, op = "<"): number {
    if (!(other instanceof Atom)) throw new TypeError(`'${op}' not supported between instances of 'Atom' and '${(other as object)?.constructor?.name ?? "NoneType"}'`);
    if (this.parent !== other.parent && !(this.parent !== null && other.parent !== null && this.parent.equals(other.parent))) {
      return this.parent!.compare(other.parent!);
    }
    const s = SORTING_KEYS[this.name] ?? 4;
    const o = SORTING_KEYS[other.name] ?? 4;
    if (s !== o) return s < o ? -1 : 1;
    if (this.name !== other.name) return compareIds(this.name, other.name);
    return compareIds(this.altloc, other.altloc);
  }

  /** Whether all of name, B-factor, occupancy, altloc, fullname (and, optionally, coordinates) agree. */
  strictlyEquals(other: Atom, compareCoordinates = false): boolean {
    if (!(other instanceof Atom)) return false;
    // np.isclose raises on None (it cannot subtract); NaN is never close, equal infinities are.
    const close = (a: number | null, b: number | null): boolean => {
      if (a === null || b === null) throw new TypeError(`unsupported operand type(s) for -: '${a === null ? "NoneType" : "float"}' and '${b === null ? "NoneType" : "float"}'`);
      return a === b || Math.abs(a - b) <= 1e-8 + 1e-5 * Math.abs(b);
    };
    return this.name === other.name && close(this.bfactor, other.bfactor) && close(this.occupancy, other.occupancy) && this.altloc === other.altloc
      && this.fullname === other.fullname && (compareCoordinates ? this.coord.every((v, k) => Math.abs(v - other.coord[k]!) <= 1e-8 + 1e-5 * Math.abs(other.coord[k]!)) : true);
  }

  /** Set the serial number. */
  setSerialNumber(n: number | string | null): void { this.serialNumber = n; }
  /** Set the B-factor. */
  setBfactor(bfactor: number | null): void { this.bfactor = bfactor; }
  /** Set the coordinates. */
  setCoord(coord: ArrayLike<number>): void { this.coord = Float32Array.from(coord); }
  /** Set the alternative location. */
  setAltloc(altloc: string): void { this.altloc = altloc; }
  /** Set the occupancy. */
  setOccupancy(occupancy: number | null): void { this.occupancy = occupancy; }
  /** Set the position standard deviations. */
  setSigatm(a: Float32Array | null): void { this.sigatmArray = a; }
  /** Set the anisotropic standard deviations. */
  setSiguij(a: Float32Array | null): void { this.siguijArray = a; }
  /** Set the anisotropic factors. */
  setAnisou(a: Float32Array | null): void { this.anisouArray = a; }
  /** Set the charge. */
  setCharge(c: number | null): void { this.pqrCharge = c; }
  /** Set the radius. */
  setRadius(r: number | null): void { this.radius = r; }
  /** Mark the atom as having alternative locations. */
  flagDisorder(): void { this.disorderedFlag = 1; }
  /** 1 if the atom has alternative locations (0 or 1; a `DisorderedAtom` wrapper reports 2). */
  isDisordered(): number { return this.disorderedFlag; }

  /** Set the parent residue and refresh the full id. */
  setParent(parent: Entity<Child> | null): void {
    this.parent = parent;
    this.fullId = this.getFullId();
  }
  /** Forget the parent. */
  detachParent(): void { this.parent = null; }
  /** Position standard deviations. */
  getSigatm(): Float32Array | null { return this.sigatmArray; }
  /** Anisotropic standard deviations. */
  getSiguij(): Float32Array | null { return this.siguijArray; }
  /** Anisotropic factors. */
  getAnisou(): Float32Array | null { return this.anisouArray; }
  /** The parent residue. */
  getParent(): Entity<Child> | null { return this.parent; }
  /** The serial number. */
  getSerialNumber(): number | string | null { return this.serialNumber; }
  /** The name. */
  getName(): string { return this.name; }
  /** The id (the name). */
  getId(): string { return this.id; }

  /** The full id: the parent's full id plus `[name, altloc]`; without a parent `[null, null, null, null, name, altloc]`. */
  getFullId(): EntityId[] {
    if (this.parent === null) return [null, null, null, null, this.name, this.altloc] as unknown as EntityId[];
    return [...this.parent.getFullId(), [this.name, this.altloc] as unknown as EntityId];
  }
  /** The coordinates. */
  getCoord(): Float32Array { return this.coord; }
  /** The B-factor. */
  getBfactor(): number | null { return this.bfactor; }
  /** The occupancy. */
  getOccupancy(): number | null { return this.occupancy; }
  /** The name with its spaces. */
  getFullname(): string { return this.fullname; }
  /** The alternative location. */
  getAltloc(): string { return this.altloc; }
  /** The level code `"A"`. */
  getLevel(): string { return this.level; }
  /** The charge. */
  getCharge(): number | null { return this.pqrCharge; }
  /** The radius. */
  getRadius(): number | null { return this.radius; }

  /** Rotate and translate: `coord = coord @ rot + tran` (single precision). */
  transform(rot: number[][], tran: ArrayLike<number>): void {
    const c = this.coord;
    this.coord = Float32Array.from([0, 1, 2], (j) => c[0]! * rot[0]![j]! + c[1]! * rot[1]![j]! + c[2]! * rot[2]![j]! + tran[j]!);
  }

  /** A copy without a parent, with its own coordinates and extra data. */
  copy(): Atom {
    const shallow = Object.create(Object.getPrototypeOf(this)) as Atom;
    Object.assign(shallow, this);
    shallow.detachParent();
    shallow.setCoord(this.coord);
    shallow.xtra = { ...this.xtra };
    return shallow;
  }
}

/** Alternative locations of one atom: the `Atom`s share a name and differ in altloc; the one with most occupancy is selected. */
export class DisorderedAtom extends DisorderedEntityWrapper {
  /** The highest occupancy seen so far. */
  lastOccupancy = -Number.MAX_SAFE_INTEGER;
  /** Whether `lastOccupancy` holds a float yet (for Python's error message). */
  private occupancySeen = false;

  /** @param id - The atom name. */
  constructor(id: string) {
    super(id);
  }

  /** Iterate over the alternatives, sorted by altloc. */
  [Symbol.iterator](): Iterator<Atom> {
    return (this.disorderedGetList() as Atom[])[Symbol.iterator]();
  }

  /** Python `repr`. */
  repr(): string {
    return this.childDict.size > 0 ? `<DisorderedAtom ${this.getId()}>` : `<Empty DisorderedAtom ${this.getId()}>`;
  }

  /** The alternatives sorted by the code point of their altloc. */
  override disorderedGetList(): Atom[] {
    return ([...this.childDict.values()] as Atom[]).sort((a, b) => a.altloc.codePointAt(0)! - b.altloc.codePointAt(0)!);
  }

  /**
   * Add an alternative; it is selected if its occupancy is higher than any seen before.
   *
   * @throws TypeError when the occupancy is missing and cannot be compared.
   */
  disorderedAdd(atom: Atom): void {
    atom.flagDisorder();
    const residue = this.getParent();
    atom.setParent(residue);
    const altloc = atom.getAltloc();
    const occupancy = atom.getOccupancy();
    this.childDict.set(`s${altloc}`, atom);
    // `lastOccupancy` starts as the integer -sys.maxsize and becomes a float once an occupancy was stored.
    if (occupancy === null) throw new TypeError(`'>' not supported between instances of 'NoneType' and '${this.occupancySeen ? "float" : "int"}'`);
    if (occupancy > this.lastOccupancy) {
      this.lastOccupancy = occupancy;
      this.occupancySeen = true;
      this.disorderedSelect(altloc);
    }
  }

  /** Remove the alternative with this altloc, selecting the one with the highest occupancy next. */
  disorderedRemove(altloc: string): void {
    const atom = this.childDict.get(`s${altloc}`) as Atom;
    const isSelected = this.selectedChild === atom;
    this.childDict.delete(`s${altloc}`);
    atom.detachParent();
    if (isSelected && this.childDict.size > 0) {
      const sorted = ([...this.childDict.values()] as Atom[]).sort((a, b) => (a.occupancy ?? 0) - (b.occupancy ?? 0));
      this.disorderedSelect(sorted[sorted.length - 1]!.altloc);
    } else if (this.childDict.size === 0) {
      this.selectedChild = null;
      this.lastOccupancy = -Number.MAX_SAFE_INTEGER;
      this.occupancySeen = false;
    }
  }

  /** Apply `coord = coord @ rot + tran` to every alternative. */
  transform(rot: number[][], tran: ArrayLike<number>): void {
    for (const child of this) child.transform(rot, tran);
  }
}
