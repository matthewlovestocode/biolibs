/**
 * @packageDocumentation
 * The `tab` format, a port of Biopython's `SeqIO.TabIO`.
 *
 * - `iterator.ts`: `TabIterator`
 * - `writer.ts`: `TabWriter`
 */

import { registerIterator, registerWriter } from "../registry.js";
import { TabIterator } from "./iterator.js";
import { TabWriter } from "./writer.js";

registerIterator("tab", TabIterator);
registerWriter("tab", TabWriter);

export * from "./iterator.js";
export * from "./writer.js";
