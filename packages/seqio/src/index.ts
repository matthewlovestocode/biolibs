/**
 * @packageDocumentation
 * `@biolibs/seqio`: a TypeScript port of Biopython's `Bio.SeqIO`.
 *
 * Inputs are the *text contents* of a file (or a `LineStream`), outputs are any object with `write(text)`
 * (such as `StringHandle`); there is no file-system access, so it works in Node and in the browser.
 *
 * - `api.ts`: `parse`, `read`, `write`, `toDict`, `convert`
 * - `handles.ts`: `LineStream`, `StringHandle`
 * - `interfaces.ts`, `registry.ts`: reader/writer base classes and the format registries
 * - `fasta/`: the FASTA family
 */

import "./fasta/index.js"; // registers the formats

export * from "./api.js";
export * from "./errors.js";
export * from "./handles.js";
export * from "./interfaces.js";
export { FORMAT_TO_ITERATOR, FORMAT_TO_WRITER, registerIterator, registerWriter } from "./registry.js";
export * from "./fasta/index.js";
