/** A 3x3 singular value decomposition and the matrix helpers the superimposer needs. */

/** A matrix as rows of numbers. */
export type Mat = number[][];

/** `A · B`. @param a - Left matrix. @param b - Right matrix. */
export function matMul(a: Mat, b: Mat): Mat {
  return a.map((row) => b[0]!.map((_, j) => row.reduce((s, x, k) => s + x * b[k]![j]!, 0)));
}

/** `A^T`. @param a - A matrix. */
export function transpose(a: Mat): Mat {
  return a[0]!.map((_, j) => a.map((row) => row[j]!));
}

/** Determinant of a 3x3 matrix. @param m - The matrix. */
export function det3(m: Mat): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = m as [[number, number, number], [number, number, number], [number, number, number]];
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * Singular value decomposition `A = U · diag(d) · Vt` of a 3x3 matrix, singular values in descending order.
 *
 * Uses one-sided Jacobi rotations, which keep full relative accuracy for small singular values. Where a singular
 * value is zero the matching column of `U` is completed to an orthonormal basis (right-handed), so a rank-deficient
 * matrix still gives orthogonal `U` and `Vt`.
 *
 * @param a - A 3x3 matrix.
 * @returns `[u, d, vt]`.
 */
export function svd3(a: Mat): [Mat, number[], Mat] {
  const u = a.map((row) => [...row]);
  const v: Mat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    let rotated = false;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        let alpha = 0, beta = 0, gamma = 0;
        for (let i = 0; i < 3; i++) { alpha += u[i]![p]! ** 2; beta += u[i]![q]! ** 2; gamma += u[i]![p]! * u[i]![q]!; }
        if (gamma === 0 || Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (const m of [u, v]) for (let i = 0; i < 3; i++) {
          const x = m[i]![p]!, y = m[i]![q]!;
          m[i]![p] = c * x - s * y;
          m[i]![q] = s * x + c * y;
        }
      }
    }
    if (!rotated) break;
  }
  // LAPACK returns identity factors for a zero matrix (a single point, say).
  if (a.every((row) => row.every((x) => x === 0))) return [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]];
  const norms = [0, 1, 2].map((j) => Math.hypot(u[0]![j]!, u[1]![j]!, u[2]![j]!));
  const order = [0, 1, 2].sort((i, j) => norms[j]! - norms[i]!);
  const d = order.map((j) => norms[j]!);
  const cols = order.map((j) => (norms[j]! > 0 ? [0, 1, 2].map((i) => u[i]![j]! / norms[j]!) : null));
  const vcols = order.map((j) => [0, 1, 2].map((i) => v[i]![j]!));
  const cross = (x: number[], y: number[]): number[] => [x[1]! * y[2]! - x[2]! * y[1]!, x[2]! * y[0]! - x[0]! * y[2]!, x[0]! * y[1]! - x[1]! * y[0]!];
  // Complete the columns that belong to zero singular values.
  if (cols[0] === null) { cols[0] = [1, 0, 0]; }
  if (cols[1] === null) {
    const c0 = cols[0]!;
    const seed = Math.abs(c0[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const w = cross(c0, seed), n = Math.hypot(...(w as [number, number, number]));
    cols[1] = w.map((x) => x / n);
  }
  if (cols[2] === null) cols[2] = cross(cols[0]!, cols[1]!);
  const uOut = [0, 1, 2].map((i) => cols.map((c) => c![i]!));
  const vt = vcols; // rows of Vt are the columns of V
  return [uOut, d, vt];
}
