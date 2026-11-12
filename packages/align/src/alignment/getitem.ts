/**
 * `alignment[key]`: Biopython's alignment indexing. A key is an integer (one row, as a string with gaps), a slice (a
 * sub-alignment of those rows), or a pair `[row, column]` in which each part is an integer, a slice or (for the
 * column) a list of integers. Each branch follows Biopython's code, including its errors.
 */

import { IndexError, ValueError, pyTypeName } from "@biolibs/core";
import { MutableSeq, Seq, sliceIndices, type PySlice } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import type { Alignment } from "./alignment.js";
import { alignedColumns, allNonNegative, allNonPositive, columnMax, diffRows, select, type Matrix } from "./coords.js";
import { parsePrintedAlignment } from "./printed-alignment.js";
import {
  boundsError, cumsum, itemAt, itemsOf, lengthOf, npAt, reverseComplementOf, searchLeft, searchRight, sliceList, sliceText, unwrap, type Items,
} from "./sequence-utils.js";

/** Builds an `Alignment` (passed in so this module need not import the class). */
export type Maker = (sequences: unknown[], coordinates: Matrix | null) => Alignment;

/** A row key: an integer or a slice. */
export type RowKey = number | PySlice;
/** A column key: an integer, a slice, or a list of integers. */
export type ColumnKey = number | PySlice | readonly unknown[];
/** What `alignment.get` accepts: one row key, or a `[row, column]` pair. */
export type AlignmentKey = RowKey | readonly [RowKey, ColumnKey];

const isSlice = (x: unknown): x is PySlice => x !== null && typeof x === "object" && !Array.isArray(x) && !ArrayBuffer.isView(x);
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** Text with gaps for each row (strings), or items with `null` gaps (lists). */
type Line = string | unknown[];

/** The `str` of a sliced sequence, as Python's `str(sequence[a:b])` gives it. */
function sliceString(items: Items, a: number, b: number): string {
  if ("text" in items) return sliceText(items.text, a, b);
  return `[${sliceList(items.list, a, b).map((x) => (typeof x === "string" ? `'${x}'` : String(x))).join(", ")}]`;
}

/** `alignment[index]` for an integer: the row as text with `-` for gaps (or a list with `null`s). */
export function getRow(alignment: Alignment, index: number): Line {
  const coordinates = alignment.coordinates!;
  const steps = diffRows(coordinates);
  const n = steps.length;
  if (index < 0) {
    index += n;
    if (index < 0) throw new IndexError("row index out of range");
  } else if (index >= n) throw new IndexError("row index out of range");
  const aligned = alignedColumns(steps);
  let coords = coordinates[index]!;
  let sequence: unknown = alignment.sequences[index];
  for (let i = 0; i < n; i++) {
    const as = select(steps[i]!, aligned);
    if (as.filter((v) => v > 0).length < as.filter((v) => v < 0).length) {
      steps[i] = steps[i]!.map((v) => -v);
      if (i === index) {
        sequence = reverseComplementOf(sequence);
        const len = lengthOf(sequence);
        coords = coords.map((v) => len - v);
      }
    }
  }
  const gaps = columnMax(steps);
  sequence = unwrap(sequence);
  const row = steps[index]!;
  let k = coords[0]!;
  const asText = typeof sequence === "string" || sequence instanceof Seq;
  const items = itemsOf(sequence);
  if (asText) {
    let line = "";
    row.forEach((step, q) => {
      if (step > 0) { const j = k + step; line += sliceString(items, k, j); k = j; }
      else if (step < 0) k += step;
      else line += "-".repeat(gaps[q]!);
    });
    return line;
  }
  const line: unknown[] = [];
  row.forEach((step, q) => {
    if (step > 0) { const j = k + step; line.push(...sliceList((items as { list: unknown[] }).list, k, j)); k = j; }
    else line.push(...new Array<null>(gaps[q]!).fill(null));
  });
  return line;
}

/** `alignment[slice]`: the alignment of a subset of the rows (score and column annotations kept when all rows are). */
export function getRows(alignment: Alignment, key: PySlice, make: Maker): Alignment {
  const rows = sliceIndices(key, alignment.sequences.length);
  const pick = <T>(items: T[]): T[] => {
    const out: T[] = [];
    const [start, stop, step] = rows;
    for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(items[i]!);
    return out;
  };
  const sequences = pick(alignment.sequences);
  const coordinates = pick(alignment.coordinates!).map((r) => [...r]);
  const result = make(sequences, coordinates);
  if (JSON.stringify(alignment.coordinates) === JSON.stringify(coordinates)) {
    if (alignment.score !== undefined) result.score = alignment.score;
    if (alignment.columnAnnotations !== undefined) result.columnAnnotations = alignment.columnAnnotations;
  }
  return result;
}

/** One cell: the letter at alignment column `col` of a row, or `-`. */
function getRowCol(j: number, col: number, steps: number[], gaps: number[], sequence: unknown): unknown {
  const indices = cumsum(gaps);
  const index = searchRight(indices, col);
  if (npAt(steps, index)) {
    const offset = col - npAt(indices, index);
    j += steps.slice(0, index + 1).reduce((a, b) => a + b, 0) + offset;
    return itemAt(itemsOf(sequence), j);
  }
  return "-";
}

/** A contiguous run of columns of one row. */
function getRowColsSlice(coordinate: number[], startIndex: number, stopIndex: number, steps: number[], gaps: number[], sequence: unknown): Line {
  const indices = cumsum(gaps);
  let i = searchRight(indices, startIndex);
  const j = i + searchRight(indices.slice(i), stopIndex);
  const items = itemsOf(sequence);
  const text = "text" in items;
  const dashes = (n: number): Line => (text ? "-".repeat(Math.max(n, 0)) : new Array<null>(Math.max(n, 0)).fill(null));
  const take = (a: number, b: number): Line => (text ? sliceString(items, a, b) : sliceList((items as { list: unknown[] }).list, a, b));
  const add = (line: Line, more: Line): Line => (typeof line === "string" ? line + (more as string) : [...line, ...(more as unknown[])]);
  let line: Line;
  if (i === j) {
    const length = stopIndex - startIndex;
    if (npAt(steps, i) === 0) line = dashes(length);
    else {
      let start = npAt(coordinate, i) + startIndex;
      if (i > 0) start -= indices[i - 1]!;
      line = take(start, start + length);
    }
  } else {
    let length = npAt(indices, i) - startIndex;
    if (npAt(steps, i) === 0) line = dashes(length);
    else {
      const stop = npAt(coordinate, i + 1);
      line = take(stop - length, stop);
    }
    i += 1;
    while (i < j) {
      const step = npAt(gaps, i);
      if (npAt(steps, i) === 0) line = add(line, dashes(step));
      else line = add(line, take(npAt(coordinate, i), npAt(coordinate, i + 1)));
      i += 1;
    }
    length = stopIndex - npAt(indices, i - 1);
    if (length > 0) {
      if (npAt(steps, text ? i : j) === 0) line = add(line, dashes(length));
      else {
        const start = npAt(coordinate, i);
        line = add(line, take(start, start + length));
      }
    }
  }
  return line;
}

/** Columns of one row selected by a list of integers. */
function getRowColsIterable(coordinate: number[], cols: Iterable<unknown>, gaps: number[], sequence: unknown): Line {
  const items = itemsOf(sequence);
  const text = "text" in items;
  let full: unknown[] = [];
  let start = coordinate[0]!;
  coordinate.slice(1).forEach((end, q) => {
    if (start < end) full.push(...(text ? Array.from(sliceString(items, start, end)) : sliceList((items as { list: unknown[] }).list, start, end)));
    else full.push(...new Array(gaps[q]!).fill(text ? "-" : null));
    start = end;
  });
  const picked: unknown[] = [];
  try {
    for (const col of cols) {
      if (!isInt(col)) throw new TypeError("not an integer");
      const k = col < 0 ? col + full.length : col;
      if (k < 0 || k >= full.length) throw new IndexError(text ? "string index out of range" : "list index out of range");
      picked.push(full[k]);
    }
  } catch (e) {
    if (e instanceof IndexError) throw e;
    throw new TypeError("second index must be an integer, slice, or iterable of integers");
  }
  full = picked;
  return text ? full.join("") : full;
}

/** One column across a slice of rows: the letters (or `-`) as a string. */
function getRowsCol(coordinates: Matrix, col: number, steps: Matrix, gaps: number[], sequences: unknown[]): string {
  const indices = cumsum(gaps);
  const j = searchRight(indices, col);
  const offset = npAt(indices, j) - col;
  let line = "";
  sequences.forEach((sequence, r) => {
    if (npAt(steps[r]!, j) === 0) line += "-";
    else line += String(itemAt(itemsOf(sequence), npAt(coordinates[r]!, j) + npAt(steps[r]!, j) - offset));
  });
  return line;
}

/** A contiguous run of columns of several rows: a new alignment. */
function getRowsColsSlice(alignment: Alignment, make: Maker, coordinates: Matrix, rowKey: PySlice, startIndex: number, stopIndex: number, steps: Matrix, gaps: number[]): Alignment {
  const nRows = alignment.sequences.length;
  const [r0, r1, rs] = sliceIndices(rowKey, nRows);
  const pickRows: number[] = [];
  for (let i = r0; rs > 0 ? i < r1 : i > r1; i += rs) pickRows.push(i);
  const original = pickRows.map((r) => alignment.coordinates![r]!);
  const rcs = coordinates.map((row, r) => row.some((v, k) => v !== original[r]![k]));
  const indices = cumsum(gaps);
  const i = searchRight(indices, startIndex);
  const j = i + searchLeft(indices.slice(i), stopIndex) + 1;
  const iStep = steps.map((s) => npAt(s, i));
  const offsetStart = iStep.map((s) => s - npAt(indices, i) + startIndex);
  coordinates.forEach((row, r) => { row[i]! += iStep[r]! > 0 ? offsetStart[r]! : 0; });
  const offsetEnd = npAt(indices, j - 1) - stopIndex;
  coordinates.forEach((row, r) => { if (j >= row.length) throw boundsError(j, row.length, 1); row[j]! -= npAt(steps[r]!, j - 1) > 0 ? offsetEnd : 0; });
  const sliced = coordinates.map((row) => row.slice(i, j + 1));
  const sequences = pickRows.map((r) => alignment.sequences[r]);
  sliced.forEach((row, r) => { if (rcs[r]) { const len = lengthOf(sequences[r]); for (let k = 0; k < row.length; k++) row[k] = len - row[k]!; } });
  const result = make(sequences, sliced);
  if (JSON.stringify(alignment.coordinates) === JSON.stringify(sliced) && alignment.score !== undefined) result.score = alignment.score;
  if (alignment.columnAnnotations !== undefined) {
    result.columnAnnotations = new Map();
    for (const [key, value] of alignment.columnAnnotations) {
      result.columnAnnotations.set(key, typeof value === "string" ? sliceText(value, startIndex, stopIndex) : sliceList(value as unknown[], startIndex, stopIndex));
    }
  }
  return result;
}

/** Selected columns of several rows: a new alignment re-derived from the printed lines. */
function getRowsColsIterable(alignment: Alignment, make: Maker, coordinates: Matrix, cols: Iterable<unknown>, steps: Matrix, gaps: number[], sequences: unknown[]): Alignment {
  if (cols === null || cols === undefined || typeof (cols as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") throw new TypeError(`'${pyTypeName(cols)}' object is not iterable`);
  const indices = [...cols];
  const lines: Uint8Array[] = [];
  sequences.forEach((sequence, i) => {
    const items = itemsOf(sequence);
    let line = "";
    let k = coordinates[i]![0]!;
    steps[i]!.forEach((step, q) => {
      if (step) { const j = k + step; line += sliceString(items, k, j); k = j; }
      else line += "-".repeat(gaps[q]!);
    });
    const chars = Array.from(line);
    let out = "";
    try {
      for (const index of indices) {
        if (!isInt(index)) throw new TypeError("not an integer");
        const p = index < 0 ? index + chars.length : index;
        if (p < 0 || p >= chars.length) throw new IndexError("string index out of range");
        out += chars[p];
      }
    } catch (e) {
      if (e instanceof IndexError) throw e;
      throw new TypeError("second index must be an integer, slice, or iterable of integers");
    }
    lines.push(new TextEncoder().encode(out));
  });
  const parsed = parsePrintedAlignment(lines);
  const result = sequences.map((sequence, i) => {
    const line = parsed.sequences[i]!;
    if (sequence instanceof SeqRecord) {
      const copy = new SeqRecord(sequence.seq, sequence.id, sequence.name, sequence.description, [...sequence.dbxrefs], [...sequence.features], new Map(sequence.annotations));
      const s = sequence.seq!;
      copy.seq = s instanceof MutableSeq ? new MutableSeq(line) : new Seq(line);
      return copy;
    }
    if (typeof sequence === "string") return new TextDecoder().decode(line);
    if (Array.isArray(sequence)) return Array.from(line);
    if (sequence instanceof Uint8Array) return Uint8Array.from(line);
    if (sequence instanceof MutableSeq) return new MutableSeq(line);
    if (sequence instanceof Seq) return new Seq(line);
    throw new TypeError("sequence class cannot be built from bytes");
  });
  const aln = make(result, parsed.coordinates);
  if (alignment.columnAnnotations !== undefined) {
    aln.columnAnnotations = new Map();
    for (const [key, value] of alignment.columnAnnotations) {
      /** `value[index]` for a column annotation: Python's errors for a bad or out-of-range index. */
      const pickOne = (index: unknown): unknown => {
        const isText = typeof value === "string";
        if (!isInt(index)) throw new TypeError(isText ? `string indices must be integers, not '${pyTypeName(index)}'` : `list indices must be integers or slices, not ${pyTypeName(index)}`);
        const items = isText ? Array.from(value) : (value as unknown[]);
        const k = index < 0 ? index + items.length : index;
        if (k < 0 || k >= items.length) throw new IndexError(isText ? "string index out of range" : "list index out of range");
        return items[k];
      };
      const values = indices.map(pickOne);
      aln.columnAnnotations.set(key, typeof value === "string" ? values.join("") : values);
    }
  }
  return aln;
}

/**
 * `alignment[key]`.
 *
 * @throws {@link IndexError} for rows or columns out of range.
 * @throws TypeError for a key that is not an integer, a slice, or a pair.
 */
export function getItem(alignment: Alignment, key: AlignmentKey, make: Maker): string | unknown | unknown[] | Alignment {
  if (isInt(key)) return getRow(alignment, key);
  if (isSlice(key)) return getRows(alignment, key, make);
  const sequences = [...alignment.sequences];
  const coordinates = alignment.coordinates!.map((r) => [...r]);
  const steps = diffRows(coordinates);
  const aligned = alignedColumns(steps);
  sequences.forEach((sequence, i) => {
    const row = select(steps[i]!, aligned);
    if (allNonNegative(row)) return;
    if (allNonPositive(row)) {
      steps[i] = steps[i]!.map((v) => -v);
      const len = lengthOf(sequence);
      coordinates[i] = coordinates[i]!.map((v) => len - v);
      const rc = reverseComplementOf(sequence);
      if (rc instanceof SeqRecord && sequence instanceof SeqRecord) rc.id = sequence.id;
      sequences[i] = rc;
    } else throw new ValueError(`Inconsistent steps in row ${i}`);
  });
  const gaps = columnMax(steps);
  for (const row of steps) row.forEach((v, k) => { if (!(v === gaps[k] || v <= 0)) throw new ValueError("Unequal step sizes in alignment"); });
  const m = gaps.reduce((a, b) => a + b, 0);
  if (!Array.isArray(key)) throw new TypeError("alignment indices must be integers, slices, or tuples");
  if (key.length !== 2) throw new ValueError("only tuples of length 2 can be alignment indices");
  const [row, colKey] = key as [RowKey, ColumnKey];
  let col: ColumnKey = colKey;
  if (isInt(col)) {
    if (col < 0) col += m;
    if (col < 0 || col >= m) throw new IndexError(`column index ${col} is out of bounds (${m} columns)`);
  }
  const rowSteps: Matrix | number[] = isInt(row) ? npRow(steps, row) : isSlice(row) ? pickSlice(steps, row) : npFancy(steps, row);
  if (isInt(row)) {
    const sequence = sequences[row < 0 ? row + sequences.length : row];
    const idx = row < 0 ? row + coordinates.length : row;
    if (isInt(col)) return getRowCol(coordinates[idx]![0]!, col, rowSteps as number[], gaps, sequence);
    const coordinate = coordinates[idx]!;
    if (isSlice(col)) {
      const [start, stop, step] = sliceIndices(col, m);
      if (start < stop && step === 1) return getRowColsSlice(coordinate, start, stop, rowSteps as number[], gaps, sequence);
      col = rangeList(start, stop, step);
    }
    return getRowColsIterable(coordinate, col as Iterable<unknown>, gaps, sequence);
  }
  if (isSlice(row)) {
    const subSequences = pickSlice(sequences, row);
    const subCoordinates = pickSlice(coordinates, row);
    if (isInt(col)) return getRowsCol(subCoordinates, col, rowSteps as Matrix, gaps, subSequences);
    if (isSlice(col)) {
      const [start, stop, step] = sliceIndices(col, m);
      if (start < stop && step === 1) return getRowsColsSlice(alignment, make, subCoordinates, row, start, stop, rowSteps as Matrix, gaps);
      col = rangeList(start, stop, step);
    }
    return getRowsColsIterable(alignment, make, subCoordinates, col as Iterable<unknown>, rowSteps as Matrix, gaps, subSequences);
  }
  throw new TypeError("first index must be an integer or slice");
}

/** `range(start, stop, step)` as a list. */
function rangeList(start: number, stop: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(i);
  return out;
}

/** `array[row]` for an integer row of a 2-D array. */
function npRow(a: Matrix, row: number): number[] {
  const k = row < 0 ? row + a.length : row;
  if (k < 0 || k >= a.length) throw boundsError(row, a.length);
  return a[k]!;
}

/** `list[slice]` / `array[slice]`. */
function pickSlice<T>(items: T[], s: PySlice): T[] {
  const [start, stop, step] = sliceIndices(s, items.length);
  const out: T[] = [];
  for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(items[i]!);
  return out;
}

/** `steps[row]` for a row that is neither an integer nor a slice: valid integer lists index, anything else is NumPy's IndexError. */
function npFancy(a: Matrix, row: unknown): Matrix {
  if (Array.isArray(row) && row.every(isInt)) return (row as number[]).map((r) => npRow(a, r));
  throw new IndexError("only integers, slices (`:`), ellipsis (`...`), numpy.newaxis (`None`) and integer or boolean arrays are valid indices");
}
