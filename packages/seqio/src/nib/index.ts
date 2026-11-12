/**
 * @packageDocumentation
 * The `nib` format (UCSC nibble files), a port of Biopython's `SeqIO.NibIO`.
 *
 * - `iterator.ts`: `NibIterator`
 * - `writer.ts`: `NibWriter`
 */

import { registerIterator, registerWriter } from "../registry.js";
import { NibIterator } from "./iterator.js";
import { NibWriter } from "./writer.js";

registerIterator("nib", NibIterator);
registerWriter("nib", NibWriter as never);

export * from "./iterator.js";
export * from "./writer.js";
