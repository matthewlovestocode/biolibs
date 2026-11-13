/** `_Matrix` and `DistanceMatrix`: symmetric matrices in lower triangular form, indexed by position or name. */

import { IndexError, ValueError, pyFormatFixed } from "@biolibs/core";
import { fl, isNumber, numRepr, pyAt, val, type PyNum } from "./num.js";

/** A matrix index: a position or a name, or a pair of them. */
export type MatrixIndex = number | string | [number | string, number | string];

/** Python's `str.expandtabs(tabsize)`. */
function expandTabs(text: string, tabsize: number): string {
  let out = "", column = 0;
  for (const ch of text) {
    if (ch === "\t") { const n = tabsize > 0 ? tabsize - (column % tabsize) : 0; out += " ".repeat(n); column += n; }
    else { out += ch; column = ch === "\n" || ch === "\r" ? 0 : column + 1; }
  }
  return out;
}

/** Base class of the distance and scoring matrices: names plus a lower triangular nested list (the diagonal included). */
export class Matrix {
  /** The element names. */
  names: string[];
  /** The values, row `i` having `i + 1` entries. */
  matrix: PyNum[][];

  /**
   * @param names - Distinct element names.
   * @param matrix - Lower triangular values; zeros (ints) by default. The list is kept, not copied.
   * @throws TypeError for bad types, ValueError for duplicate names or a wrong shape.
   */
  constructor(names: unknown, matrix: PyNum[][] | null = null) {
    if (Array.isArray(names) && names.every((s) => typeof s === "string")) {
      if (new Set(names).size === names.length) this.names = names as string[];
      else throw new ValueError("Duplicate names found");
    } else throw new TypeError("'names' should be a list of strings");
    if (matrix === null) this.matrix = Array.from({ length: this.names.length }, (_, i) => new Array<PyNum>(i + 1).fill(0));
    else if (Array.isArray(matrix) && matrix.every((row) => Array.isArray(row)) && matrix.every((row) => row.every(isNumber))) {
      if (matrix.length !== this.names.length) throw new ValueError("'names' and 'matrix' should be the same size");
      if (!matrix.every((row, i) => row.length === i + 1)) throw new ValueError("'matrix' should be in lower triangle format");
      this.matrix = matrix;
    } else throw new TypeError("'matrix' should be a list of numerical lists");
  }

  /** The number of names. */
  get length(): number { return this.names.length; }

  /** Resolve an index (position or name) to a position. */
  private single(item: number | string): number {
    let index: number;
    if (typeof item === "number") index = item;
    else if (this.names.includes(item)) index = this.names.indexOf(item);
    else throw new ValueError("Item not found.");
    if (index > this.length - 1) throw new IndexError("Index out of range.");
    return index;
  }

  /** Resolve a pair of indices. */
  private pair(item: [number | string, number | string]): [number, number] {
    let row: number, col: number;
    if (item.every((i) => typeof i === "number")) [row, col] = item as [number, number];
    else if (item.every((i) => typeof i === "string")) {
      const [r, c] = item as [string, string];
      if (this.names.includes(r) && this.names.includes(c)) { row = this.names.indexOf(r); col = this.names.indexOf(c); }
      else throw new ValueError("Item not found.");
    } else throw new TypeError("Invalid index type.");
    if (row > this.length - 1 || col > this.length - 1) throw new IndexError("Index out of range.");
    return [row, col];
  }

  /**
   * `m[item]`: a row of values for a position or name, or the value between two of them.
   *
   * @throws ValueError for an unknown name, IndexError for a position past the end, TypeError for a bad index.
   */
  get(item: MatrixIndex): PyNum | PyNum[] {
    if (typeof item === "number" || typeof item === "string") {
      const index = this.single(item);
      const out: PyNum[] = [];
      for (let i = 0; i < index; i++) out.push(pyAt(pyAt(this.matrix, index), i));
      for (let i = index; i < this.length; i++) out.push(pyAt(pyAt(this.matrix, i), index));
      return out;
    }
    if (Array.isArray(item) && item.length === 2) {
      const [row, col] = this.pair(item);
      return row > col ? pyAt(pyAt(this.matrix, row), col) : pyAt(pyAt(this.matrix, col), row);
    }
    throw new TypeError("Invalid index type.");
  }

  /** `m[row, col]` as a plain number. */
  at(row: number | string, col: number | string): number { return val(this.get([row, col]) as PyNum); }

  /**
   * `m[item] = value`: set a row of values, or one value.
   *
   * @throws ValueError / IndexError / TypeError as `get` does, and for a value of the wrong size or type.
   */
  set(item: MatrixIndex, value: PyNum | PyNum[]): void {
    if (typeof item === "number" || typeof item === "string") {
      const index = this.single(item);
      if (Array.isArray(value) && value.every(isNumber)) {
        if (value.length !== this.length) throw new ValueError("Value not the same size.");
        for (let i = 0; i < index; i++) pyAt(this.matrix, index)[i] = value[i]!;
        for (let i = index; i < this.length; i++) pyAt(this.matrix, i)[index] = value[i]!;
      } else throw new TypeError("Invalid value type.");
    } else if (Array.isArray(item) && item.length === 2) {
      const [row, col] = this.pair(item);
      if (isNumber(value)) {
        if (row > col) pyAt(this.matrix, row)[col] = value; else pyAt(this.matrix, col)[row] = value;
      } else throw new TypeError("Invalid value type.");
    } else throw new TypeError("Invalid index type.");
  }

  /** `del m[item]`: remove the row and column of a position or name. */
  delete(item: number | string): void {
    let index: number;
    if (typeof item === "number" && Number.isInteger(item)) index = item;
    else if (typeof item === "string") {
      index = this.names.indexOf(item);
      if (index < 0) throw new ValueError("list.index(x): x not in list");
    } else throw new TypeError("Invalid index type.");
    for (let i = index + 1; i < this.length; i++) pyAt(this.matrix, i).splice(index, 1);
    this.matrix.splice(index, 1);
    this.names.splice(index, 1);
  }

  /** Insert a name with a row of values at a position (default: the end). */
  insert(name: string, value: PyNum[], index: number | null = null): void {
    if (typeof name !== "string") throw new TypeError("Invalid name type.");
    const at = index === null ? this.length : index;
    if (typeof at !== "number") throw new TypeError("Invalid index type.");
    this.names.splice(at, 0, name);
    this.matrix.splice(at, 0, new Array<PyNum>(at).fill(0));
    for (let i = at; i < this.length; i++) this.matrix[i]!.splice(at, 0, 0);
    this.set(at, value);
  }

  /** The class name Python shows (`_Matrix` for the base class). */
  protected get pyName(): string { return this.constructor === Matrix ? "_Matrix" : this.constructor.name; }

  /** Python's `repr`. */
  repr(): string {
    const rows = this.matrix.map((r) => `[${r.map(numRepr).join(", ")}]`).join(", ");
    return `${this.pyName}(names=[${this.names.map((n) => `'${n.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`).join(", ")}], matrix=[${rows}])`;
  }

  /** The lower triangular matrix as text, tab-expanded to width 4. */
  toString(): string {
    const body = this.names.map((name, i) => name + "\t" + this.matrix[i]!.map((n) => pyFormatFixed(val(n), 6)).join("\t")).join("\n");
    return expandTabs(body + "\n\t" + this.names.join("\t"), 4);
  }
}

/** A distance matrix: the diagonal is always zero. */
export class DistanceMatrix extends Matrix {
  /** @param names - Element names. @param matrix - Lower triangular values (default zeros). */
  constructor(names: unknown, matrix: PyNum[][] | null = null) {
    super(names, matrix);
    this.setZeroDiagonal();
  }

  override set(item: MatrixIndex, value: PyNum | PyNum[]): void {
    super.set(item, value);
    this.setZeroDiagonal();
  }

  private setZeroDiagonal(): void { for (let i = 0; i < this.length; i++) this.matrix[i]![i] = 0; }

  /**
   * Write the matrix in PHYLIP distance format (the input of `neighbor`).
   *
   * @param handle - Anything with `write(text)`.
   */
  formatPhylip(handle: { write(text: string): unknown }): void {
    handle.write(`    ${this.names.length}\n`);
    const nameWidth = Math.max(12, Math.max(...this.names.map((n) => Array.from(n).length)) + 1);
    this.names.forEach((name, i) => {
      const values: PyNum[] = [...this.matrix[i]!];
      for (let j = i + 1; j < this.matrix.length; j++) values.push(this.matrix[j]![i]!);
      handle.write(name + " ".repeat(Math.max(0, nameWidth - Array.from(name).length)) + values.map((v) => pyFormatFixed(val(v), 4)).join("  ") + "\n");
    });
  }

  /** A float from a whole-number-aware division, for the tree algorithms. */
  static div(a: number, b: number): PyNum { return fl(a / b); }
}
