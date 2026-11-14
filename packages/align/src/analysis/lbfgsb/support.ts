/**
 * The small subroutines of L-BFGS-B: the active set, the projected gradient, the limited-memory updates and
 * the two triangular solves that go with them.
 *
 * Each is a line-by-line port of `scipy/optimize/src/lbfgsb.c`, which is itself a translation of Byrd, Lu,
 * Nocedal and Zhu's Fortran. Matrices stay column-major, so element (i, j) of an `m` by `m` block is at
 * `i + m * j`, and the vectors `ws` and `wy` hold their columns in a ring buffer whose first column is
 * `head`.
 */

import { dcopy, ddot, dpotrf, dtrtrsUpper } from "./blas.js";

/**
 * Put `x` inside its bounds and work out which variables are fixed there (`active`).
 *
 * @param n - The number of variables. @param l - Lower bounds. @param u - Upper bounds.
 * @param nbd - Which bounds each variable has. @param x - The point, clipped in place.
 * @param iwhere - Filled in with each variable's state.
 * @returns Whether `x` had to be moved, whether any variable is bounded, and whether all of them are.
 */
export function active(n: number, l: Float64Array, u: Float64Array, nbd: Int32Array, x: Float64Array,
  iwhere: Int32Array): { prjctd: boolean; cnstnd: boolean; boxed: boolean } {
  let prjctd = false, cnstnd = false, boxed = true;
  for (let i = 0; i < n; i++) {
    if (nbd[i]! > 0) {
      if (nbd[i]! <= 2 && x[i]! <= l[i]!) {
        if (x[i]! < l[i]!) { prjctd = true; x[i] = l[i]!; }
      } else if (nbd[i]! >= 2 && x[i]! >= u[i]!) {
        if (x[i]! > u[i]!) { prjctd = true; x[i] = u[i]!; }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (nbd[i] !== 2) boxed = false;
    if (nbd[i] === 0) {
      iwhere[i] = -1;
    } else {
      cnstnd = true;
      iwhere[i] = nbd[i] === 2 && u[i]! - l[i]! <= 0 ? 3 : 0;
    }
  }
  return { prjctd, cnstnd, boxed };
}

/**
 * The infinity norm of the projected gradient (`projgr`).
 *
 * @param n - The number of variables. @param l - Lower bounds. @param u - Upper bounds.
 * @param nbd - Which bounds each variable has. @param x - The point. @param g - The gradient there.
 * @returns The norm, or the gradient's own NaN if it has one.
 */
export function projgr(n: number, l: Float64Array, u: Float64Array, nbd: Int32Array, x: Float64Array,
  g: Float64Array): number {
  let sbgnrm = 0;
  for (let i = 0; i < n; i++) {
    let gi = g[i]!;
    if (Number.isNaN(gi)) return gi;
    if (nbd[i] !== 0) {
      if (gi < 0) {
        if (nbd[i]! >= 2) gi = Math.max(x[i]! - u[i]!, gi);
      } else if (nbd[i]! <= 2) {
        gi = Math.min(x[i]! - l[i]!, gi);
      }
    }
    sbgnrm = Math.max(sbgnrm, Math.abs(gi));
  }
  return sbgnrm;
}

/**
 * Split the variables into the free ones and those at a bound (`freev`).
 *
 * @param n - The number of variables. @param nfree - How many were free before.
 * @param idx - Filled in with the free variables and then the fixed ones.
 * @param idx2 - Filled in with the variables entering and leaving the free set.
 * @param iwhere - Each variable's state. @param updatd - Whether the matrix was updated.
 * @param cnstnd - Whether any variable is bounded. @param iter - The iteration number.
 * @returns The new counts and whether the factorization has to be rebuilt.
 */
export function freev(n: number, nfree: number, idx: Int32Array, idx2: Int32Array, iwhere: Int32Array,
  updatd: boolean, cnstnd: boolean, iter: number): { nfree: number; nenter: number; ileave: number; wrk: boolean } {
  let nenter = 0, ileave = n;
  if (iter > 0 && cnstnd) {
    for (let i = 0; i < nfree; i++) {
      const k = idx[i]!;
      if (iwhere[k]! > 0) { ileave -= 1; idx2[ileave] = k; }
    }
    for (let i = nfree; i < n; i++) {
      const k = idx[i]!;
      if (iwhere[k]! <= 0) { idx2[nenter] = k; nenter += 1; }
    }
  }
  const wrk = ileave < n || nenter > 0 || updatd;
  let free = 0, iact = n;
  for (let i = 0; i < n; i++) {
    if (iwhere[i]! <= 0) { idx[free] = i; free += 1; } else { iact -= 1; idx[iact] = i; }
  }
  return { nfree: free, nenter, ileave, wrk };
}

/**
 * The heap step the Cauchy point search uses to take breakpoints in increasing order (`hpsolb`).
 *
 * @param n - The last index of the heap. @param t - The breakpoints. @param iorder - Their variables.
 * @param iheap - Zero to build the heap first, non-zero when it already holds one.
 */
export function hpsolb(n: number, t: Float64Array, iorder: Int32Array, iheap: number): void {
  if (iheap === 0) {
    for (let k = 2; k <= n + 1; k++) {
      const ddum = t[k - 1]!, indxin = iorder[k - 1]!;
      let i = k;
      while (i > 1) {
        const j = Math.floor(i / 2);
        if (ddum < t[j - 1]!) { t[i - 1] = t[j - 1]!; iorder[i - 1] = iorder[j - 1]!; i = j; } else break;
      }
      t[i - 1] = ddum;
      iorder[i - 1] = indxin;
    }
  }
  if (n > 0) {
    let i = 1;
    const out = t[0]!, indxout = iorder[0]!, ddum = t[n]!, indxin = iorder[n]!;
    for (;;) {
      let j = i + i;
      if (j > n) break;
      if (t[j]! < t[j - 1]!) j += 1;
      if (t[j - 1]! < ddum) { t[i - 1] = t[j - 1]!; iorder[i - 1] = iorder[j - 1]!; i = j; } else break;
    }
    t[i - 1] = ddum;
    iorder[i - 1] = indxin;
    t[n] = out;
    iorder[n] = indxout;
  }
}

/**
 * Solve `M * p = v` with the middle matrix of the compact limited-memory representation (`bmv`).
 *
 * @param m - The maximum number of corrections. @param sy - The matrix S'Y. @param wt - The factor of T.
 * @param col - How many corrections are stored. @param v - The right-hand side. @param p - The solution.
 * @returns 0, or a non-zero `info` from the triangular solve.
 */
export function bmv(m: number, sy: Float64Array, wt: Float64Array, col: number, v: Float64Array,
  p: Float64Array): number {
  if (col === 0) return 0;
  p[col] = v[col]!;
  for (let i = 1; i < col; i++) {
    const i2 = col + i;
    let ssum = 0;
    for (let k = 0; k <= i - 1; k++) ssum += sy[i + m * k]! * v[k]! / sy[k + m * k]!;
    p[i2] = v[i2]! + ssum;
  }
  let info = dtrtrsUpper(true, col, wt, 0, m, p, col);
  if (info !== 0) return info;
  for (let i = 0; i < col; i++) p[i] = v[i]! / Math.sqrt(sy[i + m * i]!);
  info = dtrtrsUpper(false, col, wt, 0, m, p, col);
  if (info !== 0) return info;
  for (let i = 0; i < col; i++) p[i] = -p[i]! / Math.sqrt(sy[i + m * i]!);
  for (let i = 0; i < col; i++) {
    let ssum = 0;
    for (let k = i + 1; k < col; k++) ssum += sy[k + m * i]! * p[col + k]! / sy[i + m * i]!;
    p[i] = p[i]! + ssum;
  }
  return 0;
}

/**
 * The right-hand side of the subspace problem, restricted to the free variables (`cmprlb`).
 *
 * @param n - The number of variables. @param m - The maximum number of corrections. @param x - The point.
 * @param g - The gradient. @param ws - The s-vectors. @param wy - The y-vectors. @param sy - S'Y.
 * @param wt - The factor of T. @param z - The Cauchy point. @param r - Filled in with the right-hand side.
 * @param wa - Scratch, holding the Cauchy point's `c` vector at `2 * m`. @param index - The free variables.
 * @param theta - The current scaling. @param col - How many corrections are stored.
 * @param head - Where the ring buffer starts. @param nfree - How many variables are free.
 * @param cnstnd - Whether any variable is bounded.
 * @returns 0, or -8 when the middle solve fails.
 */
export function cmprlb(n: number, m: number, x: Float64Array, g: Float64Array, ws: Float64Array,
  wy: Float64Array, sy: Float64Array, wt: Float64Array, z: Float64Array, r: Float64Array, wa: Float64Array,
  index: Int32Array, theta: number, col: number, head: number, nfree: number, cnstnd: boolean): number {
  if (!cnstnd && col > 0) {
    for (let i = 0; i < n; i++) r[i] = -g[i]!;
    return 0;
  }
  for (let i = 0; i < nfree; i++) {
    const k = index[i]!;
    r[i] = -theta * (z[k]! - x[k]!) - g[k]!;
  }
  const sub = wa.subarray(2 * m);
  if (bmv(m, sy, wt, col, sub, wa) !== 0) return -8;
  let pointr = head;
  for (let j = 0; j < col; j++) {
    const a1 = wa[j]!, a2 = theta * wa[col + j]!;
    for (let i = 0; i < nfree; i++) {
      const k = index[i]!;
      r[i] = r[i]! + wy[k + n * pointr]! * a1 + ws[k + n * pointr]! * a2;
    }
    pointr = (pointr + 1) % m;
  }
  return 0;
}

/**
 * Store a new correction pair and shift the ring buffer along (`matupd`).
 *
 * @param n - The number of variables. @param m - The maximum number of corrections.
 * @param ws - The s-vectors. @param wy - The y-vectors. @param sy - S'Y. @param ss - S'S.
 * @param d - The step. @param r - The gradient change. @param state - The buffer's indices and `theta`.
 * @param rr - The squared norm of `r`. @param dr - The step's inner product with `r`.
 * @param stp - The step length. @param dtd - The squared norm of the search direction.
 */
export function matupd(n: number, m: number, ws: Float64Array, wy: Float64Array, sy: Float64Array,
  ss: Float64Array, d: Float64Array, r: Float64Array,
  state: { itail: number; iupdat: number; col: number; head: number; theta: number },
  rr: number, dr: number, stp: number, dtd: number): void {
  if (state.iupdat <= m) {
    state.col = state.iupdat;
    state.itail = (state.head + state.iupdat - 1) % m;
  } else {
    state.itail = (state.itail + 1) % m;
    state.head = (state.head + 1) % m;
  }
  dcopy(n, d, 0, ws, state.itail * n);
  dcopy(n, r, 0, wy, state.itail * n);
  state.theta = rr / dr;
  if (state.iupdat > m) {
    for (let j = 1; j < state.col; j++) {
      dcopy(j, ss, 1 + m * j, ss, m * (j - 1));
      dcopy(state.col - j, sy, j + m * j, sy, (j - 1) + m * (j - 1));
    }
  }
  let pointr = state.head;
  for (let j = 0; j < state.col - 1; j++) {
    sy[state.col - 1 + m * j] = ddot(n, d, 0, wy, pointr * n);
    ss[j + m * (state.col - 1)] = ddot(n, ws, pointr * n, d, 0);
    pointr = (pointr + 1) % m;
  }
  ss[(state.col - 1) + m * (state.col - 1)] = stp === 1 ? dtd : stp * stp * dtd;
  sy[(state.col - 1) + m * (state.col - 1)] = dr;
}

/**
 * The Cholesky factor of `theta * S'S + L D^-1 L'` (`formt`).
 *
 * @param m - The maximum number of corrections. @param wt - Filled in with the factor.
 * @param sy - S'Y. @param ss - S'S. @param col - How many corrections are stored.
 * @param theta - The current scaling.
 * @returns 0, or -3 when the matrix is not positive definite.
 */
export function formt(m: number, wt: Float64Array, sy: Float64Array, ss: Float64Array, col: number,
  theta: number): number {
  for (let j = 0; j < col; j++) wt[m * j] = theta * ss[m * j]!;
  for (let i = 1; i < col; i++) {
    for (let j = i; j < col; j++) {
      const k1 = i > j ? j : i;
      let ddum = 0;
      for (let k = 0; k < k1; k++) ddum += (sy[i + m * k]! * sy[j + m * k]!) / sy[k + m * k]!;
      wt[i + m * j] = ddum + theta * ss[i + m * j]!;
    }
  }
  return dpotrf(col, wt, 0, m) !== 0 ? -3 : 0;
}
