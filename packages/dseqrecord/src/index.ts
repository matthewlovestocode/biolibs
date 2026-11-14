/**
 * @packageDocumentation
 * pydna's record layer: a sequence with a name, features and annotations.
 *
 * Biopython's `SeqRecord` already holds all of that. What pydna adds is the working vocabulary of someone
 * with a construct in front of them — GenBank's fields under the names a GenBank file uses, marking a
 * region as a feature by position or by its sequence, a table of what is annotated, mapping a sequencing
 * read onto the record, and a checksum stamped into the comment. This is the layer `Dseqrecord` and the
 * assembly stack are built on.
 *
 * - `identifier.ts` — reducing a label to something that could be a Python name.
 * - `locations.ts` — moving a feature around a circle when the origin changes.
 * - `seqrecord.ts` — `PydnaSeqRecord` and `ProteinSeqRecord`.
 *
 * Measured against pydna the same way the other ports are measured: see `docs/parity-pydna/`.
 */

export * from "./identifier.js";
export * from "./locations.js";
export * from "./seqrecord.js";
