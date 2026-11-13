/**
 * @packageDocumentation
 * The `uniprot-xml` format, a port of Biopython's `SeqIO.UniprotIO`.
 *
 * - `etree.ts`: `Element` and an `iterparse`-style `PullParser` (also `ParseError`)
 * - `tostring.ts`: `ElementTree.tostring` for raw comments
 * - `util.ts`, `errors.ts`: Python-faithful helpers and errors
 * - `comments.ts`, `references.ts`, `features.ts`, `entry.ts`: the element parsers
 * - `iterator.ts`: `UniprotIterator`
 */

import { registerIterator } from "../registry.js";
import { UniprotIterator } from "./iterator.js";

registerIterator("uniprot-xml", UniprotIterator);

export * from "./iterator.js";
export { Element, ParseError, PullParser } from "./etree.js";
