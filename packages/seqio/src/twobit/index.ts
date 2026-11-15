/**
 * @packageDocumentation
 * The `twobit` format (UCSC 2-bit genomes), a port of Biopython's `SeqIO.TwoBitIO` and its C helper.
 *
 * - `convert.ts`: unpacking 2-bit bases, N blocks and masks
 * - `data.ts`: `TwoBitSequenceData`, lazy sequence content
 * - `iterator.ts`: `TwoBitIterator`
 * - `window.ts`: `TwoBitWindow`, the same format read a window at a time through a `ByteSource`
 */

import { registerIterator } from "../registry.js";
import { TwoBitIterator } from "./iterator.js";

registerIterator("twobit", TwoBitIterator);

export { convert as convertTwoBit, type Blocks } from "./convert.js";
export * from "./data.js";
export * from "./iterator.js";
export * from "./window.js";
