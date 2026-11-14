/**
 * @packageDocumentation
 * `Bio.Align.analysis`: calculations on codon alignments.
 *
 * - `analysis.ts`: `calculateDnDs` (NG86, LWL85, YN00, ML) and `mktest`
 * - `yn00.ts`: the YN00 method's fixed-point iteration, with `yn00-util.ts`, `yn00-sites.ts` and
 *   `yn00-diffs.ts` holding its shared arithmetic, its site counting and its difference counting
 * - `ml.ts`: the maximum-likelihood method, its codon frequency models and its likelihood function
 * - `erfc.ts`: `erfc`
 * - `expm.ts`: the matrix exponential YN00 and ML need
 * - `lbfgsb/`: L-BFGS-B, the optimizer the ML method hands its likelihood to
 *
 * `calculate_dn_ds_matrix` returns `DistanceMatrix` objects and therefore lives in `@biolibs/phylo`.
 */

export { calculateDnDs, mktest } from "./analysis.js";
export { erfc } from "./erfc.js";
export { expm, type Matrix } from "./expm.js";
export { type Bound, minimizeLbfgsb, type MinimizeOptions, type MinimizeResult } from "./lbfgsb/index.js";
export { getPi, likelihood, ml } from "./ml.js";
