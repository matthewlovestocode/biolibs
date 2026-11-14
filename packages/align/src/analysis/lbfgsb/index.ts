/**
 * @packageDocumentation
 * L-BFGS-B: limited-memory quasi-Newton minimization subject to simple bounds, as
 * `scipy.optimize.minimize(method="L-BFGS-B")` performs it.
 *
 * `Bio.Align.analysis` needs it for the maximum-likelihood dN/dS estimate, where the answer depends on
 * exactly which point the optimizer stops at, so this is a port of the algorithm rather than another
 * minimizer with the same purpose.
 *
 * - `blas.ts` — the BLAS and LAPACK routines the algorithm calls, as their reference implementations.
 * - `support.ts` — the active set, the projected gradient, the limited-memory updates and the solves with
 *   the compact representation's middle matrix.
 * - `cauchy.ts` — the generalized Cauchy point.
 * - `formk.ts` — the factorization the subspace minimization solves with.
 * - `subsm.ts` — the subspace minimization itself.
 * - `tasks.ts` — the status codes the Fortran passes back to its caller.
 * - `dcsrch.ts` — MINPACK-2's line search.
 * - `lnsrlb.ts` — the line search's bound-aware wrapper.
 * - `mainlb.ts` — the driver loop.
 * - `minimize.ts` — scipy's own layer: bounds, tolerances, the numerical gradient and the counters.
 */

export { EPSMACH } from "./blas.js";
export { Task, TaskMsg } from "./tasks.js";
export { mainlb, type MainlbResult } from "./mainlb.js";
export { type Bound, minimizeLbfgsb, type MinimizeOptions, type MinimizeResult } from "./minimize.js";
