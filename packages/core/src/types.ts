/** Plain data types shared between packages. */

/**
 * Label for the kind of residues a sequence contains.
 * Currently informational; functions detect or are told the alphabet directly.
 */
export type Alphabet = "dna" | "rna" | "protein";

/**
 * A named biological sequence, as produced by the sequence-file parsers in
 * `@biolibs/seqio`.
 */
export interface SeqRecord {
  /** Short identifier: first header token (FASTA/FASTQ) or accession (GenBank). */
  id: string;
  /** Longer description: the full header line (FASTA/FASTQ) or DEFINITION (GenBank). */
  description: string;
  /** The residues, with whitespace and line breaks removed. Case is preserved. */
  sequence: string;
  /** Per-base Phred quality scores, one per residue. Present for FASTQ records only. */
  quality?: number[];
  /** Free-form, format-specific extras (for example GenBank LOCUS and ORGANISM fields). */
  annotations?: Record<string, unknown>;
}
