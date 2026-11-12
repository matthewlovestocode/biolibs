/**
 * @packageDocumentation
 * The `snapgene` format, a port of Biopython's `SeqIO.SnapGeneIO`.
 *
 * - `dom.ts`: a minimal DOM (`parseString`)
 * - `strptime.ts`: `%Y.%m.%d` dates
 * - `packets.ts`: packet readers
 * - `iterator.ts`: `SnapGeneIterator`
 */

import { registerIterator } from "../registry.js";
import { SnapGeneIterator } from "./iterator.js";

registerIterator("snapgene", SnapGeneIterator);

export * from "./iterator.js";
export { parseString, DomElement, DomDocument } from "./dom.js";
export { ExpatError } from "../seqxml/xml-types.js";
