/**
 * @packageDocumentation
 * The `gfa1` and `gfa2` formats (Graphical Fragment Assembly), a port of Biopython's `SeqIO.GfaIO`.
 *
 * - `sha256.ts`: synchronous SHA-256 for the `SH` checksum tag
 * - `iterators.ts`: `Gfa1Iterator`, `Gfa2Iterator`
 */

import { registerIterator } from "../registry.js";
import { Gfa1Iterator, Gfa2Iterator } from "./iterators.js";

registerIterator("gfa1", Gfa1Iterator);
registerIterator("gfa2", Gfa2Iterator);

export * from "./iterators.js";
