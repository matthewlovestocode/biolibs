/** Rotation and angle functions of Biopython's `Bio.PDB.vectors`: axis/matrix conversion, reflections, angles and dihedrals. */

import { Vector, npSqrt, pyMax, pyMin, type Matrix } from "./vectors.js";

/**
 * The (angle, axis) pair of a rotation matrix. For the identity, any axis is valid and `(0, Vector(1, 0, 0))` is returned.
 *
 * @param m - A 3x3 rotation matrix.
 * @returns The angle in [0, π] and the unit axis.
 */
export function m2rotaxis(m: Matrix): [number, Vector] {
  const eps = 1e-5;
  const g = (i: number, j: number): number => m[i]![j]!;
  let angle: number;
  if (Math.abs(g(0, 1) - g(1, 0)) < eps && Math.abs(g(0, 2) - g(2, 0)) < eps && Math.abs(g(1, 2) - g(2, 1)) < eps) {
    // Singular case: a rotation of 0 or of 180 degrees.
    if (Math.abs(g(0, 1) + g(1, 0)) < eps && Math.abs(g(0, 2) + g(2, 0)) < eps && Math.abs(g(1, 2) + g(2, 1)) < eps && Math.abs(g(0, 0) + g(1, 1) + g(2, 2) - 3) < eps) angle = 0;
    else angle = Math.PI;
  } else {
    let t = 0.5 * (g(0, 0) + g(1, 1) + g(2, 2) - 1);
    t = pyMax(-1, t);
    t = pyMin(t, 1);
    angle = Math.acos(t);
  }
  if (angle < 1e-15) return [0.0, new Vector(1, 0, 0)];
  if (angle < Math.PI) {
    const axis = new Vector(g(2, 1) - g(1, 2), g(0, 2) - g(2, 0), g(1, 0) - g(0, 1));
    axis.normalize();
    return [angle, axis];
  }
  // Angle is pi: the axis comes from the diagonal.
  const m00 = g(0, 0), m11 = g(1, 1), m22 = g(2, 2);
  let x: number, y: number, z: number;
  if (m00 > m11 && m00 > m22) { x = npSqrt(m00 - m11 - m22 + 0.5); y = g(0, 1) / (2 * x); z = g(0, 2) / (2 * x); }
  else if (m11 > m00 && m11 > m22) { y = npSqrt(m11 - m00 - m22 + 0.5); x = g(0, 1) / (2 * y); z = g(1, 2) / (2 * y); }
  else { z = npSqrt(m22 - m00 - m11 + 0.5); x = g(0, 2) / (2 * z); y = g(1, 2) / (2 * z); }
  const axis = new Vector(x, y, z);
  axis.normalize();
  return [Math.PI, axis];
}

/**
 * The vector from a point to the closest point on a line (the perpendicular projection).
 *
 * @param line - A vector along the line.
 * @param point - The point.
 */
export function vectorToAxis(line: Vector, point: Vector): Vector {
  const l = line.normalized();
  const normPoint = point.norm();
  const angle = l.angle(point);
  return point.sub(l.cross(normPoint * Math.cos(angle)));
}

/**
 * A left-multiplying matrix that rotates `theta` radians around `vector`.
 *
 * @param theta - The angle.
 * @param vector - The axis (normalised internally).
 * @returns A 3x3 matrix.
 */
export function rotaxis2m(theta: number, vector: Vector): Matrix {
  const [x, y, z] = vector.normalized().getArray() as [number, number, number];
  const c = Math.cos(theta), s = Math.sin(theta), t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

/** Alias of {@link rotaxis2m} (Biopython's `rotaxis`). */
export const rotaxis = rotaxis2m;

/** `np.dot` of two matrices. */
function matMul(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => b[0]!.map((_, j) => row.reduce((s, x, k) => s + x * b[k]![j]!, 0)));
}

/**
 * A left-multiplying matrix that mirrors `p` onto `q`.
 *
 * @param p - The vector to mirror.
 * @param q - The target.
 * @returns A 3x3 matrix (the identity when the two directions coincide).
 */
export function refmat(p: Vector, q: Vector): Matrix {
  const pn = p.normalized(), qn = q.normalized();
  if (pn.sub(qn).norm() < 1e-5) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const pq = pn.sub(qn);
  pq.normalize();
  const b = pq.getArray();
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) - 2 * (b[i]! * b[j]!)));
}

/**
 * A left-multiplying matrix that rotates `p` onto `q`.
 *
 * @param p - The moving vector.
 * @param q - The fixed vector.
 */
export function rotmat(p: Vector, q: Vector): Matrix {
  return matMul(refmat(q, p.neg()), refmat(p, p.neg()));
}

/**
 * The angle at `v2` between the points `v1` and `v3`.
 *
 * @param v1 - First point.
 * @param v2 - Vertex.
 * @param v3 - Third point.
 */
export function calcAngle(v1: Vector, v2: Vector, v3: Vector): number {
  return v1.sub(v2).angle(v3.sub(v2));
}

/**
 * The dihedral angle of four points, in ]-π, π].
 *
 * @param v1 - First point.
 * @param v2 - Second point.
 * @param v3 - Third point.
 * @param v4 - Fourth point.
 */
export function calcDihedral(v1: Vector, v2: Vector, v3: Vector, v4: Vector): number {
  const ab = v1.sub(v2), cb = v3.sub(v2), db = v4.sub(v3);
  const u = ab.cross(cb), v = db.cross(cb), w = u.cross(v);
  let angle = u.angle(v);
  // The sign comes from the direction of cb relative to u x v.
  if (cb.angle(w) > 0.001) angle = -angle;
  return angle;
}
