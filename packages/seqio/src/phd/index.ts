/**
 * @packageDocumentation
 * The `phd` format (PHRED output), a port of Biopython's `SeqIO.PhdIO` and `Bio.Sequencing.Phd`.
 *
 * - `parser.ts`: `readPhd`, `PhdRecord`, `CKEYWORDS`
 * - `iterator.ts`: `PhdIterator`
 * - `writer.ts`: `PhdWriter`
 */

import { registerIterator, registerWriter } from "../registry.js";
import { PhdIterator } from "./iterator.js";
import { PhdWriter } from "./writer.js";

registerIterator("phd", PhdIterator);
registerWriter("phd", PhdWriter);

export * from "./parser.js";
export * from "./iterator.js";
export * from "./writer.js";
