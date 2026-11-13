/**
 * `Alignment`: a sequence alignment, stored as the aligned sequences plus the coordinates that define it
 * (Biopython's `Bio.Align.Alignment`). Ported so far: the data, comparison, `length`, `shape`, `aligned`, `indices`,
 * `inverseIndices`, `sort`, and text formatting; indexing, counting, mapping and the file formats are still to come.
 */

import { IndexError, NotImplementedError, ValueError } from "@biolibs/core";
import { Seq, MutableSeq, UndefinedSequenceError } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import type { SubstitutionArray } from "../substitution-matrices/index.js";
import { alignedColumns, allNonNegative, allNonPositive, diffRows, select, transpose, type Matrix } from "./coords.js";
import { formatPretty } from "./format.js";
import { parsePrintedAlignment, type ParsedAlignment } from "./printed-alignment.js";
import { lengthOf, reverseComplementOf } from "./sequence-utils.js";
import { getItem, type AlignmentKey } from "./getitem.js";
import { mapAlignment, mapAll } from "./map.js";
import { countAlignment, type CountScoring } from "./counts.js";
import type { AlignmentCounts } from "./alignment-counts.js";
import { frequencies, substitutions } from "./stats.js";
import { formatAs } from "../formats/registry.js";

/** The sequence a record-like carries (`left.seq`), or the value itself. */
function plain(x: unknown): unknown {
  return x instanceof SeqRecord ? x.seq : x;
}

/** Text of a comparable sequence value, for ordering. @throws TypeError for kinds Python cannot order together. */
function orderKey(x: unknown): string | number[] {
  const v = plain(x);
  if (typeof v === "string") return v;
  if (v instanceof Seq || v instanceof MutableSeq) return v.toString();
  if (v instanceof Uint8Array) return Array.from(v);
  throw new TypeError("'<' not supported between these sequence types");
}

/** Python ordering of two comparable values: negative, zero or positive (strings by code point). */
function compareKeys(a: string | number[], b: string | number[]): number {
  if (typeof a === "string" && typeof b === "string") {
    const x = Array.from(a, (c) => c.codePointAt(0)!);
    const y = Array.from(b, (c) => c.codePointAt(0)!);
    return compareKeys(x, y);
  }
  if (typeof a === "string" || typeof b === "string") throw new TypeError("'<' not supported between instances of 'str' and 'bytes'");
  for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) return a[k]! < b[k]! ? -1 : 1;
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** Equality of two sequences as `left != right` sees them (after unwrapping records). */
function sequencesEqual(a: unknown, b: unknown): boolean {
  const x = plain(a);
  const y = plain(b);
  if (x === undefined || y === undefined || x === null || y === null) return x === y;
  const ex = x instanceof Uint8Array || typeof x === "string" || x instanceof Seq || x instanceof MutableSeq;
  const ey = y instanceof Uint8Array || typeof y === "string" || y instanceof Seq || y instanceof MutableSeq;
  if (!ex || !ey) return x === y;
  if (x instanceof Uint8Array !== y instanceof Uint8Array) return false;
  return compareKeys(orderKey(x), orderKey(y)) === 0;
}

/** `sequence[start:end]` for a string, `Seq`, `MutableSeq` or `SeqRecord`. */
function sliceSequence(sequence: unknown, start: number, end: number): unknown {
  if (typeof sequence === "string") return Array.from(sequence).slice(start, end).join("");
  return (sequence as { get(s: { start: number; stop: number }): unknown }).get({ start, stop: end });
}

/** `a + b` for two sequences of the same kind. */
function concatSequences(a: unknown, b: unknown): unknown {
  if (typeof a === "string") return a + (b as string);
  return (a as { add(o: unknown): unknown }).add(b);
}

/** An alignment of N sequences: row `k` of `coordinates` lists where sequence `k` is at each column boundary. */
export class Alignment {
  /** The sequences that were aligned (strings, `Seq`, `MutableSeq` or `SeqRecord`). */
  sequences: unknown[];
  /** One row per sequence: its coordinates at each change of direction in the alignment path. */
  coordinates: number[][] | null;
  /** The alignment score, when known (set by the aligner). */
  score?: number | string;
  /** Annotations describing the alignment (optional). */
  annotations?: Map<string, unknown>;
  /** BED column 7: where the thick part starts. */
  thickStart?: number;
  /** BED column 8: where the thick part ends. */
  thickEnd?: number;
  /** BED column 9: the item colour, as text. */
  itemRgb?: string;
  /** Number of matching letters, as read from or written to PSL files. */
  matches?: number;
  /** Number of mismatching letters (PSL). */
  misMatches?: number;
  /** Number of matching letters inside repeat-masked target regions (PSL). */
  repMatches?: number;
  /** Number of aligned wildcard letters (PSL). */
  nCount?: number;
  /** The per-column operation (`M` match, `D` deletion, `I` insertion) kept by the Stockholm reader; Stockholm files use it to tell `-` from `.`. */
  operations?: Uint8Array;
  /** Annotations describing each column: a string or a list per key (optional). */
  columnAnnotations?: Map<string, string | unknown[]>;

  /**
   * @param sequences - The aligned sequences.
   * @param coordinates - The coordinates defining the alignment; when null, the sequences are assumed to align
   *   without gaps (they must then all have the same length).
   * @throws {@link ValueError} if `coordinates` is null and the sequences have different lengths.
   */
  constructor(sequences: unknown[], coordinates: number[][] | null = null) {
    this.sequences = sequences;
    if (coordinates === null) {
      const lengths = new Set(sequences.map((s) => (s as { length: number }).length));
      if (sequences.some((s) => (s as { length?: number } | null)?.length === undefined)) {
        // Sequences without a length (Python raises TypeError and leaves coordinates as None).
      } else if (lengths.size === 0) coordinates = [];
      else if (lengths.size === 1) coordinates = sequences.map(() => [0, [...lengths][0]!]);
      else throw new ValueError("sequences must have the same length if coordinates is None");
    }
    this.coordinates = coordinates;
  }

  /** The first sequence. @throws {@link ValueError} for an alignment of more than two sequences. */
  get target(): unknown {
    const n = this.sequences.length;
    if (n > 2) throw new ValueError(`self.target is defined for pairwise alignments only (found alignment of ${n} sequences)`);
    if (n === 0) throw new IndexError("list index out of range");
    return this.sequences[0];
  }
  set target(value: unknown) {
    const n = this.sequences.length;
    if (n !== 2) throw new ValueError(`self.target is defined for pairwise alignments only (found alignment of ${n} sequences)`);
    this.sequences[0] = value;
  }
  /** The second sequence. @throws {@link ValueError} unless there are exactly two sequences. */
  get query(): unknown {
    const n = this.sequences.length;
    if (n !== 2) throw new ValueError(`self.query is defined for pairwise alignments only (found alignment of ${n} sequences)`);
    return this.sequences[1];
  }
  set query(value: unknown) {
    const n = this.sequences.length;
    if (n !== 2) throw new ValueError(`self.query is defined for pairwise alignments only (found alignment of ${n} sequences)`);
    this.sequences[1] = value;
  }

  /** The coordinates, which the methods below need. @throws TypeError when they are missing. */
  private get coords(): Matrix {
    if (this.coordinates === null) throw new TypeError("'NoneType' object is not subscriptable");
    return this.coordinates;
  }

  /** Equal sequences and equal coordinates (`==`). */
  equals(other: Alignment): boolean {
    const n = Math.max(this.sequences.length, other.sequences.length);
    for (let k = 0; k < n; k++) if (!sequencesEqual(this.sequences[k], other.sequences[k])) return false;
    return JSON.stringify(this.coordinates) === JSON.stringify(other.coordinates);
  }

  /** Python ordering: by sequences first, then by coordinate columns. Returns -1, 0 or 1. */
  compare(other: Alignment): number {
    const n = Math.max(this.sequences.length, other.sequences.length);
    for (let k = 0; k < n; k++) {
      const a = this.sequences[k];
      const b = other.sequences[k];
      if (a === undefined || b === undefined) throw new TypeError("'<' not supported between instances of 'NoneType' and 'str'");
      const c = compareKeys(orderKey(a), orderKey(b));
      if (c !== 0) return c;
    }
    const left = transpose(this.coords);
    const right = transpose(other.coords);
    for (let k = 0; k < Math.min(left.length, right.length); k++) {
      for (let q = 0; q < Math.min(left[k]!.length, right[k]!.length); q++) if (left[k]![q] !== right[k]![q]) return left[k]![q]! < right[k]![q]! ? -1 : 1;
      if (left[k]!.length !== right[k]!.length) return left[k]!.length < right[k]!.length ? -1 : 1;
    }
    return 0;
  }
  /** `self < other`. */
  lt(other: Alignment): boolean { return this.compare(other) < 0; }
  /** `self <= other`. */
  le(other: Alignment): boolean { return this.compare(other) <= 0; }
  /** `self > other`. */
  gt(other: Alignment): boolean { return this.compare(other) > 0; }
  /** `self >= other`. */
  ge(other: Alignment): boolean { return this.compare(other) >= 0; }

  /** The number of sequences (`len(alignment)`). */
  get size(): number {
    return this.sequences.length;
  }

  /**
   * The number of columns of the alignment.
   *
   * @throws {@link ValueError} for inconsistent or unequal steps.
   */
  get length(): number {
    const coordinates = this.coords;
    const n = coordinates.length;
    if (n === 0) return 0;
    const steps = diffRows(coordinates);
    const aligned = alignedColumns(steps);
    for (let i = 0; i < n; i++) {
      const row = select(steps[i]!, aligned);
      if (allNonNegative(row)) continue;
      if (allNonPositive(row)) steps[i] = steps[i]!.map((v) => -v);
      else throw new ValueError(`Inconsistent steps in row ${i}`);
    }
    const gaps = transpose(steps).map((col) => Math.max(...col));
    for (const row of steps) row.forEach((v, k) => { if (!(v === gaps[k] || v <= 0)) throw new ValueError("Unequal step sizes in alignment"); });
    return gaps.reduce((a, b) => a + b, 0);
  }

  /** `[number of sequences, number of columns]`. */
  get shape(): [number, number] {
    return [this.coords.length, this.length];
  }

  /**
   * The aligned segments of a pairwise alignment: `result[i][k] = [start, end]` of the `k`-th stretch where both
   * sequences are aligned.
   *
   * @throws {@link NotImplementedError} for more than two sequences.
   * @throws {@link ValueError} for inconsistent steps.
   */
  get aligned(): number[][][] {
    if (this.sequences.length > 2) throw new NotImplementedError("aligned is currently implemented for pairwise alignments only");
    const coordinates = this.coords.map((r) => [...r]);
    const steps = diffRows(coordinates);
    const aligned = alignedColumns(steps);
    this.sequences.forEach((sequence, i) => {
      const row = select(steps[i]!, aligned);
      if (allNonNegative(row)) return;
      if (allNonPositive(row)) {
        steps[i] = steps[i]!.map((v) => -v);
        const len = (sequence as { length: number }).length;
        coordinates[i] = coordinates[i]!.map((v) => len - v);
      } else throw new ValueError(`Inconsistent steps in row ${i}`);
    });
    if (coordinates.length === 0) throw new ValueError("zero-size array to reduction operation minimum which has no identity");
    const columns = transpose(coordinates);
    const colSteps = columns.slice(1).map((c, k) => c.map((v, q) => Math.abs(v - columns[k]![q]!)));
    const mins = colSteps.map((r) => Math.min(...r));
    const indices = mins.flatMap((v, k) => (v !== 0 ? [k] : []));
    const segments: number[][][] = coordinates.map((_, i) => indices.map((k) => [columns[k]![i]!, columns[k + 1]![i]!]));
    const orig = diffRows(this.coords);
    this.sequences.forEach((sequence, i) => {
      const row = select(orig[i]!, aligned);
      if (allNonNegative(row)) return;
      if (allNonPositive(row)) {
        const len = (sequence as { length: number }).length;
        segments[i] = segments[i]!.map((seg) => seg.map((v) => len - v));
      } else throw new ValueError(`Inconsistent steps in row ${i}`);
    });
    return segments;
  }

  /** Per-row strand flags from the aligned steps (`true` for a row that runs backwards). */
  private strands(): boolean[] {
    const steps = diffRows(this.coords);
    const aligned = alignedColumns(steps);
    return steps.map((row, i) => {
      const r = select(row, aligned);
      if (allNonNegative(r)) return false;
      if (allNonPositive(r)) return true;
      throw new ValueError(`Inconsistent steps in row ${i}`);
    });
  }

  /**
   * For each alignment column, the position in each sequence (`-1` for a gap), as a matrix of shape `[n, length]`.
   *
   * @throws {@link ValueError} for inconsistent steps.
   */
  get indices(): number[][] {
    const [n, m0] = this.shape;
    if (m0 < 0) throw new ValueError("negative dimensions are not allowed");
    const coords = this.coords;
    const a: number[][] = Array.from({ length: n }, () => new Array<number>(m0).fill(-1));
    const m = coords[0]?.length ?? 0;
    const rcs = this.strands();
    // `ends = self.coordinates[:, 0]` fails on an empty coordinate array.
    if (m === 0) throw new IndexError("index 0 is out of bounds for axis 1 with size 0");
    let i = 0;
    let j = 0;
    for (let k = 1; k < m; k++) {
      for (let r = 0; r < n; r++) {
        const start = coords[r]![k - 1]!;
        const end = coords[r]![k]!;
        const row = a[r]!;
        if (!rcs[r] && start < end) {
          j = i + end - start;
          for (let q = 0; q < end - start; q++) row[i + q] = start + q;
        } else if (rcs[r] && start > end) {
          j = i + start - end;
          for (let q = 0; q < start - end; q++) row[i + q] = start - 1 - q;
        }
      }
      i = j;
    }
    return a;
  }

  /**
   * For each sequence, the alignment column of each of its letters (`-1` for letters outside the alignment).
   *
   * @throws {@link ValueError} for inconsistent steps.
   */
  get inverseIndices(): number[][] {
    const coords = this.coords;
    const a: number[][] = this.sequences.map((s) => new Array<number>((s as { length: number }).length).fill(-1));
    const m = coords[0]?.length ?? 0;
    const rcs = this.strands();
    let i = 0;
    let j = 0;
    for (let k = 0; k < m - 1; k++) {
      for (let r = 0; r < coords.length; r++) {
        const start = coords[r]![k]!;
        const end = coords[r]![k + 1]!;
        const row = a[r]!;
        if (!rcs[r] && start < end) {
          j = i + end - start;
          for (let q = 0; q < end - start; q++) row[start + q] = i + q;
        } else if (rcs[r] && start > end) {
          j = i + start - end;
          for (let q = 0; q < start - end; q++) row[start - 1 - q] = i + q;
        }
      }
      i = j;
    }
    return a;
  }

  /**
   * Sort the sequences (and their coordinate rows) in place by `key` (default: the record id, or the sequence).
   *
   * @param key - Maps a sequence to its sort key.
   * @param reverse - Sort in descending order (stable, like Python's `reverse=True`).
   */
  sort(key: ((sequence: unknown) => unknown) | null = null, reverse = false): void {
    const sequences = this.sequences;
    const values = key !== null ? sequences.map(key) : sequences.every((s) => s instanceof SeqRecord) ? sequences.map((s) => (s as SeqRecord).id) : sequences;
    const cmp = (a: unknown, b: unknown): number => {
      if (typeof a === "number" && typeof b === "number") return a - b;
      return compareKeys(orderKey(a), orderKey(b));
    };
    const order = sequences.map((_, k) => k).sort((p, q) => (reverse ? cmp(values[q], values[p]) : cmp(values[p], values[q])) || p - q);
    this.sequences = order.map((k) => sequences[k]);
    this.coordinates = order.map((k) => this.coords[k]!);
  }

  /**
   * The text form. The default layout is the printed pairwise alignment; `matrix` (a substitution matrix or an
   * aligner holding one) marks letters with a positive score `:` in the pattern line. Other formats need the
   * alignment file writers, which are not ported yet.
   *
   * @param fmt - `""` for the printed layout.
   * @throws {@link NotImplementedError} for a non-empty format.
   */
  format(fmt = "", matrix: SubstitutionArray | { substitutionMatrix: SubstitutionArray | null } | null = null): string {
    if (fmt !== "") return formatAs(this, fmt);
    const m = matrix !== null && "substitutionMatrix" in matrix ? matrix.substitutionMatrix : (matrix as SubstitutionArray | null);
    return formatPretty(this.sequences, this.coords, m);
  }

  /**
   * Python's `alignment[key]`: an integer gives one row as text (gaps as `-`), a slice gives an alignment of those
   * rows, and `[row, column]` gives a cell, a stretch of letters, or a sub-alignment (see `AlignmentKey`).
   *
   * @throws {@link IndexError} for rows or columns out of range; TypeError for an unsupported key.
   */
  get(key: AlignmentKey): string | unknown | unknown[] | Alignment {
    return getItem(this, key, (sequences, coordinates) => new Alignment(sequences, coordinates));
  }

  /**
   * The alignment of the reverse complements of the sequences (column annotations are reversed too).
   *
   * @throws TypeError for sequences that have no reverse complement.
   */
  reverseComplement(): Alignment {
    const sequences = this.sequences.map(reverseComplementOf);
    const coordinates = sequences.map((sequence, k) => {
      const len = lengthOf(sequence);
      return [...this.coords[k]!].reverse().map((v) => len - v);
    });
    const alignment = new Alignment(sequences, coordinates);
    if (this.columnAnnotations !== undefined) {
      alignment.columnAnnotations = new Map();
      for (const [key, value] of this.columnAnnotations) {
        alignment.columnAnnotations.set(key, typeof value === "string" ? Array.from(value).reverse().join("") : [...value].reverse());
      }
    }
    return alignment;
  }

  /**
   * Concatenate two alignments of the same number of rows: row `k` of the result is the aligned part of `this`
   * followed by that of `other`. Annotations on which both agree are kept; column annotations are concatenated.
   *
   * @throws {@link NotImplementedError} when `other` is not an `Alignment`.
   * @throws {@link ValueError} when the alignments have different numbers of rows.
   */
  add(other: Alignment): Alignment {
    if (!(other instanceof Alignment)) throw new NotImplementedError("");
    if (this.size !== other.size) throw new ValueError("When adding two alignments they must have the same length (i.e. same number of rows)");
    const c1 = this.coords;
    const c2 = other.coords;
    const sequences = this.sequences.map((seq1, k) => {
      const a = sliceSequence(seq1, c1[k]![0]!, c1[k]![c1[k]!.length - 1]!);
      const b = sliceSequence(other.sequences[k], c2[k]![0]!, c2[k]![c2[k]!.length - 1]!);
      return concatSequences(a, b);
    });
    const coordinates = c1.map((row, k) => {
      const start1 = row[0]!;
      const end1 = row[row.length - 1]!;
      const offset = c2[k]![0]! - end1 + start1;
      return [...row.map((v) => v - start1), ...c2[k]!.map((v) => v - offset)];
    });
    const alignment = new Alignment(sequences, coordinates);
    if (this.annotations !== undefined) {
      alignment.annotations = new Map();
      for (const [key, value] of this.annotations) {
        if (other.annotations?.has(key) && JSON.stringify(other.annotations.get(key)) === JSON.stringify(value)) alignment.annotations.set(key, value);
      }
    }
    if (this.columnAnnotations !== undefined) {
      alignment.columnAnnotations = new Map();
      for (const [key, value] of this.columnAnnotations) {
        const o = other.columnAnnotations?.get(key);
        if (o === undefined) continue;
        alignment.columnAnnotations.set(key, typeof value === "string" ? value + (o as string) : [...value, ...(o as unknown[])]);
      }
    }
    return alignment;
  }

  /**
   * Combine pairwise alignments that share a reference (their first sequence) into one multiple alignment whose
   * first sequence is the reference and whose other rows are the aligned sequences of each pairwise alignment.
   *
   * @throws {@link ValueError} for no alignments, references of different lengths or contents, or inconsistent
   *   reference coordinates.
   */
  static fromAlignmentsWithSameReference(alignments: readonly Alignment[]): Alignment {
    if (alignments.length === 0) throw new ValueError("No pairwise alignments provided.");
    const firsts = alignments.map((a) => a.sequences[0]);
    if (!firsts.every((f) => lengthOf(f) === lengthOf(firsts[0]))) throw new ValueError("All reference sequences must have the same length.");
    const strings = new Set<string>();
    for (let first of firsts) {
      if (first instanceof SeqRecord) first = first.seq;
      try {
        strings.add(String(first).toUpperCase());
      } catch (e) {
        if (e instanceof UndefinedSequenceError) continue;
        throw e;
      }
    }
    if (strings.size > 1) throw new ValueError("All reference sequences must match (excluding gaps).");
    const sequences = [alignments[0]!.sequences[0], ...alignments.flatMap((a) => a.sequences.slice(1))];
    const paired: number[][][] = [];
    for (const alignment of alignments) {
      const coords = alignment.coords;
      for (let row = 1; row < coords.length; row++) paired.push(coords[0]!.map((v, k) => [v, coords[row]![k]!]));
    }
    const starts = new Set(paired.map((c) => c[0]![0]));
    const ends = new Set(paired.map((c) => c[c.length - 1]![0]));
    if (starts.size !== 1 || ends.size !== 1) throw new ValueError("Reference coordinates do not align consistently across pairwise alignments.");
    let referencePosition = [...starts][0]!;
    const cursor = paired.map(() => 0);
    const take = (i: number): number[] | undefined => paired[i]![cursor[i]!++];
    const stop = (): never => { const e = new Error("StopIteration"); e.name = "StopIteration"; throw e; };
    const positions = paired.map((_, i) => [...(take(i) ?? stop())]);
    const next = paired.map((_, i) => [...(take(i) ?? stop())]);
    const msa: number[][] = [[referencePosition, ...positions.map((p) => p[1]!)]];
    const MAX = Number.MAX_SAFE_INTEGER;
    for (;;) {
      if (next.every((p) => p[0] === MAX && p[1] === MAX)) break;
      const targetSteps = next.map((p) => p[0]! - referencePosition);
      const index = targetSteps.indexOf(Math.min(...targetSteps));
      const targetStep = targetSteps[index]!;
      const querySteps = next.map((p, i) => p[1]! - positions[i]![1]!);
      const queryStep = querySteps[index]!;
      referencePosition += targetStep;
      positions[index] = [...next[index]!];
      const following = take(index);
      next[index] = following ? [...following] : [MAX, MAX];
      if (targetStep === 0) {
        if (queryStep === 0) continue;
      } else {
        querySteps.forEach((step, i) => {
          if (i === index) return; // skip the sequence that just advanced
          const pos = positions[i]!;
          if (step > 0) { pos[0]! += targetStep; pos[1]! += targetStep; }
          else pos[0]! += targetStep;
        });
      }
      msa.push([referencePosition, ...positions.map((p) => p[1]!)]);
    }
    return new Alignment(sequences, transpose(msa));
  }

  /**
   * Recover sequences and coordinates from the lines of a printed alignment (`-` marks gaps); each line is a
   * `Uint8Array`.
   *
   * @throws TypeError for a line that is not bytes.
   */
  static parsePrintedAlignment(lines: Uint8Array[]): ParsedAlignment {
    for (const line of lines) if (!(line instanceof Uint8Array)) throw new TypeError(`argument 1 must be bytes, not ${typeof line === "string" ? "str" : typeof line}`);
    return parsePrintedAlignment(lines);
  }

  /**
   * Compose with another alignment: `this` aligns a target to a query, `alignment` aligns that query (as its target)
   * to a third sequence; the result aligns the target directly to the third sequence.
   *
   * @throws {@link ValueError} when the query length differs from the other target length, or steps are inconsistent.
   */
  map(alignment: Alignment): Alignment {
    return mapAlignment(this, alignment, (sequences, coordinates) => new Alignment(sequences, coordinates));
  }

  /** Map each pairwise alignment in `alignments` through this (multiple) alignment and combine them. */
  mapall(alignments: Iterable<Alignment>): Alignment {
    return mapAll(this, [...alignments], (sequences, coordinates) => new Alignment(sequences, coordinates));
  }

  /**
   * Count identities, mismatches and gaps (by side and kind). Pass an aligner to also get the gap and substitution
   * scores, a substitution matrix to count positives and the matrix score, or a wildcard letter to ignore.
   *
   * @throws {@link ValueError} for an unexpected argument or letters missing from the substitution matrix.
   */
  counts(scoring: CountScoring = null): AlignmentCounts {
    return countAlignment(this, scoring);
  }

  /** The frequency of each letter in each column, weighted by `annotations["weight"]` of record sequences. */
  get frequencies(): Map<string, Float64Array> {
    return frequencies(this);
  }

  /** The matrix of substitution counts between aligned letters. */
  get substitutions(): SubstitutionArray {
    return substitutions(this);
  }

  /** The printed alignment (`str(alignment)`). */
  toString(): string {
    return this.format();
  }
}
