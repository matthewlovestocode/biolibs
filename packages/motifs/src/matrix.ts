/** Position matrices of Biopython's `Bio.motifs.matrix`: counts, frequencies (weights) and log-odds scores per position. */

import { IndexError, KeyError, ValueError, pySum, pyTypeName } from "@biolibs/core";
import { MutableSeq, Seq } from "@biolibs/seq";
import { PythonException, UnboundLocalError, pow2, pyDiv, pySqrt } from "./errors.js";
import { fixedWidth, intWidth } from "./format.js";
import { isSlice, rangeOf, reversed, type PySlice } from "./slices.js";

/** Something that gives a number per position for every letter: a `Map`, a record, or another matrix. */
export type LetterValues = Map<string, ArrayLike<number>> | Record<string, ArrayLike<number>> | GenericPositionMatrix;
/** A key into a matrix: a letter, a letter index, a slice, or a list of letter indices. */
export type Key = string | number | PySlice | number[];

const NUCLEOTIDE_CODES: Readonly<Record<string, string>> = {
  A: "A", C: "C", G: "G", T: "T", U: "U", AC: "M", AG: "R", AT: "W", AU: "W", CG: "S", CT: "Y", CU: "Y", GT: "K", GU: "K", ACG: "V", ACT: "H", ACU: "H", AGT: "D", AGU: "D",
  CGT: "B", CGU: "B", ACGT: "N", ACGU: "N",
};

/** Read the values for one letter from any of the accepted containers. */
function valuesOf(source: LetterValues, letter: string): ArrayLike<number> {
  if (source instanceof GenericPositionMatrix) return source.row(letter);
  if (source instanceof Map) { const v = source.get(letter); if (v === undefined) throw new KeyError(letter); return v; }
  if (!Object.hasOwn(source, letter)) throw new KeyError(letter);
  return source[letter]!;
}

/**
 * The rows of whatever a matrix is being compared with, or `null` when it is not a dict at all.
 *
 * Biopython's matrices are `dict`s, so `==` accepts another matrix, a plain dict, or anything dict-like, and is
 * simply false for everything else.
 */
function rowsOf(other: unknown): Map<string, ArrayLike<number>> | null {
  if (other instanceof GenericPositionMatrix) return other.values;
  if (other instanceof Map) return other as Map<string, ArrayLike<number>>;
  if (other !== null && typeof other === "object" && !Array.isArray(other) && Object.getPrototypeOf(other) === Object.prototype) {
    return new Map(Object.entries(other as Record<string, ArrayLike<number>>));
  }
  return null;
}

/** Python's `type(x).__name__`, with a plain object read as the `dict` it stands for. */
function typeNameOf(x: unknown): string {
  if (x !== null && typeof x === "object" && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype) return "dict";
  return pyTypeName(x);
}

/** The sorted alphabet letters, so letters of a string alphabet can be compared like Python's `sorted(alphabet)`. */
export const sortedLetters = (alphabet: string): string[] => [...alphabet].sort();

/**
 * A matrix with one row of numbers per letter of the alphabet. In Biopython it is a `dict` of letter to list; the rows
 * are kept in alphabet order in `values`.
 */
export class GenericPositionMatrix {
  /** The number of positions. */
  length: number | null = null;
  /** The letters. */
  alphabet: string;
  /** Row of values for each letter. */
  values = new Map<string, number[]>();
  /** Python type of a row (`list`, or `tuple` in a weight matrix), which shows in index error messages. */
  protected rowType: "list" | "tuple" = "list";

  /**
   * @param alphabet - The letters (a string such as `ACGT`).
   * @param values - One sequence of numbers per letter.
   * @throws PythonException (`Exception`) when the rows differ in length; KeyError for a missing letter.
   */
  constructor(alphabet: string, values: LetterValues) {
    for (const letter of alphabet) {
      const row = valuesOf(values, letter);
      if (this.length === null) this.length = row.length;
      else if (this.length !== row.length) throw new PythonException("data has inconsistent lengths");
      this.values.set(letter, Array.from(row, Number));
    }
    this.alphabet = alphabet;
  }

  /** @returns The row of a letter. @throws KeyError if there is none. */
  row(letter: string): number[] {
    const r = this.values.get(letter);
    if (r === undefined) throw new KeyError(letter);
    return r;
  }

  /** @returns The letters in alphabet order. */
  keys(): string[] { return [...this.values.keys()]; }

  /** @returns `[letter, row]` pairs in alphabet order. */
  items(): [string, number[]][] { return [...this.values]; }

  /**
   * Python's `==`. The matrices are `dict`s in Biopython, so equality compares the stored rows and nothing else:
   * the alphabet plays no part (two matrices spelling it in a different order are equal), and a plain dict with the
   * same rows is equal to a matrix.
   *
   * The row container does count, because Python's `[1.0] == (1.0,)` is false. A weight matrix stores tuples where
   * every other matrix stores lists, so a weight matrix is never equal to a counts matrix, a log-odds matrix or a
   * `GenericPositionMatrix`, however close the numbers. A JavaScript array stands for a Python list, so comparing a
   * weight matrix with a plain `Map` or object is false for the same reason.
   *
   * @param other - Anything.
   * @returns Whether Python would call them equal.
   * @example
   * ```ts
   * counts.equals(new Map(counts.items()));   // true
   * counts.normalize().equals(counts);        // false: tuples against lists, and different numbers
   * ```
   */
  equals(other: unknown): boolean {
    if (other === this) return true;                    // Python compares dict values by identity first
    const theirs = rowsOf(other);
    if (theirs === null) return false;
    const theirType = other instanceof GenericPositionMatrix ? other.rowType : "list";
    if (theirType !== this.rowType || theirs.size !== this.values.size) return false;
    for (const [letter, row] of this.values) {
      const r = theirs.get(letter);
      if (r === undefined) return false;
      if (r === row) continue;                          // the same array: equal without looking, NaN included
      if (r.length !== row.length) return false;
      for (let i = 0; i < row.length; i++) if (row[i] !== r[i]) return false;
    }
    return true;
  }

  /**
   * Python's ordering operators, which `dict` does not support: every one of them raises.
   *
   * @param op - The operator as Python spells it in the message.
   * @param other - The right-hand operand, named by its Python type.
   * @throws TypeError always, with Biopython's wording.
   */
  private refuseOrder(op: string, other: unknown): never {
    throw new TypeError(`'${op}' not supported between instances of '${this.constructor.name}' and '${typeNameOf(other)}'`);
  }

  /** Python `matrix < other`. @throws TypeError always: `dict` has no ordering. */
  lt(other: unknown): never { return this.refuseOrder("<", other); }
  /** Python `matrix <= other`. @throws TypeError always: `dict` has no ordering. */
  le(other: unknown): never { return this.refuseOrder("<=", other); }
  /** Python `matrix > other`. @throws TypeError always: `dict` has no ordering. */
  gt(other: unknown): never { return this.refuseOrder(">", other); }
  /** Python `matrix >= other`. @throws TypeError always: `dict` has no ordering. */
  ge(other: unknown): never { return this.refuseOrder(">=", other); }

  /** @returns Python's `str`: a header of position numbers and one `%6.2f` row per letter. */
  toString(): string {
    const length = this.length ?? 0;
    const lines = ["   " + Array.from({ length }, (_, i) => intWidth(i, 6)).join(" ")];
    for (const letter of this.alphabet) lines.push(`${letter}: ` + this.row(letter).map((v) => fixedWidth(v, 6, 2)).join(" "));
    return lines.join("\n") + "\n";
  }

  /** The letters a first key selects, with their dimension (1: one letter, 2: several). */
  private letterKey(key: Key): { letters: string[]; dim: 1 | 2 } {
    const a = this.alphabet;
    const at = (i: number): string => {
      const j = i < 0 ? a.length + i : i;
      if (j < 0 || j >= a.length) throw new IndexError("string index out of range");
      return a[j]!;
    };
    if (isSlice(key)) return { letters: rangeOf(key, a.length).map((i) => a[i]!), dim: 2 };
    if (typeof key === "number" && Number.isInteger(key)) return { letters: [at(key)], dim: 1 };
    if (Array.isArray(key)) return { letters: key.map(at), dim: 2 };
    if (typeof key === "string") {
      if (key.length === 1) return { letters: [key], dim: 1 };
      throw new KeyError(key);
    }
    throw new KeyError(`Cannot understand key ${String(key)}`);
  }

  /**
   * Python's `matrix[key]` / `matrix[key1, key2]`. A letter (or letter index) gives a row, several letters a map of rows;
   * with a second key it picks positions: a number gives one value (or a map of values), a slice gives a tuple (or a map of lists).
   *
   * @param key1 - Letter selector.
   * @param key2 - Position selector (an integer or a slice).
   * @throws KeyError for keys it cannot understand; IndexError for out-of-range letter indices.
   */
  get(key1: Key, key2?: number | PySlice): number | number[] | Map<string, number | number[]> {
    if (key2 !== undefined) {
      const { letters, dim: dim1 } = this.letterKey(key1);
      let indices: number[] | null = null, index2 = 0;
      let dim2: 1 | 2;
      if (isSlice(key2)) { indices = rangeOf(key2, this.length ?? 0); dim2 = 2; }
      else if (typeof key2 === "number" && Number.isInteger(key2)) { index2 = key2; dim2 = 1; }
      else throw new KeyError(`Cannot understand key ${String(key2)}`);
      const pick = (row: number[], i: number): number => {
        const j = i < 0 ? row.length + i : i;
        if (j < 0 || j >= row.length) throw new IndexError(`${this.rowType} index out of range`);
        return row[j]!;
      };
      if (dim1 === 1 && dim2 === 1) return pick(this.row(letters[0]!), index2);
      if (dim1 === 1) return indices!.map((i) => pick(this.row(letters[0]!), i));
      const d = new Map<string, number | number[]>();
      for (const l of letters) d.set(l, dim2 === 1 ? pick(this.row(l), index2) : indices!.map((i) => pick(this.row(l), i)));
      // Biopython compares sorted(letters) with the alphabet *string*, which is never equal, so a plain dict comes back.
      return d;
    }
    const { letters, dim } = this.letterKey(key1);
    if (dim === 1) return this.row(letters[0]!);
    return new Map(letters.map((l) => [l, this.row(l)]));
  }

  /**
   * Python `matrix[a, b]` / `matrix[(a,)]` written as a tuple of keys.
   *
   * @param keys - One or two keys.
   * @throws KeyError (`keys should be 1- or 2-dimensional`) for any other length.
   */
  getTuple(keys: Key[]): number | number[] | Map<string, number | number[]> {
    if (keys.length === 2) return this.get(keys[0]!, keys[1] as number | PySlice);
    if (keys.length === 1) return this.get(keys[0]!);
    throw new KeyError("keys should be 1- or 2-dimensional");
  }

  /** The consensus: for each position the letter with the highest count (the first one on ties). */
  get consensus(): Seq {
    let sequence = "";
    let best: string | undefined;   // Python leaves `sequence_letter` as it was when no count beats -inf (NaN counts)
    for (let i = 0; i < (this.length ?? 0); i++) {
      let maximum = -Infinity;
      for (const letter of this.alphabet) {
        const count = this.row(letter)[i]!;
        if (count > maximum) { maximum = count; best = letter; }
      }
      if (best === undefined) throw new UnboundLocalError("cannot access local variable 'sequence_letter' where it is not associated with a value");
      sequence += best;
    }
    return new Seq(sequence);
  }

  /** The anticonsensus: for each position the letter with the lowest count (the first one on ties). */
  get anticonsensus(): Seq {
    let sequence = "";
    let best: string | undefined;
    for (let i = 0; i < (this.length ?? 0); i++) {
      let minimum = Infinity;
      for (const letter of this.alphabet) {
        const count = this.row(letter)[i]!;
        if (count < minimum) { minimum = count; best = letter; }
      }
      if (best === undefined) throw new UnboundLocalError("cannot access local variable 'sequence_letter' where it is not associated with a value");
      sequence += best;
    }
    return new Seq(sequence);
  }

  /** The consensus with IUPAC ambiguity codes: one letter, two, three or `N` per position. */
  get degenerateConsensus(): Seq {
    let sequence = "";
    for (let i = 0; i < (this.length ?? 0); i++) {
      const nucleotides = this.keys().sort((a, b) => this.row(b)[i]! - this.row(a)[i]!);
      const counts = nucleotides.map((c) => this.row(c)[i]!);
      const need = (k: number): number => { if (k >= counts.length) throw new IndexError("list index out of range"); return counts[k]!; };
      const sum = (xs: number[]): number => pySum(xs);
      let key: string;
      if (need(0) > sum(counts.slice(1)) && counts[0]! > 2 * need(1)) key = nucleotides[0]!;
      else if (4 * sum(counts.slice(0, 2)) > 3 * sum(counts)) key = nucleotides.slice(0, 2).sort().join("");
      else if (need(3) === 0) key = nucleotides.slice(0, 3).sort().join("");
      else key = "ACGT";
      sequence += Object.hasOwn(NUCLEOTIDE_CODES, key) ? NUCLEOTIDE_CODES[key]! : key;
    }
    return new Seq(sequence);
  }

  /**
   * A consensus string: the most frequent letter per position, in lower case where it is at most half of the counts,
   * and `N` (or `X`) where it is below `identity` of them.
   *
   * @param substitutionMatrix - Not supported (must be null).
   * @param plurality - Must be null without a substitution matrix.
   * @param identity - Minimum fraction of the total the top letter needs.
   * @param setcase - Fraction of the total above which the letter is upper case (default one half).
   * @throws NotImplementedError / ValueError as Biopython does.
   */
  calculateConsensus(substitutionMatrix: unknown = null, plurality: number | null = null, identity = 0, setcase: number | null = null): string {
    const undefinedLetter = [...this.alphabet].every((c) => "ACGTUN-".includes(c)) ? "N" : "X";
    if (substitutionMatrix !== null) throw Object.assign(new Error("calculate_consensus currently only supports substitution_matrix=None"), { name: "NotImplementedError" });
    if (plurality !== null) throw new ValueError("plurality must be None if substitution_matrix is None");
    let sequence = "";
    let letterOut: string | undefined;   // like Python's `consensus_letter`, it survives from the previous position when no count is positive
    for (let i = 0; i < (this.length ?? 0); i++) {
      let maximum = 0, total = 0;
      for (const letter of this.alphabet) {
        const count = this.row(letter)[i]!;
        total += count;
        if (count > maximum) { maximum = count; letterOut = letter; }
      }
      if (maximum < identity * total) letterOut = undefinedLetter;
      else {
        const threshold = setcase === null ? total / 2 : setcase * total;
        if (letterOut === undefined) throw new UnboundLocalError("cannot access local variable 'consensus_letter' where it is not associated with a value");
        if (maximum <= threshold) letterOut = letterOut.toLowerCase();
      }
      sequence += letterOut;
    }
    return sequence;
  }

  /** The fraction of C and G among all the counts. @throws ZeroDivisionError for an empty or all-zero matrix. */
  get gcContent(): number {
    let gc = 0, total = 0;
    for (let i = 0; i < (this.length ?? 0); i++) {
      for (const letter of this.alphabet) {
        if ("CG".includes(letter)) gc += this.row(letter)[i]!;
        total += this.row(letter)[i]!;
      }
    }
    return pyDiv(gc, total);
  }

  /** The matrix of the opposite strand: A and T (or U) swapped, C and G swapped, each row reversed. */
  reverseComplement(): this {
    const v = new Map<string, number[]>();
    if (this.alphabet === "ACGU") { v.set("A", reversed(this.row("U"))); v.set("U", reversed(this.row("A"))); }
    else { v.set("A", reversed(this.row("T"))); v.set("T", reversed(this.row("A"))); }
    v.set("G", reversed(this.row("C")));
    v.set("C", reversed(this.row("G")));
    return new (this.constructor as new (a: string, v: LetterValues) => this)(this.alphabet, v);
  }
}

/** Counts of each letter at each position. */
export class FrequencyPositionMatrix extends GenericPositionMatrix {
  /**
   * Counts plus pseudocounts, as a normalised weight matrix.
   *
   * @param pseudocounts - A number or a map of letter to number added to every position (default none).
   * @throws ZeroDivisionError when a position has no counts at all.
   */
  normalize(pseudocounts: number | Record<string, number> | Map<string, number> | null = null): PositionWeightMatrix {
    const length = this.length ?? 0;
    const counts = new Map<string, number[]>();
    for (const letter of this.alphabet) {
      const p = pseudocounts === null ? 0 : typeof pseudocounts === "number" ? pseudocounts : pseudocounts instanceof Map ? pseudocounts.get(letter) : pseudocounts[letter];
      if (p === undefined) throw new KeyError(letter);
      counts.set(letter, new Array<number>(length).fill(Number(p)));
    }
    for (let i = 0; i < length; i++) for (const letter of this.alphabet) counts.get(letter)![i]! += this.row(letter)[i]!;
    return new PositionWeightMatrix(this.alphabet, counts);
  }
}

/** Probabilities of each letter at each position (every column sums to 1). */
export class PositionWeightMatrix extends GenericPositionMatrix {
  /**
   * @param alphabet - The letters.
   * @param counts - Counts (or weights) per letter; each position is divided by its total.
   * @throws ZeroDivisionError when a position totals zero.
   */
  constructor(alphabet: string, counts: LetterValues) {
    super(alphabet, counts);
    this.rowType = "tuple";
    for (let i = 0; i < (this.length ?? 0); i++) {
      const total = pySum([...alphabet].map((l) => this.row(l)[i]!));
      for (const l of alphabet) this.row(l)[i] = pyDiv(this.row(l)[i]!, total);
    }
  }

  /**
   * Log-odds scores: log2 of each probability over its background probability.
   *
   * @param background - Background probabilities by letter (default: all equal).
   * @returns A scoring matrix; `-Infinity` where a letter never occurs, `Infinity` where only the background is zero, NaN where both are.
   */
  logOdds(background: Record<string, number> | Map<string, number> | null = null): PositionSpecificScoringMatrix {
    const bg = new Map<string, number>();
    if (background === null) for (const l of this.alphabet) bg.set(l, 1.0);
    else for (const [k, v] of background instanceof Map ? background : Object.entries(background)) bg.set(k, v);
    const total = pySum(bg.values());
    const values = new Map<string, number[]>();
    for (const letter of this.alphabet) {
      if (!bg.has(letter)) throw new KeyError(letter);
      bg.set(letter, pyDiv(bg.get(letter)!, total));
      values.set(letter, []);
    }
    for (let i = 0; i < (this.length ?? 0); i++) {
      for (const letter of this.alphabet) {
        const b = bg.get(letter)!, p = this.row(letter)[i]!;
        let logodds: number;
        if (b > 0) logodds = p > 0 ? Math.log(p / b) / Math.log(2) : -Infinity;   // math.log(x, 2) is log(x) / log(2)
        else logodds = p > 0 ? Infinity : NaN;
        values.get(letter)!.push(logodds);
      }
    }
    return new PositionSpecificScoringMatrix(this.alphabet, values);
  }
}

/** Python's `bytes(x)` as far as it matters for scoring: text, sequences, byte strings and (as NUL bytes) integers. */
function toSequenceBytes(sequence: unknown): Uint8Array {
  if (sequence instanceof Seq || sequence instanceof MutableSeq) return Uint8Array.from(sequence.toString(), (c) => c.charCodeAt(0));
  if (sequence instanceof Uint8Array) return sequence;
  if (typeof sequence === "string") {
    if ([...sequence].some((c) => c.charCodeAt(0) > 127)) throw new ValueError("sequence should contain ASCII characters only");
    return Uint8Array.from(sequence, (c) => c.charCodeAt(0));
  }
  if (typeof sequence === "number" && Number.isInteger(sequence) && sequence >= 0) return new Uint8Array(sequence);
  throw new ValueError("sequence should be a Seq, MutableSeq, string, or bytes-like object");
}

/** Log-odds scores per letter and position. */
export class PositionSpecificScoringMatrix extends GenericPositionMatrix {
  /**
   * The score of every window of the sequence (single precision, as Biopython's C code stores it). Windows with a letter
   * other than ACGT score NaN.
   *
   * @param sequence - A `Seq`, `MutableSeq`, string or bytes.
   * @returns A `Float32Array`, or the bare number when there is exactly one window.
   * @throws ValueError for a non-DNA alphabet, a bad sequence, or a sequence shorter than the motif.
   */
  calculate(sequence: unknown): number | Float32Array {
    if (sortedLetters(this.alphabet).join("") !== "ACGT") throw new ValueError(`PSSM has wrong alphabet: ${this.alphabet} - Use only with DNA motifs`);
    const bytes = toSequenceBytes(sequence);
    const n = bytes.length, m = this.length ?? 0;
    if (n - m + 1 < 0) throw new ValueError("negative dimensions are not allowed");
    const scores = new Float32Array(n - m + 1);
    const index: Record<number, number> = { 65: 0, 97: 0, 67: 1, 99: 1, 71: 2, 103: 2, 84: 3, 116: 3 };
    const rows = ["A", "C", "G", "T"].map((l) => this.row(l));
    for (let i = 0; i < scores.length; i++) {
      let score = 0, ok = true;
      for (let j = 0; j < m; j++) {
        const k = index[bytes[i + j]!];
        if (k === undefined) ok = false; else score += rows[k]![j]!;
      }
      scores[i] = ok ? score : NaN;
    }
    return scores.length === 1 ? scores[0]! : scores;
  }

  /**
   * Find the positions where the score reaches a threshold, on the sequence and (with `both`) its reverse complement.
   *
   * @param sequence - A `Seq` (upper-cased before scoring).
   * @param threshold - Minimum score.
   * @param both - Also search the opposite strand; its hits have negative positions counted from the end.
   * @param chunksize - Scan the sequence in pieces of this many positions.
   * @returns `[position, score]` pairs sorted by position within each chunk.
   * @throws ValueError (as NumPy's `nonzero` does) when a chunk has exactly one window, because a single score is a scalar.
   */
  search(sequence: Seq | MutableSeq, threshold = 0.0, both = true, chunksize = 10 ** 6): [number, number][] {
    const upper = sequence.toString().toUpperCase();
    const seqLen = upper.length, motifLen = this.length ?? 0;
    const rc = both ? this.reverseComplement() : null;
    const out: [number, number][] = [];
    for (let chunkStart = 0; chunkStart < seqLen; chunkStart += chunksize) {
      const sub = upper.slice(chunkStart, chunkStart + chunksize + motifLen - 1);
      const pos = this.calculate(sub);
      if (typeof pos === "number") throw new ValueError("Calling nonzero on 0d arrays is not allowed. Use np.atleast_1d(scalar).nonzero() instead. If the context of this error is of the form `arr[nonzero(cond)]`, just use `arr[cond]`.");
      const hits: [number, number][] = [];
      pos.forEach((s, i) => { if (s >= threshold) hits.push([i + chunkStart, s]); });
      const neg: [number, number][] = [];
      if (rc) {
        const ns = rc.calculate(sub);
        if (typeof ns === "number") throw new ValueError("Calling nonzero on 0d arrays is not allowed. Use np.atleast_1d(scalar).nonzero() instead. If the context of this error is of the form `arr[nonzero(cond)]`, just use `arr[cond]`.");
        ns.forEach((s, i) => { if (s >= threshold) neg.push([i + chunkStart, s]); });
      }
      // The order is NumPy's `argsort` of the forward-strand positions, which is not stable: equal positions (one hit on each strand) can swap.
      const all: [number, number, number][] = [...hits.map(([p, s]): [number, number, number] => [p, p, s]), ...neg.map(([p, s]): [number, number, number] => [p, p - seqLen, s])];
      for (const k of argsortQuick(all.map((a) => a[0]))) out.push([all[k]![1], all[k]![2]]);
    }
    return out;
  }

  /** The highest possible score: the best letter at each position, summed. */
  get max(): number {
    let score = 0;
    for (let p = 0; p < (this.length ?? 0); p++) score += Math.max(...[...this.alphabet].map((l) => this.row(l)[p]!));
    return score;
  }

  /** The lowest possible score. */
  get min(): number {
    let score = 0;
    for (let p = 0; p < (this.length ?? 0); p++) score += Math.min(...[...this.alphabet].map((l) => this.row(l)[p]!));
    return score;
  }

  /** @throws PythonException always: a log-odds matrix has no GC content. */
  override get gcContent(): number { throw new PythonException("Cannot compute the %GC composition of a PSSM"); }

  private normalisedBackground(background: Record<string, number> | Map<string, number> | null): Map<string, number> {
    const bg = new Map<string, number>();
    if (background === null) for (const l of this.alphabet) bg.set(l, 1.0);
    else for (const [k, v] of background instanceof Map ? background : Object.entries(background)) bg.set(k, v);
    const total = pySum(bg.values());
    for (const l of this.alphabet) {
      if (!bg.has(l)) throw new KeyError(l);
      bg.set(l, pyDiv(bg.get(l)!, total));
    }
    return bg;
  }

  /** The expected score under a background distribution. */
  mean(background: Record<string, number> | Map<string, number> | null = null): number {
    const bg = this.normalisedBackground(background);
    let sx = 0;
    for (let i = 0; i < (this.length ?? 0); i++) {
      for (const letter of this.alphabet) {
        const logodds = this.row(letter)[i]!;
        if (Number.isNaN(logodds) || logodds === -Infinity) continue;
        const p = bg.get(letter)! * pow2(logodds);
        sx += p * logodds;
      }
    }
    return sx;
  }

  /** The standard deviation of the score under a background distribution. */
  std(background: Record<string, number> | Map<string, number> | null = null): number {
    const bg = this.normalisedBackground(background);
    let variance = 0;
    for (let i = 0; i < (this.length ?? 0); i++) {
      let sx = 0, sxx = 0;
      for (const letter of this.alphabet) {
        const logodds = this.row(letter)[i]!;
        if (Number.isNaN(logodds) || logodds === -Infinity) continue;
        const p = bg.get(letter)! * pow2(logodds);
        sx += p * logodds;
        sxx += p * logodds * logodds;
      }
      sxx -= sx * sx;
      variance += sxx;
    }
    return pySqrt(variance > 0 || Number.isNaN(variance) ? variance : 0);
  }

  /**
   * Pearson distance to another matrix at the best relative offset.
   *
   * @param other - Another scoring matrix with the same alphabet.
   * @returns `[1 - correlation, offset]`.
   * @throws ValueError for different alphabets.
   */
  distPearson(other: PositionSpecificScoringMatrix): [number, number] {
    if (this.alphabet !== other.alphabet) throw new ValueError("Cannot compare motifs with different alphabets");
    let maxP = -2, maxO: number | null = null;
    for (let offset = -(this.length ?? 0) + 1; offset < (other.length ?? 0); offset++) {
      const p = offset < 0 ? this.distPearsonAt(other, -offset) : other.distPearsonAt(this, offset);
      if (maxP < p) { maxP = p; maxO = -offset; }
    }
    if (maxO === null) throw new UnboundLocalError("cannot access local variable 'max_o' where it is not associated with a value");
    return [1 - maxP, maxO];
  }

  /** The Pearson correlation of this matrix, shifted by `offset`, with another. */
  distPearsonAt(other: PositionSpecificScoringMatrix, offset: number): number {
    const letters = this.alphabet;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    const norm = Math.max(this.length ?? 0, offset + (other.length ?? 0)) * letters.length;
    for (let pos = 0; pos < Math.min((this.length ?? 0) - offset, other.length ?? 0); pos++) {
      const xi = [...letters].map((l) => this.row(l)[pos + offset]!);
      const yi = [...letters].map((l) => other.row(l)[pos]!);
      sx += pySum(xi);
      sy += pySum(yi);
      sxx += pySum(xi.map((x) => x * x));
      sxy += pySum(xi.map((x, k) => x * yi[k]!));
      syy += pySum(yi.map((y) => y * y));
    }
    sx /= norm; sy /= norm; sxx /= norm; sxy /= norm; syy /= norm;
    const numerator = sxy - sx * sy;
    const denominator = pySqrt((sxx - sx * sx) * (syy - sy * sy));
    return pyDiv(numerator, denominator);
  }
}




/**
 * NumPy's default `argsort` (an introsort: median-of-three quicksort with insertion sort for runs of 16 or fewer),
 * which is not stable. Reproducing it keeps the order of equal keys the same as NumPy's.
 *
 * @param v - The keys.
 * @returns The indices that sort `v`.
 */
export function argsortQuick(v: readonly number[]): number[] {
  const n = v.length;
  const tosort = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return tosort;
  const stack: number[] = [];
  const depthStack: number[] = [];
  let pl = 0, pr = n - 1;
  let cdepth = (31 - Math.clz32(n)) * 2;
  const lt = (a: number, b: number): boolean => a < b;
  const swap = (i: number, j: number): void => { const t = tosort[i]!; tosort[i] = tosort[j]!; tosort[j] = t; };
  for (;;) {
    if (cdepth >= 0) {
      while (pr - pl > 16) {
        const pm = pl + ((pr - pl) >> 1);
        if (lt(v[tosort[pm]!]!, v[tosort[pl]!]!)) swap(pm, pl);
        if (lt(v[tosort[pr]!]!, v[tosort[pm]!]!)) swap(pr, pm);
        if (lt(v[tosort[pm]!]!, v[tosort[pl]!]!)) swap(pm, pl);
        const vp = v[tosort[pm]!]!;
        let pi = pl, pj = pr - 1;
        swap(pm, pj);
        for (;;) {
          do { pi++; } while (lt(v[tosort[pi]!]!, vp));
          do { pj--; } while (lt(vp, v[tosort[pj]!]!));
          if (pi >= pj) break;
          swap(pi, pj);
        }
        swap(pi, pr - 1);
        // push the larger partition, continue with the smaller
        if (pi - pl < pr - pi) { stack.push(pi + 1, pr); pr = pi - 1; } else { stack.push(pl, pi - 1); pl = pi + 1; }
        depthStack.push(--cdepth);
      }
      for (let pi = pl + 1; pi <= pr; pi++) {
        const vi = tosort[pi]!, vpv = v[vi]!;
        let pj = pi;
        while (pj > pl && lt(vpv, v[tosort[pj - 1]!]!)) { tosort[pj] = tosort[pj - 1]!; pj--; }
        tosort[pj] = vi;
      }
    } else {
      // Heapsort fallback in NumPy; a stable sort of the range gives the same set of orders for distinct keys.
      const part = tosort.slice(pl, pr + 1).sort((a, b) => v[a]! - v[b]!);
      for (let k = 0; k < part.length; k++) tosort[pl + k] = part[k]!;
    }
    if (stack.length === 0) break;
    pr = stack.pop()!; pl = stack.pop()!; cdepth = depthStack.pop()!;
  }
  return tosort;
}
