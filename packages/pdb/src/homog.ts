/** Homogeneous-matrix geometry of Biopython's `Bio.PDB.vectors`: 4x4 rotations, translations, spherical coordinates and coordinate-space transforms. */

import { warn } from "@biolibs/core";
import type { Matrix } from "./vectors.js";

const identity4 = (): Matrix => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

/** `np.dot` of two matrices. */
function mm(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => b[0]!.map((_, j) => row.reduce((s, x, k) => s + x * b[k]![j]!, 0)));
}
/** `np.dot(matrix, vector)`. */
function mv(a: Matrix, v: readonly number[]): number[] {
  return a.map((row) => row.reduce((s, x, k) => s + x * v[k]!, 0));
}

/**
 * A 4x4 rotation matrix about one axis.
 *
 * @param angleRads - The angle in radians.
 * @param axis - `"x"`, `"y"` or `"z"`; anything else gives the x rotation, as in Biopython.
 */
export function homogRotMtx(angleRads: number, axis: string): Matrix {
  const c = Math.cos(angleRads), s = Math.sin(angleRads);
  if (axis === "z") return [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  if (axis === "y") return [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]];
  return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]];
}

/** Update a Z rotation matrix in place to a new angle. @param angleRads - Angle. @param mtx - The matrix. */
export function setZHomogRotMtx(angleRads: number, mtx: Matrix): void {
  const c = Math.cos(angleRads), s = Math.sin(angleRads);
  mtx[0]![0] = mtx[1]![1] = c;
  mtx[1]![0] = s;
  mtx[0]![1] = -s;
}
/** Update a Y rotation matrix in place to a new angle. @param angleRads - Angle. @param mtx - The matrix. */
export function setYHomogRotMtx(angleRads: number, mtx: Matrix): void {
  const c = Math.cos(angleRads), s = Math.sin(angleRads);
  mtx[0]![0] = mtx[2]![2] = c;
  mtx[0]![2] = s;
  mtx[2]![0] = -s;
}
/** Update an X rotation matrix in place to a new angle. @param angleRads - Angle. @param mtx - The matrix. */
export function setXHomogRotMtx(angleRads: number, mtx: Matrix): void {
  const c = Math.cos(angleRads), s = Math.sin(angleRads);
  mtx[1]![1] = mtx[2]![2] = c;
  mtx[2]![1] = s;
  mtx[1]![2] = -s;
}

/** A 4x4 translation matrix. @param x - X shift. @param y - Y shift. @param z - Z shift. */
export function homogTransMtx(x: number, y: number, z: number): Matrix {
  return [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]];
}
/** Update a translation matrix in place. @param x - X shift. @param y - Y shift. @param z - Z shift. @param mtx - The matrix. */
export function setHomogTransMtx(x: number, y: number, z: number, mtx: Matrix): void {
  mtx[0]![3] = x;
  mtx[1]![3] = y;
  mtx[2]![3] = z;
}
/** A 4x4 scaling matrix. @param scale - The multiplier. */
export function homogScaleMtx(scale: number): Matrix {
  return [[scale, 0, 0, 0], [0, scale, 0, 0], [0, 0, scale, 0], [0, 0, 0, 1]];
}

/** Azimuth of (x, y) with the axis cases (x or y zero) handled explicitly, as Biopython does. */
function getAzimuth(x: number, y: number): number {
  const signY = y < 0 ? -1 : 1;
  const signX = x < 0 ? -1 : 1;
  if (x !== 0 && y !== 0) return Math.atan2(y, x);
  if (y !== 0) return (Math.PI / 2) * signY;
  return signX < 0 ? Math.PI : 0;
}

/**
 * Spherical coordinates of a point.
 *
 * @param xyz - The point's coordinates (extra homogeneous components count toward the radius).
 * @returns `[r, azimuth, polar angle]`; all zero for the origin.
 */
export function getSphericalCoordinates(xyz: readonly number[]): [number, number, number] {
  const r = Math.sqrt(xyz.reduce((s, x) => s + x * x, 0));
  if (r === 0) return [0, 0, 0];
  return [r, getAzimuth(xyz[0]!, xyz[1]!), Math.acos(xyz[2]! / r)];
}

/**
 * The 4x4 matrix that moves three points into a standard frame: `a1` at the origin, `a2` on +Z and `a0` in the XZ plane.
 *
 * @param a0 - First point as a homogeneous 4-vector `[x, y, z, 1]`.
 * @param a1 - Second point (the origin of the new frame).
 * @param a2 - Third point (on the +Z axis).
 * @param rev - Also return the matrix that undoes the transform.
 * @returns `[forward, reverse]`; reverse is null unless `rev`.
 */
export function coordSpace(a0: readonly number[], a1: readonly number[], a2: readonly number[], rev = false): [Matrix, Matrix | null] {
  const tm = identity4(), mry = identity4(), mrz = identity4(), mrz2 = identity4();
  setHomogTransMtx(-a1[0]!, -a1[1]!, -a1[2]!, tm);
  const p = a2.map((x, i) => x - a1[i]!);
  const sc = getSphericalCoordinates(p);
  setZHomogRotMtx(-sc[1], mrz);
  setYHomogRotMtx(-sc[2], mry);
  let mt = mm(mry, mm(mrz, tm));
  const q = mv(mt, a0);
  const azimuth2 = getAzimuth(q[0]!, q[1]!);
  setZHomogRotMtx(-azimuth2, mrz2);
  mt = mm(mrz2, mt);
  if (!rev) return [mt, null];
  setZHomogRotMtx(azimuth2, mrz2);
  setYHomogRotMtx(sc[2], mry);
  setZHomogRotMtx(sc[1], mrz);
  setHomogTransMtx(a1[0]!, a1[1]!, a1[2]!, tm);
  return [mt, mm(tm, mm(mrz, mm(mry, mrz2)))];
}

/** Z rotation matrices for many angles. @param angleRads - The angles. @returns One 4x4 matrix per angle. */
export function multiRotZ(angleRads: readonly number[]): Matrix[] {
  return angleRads.map((a) => { const m = identity4(); m[0]![0] = m[1]![1] = Math.cos(a); m[1]![0] = Math.sin(a); m[0]![1] = -m[1]![0]; return m; });
}
/** Y rotation matrices for many angles. @param angleRads - The angles. @returns One 4x4 matrix per angle. */
export function multiRotY(angleRads: readonly number[]): Matrix[] {
  return angleRads.map((a) => { const m = identity4(); m[0]![0] = m[2]![2] = Math.cos(a); m[0]![2] = Math.sin(a); m[2]![0] = -m[0]![2]; return m; });
}

/**
 * {@link coordSpace} for many triples at once.
 *
 * @param a3 - For each entry, three homogeneous 4-vectors. Points with the second and third coinciding are undefined (NumPy leaves garbage).
 * @param dLen - Number of entries.
 * @param rev - Also return the reverse transforms.
 * @returns The forward matrices, or `[forward, reverse]` when `rev`.
 */
export function multiCoordSpace(a3: number[][][], dLen: number, rev = false): Matrix[] | [Matrix[], Matrix[]] {
  const tm = Array.from({ length: dLen }, (_, i) => { const m = identity4(); for (let k = 0; k < 3; k++) m[k]![3] = -a3[i]![1]![k]!; return m; });
  const p = a3.map((e) => [0, 1, 2].map((k) => e[2]![k]! - e[1]![k]!));
  const r = p.map((v) => Math.sqrt(v[0]! ** 2 + v[1]! ** 2 + v[2]! ** 2));
  const azimuth = p.map((v) => Math.atan2(v[1]!, v[0]!));
  // np.divide(..., where=...) without out= always warns about uninitialised memory.
  warn("'where' used without 'out', expect uninitialized memory in output. If this is intentional, use out=None.", "UserWarning");
  const polar = p.map((v, i) => Math.acos(v[2]! / r[i]!));
  const rz = multiRotZ(azimuth.map((a) => -a)), ry = multiRotY(polar.map((a) => -a));
  const mt0 = tm.map((t, i) => mm(ry[i]!, mm(rz[i]!, t)));
  const azimuth2 = mt0.map((m, i) => { const q = mv(m, a3[i]![0]!); return Math.atan2(q[1]!, q[0]!); });
  const rz2 = multiRotZ(azimuth2.map((a) => -a));
  const mt = mt0.map((m, i) => mm(rz2[i]!, m));
  if (!rev) return mt;
  const mrz2 = multiRotZ(azimuth2), mry = multiRotY(polar), mrz = multiRotZ(azimuth);
  const mr = tm.map((t, i) => { for (let k = 0; k < 3; k++) t[k]![3] = a3[i]![1]![k]!; return mm(mm(mm(t, mrz[i]!), mry[i]!), mrz2[i]!); });
  return [mt, mr];
}
