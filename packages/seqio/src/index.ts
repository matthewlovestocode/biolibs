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
 * - `fastq/`: FASTQ (three flavours) and QUAL
 * - `insdc/`: GenBank (more INSDC formats follow)
 */

import "./fasta/index.js"; // registers the formats
import "./fastq/index.js";
import "./insdc/index.js";
import "./tab/index.js";
import "./pir/index.js";
import "./swiss/index.js";
import "./phd/index.js";
import "./ig/index.js";
import "./seqxml/index.js";
import "./nib/index.js";
import "./twobit/index.js";
import "./gck/index.js";
import "./xdna/index.js";
import "./abi/index.js";
import "./snapgene/index.js";
import "./sff/index.js";

export * from "./api.js";
export * from "./errors.js";
export * from "./handles.js";
export * from "./interfaces.js";
export { FORMAT_TO_ITERATOR, FORMAT_TO_WRITER, registerConverter, registerIterator, registerWriter } from "./registry.js";
export * from "./fasta/index.js";
export * from "./fastq/index.js";
export * from "./insdc/index.js";
export * from "./tab/index.js";
export * from "./pir/index.js";
export * from "./swiss/index.js";
export * from "./phd/index.js";
export * from "./ig/index.js";
export * from "./seqxml/index.js";
export * from "./nib/index.js";
export * from "./twobit/index.js";
export * from "./gck/index.js";
export * from "./xdna/index.js";
export * from "./abi/index.js";
export * from "./snapgene/index.js";
export * from "./sff/index.js";
export { StructError, pack, unpack, calcsize, intFromBytes } from "./binary/struct.js";
export { decodeAscii, encodeAscii, readExact } from "./binary/ascii.js";
