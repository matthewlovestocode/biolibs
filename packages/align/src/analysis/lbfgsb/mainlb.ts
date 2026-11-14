/**
 * The driver of L-BFGS-B: the loop over Cauchy point, subspace minimization and line search.
 *
 * A port of `mainlb` in `scipy/optimize/src/lbfgsb.c`. The Fortran hands control back to its caller
 * whenever it wants a function value, and resumes at a label; here the objective is called directly at
 * those points, which leaves the arithmetic and the control flow unchanged and the save arrays
 * unnecessary.
 */

import { dcopy, dnrm2, EPSMACH } from "./blas.js";
import { cauchy } from "./cauchy.js";
import { Task, TaskMsg } from "./tasks.js";
import { formk } from "./formk.js";
import { lnsrlb, newLineState } from "./lnsrlb.js";
import { subsm } from "./subsm.js";
import { active, cmprlb, formt, freev, matupd, projgr } from "./support.js";

/** What {@link mainlb} reports when it stops. */
export interface MainlbResult {
  /** The best point. */
  x: Float64Array;
  /** Its function value. */
  f: number;
  /** The gradient there. */
  g: Float64Array;
  /** How many iterations were taken. */
  iter: number;
  /** How many function and gradient evaluations the line searches used. */
  nfgv: number;
  /** Why it stopped. */
  task: Task;
  /** The detail behind that. */
  msg: TaskMsg;
  /** How many corrections were made in all, which scipy reports as `isave[30]`. */
  iupdat: number;
}

/**
 * Minimize a function of `n` variables subject to simple bounds.
 *
 * @param n - The number of variables. @param m - The maximum number of corrections to keep.
 * @param x - The starting point, overwritten with the answer. @param l - Lower bounds. @param u - Upper bounds.
 * @param nbd - Which bounds each variable has. @param factr - The relative-decrease tolerance over epsilon.
 * @param pgtol - The projected-gradient tolerance. @param maxls - The most steps one line search may take.
 * @param evaluate - The objective, which returns the value and the gradient at a point.
 * @param onNewX - Called once per completed iteration; a message means stop with it.
 * @returns Where it stopped and why.
 */
export function mainlb(n: number, m: number, x: Float64Array, l: Float64Array, u: Float64Array,
  nbd: Int32Array, factr: number, pgtol: number, maxls: number,
  evaluate: (x: Float64Array) => { f: number; g: Float64Array },
  onNewX: (iter: number, x: Float64Array, f: number) => TaskMsg | null): MainlbResult {
  const ws = new Float64Array(m * n), wy = new Float64Array(m * n);
  const sy = new Float64Array(m * m), ss = new Float64Array(m * m), wt = new Float64Array(m * m);
  const wn = new Float64Array(4 * m * m), snd = new Float64Array(4 * m * m);
  const z = new Float64Array(n), r = new Float64Array(n), d = new Float64Array(n);
  const t = new Float64Array(n), xp = new Float64Array(n), wa = new Float64Array(8 * m);
  const index = new Int32Array(n), iwhere = new Int32Array(n), indx2 = new Int32Array(n);
  const ls = newLineState();
  const buf = { itail: 0, iupdat: 0, col: 0, head: 0, theta: 1 };
  let updatd = false, nintol = 0, nskip = 0, iter = 0, nseg = 0, nfgv = 0, info = 0;
  let nfree = n, nenter = 0, ileave = n, wrk = false, iword = 0;
  let sbgnrm = 0;
  const tol = factr * EPSMACH;

  const { cnstnd, boxed } = active(n, l, u, nbd, x, iwhere);
  /** Throw the limited-memory matrix away and start it again, which the Fortran does on any breakdown. */
  const restart = (): void => {
    info = 0;
    buf.col = 0;
    buf.head = 0;
    buf.theta = 1;
    buf.iupdat = 0;
    updatd = false;
  };
  const done = (task: Task, msg: TaskMsg, f: number, g: Float64Array): MainlbResult =>
    ({ x, f, g, iter, nfgv, task, msg, iupdat: buf.iupdat });

  let { f, g } = evaluate(x);
  nfgv = 1;
  sbgnrm = projgr(n, l, u, nbd, x, g);
  if (sbgnrm <= pgtol) return done(Task.Convergence, TaskMsg.ConvGrad, f, g);

  outer: for (;;) {
    iword = -1;
    if (cnstnd || buf.col === 0) {
      const out = cauchy({ n, x, l, u, nbd, g, iorder: indx2, iwhere, t, d, xcp: z, m, wy, ws, sy, wt,
        theta: buf.theta, col: buf.col, head: buf.head, wa, sbgnrm, nseg });
      nseg = out.nseg;
      if (out.info !== 0) { restart(); continue outer; }
      nintol += nseg;
      const fr = freev(n, nfree, index, indx2, iwhere, updatd, cnstnd, iter);
      nfree = fr.nfree;
      nenter = fr.nenter;
      ileave = fr.ileave;
      wrk = fr.wrk;
    } else {
      dcopy(n, x, 0, z, 0);
      wrk = updatd;
      nseg = 0;
    }
    if (nfree !== 0 && buf.col !== 0) {
      if (wrk) {
        info = formk({ n, nsub: nfree, ind: index, nenter, ileave, indx2, iupdat: buf.iupdat, updatd,
          wn, wn1: snd, m, ws, wy, sy, theta: buf.theta, col: buf.col, head: buf.head });
      }
      if (info !== 0) { restart(); continue outer; }
      info = cmprlb(n, m, x, g, ws, wy, sy, wt, z, r, wa, index, buf.theta, buf.col, buf.head, nfree, cnstnd);
      if (info === 0) {
        const out = subsm({ n, m, nsub: nfree, ind: index, l, u, nbd, x: z, d: r, xp, ws, wy,
          theta: buf.theta, xx: x, gg: g, col: buf.col, head: buf.head, wa, wn });
        iword = out.iword;
        info = out.info;
      }
      if (info !== 0) { restart(); continue outer; }
    }
    for (let i = 0; i < n; i++) d[i] = z[i]! - x[i]!;

    let msg = TaskMsg.None;
    for (;;) {
      const out = lnsrlb({ n, l, u, nbd, x, f, g, d, r, t, z, iter, boxed, cnstnd, state: ls, msg });
      info = out.info;
      nfgv += out.nfgv;
      if (info !== 0 || ls.iback >= maxls) {
        // The line search failed: go back to the best point, and either stop or throw the matrix away.
        dcopy(n, t, 0, x, 0);
        dcopy(n, r, 0, g, 0);
        f = ls.fold;
        if (buf.col === 0) {
          if (info === 0) { nfgv -= 1; ls.ifun -= 1; ls.iback -= 1; }
          iter += 1;
          return done(Task.Abnormal, TaskMsg.None, f, g);
        }
        if (info === 0) nfgv -= 1;
        restart();
        continue outer;
      }
      if (out.task === Task.Fg && out.msg === TaskMsg.FgLnsrch) {
        ({ f, g } = evaluate(x));
        msg = TaskMsg.FgLnsrch;
        continue;
      }
      iter += 1;
      sbgnrm = projgr(n, l, u, nbd, x, g);
      const halt = onNewX(iter, x, f);
      if (halt !== null) return done(Task.Stop, halt, f, g);
      break;
    }

    if (sbgnrm <= pgtol) return done(Task.Convergence, TaskMsg.ConvGrad, f, g);
    const ddum = Math.max(Math.max(Math.abs(ls.fold), Math.abs(f)), 1);
    if (ls.fold - f <= tol * ddum) return done(Task.Convergence, TaskMsg.ConvF, f, g);
    for (let i = 0; i < n; i++) r[i] = g[i]! - r[i]!;
    const rr = dnrm2(n, r, 0) ** 2;
    let dr: number, dd: number;
    if (ls.stp === 1) {
      dr = ls.gd - ls.gdold;
      dd = -ls.gdold;
    } else {
      dr = (ls.gd - ls.gdold) * ls.stp;
      for (let i = 0; i < n; i++) d[i] = ls.stp * d[i]!;
      dd = -ls.gdold * ls.stp;
    }
    if (dr <= EPSMACH * dd) { nskip += 1; updatd = false; continue outer; }
    updatd = true;
    buf.iupdat += 1;
    matupd(n, m, ws, wy, sy, ss, d, r, buf, rr, dr, ls.stp, ls.dtd);
    info = formt(m, wt, sy, ss, buf.col, buf.theta);
    if (info !== 0) { restart(); continue outer; }
  }
}
