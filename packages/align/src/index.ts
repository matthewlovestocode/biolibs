/**
 * @packageDocumentation
 * A port of Biopython's `Bio.Align`. So far: `MultipleSeqAlignment`, the container the alignment file formats
 * of `@biolibs/seqio` read and write. The pairwise aligner and the `Alignment` class are not yet ported, and
 * the earlier string-only scaffold has been removed.
 *
 * - `multiple-seq-alignment.ts`: `MultipleSeqAlignment`
 * - `alignment/`: `Alignment` (data only so far) and `PairwiseAlignments`
 * - `pairwise/`: `PairwiseAligner` (settings and `score`; `align` is not ported yet)
 * - `substitution-matrices/`: `SubstitutionArray` and the bundled scoring matrices
 */

export * from "./multiple-seq-alignment.js";
export * from "./alignment/index.js";
export * from "./pairwise/index.js";
export * as substitutionMatrices from "./substitution-matrices/index.js";
