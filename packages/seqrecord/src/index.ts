/**
 * @packageDocumentation
 * `@biolibs/seqrecord`: a TypeScript port of Biopython's `Bio.SeqRecord`.
 *
 * - `seq-record.ts`: the `SeqRecord` class
 * - `restricted-dict.ts`, `letter-values.ts`: per-letter annotations
 * - `slicing.ts`, `concatenate.ts`, `transform.ts`: slicing, `+`, `reverseComplement`, `translate`
 * - `types.ts`: shared argument types
 */

export { SeqRecord, type RecordWriter } from "./seq-record.js";
export { RestrictedDict, type LetterValue } from "./restricted-dict.js";
export type { Addable } from "./concatenate.js";
export type { ReverseComplementOptions, TranslateRecordOptions, TransformOptions } from "./transform.js";
export type { AnnotationsInput, LetterAnnotationsInput } from "./types.js";
