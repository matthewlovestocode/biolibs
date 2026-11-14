/**
 * MINPACK-2's line search: find a step satisfying the sufficient-decrease and curvature conditions.
 *
 * A line-by-line port of `dcsrch` and `dcstep` in `scipy/optimize/src/lbfgsb.c`. The search keeps its
 * state between calls, because the caller has to evaluate the function at each trial step and come back;
 * here that state lives in a {@link SearchState} rather than in the Fortran's save arrays.
 */

import { Task, TaskMsg } from "./tasks.js";

/** The line search's state between evaluations: the Fortran's `isave` and `dsave` under their own names. */
export interface SearchState {
  /** Whether a minimizer has been bracketed. */
  brackt: boolean;
  /** Which of the two stages the search is in. */
  stage: number;
  /** The directional derivative at the start. */
  ginit: number;
  /** The sufficient-decrease slope. */
  gtest: number;
  /** The derivative at `stx`. */
  gx: number;
  /** The derivative at `sty`. */
  gy: number;
  /** The function value at the start. */
  finit: number;
  /** The function value at `stx`. */
  fx: number;
  /** The function value at `sty`. */
  fy: number;
  /** The best step so far. */
  stx: number;
  /** The other end of the bracket. */
  sty: number;
  /** The interval's lower end. */
  stmin: number;
  /** The interval's upper end. */
  stmax: number;
  /** The bracket's width. */
  width: number;
  /** Its width one iteration ago. */
  width1: number;
}

/** @returns A line search state with every field zeroed, as the Fortran's save arrays start out. */
export function newSearchState(): SearchState {
  return { brackt: false, stage: 0, ginit: 0, gtest: 0, gx: 0, gy: 0, finit: 0, fx: 0, fy: 0,
    stx: 0, sty: 0, stmin: 0, stmax: 0, width: 0, width1: 0 };
}

/**
 * Compute the next trial step from the two endpoints of the current interval (`dcstep`).
 *
 * The three cases are the ones in the paper: the trial step gave a higher value, it gave a lower value
 * but the derivative changed sign, or it gave a lower value with the derivative still pointing the same
 * way but smaller in size.
 *
 * @param s - The interval's endpoints and the trial step, all updated in place.
 * @param fp - The function value at the trial step. @param dp - The derivative there.
 * @param stpmin - The smallest allowed step. @param stpmax - The largest.
 */
function dcstep(s: { stx: number; fx: number; dx: number; sty: number; fy: number; dy: number; stp: number;
  brackt: boolean }, fp: number, dp: number, stpmin: number, stpmax: number): void {
  const sgnd = dp * (s.dx / Math.abs(s.dx));
  let stpf: number;
  if (fp > s.fx) {
    // A higher value: the minimizer is bracketed, and the step comes from the cubic or the quadratic.
    const theta = (3 * (s.fx - fp)) / (s.stp - s.stx) + s.dx + dp;
    const scale = Math.max(Math.abs(theta), Math.max(Math.abs(s.dx), Math.abs(dp)));
    let gamma = scale * Math.sqrt((theta / scale) ** 2 - (s.dx / scale) * (dp / scale));
    if (s.stp < s.stx) gamma = -gamma;
    const p = gamma - s.dx + theta, q = gamma - s.dx + gamma + dp, r = p / q;
    const stpc = s.stx + r * (s.stp - s.stx);
    const stpq = s.stx + (s.dx / ((s.fx - fp) / (s.stp - s.stx) + s.dx) / 2) * (s.stp - s.stx);
    stpf = Math.abs(stpc - s.stx) < Math.abs(stpq - s.stx) ? stpc : stpc + (stpq - stpc) / 2;
    s.brackt = true;
  } else if (sgnd < 0) {
    // A lower value with the derivative the other way round: again bracketed.
    const theta = (3 * (s.fx - fp)) / (s.stp - s.stx) + s.dx + dp;
    const scale = Math.max(Math.abs(theta), Math.max(Math.abs(s.dx), Math.abs(dp)));
    let gamma = scale * Math.sqrt((theta / scale) ** 2 - (s.dx / scale) * (dp / scale));
    if (s.stp > s.stx) gamma = -gamma;
    const p = gamma - dp + theta, q = gamma - dp + gamma + s.dx, r = p / q;
    const stpc = s.stp + r * (s.stx - s.stp);
    const stpq = s.stp + (dp / (dp - s.dx)) * (s.stx - s.stp);
    stpf = Math.abs(stpc - s.stp) > Math.abs(stpq - s.stp) ? stpc : stpq;
    s.brackt = true;
  } else if (Math.abs(dp) < Math.abs(s.dx)) {
    // A lower value, same sign, smaller derivative: the cubic may not have a minimizer, so it is only
    // used when it points back into the interval.
    const theta = (3 * (s.fx - fp)) / (s.stp - s.stx) + s.dx + dp;
    const scale = Math.max(Math.abs(theta), Math.max(Math.abs(s.dx), Math.abs(dp)));
    let gamma = scale * Math.sqrt(Math.max(0, (theta / scale) ** 2 - (s.dx / scale) * (dp / scale)));
    if (s.stp > s.stx) gamma = -gamma;
    const p = gamma - dp + theta, q = gamma + (s.dx - dp) + gamma, r = p / q;
    let stpc: number;
    if (r < 0 && gamma !== 0) stpc = s.stp + r * (s.stx - s.stp);
    else if (s.stp > s.stx) stpc = stpmax;
    else stpc = stpmin;
    const stpq = s.stp + (dp / (dp - s.dx)) * (s.stx - s.stp);
    if (s.brackt) {
      stpf = Math.abs(stpc - s.stp) < Math.abs(stpq - s.stp) ? stpc : stpq;
      if (s.stp > s.stx) stpf = Math.min(s.stp + 0.66 * (s.sty - s.stp), stpf);
      else stpf = Math.max(s.stp + 0.66 * (s.sty - s.stp), stpf);
    } else {
      stpf = Math.abs(stpc - s.stp) > Math.abs(stpq - s.stp) ? stpc : stpq;
      stpf = Math.min(stpmax, stpf);
      stpf = Math.max(stpmin, stpf);
    }
  } else if (s.brackt) {
    const theta = (3 * (fp - s.fy)) / (s.sty - s.stp) + s.dy + dp;
    const scale = Math.max(Math.abs(theta), Math.max(Math.abs(s.dy), Math.abs(dp)));
    let gamma = scale * Math.sqrt((theta / scale) ** 2 - (s.dy / scale) * (dp / scale));
    if (s.stp > s.sty) gamma = -gamma;
    const p = gamma - dp + theta, q = gamma - dp + gamma + s.dy, r = p / q;
    stpf = s.stp + r * (s.sty - s.stp);
  } else {
    stpf = s.stp > s.stx ? stpmax : stpmin;
  }
  if (fp > s.fx) {
    s.sty = s.stp;
    s.fy = fp;
    s.dy = dp;
  } else {
    if (sgnd < 0) { s.sty = s.stx; s.fy = s.fx; s.dy = s.dx; }
    s.stx = s.stp;
    s.fx = fp;
    s.dx = dp;
  }
  s.stp = stpf;
}

/**
 * One step of the line search (`dcsrch`).
 *
 * @param f - The function value at the current step. @param g - The directional derivative there.
 * @param stp - The current step, returned updated.
 * @param ftol - The sufficient-decrease parameter. @param gtol - The curvature parameter.
 * @param xtol - The relative width the interval of uncertainty must reach.
 * @param stpmin - The smallest allowed step. @param stpmax - The largest.
 * @param task - What the caller is asking for: `Start` to begin a search.
 * @param s - The search's state, carried between calls and updated here.
 * @returns The new step and what the search wants next.
 */
export function dcsrch(f: number, g: number, stp: number, ftol: number, gtol: number, xtol: number,
  stpmin: number, stpmax: number, task: Task, s: SearchState): { stp: number; task: Task; msg: TaskMsg } {
  const xtrapl = 1.1, xtrapu = 4;
  if (task === Task.Start) {
    // The checks run in order and the last one that fires decides the message, as in the Fortran.
    let msg = TaskMsg.None;
    if (stp < stpmin) msg = TaskMsg.ErrorStp1;
    if (stp > stpmax) msg = TaskMsg.ErrorStp2;
    if (g >= 0) msg = TaskMsg.ErrorInitg;
    if (msg !== TaskMsg.None) return { stp, task: Task.Error, msg };
    s.brackt = false;
    s.stage = 1;
    s.finit = f;
    s.ginit = g;
    s.gtest = ftol * s.ginit;
    s.width = stpmax - stpmin;
    s.width1 = s.width / 0.5;
    s.stx = 0;
    s.fx = s.finit;
    s.gx = s.ginit;
    s.sty = 0;
    s.fy = s.finit;
    s.gy = s.ginit;
    s.stmin = 0;
    s.stmax = stp + xtrapu * stp;
    return { stp, task: Task.Fg, msg: TaskMsg.None };
  }
  const ftest = s.finit + stp * s.gtest;
  if (s.stage === 1 && f <= ftest && g >= 0) s.stage = 2;
  let out: { task: Task; msg: TaskMsg } | null = null;
  if (s.brackt && (stp <= s.stmin || stp >= s.stmax)) out = { task: Task.Warning, msg: TaskMsg.WarnRound };
  if (s.brackt && s.stmax - s.stmin <= xtol * s.stmax) out = { task: Task.Warning, msg: TaskMsg.WarnXtol };
  if (stp === stpmax && f <= ftest && g <= s.gtest) out = { task: Task.Warning, msg: TaskMsg.WarnStpmax };
  if (stp === stpmin && (f > ftest || g >= s.gtest)) out = { task: Task.Warning, msg: TaskMsg.WarnStpmin };
  if (f <= ftest && Math.abs(g) <= gtol * -s.ginit) out = { task: Task.Convergence, msg: out?.msg ?? TaskMsg.None };
  if (out !== null) return { stp, ...out };
  const step = { stx: s.stx, fx: s.fx, dx: s.gx, sty: s.sty, fy: s.fy, dy: s.gy, stp, brackt: s.brackt };
  if (s.stage === 1 && f <= s.fx && f > ftest) {
    // In the first stage the modified function is searched instead, which keeps the step away from zero.
    const fm = f - stp * s.gtest;
    step.fx = s.fx - s.stx * s.gtest;
    step.fy = s.fy - s.sty * s.gtest;
    const gm = g - s.gtest;
    step.dx = s.gx - s.gtest;
    step.dy = s.gy - s.gtest;
    dcstep(step, fm, gm, s.stmin, s.stmax);
    s.stx = step.stx;
    s.sty = step.sty;
    s.fx = step.fx + s.stx * s.gtest;
    s.fy = step.fy + s.sty * s.gtest;
    s.gx = step.dx + s.gtest;
    s.gy = step.dy + s.gtest;
  } else {
    dcstep(step, f, g, s.stmin, s.stmax);
    s.stx = step.stx;
    s.sty = step.sty;
    s.fx = step.fx;
    s.fy = step.fy;
    s.gx = step.dx;
    s.gy = step.dy;
  }
  s.brackt = step.brackt;
  let next = step.stp;
  if (s.brackt) {
    if (Math.abs(s.sty - s.stx) >= 0.66 * s.width1) next = s.stx + 0.5 * (s.sty - s.stx);
    s.width1 = s.width;
    s.width = Math.abs(s.sty - s.stx);
  }
  if (s.brackt) {
    s.stmin = Math.min(s.stx, s.sty);
    s.stmax = Math.max(s.stx, s.sty);
  } else {
    s.stmin = next + xtrapl * (next - s.stx);
    s.stmax = next + xtrapu * (next - s.stx);
  }
  next = Math.max(next, stpmin);
  next = Math.min(next, stpmax);
  if ((s.brackt && (next <= s.stmin || next >= s.stmax))
    || (s.brackt && s.stmax - s.stmin <= xtol * s.stmax)) next = s.stx;
  return { stp: next, task: Task.Fg, msg: TaskMsg.None };
}
