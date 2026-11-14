/**
 * The line search along the direction the subspace minimization produced, with the step limited so that
 * the point stays inside the box.
 *
 * A line-by-line port of `lnsrlb` in `scipy/optimize/src/lbfgsb.c`. It is entered once to set the search
 * up and then once after every function evaluation, so its state lives in a {@link LineState}.
 */

import { dcopy, ddot, dnrm2 } from "./blas.js";
import { dcsrch, newSearchState, type SearchState } from "./dcsrch.js";
import { Task, TaskMsg } from "./tasks.js";

/** What the line search carries from one function evaluation to the next. */
export interface LineState {
  /** The current step length. */
  stp: number;
  /** The 2-norm of the search direction. */
  dnorm: number;
  /** Its square. */
  dtd: number;
  /** The largest step that keeps the point inside the box. */
  stpmx: number;
  /** The function value the line search started from. */
  fold: number;
  /** How many evaluations this line search has used. */
  ifun: number;
  /** How many of them were backtracks. */
  iback: number;
  /** The directional derivative at the current step. */
  gd: number;
  /** The one at the starting point. */
  gdold: number;
  /** The distance moved. */
  xstep: number;
  /** MINPACK-2's own state. */
  search: SearchState;
  /** What MINPACK-2 wants next. */
  searchTask: Task;
}

/** @returns A line search state with every field zeroed, as the Fortran's save arrays start out. */
export function newLineState(): LineState {
  return { stp: 0, dnorm: 0, dtd: 0, stpmx: 0, fold: 0, ifun: 0, iback: 0, gd: 0, gdold: 0, xstep: 0,
    search: newSearchState(), searchTask: Task.Start };
}

/** Everything `lnsrlb` works on. */
export interface LnsrlbArgs {
  /** The number of variables. */
  n: number;
  /** Lower bounds. */
  l: Float64Array;
  /** Upper bounds. */
  u: Float64Array;
  /** Which bounds each variable has. */
  nbd: Int32Array;
  /** The current point, moved to the trial step. */
  x: Float64Array;
  /** The function value there. */
  f: number;
  /** The gradient there. */
  g: Float64Array;
  /** The search direction. */
  d: Float64Array;
  /** Filled in with the gradient at the starting point. */
  r: Float64Array;
  /** Filled in with the starting point. */
  t: Float64Array;
  /** The subspace minimizer, which the unit step goes to exactly. */
  z: Float64Array;
  /** The iteration number. */
  iter: number;
  /** Whether every variable has both bounds. */
  boxed: boolean;
  /** Whether any variable is bounded. */
  cnstnd: boolean;
  /** The state carried between evaluations. */
  state: LineState;
  /** What the caller asked for: `FgLnsrch` when coming back with a new value. */
  msg: TaskMsg;
}

/**
 * Take one step of the line search.
 *
 * @param a - The vectors and sizes; `x`, `r`, `t` and `a.state` are written.
 * @returns What to do next and how many evaluations were added, or `info` of -4 when the direction is not
 *   a descent direction.
 */
export function lnsrlb(a: LnsrlbArgs): { task: Task; msg: TaskMsg; info: number; nfgv: number } {
  const { n, l, u, nbd, x, f, g, d, r, t, z, iter, boxed, cnstnd, state: s } = a;
  const ftol = 1e-3, gtol = 0.9, xtol = 0.1;
  if (a.msg !== TaskMsg.FgLnsrch) {
    s.dnorm = dnrm2(n, d, 0);
    s.dtd = s.dnorm ** 2;
    s.stpmx = 1.0e10;
    if (cnstnd) {
      if (iter === 0) {
        s.stpmx = 1;
      } else {
        for (let i = 0; i < n; i++) {
          const a1 = d[i]!;
          if (nbd[i] !== 0) {
            if (a1 < 0 && nbd[i]! <= 2) {
              const a2 = l[i]! - x[i]!;
              if (a2 >= 0) s.stpmx = 0;
              else if (a1 * s.stpmx < a2) s.stpmx = a2 / a1;
            } else if (a1 > 0 && nbd[i]! >= 2) {
              const a2 = u[i]! - x[i]!;
              if (a2 <= 0) s.stpmx = 0;
              else if (a1 * s.stpmx > a2) s.stpmx = a2 / a1;
            }
          }
        }
      }
    }
    s.stp = iter === 0 && !boxed ? Math.min(1 / s.dnorm, s.stpmx) : 1;
    for (let i = 0; i < n; i++) { t[i] = x[i]!; r[i] = g[i]!; }
    s.fold = f;
    s.ifun = 0;
    s.iback = 0;
    s.searchTask = Task.Start;
  }
  s.gd = ddot(n, g, 0, d, 0);
  if (s.ifun === 0) {
    s.gdold = s.gd;
    if (s.gd >= 0) return { task: Task.Fg, msg: a.msg, info: -4, nfgv: 0 };
  }
  const out = dcsrch(f, s.gd, s.stp, ftol, gtol, xtol, 0, s.stpmx, s.searchTask, s.search);
  s.stp = out.stp;
  s.searchTask = out.task;
  s.xstep = s.stp * s.dnorm;
  if (out.task !== Task.Convergence && out.task !== Task.Warning) {
    s.ifun += 1;
    s.iback = s.ifun - 1;
    if (s.stp === 1) {
      dcopy(n, z, 0, x, 0);
    } else {
      for (let i = 0; i < n; i++) {
        x[i] = s.stp * d[i]! + t[i]!;
        if (nbd[i] === 1 || nbd[i] === 2) x[i] = Math.max(x[i]!, l[i]!);
        if (nbd[i] === 2 || nbd[i] === 3) x[i] = Math.min(x[i]!, u[i]!);
      }
    }
    return { task: Task.Fg, msg: TaskMsg.FgLnsrch, info: 0, nfgv: 1 };
  }
  return { task: Task.NewX, msg: TaskMsg.None, info: 0, nfgv: 0 };
}
