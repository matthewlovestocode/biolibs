/**
 * @packageDocumentation
 * FASTQ and QUAL, a port of Biopython's `SeqIO.QualityIO`.
 *
 * - `scores.ts`: PHRED/Solexa/Illumina conversions and quality-string builders
 * - `general-iterator.ts`: `fastqGeneralIterator` (raw text triples)
 * - `iterators.ts`, `qual-iterator.ts`, `paired.ts`: readers
 * - `writers.ts`, `qual-writer.ts`: writers
 * - `converters.ts`: direct FASTQ conversions used by `convert()`
 * - `errors.ts`: `InvalidCharError`
 */

import { registerConverter, registerIterator, registerWriter } from "../registry.js";
import * as C from "./converters.js";
import { FastqIlluminaIterator, FastqPhredIterator, FastqSolexaIterator } from "./iterators.js";
import { QualPhredIterator } from "./qual-iterator.js";
import { QualPhredWriter } from "./qual-writer.js";
import { FastqIlluminaWriter, FastqPhredWriter, FastqSolexaWriter } from "./writers.js";

registerIterator("fastq", FastqPhredIterator);
registerIterator("fastq-sanger", FastqPhredIterator);
registerIterator("fastq-solexa", FastqSolexaIterator);
registerIterator("fastq-illumina", FastqIlluminaIterator);
registerIterator("qual", QualPhredIterator);
registerWriter("fastq", FastqPhredWriter);
registerWriter("fastq-sanger", FastqPhredWriter);
registerWriter("fastq-solexa", FastqSolexaWriter);
registerWriter("fastq-illumina", FastqIlluminaWriter);
registerWriter("qual", QualPhredWriter);

// Direct conversions, keyed by (input format, output format) exactly as Biopython's `_converter` table.
const SANGER = ["fastq", "fastq-sanger"];
const table: Record<string, Record<string, C.Converter>> = {
  fasta: { sanger: C.fastqToFasta, solexa: C.fastqToFasta, illumina: C.fastqToFasta },
  tab: { sanger: C.fastqToTab, solexa: C.fastqToTab, illumina: C.fastqToTab },
  fastq: { sanger: C.fastqSangerToSanger, solexa: C.fastqSolexaToSanger, illumina: C.fastqIlluminaToSanger },
  "fastq-sanger": { sanger: C.fastqSangerToSanger, solexa: C.fastqSolexaToSanger, illumina: C.fastqIlluminaToSanger },
  "fastq-solexa": { sanger: C.fastqSangerToSolexa, solexa: C.fastqSolexaToSolexa, illumina: C.fastqIlluminaToSolexa },
  "fastq-illumina": { sanger: C.fastqSangerToIllumina, solexa: C.fastqSolexaToIllumina, illumina: C.fastqIlluminaToIllumina },
  qual: { sanger: C.fastqSangerToQual, solexa: C.fastqSolexaToQual, illumina: C.fastqIlluminaToQual },
};
const FLAVOUR: Record<string, string> = { fastq: "sanger", "fastq-sanger": "sanger", "fastq-solexa": "solexa", "fastq-illumina": "illumina" };
for (const [out, byFlavour] of Object.entries(table)) {
  for (const input of [...SANGER, "fastq-solexa", "fastq-illumina"]) registerConverter(input, out, byFlavour[FLAVOUR[input]!]!);
}

export * from "./errors.js";
export * from "./scores.js";
export * from "./general-iterator.js";
export * from "./iterators.js";
export * from "./qual-iterator.js";
export * from "./paired.js";
export * from "./writers.js";
export { QualPhredWriter } from "./qual-writer.js";
export * from "./converters.js";
