/**
 * @packageDocumentation
 * `Bio.Align.analysis`: calculations on codon alignments.
 *
 * - `analysis.ts`: `calculateDnDs` (NG86, LWL85) and `mktest`
 * - `erfc.ts`: `erfc`
 *
 * `calculate_dn_ds_matrix` returns `DistanceMatrix` objects and therefore lives in `@biolibs/phylo`.
 */

export { calculateDnDs, mktest } from "./analysis.js";
export { erfc } from "./erfc.js";
