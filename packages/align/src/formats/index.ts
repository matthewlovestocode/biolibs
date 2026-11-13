/**
 * @packageDocumentation
 * Alignment file formats of Biopython's `Bio.Align` (`parse`, `read`, `write` and `Alignment.format`).
 *
 * - `stream.ts`: `TextStream`
 * - `interfaces.ts`: `AlignmentIterator`, `AlignmentWriter`, `Alignments`
 * - `registry.ts`: the format table, `parse`, `read`, `write`, `formatAs`
 * - `fasta.ts`, `a2m.ts`, `clustal.ts`, `phylip.ts`, `msf.ts`, `emboss.ts`: the formats
 */

import "./fasta.js";
import "./a2m.js";
import "./clustal.js";
import "./phylip.js";
import "./msf.js";
import "./emboss.js";

export * from "./stream.js";
export * from "./interfaces.js";
export * from "./registry.js";
export * from "./fasta.js";
export * from "./a2m.js";
export * from "./clustal.js";
export * from "./phylip.js";
export * from "./msf.js";
export * from "./emboss.js";
export { PythonException, AssertionError } from "./rows.js";
