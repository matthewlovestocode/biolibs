/**
 * @packageDocumentation
 * `@biolibs/seqrecord`: a TypeScript port of Biopython's `Bio.SeqRecord` — a sequence together with its
 * identifiers, features, annotations and a value per base.
 *
 * Verified against Biopython 1.88 by 6,773 recorded calls. Each one compares not just the result but
 * **the whole state of the record afterwards**, which is what catches the side effects: the lazy creation
 * of `letterAnnotations`, an annotations dict shared rather than copied, a feature list mutated in place.
 * 1,857 of the calls record a refusal, 693 a warning, and 3,150 are slices — every combination of start,
 * stop and step over records with fuzzy features, features pointing elsewhere, undefined content and no
 * sequence at all.
 *
 * - `seq-record.ts`: the `SeqRecord` class, and the `writers` registry `format()` renders through
 *   (`@biolibs/seqio` fills it with 26 formats when imported)
 * - `restricted-dict.ts`, `letter-values.ts`: per-letter annotations, which are length-checked against
 *   the sequence so a quality string cannot drift out of step with its bases
 * - `slicing.ts`, `concatenate.ts`, `transform.ts`: slicing, `+`, `reverseComplement`, `translate` —
 *   each of which has to decide what metadata honestly survives the operation
 * - `types.ts`: shared argument types
 */

export { SeqRecord, type RecordWriter } from "./seq-record.js";
export { RestrictedDict, type LetterValue } from "./restricted-dict.js";
export type { Addable } from "./concatenate.js";
export type { ReverseComplementOptions, TranslateRecordOptions, TransformOptions } from "./transform.js";
export type { AnnotationsInput, LetterAnnotationsInput } from "./types.js";
