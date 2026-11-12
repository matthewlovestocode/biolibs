/**
 * @packageDocumentation
 * The `pir` (NBRF) format, a port of Biopython's `SeqIO.PirIO`.
 *
 * - `iterator.ts`: `PirIterator` and the `PIR_MOL_TYPE` code table
 * - `writer.ts`: `PirWriter`
 */

import { registerIterator, registerWriter } from "../registry.js";
import { PirIterator } from "./iterator.js";
import { PirWriter } from "./writer.js";

registerIterator("pir", PirIterator);
registerWriter("pir", PirWriter);

export * from "./iterator.js";
export * from "./writer.js";
