/** `Vector` and the rotation helpers of Biopython's `Bio.PDB.vectors` (NumPy float64 semantics). */

import { IndexError, ValueError, pyTypeName, warn } from "@biolibs/core";
import { fixed } from "./pyformat.js";

/** A matrix as rows of numbers (a NumPy 2-D array). */
export type Matrix = number[][];

/** Category of the warnings NumPy raises for invalid arithmetic. */
export const RUNTIME_WARNING = "RuntimeWarning";

/** Python `min(a, b)`: `b` only if it compares smaller, so NaN in `a` is kept. */
export const pyMin = (a: number, b: number): number => (b < a ? b : a);
/** Python `max(a, b)`: `b` only if it compares larger, so NaN in `b` is dropped. */
export const pyMax = (a: number, b: number): number => (b > a ? b : a);

/** `np.sqrt`, warning (and giving NaN) for a negative argument. */
export function npSqrt(x: number): number {
  if (x < 0) warn("invalid value encountered in sqrt", RUNTIME_WARNING);
  return Math.sqrt(x);
}

/**
 * `np.linalg.det` of a 2x2 matrix as NumPy computes it: LU factorisation with partial pivoting, then
 * `sign * exp(sum(log|diag|))`. Mirroring that (rather than `ad - bc`) reproduces its rounding.
 *
 * @param m - `[[a, b], [c, d]]`.
 * @returns The determinant (0 for a singular matrix).
 */
export function det2(m: [[number, number], [number, number]]): number {
  let [[a, b], [c, d]] = m;
  let sign = 1;
  if (Math.abs(c) > Math.abs(a)) { [a, b, c, d] = [c, d, a, b]; sign = -1; }
  if (a === 0) return 0;
  const l = c / a;
  const u = d - l * b;
  if (u === 0) return 0;
  let logdet = 0;
  for (const x of [a, u]) {
    if (x < 0) sign = -sign;
    logdet += Math.log(Math.abs(x));
  }
  return sign * Math.exp(logdet);
}

/** Warn the way NumPy does for a float division that produced inf or nan. */
function divWarn(num: number, den: number, kind: "scalar divide" | "divide"): void {
  if (den === 0 && !Number.isNaN(num)) warn(num === 0 ? `invalid value encountered in ${kind}` : `divide by zero encountered in ${kind}`, RUNTIME_WARNING);
}

/** Broadcast a scalar or short list against 3 components, as `np.array(other)` would in `self._ar + other`. */
function broadcast3(other: number | readonly number[]): number[] {
  if (typeof other === "number") return [other, other, other];
  if (other.length === 3) return [...other];
  if (other.length === 1) return [other[0]!, other[0]!, other[0]!];
  throw new ValueError(`operands could not be broadcast together with shapes (3,) (${other.length},) `);
}

/** `np.dot(matrix, v)` for a matrix with 3 columns. */
function dotMV(matrix: Matrix, v: readonly number[]): number[] {
  const cols = matrix[0]?.length ?? 0;
  if (cols !== v.length) throw new ValueError(`shapes (${matrix.length},${cols}) and (${v.length},) not aligned: ${cols} (dim 1) != ${v.length} (dim 0)`);
  return matrix.map((row) => row.reduce((s, x, k) => s + x * v[k]!, 0));
}

/** A 3D vector (float64), with Biopython's operators spelled as methods. */
export class Vector {
  /** The coordinates. */
  ar: number[];

  /**
   * @param x - Three numbers `(x, y, z)`, or one array of 3 numbers.
   * @param y - Second coordinate (missing coordinates become NaN, as `None` does in NumPy).
   * @param z - Third coordinate.
   * @throws ValueError for an array that does not have 3 elements, TypeError for a lone number.
   */
  constructor(x: number | readonly number[], y?: number | null, z?: number | null) {
    if ((y === undefined || y === null) && (z === undefined || z === null)) {
      if (typeof x === "number") throw new TypeError(`object of type '${pyTypeName(x)}' has no len()`);
      if (x.length !== 3) throw new ValueError("Vector: x is not a list/tuple/array of 3 numbers");
      this.ar = [...x];
    } else {
      this.ar = [x as number, y ?? Number.NaN, z ?? Number.NaN];
    }
  }

  /** @returns Python's `repr`, e.g. `<Vector 1.00, 2.00, 3.00>`. */
  repr(): string { return `<Vector ${fixed(this.ar[0]!, 2)}, ${fixed(this.ar[1]!, 2)}, ${fixed(this.ar[2]!, 2)}>`; }
  /** @returns `-self`. */
  neg(): Vector { return new Vector(this.ar.map((a) => -a)); }
  /** @param other - A vector, a scalar or a list (broadcast). @returns `self + other`. */
  add(other: Vector | number | readonly number[]): Vector {
    const b = other instanceof Vector ? other.ar : broadcast3(other);
    return new Vector(this.ar.map((a, i) => a + b[i]!));
  }
  /** @param other - A vector, a scalar or a list (broadcast). @returns `self - other`. */
  sub(other: Vector | number | readonly number[]): Vector {
    const b = other instanceof Vector ? other.ar : broadcast3(other);
    return new Vector(this.ar.map((a, i) => a - b[i]!));
  }
  /** @param other - A vector. @returns The dot product (Python's `self * other`). @throws TypeError for a non-vector. */
  dot(other: Vector): number {
    if (!(other instanceof Vector)) throw new TypeError(`'${pyTypeName(other)}' object has no attribute '_ar'`);
    return this.ar.reduce((s, a, i) => s + a * other.ar[i]!, 0);
  }
  /** @param x - A scalar or list. @returns `self / x`, warning like NumPy on division by zero. */
  div(x: number | readonly number[]): Vector {
    const d = broadcast3(x);
    // NumPy warns once per kind per operation: divide-by-zero first, then invalid (0/0).
    if (this.ar.some((a, i) => d[i] === 0 && a !== 0 && !Number.isNaN(a))) warn("divide by zero encountered in divide", RUNTIME_WARNING);
    if (this.ar.some((a, i) => d[i] === 0 && a === 0)) warn("invalid value encountered in divide", RUNTIME_WARNING);
    return new Vector(this.ar.map((a, i) => a / d[i]!));
  }
  /** @param other - A vector (cross product) or scalar/list (component-wise product). @returns `self ** other`. */
  cross(other: Vector | number | readonly number[]): Vector {
    if (other instanceof Vector) {
      const [a, b, c] = this.ar as [number, number, number];
      const [d, e, f] = other.ar as [number, number, number];
      return new Vector(det2([[b, c], [e, f]]), -det2([[a, c], [d, f]]), det2([[a, b], [d, e]]));
    }
    const m = broadcast3(other);
    return new Vector(this.ar.map((a, i) => a * m[i]!));
  }
  /** @param i - An index (negative counts from the end). @returns The component. @throws IndexError out of range. */
  get(i: number): number {
    if (i < -3 || i > 2) throw new IndexError(`index ${i} is out of bounds for axis 0 with size 3`);
    return this.ar[i < 0 ? i + 3 : i]!;
  }
  /** @param i - An index. @param value - The new component. @throws IndexError out of range. */
  set(i: number, value: number): void {
    this.get(i);
    this.ar[i < 0 ? i + 3 : i] = value;
  }
  /** @param x - A number. @returns Whether it equals a component (`x in vector`). */
  has(x: number): boolean { return this.ar.some((a) => a === x); }
  /** @returns The Euclidean norm. */
  norm(): number { return Math.sqrt(this.ar.reduce((s, a) => s + a * a, 0)); }
  /** @returns The squared norm. */
  normsq(): number { return Math.abs(this.ar.reduce((s, a) => s + a * a, 0)); }
  /** Scale to unit length in place (a zero vector is left alone). */
  normalize(): void {
    const n = this.norm();
    if (n) this.ar = this.ar.map((a) => a / n);
  }
  /** @returns A normalised copy. */
  normalized(): Vector { const v = this.copy(); v.normalize(); return v; }
  /** @param other - A vector. @returns The angle between the two, in radians (π for zero-length input, via NaN). */
  angle(other: Vector): number {
    const n1 = this.norm(), n2 = other.norm();
    const num = this.dot(other), den = n1 * n2;
    divWarn(num, den, "scalar divide");
    let c = num / den;
    // Guard against rounding outside [-1, 1]; Python's min/max keep or drop NaN asymmetrically.
    c = pyMin(c, 1);
    c = pyMax(-1, c);
    return Math.acos(c);
  }
  /** @returns A copy of the coordinates. */
  getArray(): number[] { return [...this.ar]; }
  /** @param matrix - Rows of numbers with 3 columns. @returns `matrix · self`. */
  leftMultiply(matrix: Matrix): Vector { return new Vector(dotMV(matrix, this.ar)); }
  /** @param matrix - A 3-row matrix. @returns `self · matrix`. */
  rightMultiply(matrix: Matrix): Vector {
    const cols = matrix[0]?.length ?? 0;
    if (matrix.length !== 3) throw new ValueError(`shapes (3,) and (${matrix.length},${cols}) not aligned: 3 (dim 0) != ${matrix.length} (dim 0)`);
    return new Vector(Array.from({ length: cols }, (_, j) => this.ar.reduce((s, a, i) => s + a * matrix[i]![j]!, 0)));
  }
  /** @returns A copy. */
  copy(): Vector { return new Vector(this.ar); }
}
