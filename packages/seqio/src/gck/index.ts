/**
 * @packageDocumentation
 * The `gck` format (Gene Construction Kit), a port of Biopython's `SeqIO.GckIO`.
 *
 * - `iterator.ts`: `GckIterator`
 */

import { registerIterator } from "../registry.js";
import { GckIterator } from "./iterator.js";

registerIterator("gck", GckIterator);

export * from "./iterator.js";
