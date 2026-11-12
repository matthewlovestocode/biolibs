/**
 * @packageDocumentation
 * The pairwise aligner of `Bio.Align`: settings, scoring and alignment (`score`, `align`), including the FOGSAA mode.
 *
 * - `gap-properties.ts`: the gap-score property table (generated from Biopython's C source)
 * - `state.ts`: the gap-score state and algorithm choice
 * - `sequences.ts`: sequence conversion to letter indices
 * - `score-linear.ts`, `score-gotoh.ts`, `score-wsb.ts`: the score-only algorithms
 * - `align-*.ts`, `path-*.ts`, `trace.ts`: alignment with traceback and the path generators
 * - `fogsaa.ts`: the FOGSAA search
 * - `aligner.ts`: `PairwiseAligner`
 */

export * from "./aligner.js";
export type { GapScoreFunction } from "./gap-properties.js";
export type { Mode } from "./state.js";
export type { SequenceInput } from "./sequences.js";
