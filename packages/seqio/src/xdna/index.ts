/**
 * @packageDocumentation
 * The `xdna` format (DNA Strider), a port of Biopython's `SeqIO.XdnaIO`.
 *
 * - `reader.ts`: `XdnaIterator`
 * - `writer.ts`: `XdnaWriter`
 */

import { registerIterator, registerWriter } from "../registry.js";
import { XdnaIterator } from "./reader.js";
import { XdnaWriter } from "./writer.js";

registerIterator("xdna", XdnaIterator);
registerWriter("xdna", XdnaWriter as never);

export * from "./reader.js";
export * from "./writer.js";
