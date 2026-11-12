/**
 * @packageDocumentation
 * The `ace` format and the ACE parser it rests on, a port of Biopython's `SeqIO.AceIO` and `Bio.Sequencing.Ace`.
 *
 * - `records.ts`: `Contig`, `Reads`, `Rd`, `Qa`, `Ds`, `Af`, `Bs`, `Rt`, `Ct`, `Wa`, `Wr`
 * - `parser.ts`: `parseAce`, contig by contig
 * - `read.ts`: `readAce` and `ACEFileRecord` (footer tags sorted into place)
 * - `iterator.ts`: `AceIterator`, the SeqIO reader
 */

import { registerIterator } from "../registry.js";
import { AceIterator } from "./iterator.js";

registerIterator("ace", AceIterator);

export * from "./records.js";
export * from "./parser.js";
export * from "./read.js";
export * from "./iterator.js";
