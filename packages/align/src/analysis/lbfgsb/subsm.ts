/**
 * The subspace minimization: the Newton step of the quadratic model over the variables that are free at
 * the Cauchy point, truncated so that it stays inside the box.
 *
 * A line-by-line port of `subsm` in `scipy/optimize/src/lbfgsb.c`, including the safeguard that undoes
 * the whole step when the projected direction turns out not to be a descent direction and instead walks
 * to the first bound along it.
 */

import { dcopy, dtrtrsUpper } from "./blas.js";

/** Everything `subsm` works on. */
export interface SubsmArgs {
  /** The number of variables. */
  n: number;
  /** The maximum number of corrections. */
  m: number;
  /** How many variables are free. */
  nsub: number;
  /** The free variables. */
  ind: Int32Array;
  /** Lower bounds. */
  l: Float64Array;
  /** Upper bounds. */
  u: Float64Array;
  /** Which bounds each variable has. */
  nbd: Int32Array;
  /** The Cauchy point, moved to the subspace minimizer. */
  x: Float64Array;
  /** The right-hand side, overwritten with the direction. */
  d: Float64Array;
  /** Scratch holding a copy of `x` for the safeguard. */
  xp: Float64Array;
  /** The s-vectors. */
  ws: Float64Array;
  /** The y-vectors. */
  wy: Float64Array;
  /** The current scaling. */
  theta: number;
  /** The iteration's starting point. */
  xx: Float64Array;
  /** The gradient there. */
  gg: Float64Array;
  /** How many corrections are stored. */
  col: number;
  /** Where the ring buffer starts. */
  head: number;
  /** The 8m-long scratch array, used here as the 2m-long vector wv. */
  wa: Float64Array;
  /** The factorization of K from {@link formk}. */
  wn: Float64Array;
}

/**
 * Take the subspace Newton step.
 *
 * @param a - The vectors and sizes; `x`, `d`, `xp` and `wa` are written.
 * @returns Whether the minimizer ran into a bound (`iword`) and `info` from the triangular solves.
 */
export function subsm(a: SubsmArgs): { iword: number; info: number } {
  const { n, m, nsub, ind, l, u, nbd, x, d, xp, ws, wy, theta, xx, gg, col, head, wa: wv, wn } = a;
  if (nsub <= 0) return { iword: 0, info: 0 };
  let pointr = head;
  for (let i = 0; i < col; i++) {
    let temp1 = 0, temp2 = 0;
    for (let j = 0; j < nsub; j++) {
      const k = ind[j]!;
      temp1 += wy[k + n * pointr]! * d[j]!;
      temp2 += ws[k + n * pointr]! * d[j]!;
    }
    wv[i] = temp1;
    wv[col + i] = theta * temp2;
    pointr = (pointr + 1) % m;
  }
  const m2 = 2 * m, col2 = 2 * col;
  let info = dtrtrsUpper(true, col2, wn, 0, m2, wv, 0);
  if (info !== 0) return { iword: 0, info };
  for (let i = 0; i < col; i++) wv[i] = -wv[i]!;
  info = dtrtrsUpper(false, col2, wn, 0, m2, wv, 0);
  if (info !== 0) return { iword: 0, info };
  pointr = head;
  for (let jy = 0; jy < col; jy++) {
    const js = col + jy;
    for (let i = 0; i < nsub; i++) {
      const k = ind[i]!;
      d[i] = d[i]! + (wy[k + n * pointr]! * wv[jy]!) / theta + ws[k + n * pointr]! * wv[js]!;
    }
    pointr = (pointr + 1) % m;
  }
  const temp = 1 / theta;
  for (let i = 0; i < nsub; i++) d[i] = temp * d[i]!;
  let iword = 0;
  dcopy(n, x, 0, xp, 0);
  for (let i = 0; i < nsub; i++) {
    const k = ind[i]!, dk = d[i]!;
    let xk = x[k]!;
    if (nbd[k] !== 0) {
      if (nbd[k] === 1) {
        x[k] = Math.max(l[k]!, xk + dk);
        if (x[k] === l[k]) iword = 1;
      } else if (nbd[k] === 2) {
        xk = Math.max(l[k]!, xk + dk);
        x[k] = Math.min(u[k]!, xk);
        if (x[k] === l[k] || x[k] === u[k]) iword = 1;
      } else if (nbd[k] === 3) {
        x[k] = Math.min(u[k]!, xk + dk);
        if (x[k] === u[k]) iword = 1;
      }
    } else {
      x[k] = xk + dk;
    }
  }
  if (iword === 0) return { iword, info: 0 };
  // The projected direction has to go downhill; when it does not, start again from the Cauchy point and
  // walk to the nearest bound instead.
  let ddP = 0;
  for (let i = 0; i < n; i++) ddP += (x[i]! - xx[i]!) * gg[i]!;
  if (ddP > 0) dcopy(n, xp, 0, x, 0);
  else return { iword, info: 0 };
  let alpha = 1, temp1 = 1, ibd = 0;
  for (let i = 0; i < nsub; i++) {
    const k = ind[i]!, dk = d[i]!;
    if (nbd[k] !== 0) {
      if (dk < 0 && nbd[k]! <= 2) {
        const temp2 = l[k]! - x[k]!;
        if (temp2 >= 0) temp1 = 0;
        else if (dk * alpha < temp2) temp1 = temp2 / dk;
      } else if (dk > 0 && nbd[k]! >= 2) {
        const temp2 = u[k]! - x[k]!;
        if (temp2 <= 0) temp1 = 0;
        else if (dk * alpha > temp2) temp1 = temp2 / dk;
      }
      if (temp1 < alpha) { alpha = temp1; ibd = i; }
    }
  }
  if (alpha < 1) {
    const dk = d[ibd]!, k = ind[ibd]!;
    if (dk > 0) { x[k] = u[k]!; d[ibd] = 0; } else if (dk < 0) { x[k] = l[k]!; d[ibd] = 0; }
  }
  for (let i = 0; i < nsub; i++) {
    const k = ind[i]!;
    x[k] = x[k]! + alpha * d[i]!;
  }
  return { iword, info: 0 };
}
