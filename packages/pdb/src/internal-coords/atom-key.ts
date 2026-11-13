/**
 * `AtomKey`: how internal coordinates name an atom (Biopython's `Bio.PDB.internal_coords.AtomKey`).
 *
 * A key carries the residue position, insertion code, residue name, atom name, altloc and occupancy together, so
 * that one string with no whitespace identifies an atom across a chain — disorder included. Keys are also the sort
 * order of a residue's atoms, and that order is the interesting part: backbone before side chain, side chain
 * outwards from the alpha carbon, hydrogens last and numbered, with higher occupancy first. {@link AtomKey.compare}
 * is a direct port of Biopython's `_cmp`, whose answer is a pair of ranks rather than a sign.
 */

import { pyFloatRepr, pyInt } from "@biolibs/core";
import { icSettings } from "./settings.js";
import { residueAtomBondState } from "./ic-data.js";

/** The six fields of a key, in order; `AtomKey.fields` maps each name to its index. */
export const FIELD_NAMES = ["respos", "icode", "resname", "atm", "altloc", "occ"] as const;

/** Index of each field in a key's `akl` tuple, as Biopython's `AtomKey.fields` namedtuple gives them. */
export const FIELDS = { respos: 0, icode: 1, resname: 2, atm: 3, altloc: 4, occ: 5 } as const;

/** The string form of a key: `52_G_CA`, `52B_G_CA`, `52_G_CA_0.33`, `52_G_CA_B_0.33`. */
const ATOM_RE = /^(?<respos>-?\d+)(?<icode>[A-Za-z])?_(?<resname>[a-zA-Z]+)_(?<atm>[A-Za-z0-9]+)(?:_(?<altloc>\w))?(?:_(?<occ>-?\d\.\d+?))?$/;

/** Trailing digits of an atom name, which order the hydrogens of one group (`HG12` after `HG11`). */
const END_NUM_RE = /\D+(\d+)$/;

/** The backbone atoms, in the order they are bonded. */
const BACKBONE_SORT: Readonly<Record<string, number>> = { N: 0, CA: 1, C: 2, O: 3 };

/** Side-chain atoms by distance from the alpha carbon, with `OXT` and the amide hydrogen last. */
const SIDECHAIN_SORT: Readonly<Record<string, number>> = {
  CB: 1, CG: 2, CG1: 2, OG: 2, OG1: 2, SG: 2, CG2: 3, CD: 4, CD1: 4, SD: 4, OD1: 4, ND1: 4,
  CD2: 5, ND2: 5, OD2: 5, CE: 6, NE: 6, CE1: 6, OE1: 6, NE1: 6, CE2: 7, OE2: 7, NE2: 7,
  CE3: 8, CZ: 9, CZ2: 9, NZ: 9, NH1: 10, OH: 10, CZ3: 10, CH2: 11, NH2: 11, OXT: 12, H: 13,
};

/** The Greek letters naming a hydrogen's position, in alphabet order: alpha, beta, gamma, ... */
const GREEK_SORT: Readonly<Record<string, number>> = { A: 0, B: 1, G: 2, D: 3, E: 4, Z: 5, H: 6 };

/** Anything shaped like an `IC_Residue`: it contributes the position, insertion code and residue name. */
export interface HasRbase {
  /** Residue position, insertion code and name, as `IC_Residue.rbase` holds them. */
  rbase: readonly (string | number | null)[];
}

/** Anything shaped like an `Atom`: it contributes the atom name, and the altloc and occupancy of a disordered one. */
export interface HasAtomName {
  /** The atom name. */
  name: string;
  /** Its alternative-location label; a space means none. */
  altloc: string;
  /** Its occupancy; 1 means the only location. */
  occupancy: number | null;
}

/** What a key can be built from: its six fields in order, or by name. */
export type AtomKeyFields = Partial<Record<(typeof FIELD_NAMES)[number], string | number | null>>;

/** One field of a key: a string, or null where the PDB file had nothing. */
export type KeyField = string | null;

/**
 * Python's `ord()`, which takes one character and nothing else.
 *
 * The ordering reaches it with a residue name, which is one letter for the twenty standard amino acids and three
 * for anything else — so comparing a standard residue with a non-standard one raises here, as it does in Biopython.
 *
 * @param s - The string to take the code point of.
 * @returns Its code point.
 * @throws TypeError for anything but a single character.
 */
function ord1(s: string): number {
  const chars = [...s];
  if (chars.length !== 1) throw new TypeError(`ord() expected a character, but string of length ${chars.length} found`);
  return chars[0]!.codePointAt(0)!;
}

/** One field of a key by index; absent reads as `null`, as Python's `None` does. */
const field = (akl: readonly KeyField[], index: number): KeyField => akl[index] ?? null;

/** Python's bare `Exception`, which is what `AtomKey` raises for input it does not recognise. */
class PythonException extends Error { override name = "Exception"; }

/**
 * An atom's identity within a chain: position, insertion code, residue, atom, altloc and occupancy.
 *
 * @example
 * ```ts
 * const ca = new AtomKey("52_G_CA");
 * ca.atm();            // "CA"
 * ca.isBackbone();     // true
 * new AtomKey([52, null, "G", "CB"]).id;   // "52_G_CB"
 * ```
 */
export class AtomKey {
  /** All six fields, `null` where absent. */
  readonly akl: readonly KeyField[];
  /** The fields joined with `_`, leaving the absent ones out: the key's string form. */
  readonly id: string;
  /** Set when a key was built from a string for an atom the structure does not have. */
  missing = false;

  /** Convert deuterium to hydrogen on input. Biopython keeps this as a class attribute. */
  static d2h = false;

  /** Index of each field, as {@link FIELDS}. */
  static readonly fields = FIELDS;
  /** The field names, as {@link FIELD_NAMES}. */
  static readonly fieldNames = FIELD_NAMES;

  /**
   * @param args - Any mixture of: the whole key as a string (`"52B_G_CA_0.33"`); single field values as strings, in
   *   order; an array of fields; an {@link HasRbase} (an `IC_Residue`) followed by an {@link HasAtomName} (an
   *   `Atom`); or an object with the field names. A string holding `_` is parsed as a whole key
   *   and must come first.
   * @param named - Fields by name, filling whatever the positional arguments left.
   * @throws An error named `Exception`, as Biopython raises a bare one, for input it does not recognise or a whole key that is not the first argument.
   */
  constructor(args: unknown, named: AtomKeyFields = {}) {
    // An array *is* the argument list, as Python's `*args`: a single list of fields is passed nested,
    // `new AtomKey([[52, null, "G", "CA"]])`, and so is a field object.
    const given = Array.isArray(args) ? args : [args];
    let akl: KeyField[] = [];
    for (const arg of given) {
      if (typeof arg === "string") {
        if (arg.includes("_")) {
          const m = ATOM_RE.exec(arg);
          if (m !== null) {
            if (akl.length !== 0) throw new PythonException(`Atom Key init full key not first argument: ${arg}`);
            akl = FIELD_NAMES.map((n) => m.groups![n] ?? null);
          }
        } else akl.push(arg);
      } else if (typeof arg === "number") {
        akl.push(String(arg));
      } else if (Array.isArray(arg)) {
        for (const x of arg) akl.push(x === null || x === undefined ? null : String(x));
      } else if (arg !== null && arg !== undefined && typeof arg === "object" && "rbase" in arg) {
        // An IC_Residue contributes the residue's three fields, and must come first.
        if (akl.length !== 0) throw new PythonException("Atom Key init Residue not first argument");
        akl = (arg as HasRbase).rbase.map((v) => (v === null ? null : String(v)));
      } else if (arg !== null && arg !== undefined && typeof arg === "object" && "name" in arg && "altloc" in arg) {
        // An Atom contributes the atom name and, unless altlocs are being ignored, its altloc and occupancy.
        if (akl.length !== 3) throw new PythonException("Atom Key init Atom before Residue info");
        const atom = arg as HasAtomName;
        akl.push(atom.name);
        if (!icSettings.noAltloc) {
          akl.push(atom.altloc !== " " ? atom.altloc : null);
          const occ = Number(atom.occupancy);
          akl.push(occ !== 1.0 ? pyFloatRepr(occ) : null);
        } else {
          akl.push(null, null);
        }
      } else if (arg !== null && arg !== undefined && typeof arg === "object") {
        const fields = arg as AtomKeyFields;
        for (const n of FIELD_NAMES) {
          const v = fields[n];
          akl.push(v === null || v === undefined ? null : String(v));
        }
      } else {
        // Biopython's `else` clause: `None` among the positional arguments is not one of the accepted forms, even
        // though it is a perfectly good *field* value inside a list.
        throw new PythonException("Atom Key init not recognised");
      }
    }
    // Named fields fill the positions the arguments did not reach, and only those: Biopython appends them.
    for (let i = akl.length; i < FIELD_NAMES.length; i++) {
      const v = named[FIELD_NAMES[i]!];
      if (v !== null && v !== undefined) akl.push(String(v));
    }
    if (AtomKey.d2h) {
      const atm = akl[FIELDS.atm];
      if (atm !== null && atm !== undefined && atm.startsWith("D")) akl[FIELDS.atm] = `H${atm.slice(1)}`;
    }
    // The id joins position and insertion code, then the residue, then whatever of atom/altloc/occupancy is there.
    this.id = [
      akl.slice(0, 2).filter(Boolean).join(""),
      String(akl[2]),
      akl.slice(3).filter(Boolean).join("_"),
    ].join("_");
    while (akl.length < FIELD_NAMES.length) akl.push(null);
    this.akl = akl;
  }

  /** @returns The key's string form, as Python's `repr`. */
  repr(): string { return this.id; }
  /** @returns The key's string form. */
  toString(): string { return this.id; }

  /** @returns The atom name, e.g. `N`, `CA`, `CB`. */
  atm(): string { return this.akl[FIELDS.atm] as string; }

  /** @returns Whether this is a backbone atom: `N`, `C`, `CA`, `O` or `H`. */
  isBackbone(): boolean {
    const atm = this.akl[FIELDS.atm];
    return atm === "N" || atm === "C" || atm === "CA" || atm === "O" || atm === "H";
  }

  /**
   * @param other - Another key.
   * @returns Whether the two agree on position, insertion code, residue and atom, whatever their altloc and
   *   occupancy — which is what makes two keys the same atom in different conformations.
   */
  altlocMatch(other: AtomKey): boolean {
    return this.akl.slice(0, 4).every((v, i) => v === other.akl[i]);
  }

  /**
   * @returns The atom's covalent-radius class (`Csb`, `Ndb`, ...), from the table shared by every residue or from
   *   this residue's own entry; `Hsb` for any other hydrogen, and null for an atom the tables do not know.
   * @throws TypeError when the key has no atom name, which Biopython reaches by subscripting `None`.
   */
  crClass(): string | null {
    const atm = field(this.akl, FIELDS.atm);
    // Named fields are appended in index order, so leaving one out shifts the rest along and the atom field can end
    // up empty; Biopython then subscripts `None`.
    if (atm === null) throw new TypeError("'NoneType' object is not subscriptable");
    const shared = residueAtomBondState["X"]?.[atm];
    if (shared !== undefined) return shared;
    const resname = field(this.akl, FIELDS.resname);
    const own = resname === null ? undefined : (residueAtomBondState as Record<string, Record<string, string> | undefined>)[resname]?.[atm];
    if (own !== undefined) return own;
    return atm.startsWith("H") ? "Hsb" : null;
  }

  /** @param other - Another key. @returns Whether every field agrees. */
  equals(other: unknown): boolean {
    return other instanceof AtomKey && this.akl.length === other.akl.length && this.akl.every((v, i) => v === other.akl[i]);
  }

  /**
   * Rank this key against another, as Biopython's `_cmp`: the lower rank sorts first.
   *
   * The pair of ranks is returned rather than a sign because that is what Biopython compares, and the two are not
   * always consistent — the ranks for a pair of unknown atom names come from `int()` of the names, which throws.
   *
   * @param other - The key to rank against.
   * @returns `[thisRank, otherRank]`.
   */
  compare(other: AtomKey): [number, number] {
    for (let i = 0; i < 6; i++) {
      const s = this.akl[i] ?? null;
      const o = other.akl[i] ?? null;
      if (s === o) continue;
      // An absent insertion code or altloc sorts before a named one.
      if (s === null) return [0, 1];
      if (o === null) return [1, 0];
      if (i !== FIELDS.atm) {
        if (i === FIELDS.occ) return [Math.trunc(Number(o) * 100), Math.trunc(Number(s) * 100)];   // higher occupancy first
        if (i === FIELDS.respos) return [Number(s), Number(o)];
        if (i === FIELDS.resname) {
          // A residue name only decides the order when neither key has an altloc; an altloc outranks it.
          const sac = field(this.akl, FIELDS.altloc);
          const oac = field(other.akl, FIELDS.altloc);
          if (sac !== null) {
            if (oac !== null) return [ord1(sac), ord1(oac)];
            return [1, 0];
          }
          if (oac !== null) return [0, 1];
        }
        return [ord1(s), ord1(o)];
      }
      // Atom names: backbone first, in bonding order, then side chain outwards, then hydrogens.
      const sb = BACKBONE_SORT[s];
      const ob = BACKBONE_SORT[o];
      if (sb !== undefined && ob !== undefined) return [sb, ob];
      if (sb !== undefined) return [0, 1];
      if (ob !== undefined) return [1, 0];
      const ss = SIDECHAIN_SORT[s];
      const os = SIDECHAIN_SORT[o];
      if (ss !== undefined && os !== undefined) return [ss, os];
      if (ss !== undefined) return [0, 1];
      if (os !== undefined) return [1, 0];
      // The amide `H` is in the side-chain table; the named hydrogens are ordered here.
      // Python indexes `s[1]` directly, which would raise for a one-character name; such a name is always in one
      // of the tables above, so it never reaches here.
      const [s0, s1] = [s[0]!, s[1] ?? ""];
      const [o0, o1] = [o[0]!, o[1] ?? ""];
      const s1d = /\d/.test(s1);
      const o1d = /\d/.test(o1);
      if (s0 === "H" && o0 === "H") {
        if (s1 === o1 || (s1d && o1d)) {
          const enmS = END_NUM_RE.exec(s);
          const enmO = END_NUM_RE.exec(o);
          if (enmS !== null && enmO !== null) return [Number(enmS[1]), Number(enmO[1])];
          if (enmS === null) return [0, 1];
          return [1, 0];
        }
        if (s1d) return [0, 1];
        if (o1d) return [1, 0];
        return [GREEK_SORT[s1] as number, GREEK_SORT[o1] as number];
      }
      // Nothing above matched: Biopython falls through to `int()` of the two names, which raises for a name that
      // is not a number. Its own comment there reads "raise exception?".
      return [pyInt(s), pyInt(o)];
    }
    return [1, 1];
  }

  /** @param other - Another key. @returns Whether this sorts before it. */
  lt(other: AtomKey): boolean { const [a, b] = this.compare(other); return a < b; }
  /** @param other - Another key. @returns Whether this sorts before it or equal. */
  le(other: AtomKey): boolean { const [a, b] = this.compare(other); return a <= b; }
  /** @param other - Another key. @returns Whether this sorts after it. */
  gt(other: AtomKey): boolean { const [a, b] = this.compare(other); return a > b; }
  /** @param other - Another key. @returns Whether this sorts after it or equal. */
  ge(other: AtomKey): boolean { const [a, b] = this.compare(other); return a >= b; }
}
