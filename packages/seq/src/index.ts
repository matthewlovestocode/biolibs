/**
 * @packageDocumentation
 * `@biolibs/seq`: a TypeScript port of Biopython's `Bio.Seq`, `Bio.Data.CodonTable`
 * and `Bio.Data.IUPACData`.
 *
 * - `Seq` / `MutableSeq`: immutable and mutable sequences (`./seq/`).
 * - `CodonTable`: all 27 NCBI genetic codes, as a namespace (`./codon-table/`).
 * - `IUPACData`: alphabets, ambiguity codes and molecular weights, as a namespace (`./data/`).
 * - Module functions: `translate`, `transcribe`, `reverseComplement`, ...
 * - Content providers (`./seqdata/`) and Python `bytes` semantics (`./pybytes/`) underneath.
 */

import { registerPythonClasses } from "@biolibs/core";

// So error messages can say `<class 'Bio.Seq.Seq'>` like Biopython.
registerPythonClasses("Bio.Seq", ["Seq", "MutableSeq"]);

export * from "./seq/index.js";
export {
  SequenceDataAbstractBaseClass,
  BytesData,
  UndefinedSequenceData,
  PartiallyDefinedSequenceData,
  UndefinedSequenceError,
  type SeqDataLike,
} from "./seqdata/index.js";
export type { PySlice } from "./pybytes/index.js";
export { sliceIndices, rangeLength } from "./pybytes/index.js";
export * as CodonTable from "./codon-table/index.js";
export * as IUPACData from "./data/iupac-data.js";
