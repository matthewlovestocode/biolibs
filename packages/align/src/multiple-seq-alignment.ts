/** `MultipleSeqAlignment`: a classical multiple sequence alignment held as equal-length `SeqRecord`s. */

import { IndexError, NotImplementedError, ValueError, pyEquals, pyTypeName } from "@biolibs/core";
import { RestrictedDict, SeqRecord, type LetterValue } from "@biolibs/seqrecord";
import type { PySlice } from "@biolibs/seq";

/** Function that renders an alignment in a file format (installed by `@biolibs/seqio`). */
export type AlignmentWriter = (alignment: MultipleSeqAlignment) => string;

/** `len(record.seq)`: a record without a sequence raises as Python's `len(None)` does. */
function seqLength(record: SeqRecord): number {
  if (record.seq === null) throw new TypeError("object of type 'NoneType' has no len()");
  return record.seq.length;
}

/** Python's `x[index]` on a list: int with wrap-around, or slice. */
function normalIndex(index: number, length: number): number {
  const i = index < 0 ? index + length : index;
  if (i < 0 || i >= length) throw new IndexError("list index out of range");
  return i;
}

/** Items selected from a list by a Python slice. */
function sliceList<T>(items: T[], s: PySlice): T[] {
  const n = items.length;
  const step = s.step ?? 1;
  if (step === 0) throw new ValueError("slice step cannot be zero");
  const clamp = (v: number | null | undefined, lo: number, hi: number, dflt: number): number => {
    if (v === null || v === undefined) return dflt;
    const w = v < 0 ? v + n : v;
    return Math.min(Math.max(w, lo), hi);
  };
  const out: T[] = [];
  if (step > 0) {
    for (let i = clamp(s.start, 0, n, 0); i < clamp(s.stop, 0, n, n); i += step) out.push(items[i]!);
  } else {
    for (let i = clamp(s.start, -1, n - 1, n - 1); i > clamp(s.stop, -1, n - 1, -1); i += step) out.push(items[i]!);
  }
  return out;
}

const isSlice = (x: unknown): x is PySlice => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * A multiple sequence alignment: a list of `SeqRecord`s that all have the same length, plus alignment-level
 * `annotations` and per-column annotations.
 *
 * @example
 * ```ts
 * const aln = new MultipleSeqAlignment([new SeqRecord(new Seq("AC-T"), "a"), new SeqRecord(new Seq("ACGT"), "b")]);
 * aln.getAlignmentLength();   // 4
 * ```
 */
export class MultipleSeqAlignment implements Iterable<SeqRecord> {
  /** Format writers by name, installed by `@biolibs/seqio` so that {@link MultipleSeqAlignment.format} works. */
  static writers = new Map<string, AlignmentWriter>();

  private records: SeqRecord[] = [];
  /** Alignment-level annotations. */
  annotations: Map<string, unknown>;
  private perColumn: RestrictedDict | null = null;
  /** Clustal consensus and similar extras that readers attach (`alignment._version` in Python). */
  [key: string]: unknown;

  /**
   * @param records - The sequences; they must all have the same length.
   * @param alphabet - Not supported; must be null.
   * @param annotations - Alignment annotations.
   * @param columnAnnotations - Per-column annotations (need at least one record).
   * @throws {@link ValueError} for different lengths, an alphabet, or column annotations without records.
   * @throws TypeError for a non-`SeqRecord` or non-dict annotations.
   */
  constructor(records: Iterable<SeqRecord> | null, alphabet: null | undefined = null, annotations: Map<string, unknown> | null = null, columnAnnotations: Map<string, LetterValue> | null = null) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    // A generator is always truthy in Python; an empty list is not.
    if (records !== null && (!Array.isArray(records) || records.length > 0)) this.extend(records);
    if (annotations === null) annotations = new Map();
    else if (!(annotations instanceof Map)) throw new TypeError("annotations argument should be a dict");
    this.annotations = annotations;
    this.columnAnnotations = columnAnnotations ?? new Map();
  }

  /** Per-column annotations; each value must be as long as the alignment. */
  get columnAnnotations(): RestrictedDict {
    if (this.perColumn === null) this.perColumn = new RestrictedDict(this.records.length ? this.getAlignmentLength() : 0);
    return this.perColumn;
  }

  set columnAnnotations(value: Map<string, LetterValue>) {
    if (!(value instanceof Map)) throw new TypeError("The per-column-annotations should be a (restricted) dictionary.");
    if (this.records.length > 0) {
      this.perColumn = new RestrictedDict(this.getAlignmentLength());
      this.perColumn.update(value);
    } else {
      this.perColumn = null;
      if (value.size > 0) throw new ValueError("Can't set per-column-annotations without an alignment");
    }
  }

  private strLine(record: SeqRecord, length = 50): string {
    seqLength(record);
    const text = record.seq!.toString();
    if (text.length <= length) return `${text} ${record.id}`;
    return `${text.slice(0, length - 6)}...${text.slice(-3)} ${record.id}`;
  }

  /** A summary: the shape, then one line per record (long sequences shortened; more than 20 rows are abbreviated). */
  toString(): string {
    const rows = this.records.length;
    const lines = [`Alignment with ${rows} rows and ${this.getAlignmentLength()} columns`];
    if (rows <= 20) lines.push(...this.records.map((r) => this.strLine(r)));
    else {
      lines.push(...this.records.slice(0, 18).map((r) => this.strLine(r)));
      lines.push("...");
      lines.push(this.strLine(this.records[rows - 1]!));
    }
    return lines.join("\n");
  }

  /**
   * The alignment in a file format (Python's `format(alignment, "clustal")`); no format gives the summary of {@link MultipleSeqAlignment.toString}.
   *
   * @throws {@link ValueError} for a format that cannot be written.
   */
  format(formatSpec = ""): string {
    if (!formatSpec) return this.toString();
    const writer = MultipleSeqAlignment.writers.get(formatSpec);
    if (writer === undefined) throw new ValueError(`Unknown format '${formatSpec}'`);
    return writer(this);
  }

  [Symbol.iterator](): Iterator<SeqRecord> {
    return this.records[Symbol.iterator]();
  }

  /** Number of records (rows). */
  get length(): number {
    return this.records.length;
  }

  /** Length of the longest record. */
  getAlignmentLength(): number {
    let max = 0;
    for (const record of this.records) if (seqLength(record) > max) max = seqLength(record);
    return max;
  }

  /**
   * Add several records; each must be as long as the first (or as the existing alignment).
   *
   * @throws {@link ValueError} for different lengths; TypeError for something that is not a `SeqRecord`.
   */
  extend(records: Iterable<SeqRecord>): void {
    let expected: number;
    const iterator = records[Symbol.iterator]();
    if (this.records.length > 0) {
      expected = this.getAlignmentLength();
    } else {
      const first = iterator.next();
      if (first.done) return;
      const size = (first.value as unknown as { length?: unknown }).length;
      if (typeof size !== "number") throw new TypeError(`object of type '${pyTypeName(first.value)}' has no len()`);
      expected = size;
      this.appendChecked(first.value, expected);
      this.columnAnnotations = new Map();
    }
    for (let next = iterator.next(); !next.done; next = iterator.next()) this.appendChecked(next.value, expected);
  }

  /** Add one record. */
  append(record: SeqRecord): void {
    if (this.records.length > 0) this.appendChecked(record, this.getAlignmentLength());
    else this.appendChecked(record, null);
  }

  private appendChecked(record: SeqRecord, expected: number | null): void {
    if (!(record instanceof SeqRecord)) throw new TypeError("New sequence is not a SeqRecord object");
    if (expected !== null && record.length !== expected) throw new ValueError("Sequences must all be the same length");
    this.records.push(record);
  }

  /**
   * Join two alignments with the same number of rows side by side.
   *
   * @throws {@link NotImplementedError} for a non-alignment; {@link ValueError} for different row counts.
   */
  add(other: MultipleSeqAlignment): MultipleSeqAlignment {
    if (!(other instanceof MultipleSeqAlignment)) throw new NotImplementedError("");
    if (this.length !== other.length) throw new ValueError("When adding two alignments they must have the same length (i.e. same number of rows)");
    const merged = this.records.map((left, i) => left.add(other.records[i]!) as SeqRecord);
    const annotations = new Map<string, unknown>();
    for (const [k, v] of this.annotations) if (other.annotations.has(k) && pyEquals(other.annotations.get(k), v)) annotations.set(k, v);
    const columnAnnotations = new Map<string, LetterValue>();
    for (const [k, v] of this.columnAnnotations) {
      if (other.columnAnnotations.has(k)) {
        const w = other.columnAnnotations.get(k)!;
        columnAnnotations.set(k, typeof v === "string" ? v + (w as string) : [...v, ...(w as unknown[])]);
      }
    }
    return new MultipleSeqAlignment(merged, null, annotations, columnAnnotations);
  }

  /** The record at a row (negative counts from the end). @throws {@link IndexError} if out of range. */
  at(row: number): SeqRecord {
    return this.records[normalIndex(row, this.records.length)]!;
  }

  /**
   * Python's `alignment[row]`, `alignment[rows]`, `alignment[row, col]` and the slice combinations.
   *
   * - one integer: that record;
   * - one slice: a new alignment of those rows;
   * - integer row and integer column: one letter; integer row and slice column: part of one record;
   * - slice rows and integer column: that column as a string; slice rows and slice columns: a new alignment.
   */
  get(row: number, col: number): string;
  get(row: number, col: PySlice): SeqRecord;
  get(row: PySlice, col: number): string;
  get(row: PySlice, col: PySlice): MultipleSeqAlignment;
  get(row: number): SeqRecord;
  get(row: PySlice): MultipleSeqAlignment;
  get(row: number | PySlice, col?: number | PySlice): SeqRecord | string | MultipleSeqAlignment {
    if (col === undefined) {
      if (typeof row === "number") return this.at(row);
      const sliced = new MultipleSeqAlignment(sliceList(this.records, row));
      if (this.columnAnnotations.size > 0 && sliced.length === this.length) for (const [k, v] of this.columnAnnotations) sliced.columnAnnotations.set(k, v);
      return sliced;
    }
    if (typeof row === "number") {
      const rec = this.at(row);
      return typeof col === "number" ? rec.get(col) : rec.get(col);
    }
    const rows = sliceList(this.records, row);
    if (typeof col === "number") return rows.map((rec) => rec.get(col)).join("");
    const sliced = new MultipleSeqAlignment(rows.map((rec) => rec.get(col)));
    if (this.columnAnnotations.size > 0 && sliced.length === this.length) {
      for (const [k, v] of this.columnAnnotations) {
        sliced.columnAnnotations.set(k, typeof v === "string" ? sliceString(v, col) : sliceList(v, col));
      }
    }
    return sliced;
  }

  /** Remove the record at a row, or the rows selected by a slice. */
  delete(index: number | PySlice): void {
    if (typeof index === "number") this.records.splice(normalIndex(index, this.records.length), 1);
    else if (isSlice(index)) {
      const drop = new Set(sliceList(this.records, index));
      this.records = this.records.filter((r) => !drop.has(r));
    } else throw new TypeError("Invalid index type.");
  }

  /** Sort the records in place by id, or by a key function; `reverse` reverses the order (keeping ties stable). */
  sort(key: ((record: SeqRecord) => string | number) | null = null, reverse = false): void {
    const k = key ?? ((r: SeqRecord) => r.id as string);
    const sign = reverse ? -1 : 1;
    this.records.sort((a, b) => {
      const ka = k(a);
      const kb = k(b);
      return ka < kb ? -sign : ka > kb ? sign : 0;
    });
  }
}

/** A string selected by a Python slice. */
function sliceString(s: string, slice: PySlice): string {
  return sliceList([...s], slice).join("");
}
