/**
 * The factorization of the indefinite middle matrix K that the subspace minimization solves with.
 *
 * A line-by-line port of `formk` in `scipy/optimize/src/lbfgsb.c`. The matrix is built up from the one
 * kept for the previous iteration (`wn1`) by adding the contributions of the variables that have just
 * entered the free set and taking away those of the variables that have left it, which is why the
 * routine needs both index lists.
 */

import { ddot, dpotrf, dtrtrsUpper } from "./blas.js";

/**
 * One triangular solve with several right-hand sides, transposed and upper triangular (LAPACK `dtrtrs`
 * as `formk` calls it, which for a column at a time is BLAS `dtrsm`).
 *
 * @param n - The matrix's order. @param nrhs - How many right-hand sides.
 * @param a - The matrix, column-major. @param aOff - Where it starts. @param lda - Its leading dimension.
 * @param b - The right-hand sides, overwritten with the solutions. @param bOff - Where they start.
 * @param ldb - Their leading dimension.
 * @returns 0 on success, or the one-based index of a zero on the diagonal.
 */
function dtrtrsUpperMulti(n: number, nrhs: number, a: Float64Array, aOff: number, lda: number,
  b: Float64Array, bOff: number, ldb: number): number {
  for (let i = 0; i < n; i++) if (a[aOff + i + lda * i] === 0) return i + 1;
  for (let j = 0; j < nrhs; j++) {
    const info = dtrtrsUpper(true, n, a, aOff, lda, b, bOff + ldb * j);
    if (info !== 0) return info;
  }
  return 0;
}

/** Everything `formk` works on. */
export interface FormkArgs {
  /** The number of variables. */
  n: number;
  /** How many variables are free. */
  nsub: number;
  /** The free variables, then the fixed ones. */
  ind: Int32Array;
  /** How many variables entered the free set. */
  nenter: number;
  /** Where the variables that left the free set start in `indx2`. */
  ileave: number;
  /** The variables entering and leaving the free set. */
  indx2: Int32Array;
  /** How many corrections have been made in all. */
  iupdat: number;
  /** Whether a correction was added this iteration. */
  updatd: boolean;
  /** Filled in with the factorization of K. */
  wn: Float64Array;
  /** The matrix kept between iterations, updated in place. */
  wn1: Float64Array;
  /** The maximum number of corrections. */
  m: number;
  /** The s-vectors. */
  ws: Float64Array;
  /** The y-vectors. */
  wy: Float64Array;
  /** S'Y. */
  sy: Float64Array;
  /** The current scaling. */
  theta: number;
  /** How many corrections are stored. */
  col: number;
  /** Where the ring buffer starts. */
  head: number;
}

/**
 * Form and factor K.
 *
 * @param a - The matrices and index lists; `wn` and `wn1` are written.
 * @returns 0, -1 when the first Cholesky fails, or -2 when the second does.
 */
export function formk(a: FormkArgs): number {
  const { n, nsub, ind, nenter, ileave, indx2, iupdat, updatd, wn, wn1, m, ws, wy, sy, theta, col, head } = a;
  let upcl: number;
  if (updatd) {
    if (iupdat > m) {
      // Shift the old blocks up and left by one, dropping the oldest correction.
      for (let jy = 0; jy < m - 1; jy++) {
        const js = m + jy;
        for (let i = 0; i < m - (jy + 1); i++) wn1[jy + 2 * m * jy + i] = wn1[(jy + 1) + 2 * m * (jy + 1) + i]!;
        for (let i = 0; i < m - (jy + 1); i++) wn1[js + 2 * m * js + i] = wn1[(js + 1) + 2 * m * (js + 1) + i]!;
        for (let i = 0; i < m - 1; i++) wn1[m + 2 * m * jy + i] = wn1[(m + 1) + 2 * m * (jy + 1) + i]!;
      }
    }
    const pbegin = 0, pend = nsub, dbegin = nsub, dend = n;
    const iy = col - 1;
    let is = m + col - 1;
    let ipntr = head + col - 1;
    if (ipntr >= m) ipntr -= m;
    let jpntr = head;
    for (let jy = 0; jy < col; jy++) {
      const js = m + jy;
      let temp1 = 0, temp2 = 0, temp3 = 0;
      for (let k = pbegin; k < pend; k++) {
        const k1 = ind[k]!;
        temp1 += wy[k1 + n * ipntr]! * wy[k1 + n * jpntr]!;
      }
      for (let k = dbegin; k < dend; k++) {
        const k1 = ind[k]!;
        temp2 += ws[k1 + n * ipntr]! * ws[k1 + n * jpntr]!;
        temp3 += ws[k1 + n * ipntr]! * wy[k1 + n * jpntr]!;
      }
      wn1[iy + 2 * m * jy] = temp1;
      wn1[is + 2 * m * js] = temp2;
      wn1[is + 2 * m * jy] = temp3;
      jpntr = (jpntr + 1) % m;
    }
    const jy = col - 1;
    jpntr = head + col - 1;
    if (jpntr >= m) jpntr -= m;
    ipntr = head;
    for (let i = 0; i < col; i++) {
      is = m + i;
      let temp3 = 0;
      for (let k = pbegin; k < pend; k++) {
        const k1 = ind[k]!;
        temp3 += ws[k1 + n * ipntr]! * wy[k1 + n * jpntr]!;
      }
      ipntr = (ipntr + 1) % m;
      wn1[is + 2 * m * jy] = temp3;
    }
    upcl = col - 1;
  } else {
    upcl = col;
  }
  let ipntr = head;
  for (let iy = 0; iy < upcl; iy++) {
    const is = m + iy;
    let jpntr = head;
    for (let jy = 0; jy <= iy; jy++) {
      const js = m + jy;
      let temp1 = 0, temp2 = 0, temp3 = 0, temp4 = 0;
      for (let k = 0; k < nenter; k++) {
        const k1 = indx2[k]!;
        temp1 += wy[k1 + n * ipntr]! * wy[k1 + n * jpntr]!;
        temp2 += ws[k1 + n * ipntr]! * ws[k1 + n * jpntr]!;
      }
      for (let k = ileave; k < n; k++) {
        const k1 = indx2[k]!;
        temp3 += wy[k1 + n * ipntr]! * wy[k1 + n * jpntr]!;
        temp4 += ws[k1 + n * ipntr]! * ws[k1 + n * jpntr]!;
      }
      wn1[iy + 2 * m * jy] = wn1[iy + 2 * m * jy]! + temp1 - temp3;
      wn1[is + 2 * m * js] = wn1[is + 2 * m * js]! - temp2 + temp4;
      jpntr = (jpntr + 1) % m;
    }
    ipntr = (ipntr + 1) % m;
  }
  ipntr = head;
  for (let is = m; is < m + upcl; is++) {
    let jpntr = head;
    for (let jy = 0; jy < upcl; jy++) {
      let temp1 = 0, temp3 = 0;
      for (let k = 0; k < nenter; k++) {
        const k1 = indx2[k]!;
        temp1 += ws[k1 + n * ipntr]! * wy[k1 + n * jpntr]!;
      }
      for (let k = ileave; k < n; k++) {
        const k1 = indx2[k]!;
        temp3 += ws[k1 + n * ipntr]! * wy[k1 + n * jpntr]!;
      }
      if (is <= jy + m) wn1[is + 2 * m * jy] = wn1[is + 2 * m * jy]! + temp1 - temp3;
      else wn1[is + 2 * m * jy] = wn1[is + 2 * m * jy]! - temp1 + temp3;
      jpntr = (jpntr + 1) % m;
    }
    ipntr = (ipntr + 1) % m;
  }
  const m2 = 2 * m;
  for (let iy = 0; iy < col; iy++) {
    const is = col + iy, is1 = m + iy;
    for (let jy = 0; jy <= iy; jy++) {
      const js = col + jy, js1 = m + jy;
      wn[jy + m2 * iy] = wn1[iy + m2 * jy]! / theta;
      wn[js + m2 * is] = wn1[is1 + m2 * js1]! * theta;
    }
    for (let jy = 0; jy < iy; jy++) wn[jy + m2 * is] = -wn1[is1 + m2 * jy]!;
    for (let jy = iy; jy < col; jy++) wn[jy + m2 * is] = wn1[is1 + m2 * jy]!;
    wn[iy + m2 * iy] = wn[iy + m2 * iy]! + sy[iy + m * iy]!;
  }
  if (dpotrf(col, wn, 0, m2) !== 0) return -1;
  const col2 = 2 * col;
  dtrtrsUpperMulti(col, col, wn, 0, m2, wn, m2 * col, m2);
  for (let is = col; is < col2; is++) {
    for (let js = is; js < col2; js++) {
      wn[is + m2 * js] = wn[is + m2 * js]! + ddot(col, wn, m2 * is, wn, m2 * js);
    }
  }
  return dpotrf(col, wn, col + m2 * col, m2) !== 0 ? -2 : 0;
}
