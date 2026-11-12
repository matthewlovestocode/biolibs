/**
 * @packageDocumentation
 * Sequence content providers, mirroring Biopython's
 * `SequenceDataAbstractBaseClass`, `_UndefinedSequenceData` and
 * `_PartiallyDefinedSequenceData` (from `Bio.Seq`).
 *
 * A `Seq` never holds a raw byte array directly; it holds one of these
 * providers. That lets a sequence be fully defined (`BytesData`), of known
 * length but unknown content (`UndefinedSequenceData`), or defined only in some
 * ranges (`PartiallyDefinedSequenceData`), and lets lazy parsers subclass
 * `SequenceDataAbstractBaseClass`.
 *
 * - `abstract.ts`: base class, `UndefinedSequenceError`, shared types
 * - `bytes-data.ts`, `undefined-data.ts`, `partial-data.ts`: the providers
 * - `ops.ts`: `toData`, `addData`
 */

export * from "./abstract.js";
export * from "./bytes-data.js";
export * from "./undefined-data.js";
export * from "./partial-data.js";
export * from "./ops.js";
