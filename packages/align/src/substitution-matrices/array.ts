/**
 * `SubstitutionArray`: Biopython's `substitution_matrices.Array`, a one- or two-dimensional array of numbers that
 * can be indexed by integers or by letters (`m["A", "C"]`, `m["A"]` for a row). Biopython subclasses a numpy
 * array; here the data live in a `Float64Array` and the numpy operator overloads are plain methods.
 */

import { IndexError, TypeErrorPy, UnboundLocalError, ValueError } from "./py-errors.js";
import { percentFormat } from "./percent.js";

/** A letter key, an integer index, or `null` for a whole axis (Python's `:`). */
export type ArrayIndex = string | number | null;
/** The alphabet: a string of single letters, or a list of (possibly longer) symbols. */
export type Alphabet = string | string[];
/** Element type: Biopython's default is float; integer arrays truncate on assignment. */
export type ArrayDtype = "float" | "int";

/** Options of the {@link SubstitutionArray} constructor. */
export interface ArrayOptions {
  /** Letters of the axes; default `A`-`Z`. */
  alphabet?: Alphabet | null;
  /** 1 or 2; inferred from `data` when omitted (else 1). */
  dims?: number | null;
  /** Initial values: a flat list (1-D) or list of rows (2-D). */
  data?: number[] | number[][] | null;
  /** Element type. Default `"float"`. */
  dtype?: ArrayDtype;
}

/** Python's tuple repr of a shape, e.g. `(4, 4)` or `(4,)`. */
const shapeRepr = (s: number[]): string => `(${s.join(", ")}${s.length === 1 ? "," : ""})`;

/** Position of `key` in an alphabet, or -1: a string alphabet is searched as a substring (`str.index`). */
function letterIndex(alphabet: Alphabet, key: string): number {
  return typeof alphabet === "string" ? alphabet.indexOf(key) : alphabet.indexOf(key);
}

/**
 * A 1-D or 2-D array of numbers indexed by integers or letters (Biopython's `substitution_matrices.Array`).
 *
 * @example
 * ```ts
 * const m = new SubstitutionArray({ alphabet: "ACGT", dims: 2 });
 * m.set(["A", "A"], 5);
 * m.get(["A", "A"]);   // 5
 * ```
 */
export class SubstitutionArray {
  /** Letters of the axes. */
  alphabet: Alphabet;
  /** Dimensions: `[n]` or `[n, n]` (or `[1]`/`[n]` row views). */
  readonly shape: number[];
  /** Element type. */
  readonly dtype: ArrayDtype;
  /** Free-text header lines (set by {@link readMatrix}). */
  header?: string[];
  /** @internal The values, row-major. */
  data: Float64Array;

  /**
   * @param options - See {@link ArrayOptions}.
   * @throws {@link ValueError} for a bad alphabet, `dims`, or `data` shape.
   */
  constructor(options: ArrayOptions = {}) {
    let { alphabet = null, dims = null } = options;
    const { data = null, dtype = "float" } = options;
    if (alphabet === null) alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    else if (typeof alphabet !== "string" && !Array.isArray(alphabet)) throw new ValueError("alphabet should be a string or a tuple");
    const n = alphabet.length;
    let shape: number[];
    if (data === null) {
      if (dims === null) dims = 1;
      else if (dims !== 1 && dims !== 2) throw new ValueError(`dims should be 1 or 2 (found ${dims})`);
      shape = Array<number>(dims).fill(n);
    } else {
      const dshape = SubstitutionArray.shapeOf(data);
      if (dims === null) {
        shape = dshape;
        dims = shape.length;
        if (dims === 2 && shape[0] !== shape[1]) throw new ValueError("data array is not square");
        if (dims !== 1 && dims !== 2) throw new ValueError(`data array should be 1- or 2- dimensional (found ${dims} dimensions) `);
      } else {
        shape = Array<number>(dims).fill(n);
        if (shape.length !== dshape.length || shape.some((v, i) => v !== dshape[i])) {
          throw new ValueError(`data shape has inconsistent shape (expected (${shapeRepr(shape)}), found (${shapeRepr(dshape)}))`);
        }
      }
    }
    // Biopython's alphabet setter rejects repeated letters, then checks the length against the shape.
    const seen = new Set<string>();
    for (const letter of alphabet) {
      if (seen.has(letter)) throw new ValueError(`alphabet contains '${letter}' more than once`);
      seen.add(letter);
    }
    if (shape.length === 1 && shape[0] !== alphabet.length) throw new ValueError(`alphabet length ${alphabet.length} is inconsistent with array size ${shape[0]}`);
    if (shape.length === 2 && !(shape[0] === alphabet.length && (shape[1] === alphabet.length || shape[1] === 1)) && !(shape[0] === 1 && shape[1] === alphabet.length)) {
      throw new ValueError(`alphabet length ${alphabet.length} is inconsistent with array size (${shape[0]}, ${shape[1]})`);
    }
    this.alphabet = alphabet;
    this.shape = shape;
    this.dtype = dtype;
    this.data = new Float64Array(shape.reduce((a, b) => a * b, 1));
    if (data !== null) (data as number[]).flat().forEach((v, i) => (this.data[i] = this.cast(v)));
  }

  /** Shape of nested list data (rows must be equally long). */
  private static shapeOf(data: number[] | number[][]): number[] {
    if (data.length > 0 && Array.isArray(data[0])) return [data.length, (data[0] as number[]).length];
    return [data.length];
  }

  /** Apply the dtype's cast: integer arrays truncate toward zero. */
  private cast(v: number): number {
    // `+ 0` turns -0 (from truncating -0.5) into 0, as an integer array would hold.
    return this.dtype === "int" ? Math.trunc(v) + 0 : v;
  }

  /**
   * Build an array from `(key, value)` pairs, the equivalent of passing a dict to `Array(data=...)`: string keys make
   * a 1-D array, 2-tuples a 2-D array; the alphabet is the sorted set of letters. Missing entries are zero.
   *
   * @throws {@link ValueError} for inconsistent key kinds, 1-tuples or longer tuples, or no entries.
   * @throws {@link UnboundLocalError} for a 1-D dict: Biopython reads an unassigned variable there and always fails.
   */
  static fromEntries(entries: [string | string[], number][], dtype: ArrayDtype = "float"): SubstitutionArray {
    let dims: number | null = null;
    const letters: string[] = [];
    let single = true;
    for (const [key] of entries) {
      if (typeof key === "string") {
        if (dims === null) dims = 1;
        else if (dims !== 1) throw new ValueError("inconsistent dimensions in data");
        letters.push(key);
      } else {
        if (dims === null) dims = key.length;
        else if (dims !== key.length) throw new ValueError("inconsistent dimensions in data");
        if (dims === 1) throw new ValueError("expected string");
        if (dims === 2) {
          for (const l of key) {
            if (l.length > 1) single = false;
            letters.push(l);
          }
        } else throw new ValueError(`data array should be 1- or 2- dimensional (found ${dims} dimensions) in key`);
      }
    }
    const sorted = [...new Set(letters)].sort();
    const alphabet: Alphabet = single ? sorted.join("") : sorted;
    if (dims === null) throw new ValueError("data is an empty dictionary");
    if (dims === 1) throw new UnboundLocalError("cannot access local variable 'letter' where it is not associated with a value");
    const lookup = new Map(entries.map(([k, v]) => [(k as string[]).join("\0"), v]));
    const out = new SubstitutionArray({ alphabet, dims: 2, dtype });
    const n = sorted.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.data[i * n + j] = out.cast(lookup.get(`${sorted[i]}\0${sorted[j]}`) ?? 0);
    return out;
  }

  /** Number of dimensions. */
  get ndim(): number {
    return this.shape.length;
  }

  /** Resolve one index to a position on an axis (letters through the alphabet, negatives from the end). */
  private position(index: ArrayIndex, axis: number): number {
    let i: number;
    if (typeof index === "string") {
      i = letterIndex(this.alphabet, index);
      if (i < 0) throw new IndexError(`'${index}'`);
    } else i = index as number;
    const size = this.shape[axis]!;
    const j = i < 0 ? i + size : i;
    if (j < 0 || j >= size) throw new IndexError(`index ${i} is out of bounds for axis ${axis} with size ${size}`);
    return j;
  }

  /** Indices an index selects on an axis: all of them for `null` (Python's `:`), else exactly one. */
  private select1(index: ArrayIndex | undefined, axis: number): number[] {
    if (index === null) return Array.from({ length: this.shape[axis]! }, (_, i) => i);
    return [this.position(index as string | number, axis)];
  }

  /**
   * Normalise a key to one entry per indexed axis. Letters are converted first (an unknown letter is an
   * `IndexError` before any count check, as in Biopython's `_convert_key`).
   */
  private axes(key: ArrayIndex | [ArrayIndex, ArrayIndex]): ArrayIndex[] {
    const keys = (Array.isArray(key) ? key : [key]).map((k) => {
      if (typeof k !== "string") return k;
      const i = letterIndex(this.alphabet, k);
      if (i < 0) throw new IndexError(`'${k}'`);
      return i;
    });
    if (keys.length > this.ndim) throw new IndexError(`too many indices for array: array is ${this.ndim}-dimensional, but ${keys.length} were indexed`);
    return keys;
  }

  /** Flat offsets selected by a key, the shape of the selection, and whether it is a single cell or the whole array. */
  private offsets(keys: ArrayIndex[]): { at: number[]; shape: number[]; scalar: boolean; whole: boolean } {
    const n = this.shape[this.ndim - 1]!;
    if (this.ndim === 1) {
      const at = this.select1(keys[0], 0);
      return { at, shape: keys[0] === null ? [at.length] : [], scalar: keys[0] !== null, whole: keys[0] === null };
    }
    const rows = this.select1(keys[0], 0);
    const cols = keys.length === 2 ? this.select1(keys[1], 1) : Array.from({ length: n }, (_, i) => i);
    const shape = [...(keys[0] === null ? [rows.length] : []), ...(keys.length === 1 || keys[1] === null ? [cols.length] : [])];
    const whole = keys[0] === null && (keys.length === 1 || keys[1] === null);
    return { at: rows.flatMap((r) => cols.map((c) => r * n + c)), shape, scalar: shape.length === 0, whole };
  }

  /**
   * Value at a key: a letter or integer (a number for 1-D; a row view for a single key on 2-D), a pair for a cell,
   * and `null` for a whole axis (Python's `:`; a column or row selected that way is a copy, not a view).
   *
   * @throws {@link IndexError} for an unknown letter, an index out of range, or too many indices.
   */
  get(key: ArrayIndex | [ArrayIndex, ArrayIndex]): number | SubstitutionArray {
    const keys = this.axes(key);
    const { at, scalar, whole } = this.offsets(keys);
    if (scalar) return this.data[at[0]!]!;
    if (whole) return this;
    if (this.ndim === 2 && keys.length === 1) return this.view([this.shape[1]!], this.data.subarray(at[0]!, at[0]! + this.shape[1]!));
    return this.view([at.length], Float64Array.from(at, (i) => this.data[i]!));
  }

  /** A view of this array's data under another shape. */
  private view(shape: number[], data: Float64Array): SubstitutionArray {
    const v = Object.create(SubstitutionArray.prototype) as SubstitutionArray;
    Object.assign(v, { alphabet: this.alphabet, shape, dtype: this.dtype, data });
    return v;
  }

  /** Python's `array.get(key, default)`: the default when the key raises `IndexError`. */
  getOr<T>(key: ArrayIndex | [ArrayIndex, ArrayIndex], fallback: T): number | SubstitutionArray | T {
    try {
      return this.get(key);
    } catch (e) {
      if (e instanceof IndexError) return fallback;
      throw e;
    }
  }

  /**
   * Assign at a key. A number fills the selection; a list must match its size.
   *
   * @throws {@link IndexError} for an unknown letter or an index out of range.
   * @throws {@link ValueError} when a list does not fit.
   */
  set(key: ArrayIndex | [ArrayIndex, ArrayIndex], value: number | number[]): void {
    const keys = this.axes(key);
    const { at, shape, scalar } = this.offsets(keys);
    // Assigning a list to a single cell makes numpy convert the list itself, which fails.
    if (scalar && typeof value !== "number") {
      if (this.dtype === "int") throw new TypeErrorPy("int() argument must be a string, a bytes-like object or a real number, not 'list'");
      throw new ValueError("setting an array element with a sequence.");
    }
    let values: number[];
    if (typeof value === "number") values = Array<number>(at.length).fill(value);
    else {
      // A list broadcasts along the last axis of the selection (and a single value over everything).
      const last = shape[shape.length - 1]!;
      if (value.length === 1) values = Array<number>(at.length).fill(value[0]!);
      else if (value.length === last) values = at.map((_, i) => value[i % last]!);
      else throw new ValueError(`could not broadcast input array from shape (${value.length},) into shape ${shapeRepr(shape)}`);
    }
    at.forEach((offset, i) => (this.data[offset] = this.cast(values[i]!)));
  }

  /** Whether `key` is one of {@link keys} (Python's `key in array`). */
  has(key: string | [string, string]): boolean {
    return this.keys().some((k) => (Array.isArray(k) ? Array.isArray(key) && k[0] === key[0] && k[1] === key[1] : k === key));
  }

  /** All `(key, value)` pairs, row by row (Python's `items()`; unlike {@link keys} the second letter varies fastest). */
  items(): [string | [string, string], number][] {
    const a = [...this.alphabet];
    if (this.ndim === 1) return a.map((k, i) => [k, this.data[i]!]);
    const n = a.length;
    return a.flatMap((c1, i1) => a.map((c2, i2): [[string, string], number] => [[c1, c2], this.data[i1 * n + i2]!]));
  }

  /** The keys: letters for 1-D, `[letter1, letter2]` pairs for 2-D (note: second letter varies slowest, as in Biopython). */
  keys(): (string | [string, string])[] {
    const a = [...this.alphabet];
    if (this.ndim === 1) return a;
    return a.flatMap((c2) => a.map((c1): [string, string] => [c1, c2]));
  }

  /** The values in {@link keys} order. */
  values(): number[] {
    if (this.ndim === 1) return [...this.data];
    const n = this.shape[0]!;
    const out: number[] = [];
    for (let i2 = 0; i2 < n; i2++) for (let i1 = 0; i1 < n; i1++) out.push(this.data[i1 * n + i2]!);
    return out;
  }

  /**
   * Update from pairs or an object of `key: value` (Python's `update`).
   *
   * @param entries - `[key, value]` pairs; 2-D keys are `[l1, l2]` arrays.
   */
  update(entries: [ArrayIndex | [ArrayIndex, ArrayIndex], number][]): void {
    for (const [k, v] of entries) this.set(k, v);
  }

  /** A new array over `alphabet`, taking the values of the letters this array has (others stay zero). */
  select(alphabet: Alphabet): SubstitutionArray {
    const ii: number[] = [];
    const jj: number[] = [];
    [...alphabet].forEach((key, i) => {
      const j = letterIndex(this.alphabet, key);
      if (j >= 0) { ii.push(i); jj.push(j); }
    });
    // Biopython builds the result with the default dtype (float), whatever this array holds.
    const out = new SubstitutionArray({ alphabet, dims: this.ndim });
    const n = out.shape[0]!;
    const m = this.shape[0]!;
    if (this.ndim === 1) ii.forEach((i, k) => (out.data[i] = this.data[jj[k]!]!));
    else ii.forEach((i, a) => ii.forEach((i2, b) => (out.data[i * n + i2] = this.data[jj[a]! * m + jj[b]!]!)));
    return out;
  }

  /**
   * Text form: a header (as `#  ` lines) then rows. The default number format is `%i` for integer arrays, else `%.1f`.
   *
   * @param fmt - A Python `%` format, e.g. `"%.2f"`.
   */
  format(fmt = ""): string {
    if (fmt === "") fmt = this.dtype === "int" ? "%i" : "%.1f";
    const isInt = this.dtype === "int";
    const alphabet = [...this.alphabet];
    const lines = (this.header ?? []).map((l) => `#  ${l}\n`);
    const num = (v: number): string => percentFormat(fmt, v, isInt);
    const rjust = (s: string, w: number): string => s.padStart(w);
    if (this.ndim === 1) {
      const words = alphabet.map((_, i) => num(this.data[i]!));
      const width = Math.max(0, ...words.map((w) => w.length));
      alphabet.forEach((letter, i) => lines.push(`${letter} ${rjust(words[i]!, width)}\n`));
      return lines.join("");
    }
    const n = alphabet.length;
    if (n === 0) throw new ValueError("max() iterable argument is empty");
    const keyWidth = Math.max(...alphabet.map((c) => c.length));
    const words: string[][] = Array.from({ length: n }, () => Array<string>(n).fill(""));
    let head = " ".repeat(keyWidth);
    for (let j = 0; j < n; j++) {
      let width = 0;
      for (let i = 0; i < n; i++) {
        const w = num(this.data[i * n + j]!);
        width = Math.max(width, w.length);
        words[i]![j] = w;
      }
      head += " " + rjust(alphabet[j]!, width);
      for (let i = 0; i < n; i++) words[i]![j] = " " + rjust(words[i]![j]!, width);
    }
    lines.push(head.replace(/\s+$/, "") + "\n");
    alphabet.forEach((letter, i) => lines.push(rjust(letter, keyWidth) + words[i]!.join("") + "\n"));
    return lines.join("");
  }

  /** Same as {@link format} with the default number format. */
  toString(): string {
    return this.format();
  }
}
