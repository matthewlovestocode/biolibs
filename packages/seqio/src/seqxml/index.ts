/**
 * @packageDocumentation
 * The `seqxml` format, a port of Biopython's `SeqIO.SeqXmlIO` with its own small XML reader in place of expat.
 *
 * - `xml-types.ts`, `xml-chars.ts`, `xml-names.ts`, `xml-scanner.ts`: a namespace-aware XML scanner producing SAX events with byte positions
 * - `xml-sax.ts`: feeds those events in byte-count steps, like an incremental parser
 * - `content-handler.ts`: the seqXML state machine
 * - `iterator.ts`: `SeqXmlIterator`
 * - `xml-generator.ts`, `writer.ts`: `XmlGenerator` and `SeqXmlWriter`
 */

import { registerIterator, registerWriter } from "../registry.js";
import { SeqXmlIterator } from "./iterator.js";
import { SeqXmlWriter } from "./writer.js";

registerIterator("seqxml", SeqXmlIterator);
registerWriter("seqxml", SeqXmlWriter as never);

export { SAXParseException } from "./xml-types.js";
export * from "./iterator.js";
export * from "./writer.js";
export { XmlGenerator, escapeXml, quoteAttribute } from "./xml-generator.js";
export { SeqXmlContentHandler } from "./content-handler.js";
