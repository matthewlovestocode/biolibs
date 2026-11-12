/**
 * @packageDocumentation
 * The `swiss` format and the SwissProt parser behind it, a port of Biopython's `SeqIO.SwissIO` and `Bio.SwissProt`.
 *
 * - `records.ts`: `SwissProtRecord`, `SwissProtReference`, `FeatureTable`, `SwissProtParserError`
 * - `text.ts`: Python string helpers
 * - `fields.ts`: parsers for ID, DT, OX, OH, RN, RC, RX, CC, DR, PE, KW and GN lines
 * - `features.ts`: the `FT` line parser
 * - `parser.ts`: `readEntry`, `parse`, `read`
 * - `iterator.ts`: `SwissIterator`
 */

import { registerIterator } from "../registry.js";
import { SwissIterator } from "./iterator.js";

registerIterator("swiss", SwissIterator);

export * from "./records.js";
export { readEntry, parse as parseSwissProt, read as readSwissProt } from "./parser.js";
export * from "./iterator.js";
