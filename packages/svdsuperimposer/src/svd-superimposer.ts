/** `SVDSuperimposer`: the rotation and translation that put one set of points on another with least squared distance. */

import { type Mat, det3, matMul, svd3, transpose } from "./svd.js";

/** Python's bare `Exception`, which Biopython raises for bad input here. */
export class PythonException extends Error {
  override name = "Exception";
}

/** Python's `ZeroDivisionError`. */
export class ZeroDivisionError extends Error {
  override name = "ZeroDivisionError";
}

/** Points as rows. `Float32Array` rows are single precision, anything else double. */
export type Points = ArrayLike<ArrayLike<number>>;

const isF32 = (p: Points): boolean => p.length > 0 && Array.from(p as ArrayLike<unknown>).every((r) => r instanceof Float32Array);
const toRows = (p: Points): number[][] => Array.from(p, (r) => Array.from(r));

/**
 * Superimpose two sets of 3D points.
 *
 * @example
 * ```ts
 * const sup = new SVDSuperimposer();
 * sup.set(reference, moving);   // `moving` will be put on `reference`
 * sup.run();
 * const [rot, tran] = sup.getRotran();   // right-multiplying: moved = moving · rot + tran
 * sup.getRms();
 * ```
 */
export class SVDSuperimposer {
  /** The points to superimpose on. */
  referenceCoords: Points | null = null;
  /** The points to move. */
  coords: Points | null = null;
  /** The moved points, once computed. */
  transformedCoords: Points | null = null;
  /** The right-multiplying rotation, once computed. */
  rot: Points | null = null;
  /** The translation, once computed. */
  tran: ArrayLike<number> | null = null;
  /** The RMSD after superposition, once computed. */
  rms: number | null = null;
  /** The RMSD before superposition, once computed. */
  initRms: number | null = null;
  /** Number of points. */
  n = 0;

  private single = false;

  private clear(): void {
    this.referenceCoords = this.coords = this.transformedCoords = this.rot = this.tran = this.rms = this.initRms = null;
  }

  /** Round to float32 when both inputs were single precision, as NumPy's dtype propagation does. */
  private out(x: number): number { return this.single ? Math.fround(x) : x; }

  private rmsOf(a: number[][], b: number[][]): number {
    const sums = [0, 0, 0];
    for (let i = 0; i < a.length; i++) for (let k = 0; k < 3; k++) sums[k]! += (a[i]![k]! - b[i]![k]!) ** 2;
    return Math.sqrt((sums[0]! + sums[1]! + sums[2]!) / a.length);
  }

  /**
   * Set the points. `coords` will be put on top of `referenceCoords`.
   *
   * @param referenceCoords - An Nx3 array.
   * @param coords - An Nx3 array.
   * @throws PythonException (`Exception`) unless both are Nx3 with the same N.
   */
  set(referenceCoords: Points, coords: Points): void {
    this.clear();
    this.referenceCoords = referenceCoords;
    this.coords = coords;
    const nCols = (p: Points): number => (p.length > 0 ? p[0]!.length : 3);   // an empty set stands for np.zeros((0, 3))
    if (referenceCoords.length !== coords.length || !(nCols(referenceCoords) === nCols(coords) && nCols(coords) === 3)) {
      throw new PythonException("Coordinate number/dimension mismatch.");
    }
    this.n = referenceCoords.length;
  }

  /**
   * Compute the superposition.
   *
   * @throws PythonException when no points were set; ZeroDivisionError for an empty set.
   */
  run(): void {
    if (this.coords === null || this.referenceCoords === null) throw new PythonException("No coordinates set.");
    this.single = isF32(this.coords) && isF32(this.referenceCoords);
    const coords = toRows(this.coords), ref = toRows(this.referenceCoords);
    if (this.n === 0) throw new ZeroDivisionError("division by zero");
    const mean = (p: number[][]): number[] => [0, 1, 2].map((k) => p.reduce((s, r) => s + r[k]!, 0) / this.n);
    const av1 = mean(coords), av2 = mean(ref);
    const c = coords.map((r) => r.map((x, k) => x - av1[k]!));
    const rf = ref.map((r) => r.map((x, k) => x - av2[k]!));
    const a = matMul(transpose(c), rf);
    const [u, , vt] = svd3(a);
    let rot = matMul(u, vt);
    if (det3(rot) < 0) {
      vt[2] = vt[2]!.map((x) => -x);
      rot = matMul(u, vt);
    }
    const tran = av2.map((x, k) => x - [0, 1, 2].reduce((s, i) => s + av1[i]! * rot[i]![k]!, 0));
    this.rot = this.single ? rot.map((r) => Float32Array.from(r)) : rot;
    this.tran = this.single ? Float32Array.from(tran) : tran;
  }

  /**
   * The moved points, `coords · rot + tran`.
   *
   * @throws PythonException when no points were set or `run` has not been called.
   */
  getTransformed(): Points {
    if (this.coords === null || this.referenceCoords === null) throw new PythonException("No coordinates set.");
    if (this.rot === null) throw new PythonException("Nothing superimposed yet.");
    if (this.transformedCoords === null) {
      const rot = toRows(this.rot), tran = Array.from(this.tran!);
      const moved = toRows(this.coords).map((r) => [0, 1, 2].map((k) => this.out(r.reduce((s, x, i) => s + x * rot[i]![k]!, 0) + tran[k]!)));
      this.transformedCoords = this.single ? moved.map((r) => Float32Array.from(r)) : moved;
    }
    return this.transformedCoords;
  }

  /**
   * The rotation (right-multiplying) and translation.
   *
   * @throws PythonException when `run` has not been called.
   */
  getRotran(): [Points, ArrayLike<number>] {
    if (this.rot === null) throw new PythonException("Nothing superimposed yet.");
    return [this.rot, this.tran!];
  }

  /**
   * The RMSD before superposition.
   *
   * @throws PythonException when no points were set.
   */
  getInitRms(): number {
    if (this.coords === null) throw new PythonException("No coordinates set yet.");
    if (this.initRms === null) this.initRms = this.out(this.rmsOf(toRows(this.coords), toRows(this.referenceCoords!)));
    return this.initRms;
  }

  /**
   * The RMSD after superposition.
   *
   * @throws PythonException when `run` has not been called.
   */
  getRms(): number {
    if (this.rms === null) this.rms = this.out(this.rmsOf(toRows(this.getTransformed()), toRows(this.referenceCoords!)));
    return this.rms;
  }
}
