/**
 * @packageDocumentation
 * The `Alignment` class and the list-like containers of alignments.
 *
 * - `alignment.ts`: `Alignment` (data only so far)
 * - `pairwise-alignments.ts`: `PairwiseAlignments`, what the aligner's `align` returns
 */

export * from "./alignment.js";
export { AlignmentCounts, type AlignmentCountsAccessors, type RawCounts } from "./alignment-counts.js";
export type { CountScoring, CountingAligner } from "./counts.js";
export * from "./pairwise-alignments.js";
