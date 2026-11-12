/**
 * @packageDocumentation
 * A port of Biopython's `Bio.Align`. So far: `MultipleSeqAlignment`, the container the alignment file formats
 * of `@biolibs/seqio` read and write. The pairwise aligner and the `Alignment` class are not yet ported, and
 * the earlier string-only scaffold has been removed.
 *
 * - `multiple-seq-alignment.ts`: `MultipleSeqAlignment`
 */

export * from "./multiple-seq-alignment.js";
