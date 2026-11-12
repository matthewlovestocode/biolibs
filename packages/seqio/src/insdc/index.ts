/**
 * @packageDocumentation
 * The INSDC flat-file formats (GenBank, EMBL, IMGT), a port of Biopython's `GenBank.Scanner`, the feature consumer
 * and `SeqIO.InsdcIO`.
 *
 * - `scanner.ts`: `InsdcScanner` base (finding records, headers, feature tables)
 * - `genbank-scanner.ts`, `embl-scanner.ts`: GenBank and EMBL/IMGT specifics
 * - `consumer.ts`: builds the `SeqRecord` from scanner callbacks
 * - `genbank-writer.ts`, `embl-writer.ts`, `writer-base.ts`, `location-string.ts`: the writers
 * - `converters.ts`: direct GenBank/EMBL to FASTA
 * - `cleaner.ts`, `text.ts`: value cleaning and Python-style string helpers
 * - `iterators.ts`: the registered readers
 */

import { registerConverter, registerIterator, registerWriter } from "../registry.js";
import { emblConvertFasta, genbankConvertFasta } from "./converters.js";
import { EmblWriter, ImgtWriter } from "./embl-writer.js";
import { GenBankWriter } from "./genbank-writer.js";
import { EmblCdsFeatureIterator, EmblIterator, GenBankCdsFeatureIterator, GenBankIterator, ImgtIterator } from "./iterators.js";

registerIterator("genbank", GenBankIterator);
registerIterator("gb", GenBankIterator);
registerIterator("genbank-cds", GenBankCdsFeatureIterator);
registerIterator("embl", EmblIterator);
registerIterator("embl-cds", EmblCdsFeatureIterator);
registerIterator("imgt", ImgtIterator);
registerWriter("genbank", GenBankWriter);
registerWriter("gb", GenBankWriter);
registerWriter("embl", EmblWriter);
registerWriter("imgt", ImgtWriter);
registerConverter("genbank", "fasta", genbankConvertFasta);
registerConverter("gb", "fasta", genbankConvertFasta);
registerConverter("embl", "fasta", emblConvertFasta);

export * from "./cleaner.js";
export * from "./consumer.js";
export * from "./genbank-scanner.js";
export * from "./embl-scanner.js";
export * from "./genbank-writer.js";
export * from "./embl-writer.js";
export * from "./converters.js";
export * from "./location-string.js";
export * from "./iterators.js";
export { InsdcScanner, type FeatureTuple } from "./scanner.js";
