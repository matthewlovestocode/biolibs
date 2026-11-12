/**
 * @packageDocumentation
 * The `abi` and `abi-trim` formats (ABIF trace files), a port of Biopython's `SeqIO.AbiIO`.
 *
 * - `datetime.ts`: `datetime.date`/`time` as text
 * - `parse.ts`: directory and tag decoding
 * - `trim.ts`: quality trimming
 * - `iterator.ts`: `AbiIterator`, `AbiTrimIterator`
 */

import { registerIterator } from "../registry.js";
import { AbiIterator, AbiTrimIterator } from "./iterator.js";

registerIterator("abi", AbiIterator);
registerIterator("abi-trim", AbiTrimIterator);

export * from "./iterator.js";
export { abiTrim } from "./trim.js";
export { parseTagData, type TagValue } from "./parse.js";
