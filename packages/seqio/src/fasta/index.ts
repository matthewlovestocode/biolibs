/**
 * @packageDocumentation
 * The FASTA family of formats, a port of Biopython's `SeqIO.FastaIO`.
 *
 * - `parsers.ts`: `simpleFastaParser`, `fastaTwoLineParser` (title/sequence pairs)
 * - `iterators.ts`: readers for `fasta`, `fasta-2line`, `fasta-blast`, `fasta-pearson`
 * - `writers.ts`: writers for `fasta` and `fasta-2line`
 */

import { registerIterator, registerWriter } from "../registry.js";
import { FastaBlastIterator, FastaIterator, FastaPearsonIterator, FastaTwoLineIterator } from "./iterators.js";
import { FastaTwoLineWriter, FastaWriter } from "./writers.js";

registerIterator("fasta", FastaIterator);
registerIterator("fasta-2line", FastaTwoLineIterator);
registerIterator("fasta-blast", FastaBlastIterator);
registerIterator("fasta-pearson", FastaPearsonIterator);
registerWriter("fasta", FastaWriter);
registerWriter("fasta-2line", FastaTwoLineWriter);

export * from "./parsers.js";
export * from "./iterators.js";
export * from "./writers.js";
