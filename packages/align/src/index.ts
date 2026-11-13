/**
 * @packageDocumentation
 * A port of Biopython's `Bio.Align`. So far: `MultipleSeqAlignment`, the container the alignment file formats
 * of `@biolibs/seqio` read and write. The pairwise aligner and the `Alignment` class are not yet ported, and
 * the earlier string-only scaffold has been removed.
 *
 * - `multiple-seq-alignment.ts`: `MultipleSeqAlignment`
 * - `alignment/`: `Alignment` (data only so far) and `PairwiseAlignments`
 * - `pairwise/`: `PairwiseAligner` (settings and `score`; `align` is not ported yet)
 * - `codon/`: `CodonAligner`
 * - `analysis/`: `analysis` (dN/dS and the McDonald-Kreitman test)
 * - `formats/`: `parse`, `read`, `write` and the fasta, a2m, clustal, phylip and msf file formats
 * - `align-info.ts`: `SummaryInfo`
 * - `substitution-matrices/`: `SubstitutionArray` and the bundled scoring matrices
 */

export * from "./multiple-seq-alignment.js";
export * from "./alignment/index.js";
export * from "./pairwise/index.js";
export * from "./codon/index.js";
export * as analysis from "./analysis/index.js";
export * from "./formats/index.js";
export * from "./align-info.js";
export type { AlignmentWriter } from "./multiple-seq-alignment.js";
export * as substitutionMatrices from "./substitution-matrices/index.js";
/** The base class of the alignment file writers in `formats/` (the name `AlignmentWriter` is taken by the older function type). */
export { AlignmentWriter as AlignmentFileWriter } from "./formats/interfaces.js";
