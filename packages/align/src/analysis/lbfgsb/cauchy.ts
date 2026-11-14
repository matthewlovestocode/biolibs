/**
 * The generalized Cauchy point: where the piecewise-linear path along the projected steepest-descent
 * direction first stops decreasing the quadratic model.
 *
 * A line-by-line port of `cauchy` in `scipy/optimize/src/lbfgsb.c`. The search walks the breakpoints in
 * increasing order, taking them off a heap, and keeps the model's first and second derivatives (`f1` and
 * `f2`) up to date as each variable hits its bound.
 */

import { daxpy, dcopy, ddot, EPSMACH } from "./blas.js";
import { bmv, hpsolb } from "./support.js";

/** Everything `cauchy` needs that is not a plain number. */
export interface CauchyArgs {
  /** The number of variables. */
  n: number;
  /** The current point. */
  x: Float64Array;
  /** Lower bounds. */
  l: Float64Array;
  /** Upper bounds. */
  u: Float64Array;
  /** Which bounds each variable has. */
  nbd: Int32Array;
  /** The gradient. */
  g: Float64Array;
  /** Scratch for the breakpoints' variables, left holding the free ones at the end. */
  iorder: Int32Array;
  /** Each variable's state, updated as variables reach a bound. */
  iwhere: Int32Array;
  /** Scratch for the breakpoints. */
  t: Float64Array;
  /** Filled in with the search direction. */
  d: Float64Array;
  /** Filled in with the Cauchy point. */
  xcp: Float64Array;
  /** The maximum number of corrections. */
  m: number;
  /** The y-vectors. */
  wy: Float64Array;
  /** The s-vectors. */
  ws: Float64Array;
  /** S'Y. */
  sy: Float64Array;
  /** The factor of T. */
  wt: Float64Array;
  /** The current scaling. */
  theta: number;
  /** How many corrections are stored. */
  col: number;
  /** Where the ring buffer starts. */
  head: number;
  /** The 8m-long scratch array, partitioned into p, c, wbp and v. */
  wa: Float64Array;
  /** The infinity norm of the projected gradient. */
  sbgnrm: number;
  /**
   * The segment count from the previous call.
   *
   * The Fortran passes `nseg` in and out, and the paths that return before the search starts leave it
   * alone, so the caller adds the previous iteration's count to its running total a second time. That is
   * reproduced here rather than quietly fixed.
   */
  nseg: number;
}

/**
 * Find the generalized Cauchy point.
 *
 * @param a - The vectors and sizes the search works on; `xcp`, `d`, `iwhere` and `wa` are written.
 * @returns How many segments the search explored, and `info` from the middle solve (0 when it succeeded).
 */
export function cauchy(a: CauchyArgs): { nseg: number; info: number } {
  const { n, x, l, u, nbd, g, iorder, iwhere, t, d, xcp, m, wy, ws, sy, wt, theta, col, head, wa } = a;
  // `wa` is partitioned exactly as the Fortran partitions it.
  const p = wa, c = wa.subarray(2 * m), wbp = wa.subarray(4 * m), v = wa.subarray(6 * m);
  let f1 = 0, tl = 0, tu = 0;
  if (a.sbgnrm <= 0) {
    dcopy(n, x, 0, xcp, 0);
    return { nseg: a.nseg, info: 0 };
  }
  let bnded = true, nfree = n, nbreak = -1, ibkmin = 0, bkmin = 0;
  const col2 = 2 * col;
  for (let i = 0; i < col2; i++) p[i] = 0;
  for (let i = 0; i < n; i++) {
    const neggi = -g[i]!;
    if (iwhere[i] !== 3 && iwhere[i] !== -1) {
      if (nbd[i]! <= 2) tl = x[i]! - l[i]!;
      if (nbd[i]! >= 2) tu = u[i]! - x[i]!;
      const xlower = nbd[i]! <= 2 && tl <= 0;
      const xupper = nbd[i]! >= 2 && tu <= 0;
      iwhere[i] = 0;
      if (xlower) {
        if (neggi <= 0) iwhere[i] = 1;
      } else if (xupper) {
        if (neggi >= 0) iwhere[i] = 2;
      } else if (Math.abs(neggi) <= 0) {
        iwhere[i] = -3;
      }
    }
    let pointr = head;
    if (iwhere[i] !== 0 && iwhere[i] !== -1) {
      d[i] = 0;
    } else {
      d[i] = neggi;
      f1 -= neggi * neggi;
      for (let j = 0; j < col; j++) {
        p[j] = p[j]! + wy[i + n * pointr]! * neggi;
        p[col + j] = p[col + j]! + ws[i + n * pointr]! * neggi;
        pointr = (pointr + 1) % m;
      }
      if (nbd[i]! <= 2 && nbd[i] !== 0 && neggi < 0) {
        nbreak += 1;
        iorder[nbreak] = i;
        t[nbreak] = tl / -neggi;
        if (nbreak === 0 || t[nbreak]! < bkmin) { bkmin = t[nbreak]!; ibkmin = nbreak; }
      } else if (nbd[i]! >= 2 && neggi > 0) {
        nbreak += 1;
        iorder[nbreak] = i;
        t[nbreak] = tu / neggi;
        if (nbreak === 0 || t[nbreak]! < bkmin) { bkmin = t[nbreak]!; ibkmin = nbreak; }
      } else {
        nfree -= 1;
        iorder[nfree] = i;
        if (Math.abs(neggi) > 0) bnded = false;
      }
    }
  }
  if (theta !== 1) {
    for (let i = 0; i < col; i++) p[col + i] = theta * p[col + i]!;
  }
  dcopy(n, x, 0, xcp, 0);
  if (nbreak === -1 && nfree === n) return { nseg: a.nseg, info: 0 };
  for (let j = 0; j < col2; j++) c[j] = 0;
  let f2 = -theta * f1;
  const f2Org = f2;
  if (col > 0) {
    const info = bmv(m, sy, wt, col, p, v);
    if (info !== 0) return { nseg: a.nseg, info };
    f2 -= ddot(col2, v, 0, p, 0);
  }
  let dtm = -f1 / f2, tsum = 0, nseg = 1, nleft = nbreak, iter = 0, tj = 0;
  while (nbreak > -1) {
    const tj0 = tj;
    let ibp: number;
    if (iter === 0) {
      tj = bkmin;
      ibp = iorder[ibkmin]!;
    } else {
      if (iter === 1 && ibkmin !== nbreak) {
        t[ibkmin] = t[nbreak]!;
        iorder[ibkmin] = iorder[nbreak]!;
      }
      hpsolb(nleft, t, iorder, iter - 1);
      tj = t[nleft]!;
      ibp = iorder[nleft]!;
    }
    const dt = tj - tj0;
    if (dtm < dt) {
      if (dtm <= 0) dtm = 0;
      tsum += dtm;
      daxpy(n, tsum, d, 0, xcp, 0);
      if (col > 0) daxpy(col2, dtm, p, 0, c, 0);
      return { nseg, info: 0 };
    }
    tsum += dt;
    nleft -= 1;
    iter += 1;
    let dibp = d[ibp]!;
    d[ibp] = 0;
    let zibp: number;
    if (dibp > 0) {
      zibp = u[ibp]! - x[ibp]!;
      xcp[ibp] = u[ibp]!;
      iwhere[ibp] = 2;
    } else {
      zibp = l[ibp]! - x[ibp]!;
      xcp[ibp] = l[ibp]!;
      iwhere[ibp] = 1;
    }
    if (nleft === -1 && nbreak === n) {
      dtm = dt;
      if (col > 0) daxpy(col2, dtm, p, 0, c, 0);
      return { nseg, info: 0 };
    }
    nseg += 1;
    const dibp2 = dibp ** 2;
    f1 = f1 + dt * f2 + dibp2 - theta * dibp * zibp;
    f2 -= theta * dibp2;
    if (col > 0) {
      daxpy(col2, dt, p, 0, c, 0);
      let pointr = head;
      for (let j = 0; j < col; j++) {
        wbp[j] = wy[ibp + n * pointr]!;
        wbp[col + j] = theta * ws[ibp + n * pointr]!;
        pointr = (pointr + 1) % m;
      }
      const info = bmv(m, sy, wt, col, wbp, v);
      if (info !== 0) return { nseg, info };
      const wmc = ddot(col2, c, 0, v, 0), wmp = ddot(col2, p, 0, v, 0), wmw = ddot(col2, wbp, 0, v, 0);
      dibp = -dibp;
      daxpy(col2, dibp, wbp, 0, p, 0);
      dibp = -dibp;
      f1 += dibp * wmc;
      f2 = f2 + dibp * 2 * wmp - dibp2 * wmw;
    }
    f2 = Math.max(EPSMACH * f2Org, f2);
    if (nleft >= 0) {
      dtm = -f1 / f2;
    } else if (bnded) {
      dtm = 0;
      break;
    } else {
      dtm = -f1 / f2;
      break;
    }
  }
  if (dtm <= 0) dtm = 0;
  tsum += dtm;
  daxpy(n, tsum, d, 0, xcp, 0);
  if (col > 0) daxpy(col2, dtm, p, 0, c, 0);
  return { nseg, info: 0 };
}
