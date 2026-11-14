/**
 * @packageDocumentation
 * A port of Biopython's `Bio.Align`, at parity on all 175 items of its nine modules: see
 * `docs/parity/` for the checklist and `docs/align.md` for the reference.
 *
 * - `multiple-seq-alignment.ts`: `MultipleSeqAlignment`
 * - `alignment/`: `Alignment` and `PairwiseAlignments`
 * - `pairwise/`: `PairwiseAligner` — the scoring settings, `score` and `align`
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
