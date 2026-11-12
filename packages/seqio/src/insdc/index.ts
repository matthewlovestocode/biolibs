/**
 * @packageDocumentation
 * The INSDC flat-file formats (GenBank, EMBL, IMGT), a port of Biopython's `GenBank.Scanner`, the feature consumer
 * and `SeqIO.InsdcIO`.
 *
 * - `scanner.ts`: `InsdcScanner` base (finding records, headers, feature tables)
 * - `genbank-scanner.ts`: GenBank specifics
 * - `consumer.ts`: builds the `SeqRecord` from scanner callbacks
 * - `cleaner.ts`, `text.ts`: value cleaning and Python-style string helpers
 * - `iterators.ts`: the registered readers
 */

import { registerIterator } from "../registry.js";
import { GenBankCdsFeatureIterator, GenBankIterator } from "./iterators.js";

registerIterator("genbank", GenBankIterator);
registerIterator("gb", GenBankIterator);
registerIterator("genbank-cds", GenBankCdsFeatureIterator);

export * from "./cleaner.js";
export * from "./consumer.js";
export * from "./genbank-scanner.js";
export * from "./iterators.js";
export { InsdcScanner, type FeatureTuple } from "./scanner.js";
