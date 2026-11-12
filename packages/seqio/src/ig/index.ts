/**
 * @packageDocumentation
 * The `ig` (IntelliGenetics) format, a port of Biopython's `SeqIO.IgIO`.
 *
 * - `iterator.ts`: `IgIterator`
 */

import { registerIterator } from "../registry.js";
import { IgIterator } from "./iterator.js";

registerIterator("ig", IgIterator);

export * from "./iterator.js";
