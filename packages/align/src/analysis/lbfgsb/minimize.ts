/**
 * `scipy.optimize.minimize(..., method="L-BFGS-B")` with a numerical gradient.
 *
 * This is the layer around {@link mainlb}: it maps the bounds onto the Fortran's `nbd` codes, turns
 * `tol` into the two tolerances scipy derives from it, counts evaluations the way scipy's
 * `ScalarFunction` does (including the value and gradient it takes at the starting point before the
 * iteration begins), and differentiates the objective by one-sided differences with the same step rule
 * `scipy.optimize._numdiff.approx_derivative` uses, bounds and all.
 */

import { EPSMACH } from "./blas.js";
import { Task, TaskMsg } from "./tasks.js";
import { mainlb } from "./mainlb.js";

/** One variable's bounds; `null` on either side means that side is unbounded. */
export type Bound = [number | null, number | null];

/** What {@link minimizeLbfgsb} answers with, under scipy's own names. */
export interface MinimizeResult {
  /** The best point found. */
  x: Float64Array;
  /** Its function value. */
  fun: number;
  /** The gradient there. */
  jac: Float64Array;
  /** How many times the objective was called. */
  nfev: number;
  /** How many iterations were taken. */
  nit: number;
  /** 0 when a tolerance was met, 1 when a budget ran out, 2 otherwise. */
  status: number;
  /** Whether the minimization is considered to have succeeded. */
  success: boolean;
}

/** The options scipy's L-BFGS-B takes, with its own defaults. */
export interface MinimizeOptions {
  /** The relative-decrease tolerance. */
  ftol?: number;
  /** The projected-gradient tolerance. */
  gtol?: number;
  /** The absolute step for the numerical gradient. */
  eps?: number;
  /** How many corrections to keep. */
  maxcor?: number;
  /** The most objective calls allowed. */
  maxfun?: number;
  /** The most iterations allowed. */
  maxiter?: number;
  /** The most steps one line search may take. */
  maxls?: number;
}

/** The relative step `approx_derivative` falls back on for a one-sided difference. */
const RELSTEP = Math.sqrt(EPSMACH);

/**
 * The finite-difference steps for one point, moved inside the bounds where they have to be.
 *
 * Mirrors `_adjust_scheme_to_bounds(x0, h, 1, "1-sided", lb, ub)`: a step that would leave the box is
 * turned around when the other direction has room, and otherwise shortened to reach the nearer bound.
 *
 * @param x - The point. @param lb - Lower bounds. @param ub - Upper bounds. @param absStep - The step asked for.
 * @returns One step per variable, signed.
 */
function steps(x: Float64Array, lb: Float64Array, ub: Float64Array, absStep: number): Float64Array {
  const n = x.length;
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const sign = x[i]! >= 0 ? 1 : -1;
    // A step too small to change the point at all falls back on a relative one.
    h[i] = x[i]! + absStep - x[i]! === 0 ? RELSTEP * sign * Math.max(1, Math.abs(x[i]!)) : absStep;
  }
  if (lb.every((v) => v === -Infinity) && ub.every((v) => v === Infinity)) return h;
  for (let i = 0; i < n; i++) {
    const lower = x[i]! - lb[i]!, upper = ub[i]! - x[i]!;
    const total = h[i]!;
    const violated = x[i]! + total < lb[i]! || x[i]! + total > ub[i]!;
    const fitting = Math.abs(total) <= Math.max(lower, upper);
    if (violated && fitting) h[i] = -h[i]!;
    if (!fitting) h[i] = upper >= lower ? upper : -lower;
  }
  return h;
}

/**
 * Minimize a function of several variables subject to simple bounds.
 *
 * @param fun - The objective. @param x0 - The starting point, which is clipped into the bounds.
 * @param bounds - One pair per variable, or `null` for an unbounded problem.
 * @param tol - scipy's `tol`, which sets both tolerances unless the options give them.
 * @param options - The rest of scipy's options.
 * @returns Where it stopped, with the evaluation and iteration counts.
 */
export function minimizeLbfgsb(fun: (x: Float64Array) => number, x0: readonly number[] | Float64Array,
  bounds: readonly Bound[] | null, tol: number | null = null, options: MinimizeOptions = {}): MinimizeResult {
  // A variable whose bounds are equal cannot be differentiated numerically, so scipy's `minimize` takes
  // it out of the problem, runs the optimizer on what is left, and puts the value back afterwards with a
  // NaN for its gradient. Without this the gradient would hold a NaN all the way through the iteration.
  const fixed = bounds === null ? [] : bounds.map((b) => b[0] !== null && b[1] !== null && b[0] === b[1]);
  if (fixed.some((v) => v)) {
    const values = bounds!.map((b) => b[0]!);
    if (fixed.every((v) => v)) {
      // scipy answers without running anything at all, and its result carries no `jac`, `nit` or `status`.
      const at = Float64Array.from(values);
      return { x: at, fun: fun(at), jac: new Float64Array(values.length).fill(NaN), nfev: 1, nit: 0,
        status: 0, success: true };
    }
    const keep: number[] = [];
    fixed.forEach((isFixed, i) => { if (!isFixed) keep.push(i); });
    const full = Float64Array.from(values);
    /**
     * The objective over the free variables alone, with the fixed ones put back in their places.
     *
     * @param small - The free variables' values. @returns The objective there.
     */
    const reduced = (small: Float64Array): number => {
      const at = Float64Array.from(full);
      keep.forEach((i, j) => { at[i] = small[j]!; });
      return fun(at);
    };
    const out = minimizeLbfgsb(reduced, keep.map((i) => x0[i]!),
      keep.map((i) => bounds![i]!), tol, options);
    const x = Float64Array.from(values), jac = new Float64Array(values.length).fill(NaN);
    keep.forEach((i, j) => { x[i] = out.x[j]!; jac[i] = out.jac[j]!; });
    return { ...out, x, jac };
  }
  const n = x0.length;
  const ftol = options.ftol ?? tol ?? 2.220446049250313e-9;
  const gtol = options.gtol ?? tol ?? 1e-5;
  const eps = options.eps ?? 1e-8;
  const m = options.maxcor ?? 10;
  const maxfun = options.maxfun ?? 15000;
  const maxiter = options.maxiter ?? 15000;
  const maxls = options.maxls ?? 20;

  const lb = new Float64Array(n).fill(-Infinity), ub = new Float64Array(n).fill(Infinity);
  const low = new Float64Array(n), up = new Float64Array(n), nbd = new Int32Array(n);
  const x = Float64Array.from(x0);
  if (bounds !== null) {
    for (let i = 0; i < n; i++) {
      lb[i] = bounds[i]![0] ?? -Infinity;
      ub[i] = bounds[i]![1] ?? Infinity;
      x[i] = Math.min(Math.max(x[i]!, lb[i]!), ub[i]!);
      const hasLow = Number.isFinite(lb[i]!), hasUp = Number.isFinite(ub[i]!);
      if (hasLow) low[i] = lb[i]!;
      if (hasUp) up[i] = ub[i]!;
      nbd[i] = hasLow ? (hasUp ? 2 : 1) : (hasUp ? 3 : 0);
    }
  }

  let nfev = 0;
  let cachedX: Float64Array | null = null, cachedF = 0, cachedG = new Float64Array(n);
  /**
   * The objective and its numerical gradient, cached on the point as `ScalarFunction` caches them.
   *
   * @param at - Where to evaluate. @returns The value and the gradient there.
   */
  const evaluate = (at: Float64Array): { f: number; g: Float64Array } => {
    if (cachedX !== null && cachedX.every((v, i) => v === at[i])) return { f: cachedF, g: cachedG };
    const here = Float64Array.from(at);
    const f0 = fun(here);
    nfev += 1;
    const h = steps(here, lb, ub, eps);
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const trial = Float64Array.from(here);
      trial[i] = here[i]! + h[i]!;
      const dx = here[i]! + h[i]! - here[i]!;
      g[i] = (fun(trial) - f0) / dx;
      nfev += 1;
    }
    cachedX = here;
    cachedF = f0;
    cachedG = g;
    return { f: f0, g };
  };

  // scipy's ScalarFunction takes a value and a gradient at the starting point before the loop begins.
  evaluate(x);
  let nit = 0;
  const out = mainlb(n, m, x, low, up, nbd, ftol / EPSMACH, gtol, maxls, evaluate,
    (iter, _x, _f): TaskMsg | null => {
      nit = iter;
      if (iter >= maxiter) return TaskMsg.StopIterc;
      if (nfev > maxfun) return TaskMsg.StopIter;
      return null;
    });
  const status = out.task === Task.Convergence ? 0 : (nfev > maxfun || nit >= maxiter ? 1 : 2);
  return { x: out.x, fun: out.f, jac: out.g, nfev, nit, status, success: status === 0 };
}
