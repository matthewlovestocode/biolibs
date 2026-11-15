/**
 * @packageDocumentation
 * pydna's record layer: a molecule with a name, features and annotations — **94 of 95 items** at parity,
 * verified against pydna 5.5.16 by 1,198 recorded cases.
 *
 * Biopython's `SeqRecord` already holds a sequence with features. What pydna adds is the working
 * vocabulary of someone with a construct in front of them: GenBank's fields under the names a GenBank
 * file uses, marking a region as a feature by position *or* by its sequence, a table of what is
 * annotated, mapping a sequencing read onto the record, and a checksum stamped into the comment.
 *
 * Every case is run on a record **carrying features**, because that is where the difficulty is: closing
 * a molecule shortens it by its overhangs, moving the origin renumbers everything, and a feature that no
 * longer fits has to go. 1,140 of the cases are about moving a feature around a circle alone.
 *
 * - `identifier.ts` — reducing a label to something that could be a Python name.
 * - `locations.ts` — moving a feature around a circle when the origin changes.
 * - `seqrecord.ts` — `PydnaSeqRecord` and `ProteinSeqRecord`. The coding-sequence questions (`gc`,
 *   `cai`, `rarecodons`, `express`) ask the *sequence*, so they need a `PydnaSeq` under them and are not
 *   available on a `Dseqrecord`, whose sequence is a `Dseq`.
 * - `dseqrecord.ts` — `Dseqrecord`: the double-stranded molecule with its features, its cutting, its
 *   `format` (pydna's own override) and its `figure`.
 *
 * `format` needs `@biolibs/seqio` imported for GenBank, FASTA and the rest — this package does not pull
 * the IO layer in — while pydna's own `"pydnafasta"` and `"primer"` need nothing. The one member not
 * ported is `write`, which takes a file name: nothing here touches a file system, and what it would have
 * written is what `format` returns.
 *
 * Measured against pydna the same way the other ports are measured: see `docs/parity-pydna/`.
 */

export * from "./dseqrecord.js";
export * from "./identifier.js";
export * from "./locations.js";
export * from "./seqrecord.js";
