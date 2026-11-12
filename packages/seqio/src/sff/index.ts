/**
 * @packageDocumentation
 * The `sff` and `sff-trim` formats (454/Roche flowgrams), a port of Biopython's `SeqIO.SffIO`.
 *
 * - `header.ts`: common header and Roche index helpers, `readRocheXmlManifest`
 * - `names.ts`: decoding of read names
 * - `iterator.ts`: `SffIterator`, `SffTrimIterator`
 * - `writer.ts`: `SffWriter`
 */

import { registerIterator, registerWriter } from "../registry.js";
import { SffIterator, SffTrimIterator } from "./iterator.js";
import { SffWriter } from "./writer.js";

registerIterator("sff", SffIterator);
registerIterator("sff-trim", SffTrimIterator);
registerWriter("sff", SffWriter as never);

export * from "./iterator.js";
export * from "./writer.js";
export { readRocheXmlManifest } from "./header.js";
