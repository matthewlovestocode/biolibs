/**
 * @packageDocumentation
 * `@biolibs/seq`: a TypeScript port of Biopython's `Bio.Seq`, `Bio.Data.CodonTable` and
 * `Bio.Data.IUPACData`, verified against Biopython 1.88 by 23,556 recorded calls — results, exception
 * types *and* messages, warnings, and the object's state after a mutation — plus a whole dump of every
 * genetic code in all six flavours. All 219 items are at parity.
 *
 * - `Seq` / `MutableSeq`: immutable and mutable sequences, sharing ~90 methods (`./seq/`).
 * - `CodonTable`: all 27 NCBI genetic codes, as a namespace (`./codon-table/`).
 * - `IUPACData`: alphabets, ambiguity codes and molecular weights, as a namespace (`./data/`).
 * - Module functions: `translate`, `transcribe`, `backTranscribe`, `complement`, `complementRna`,
 *   `reverseComplement`, `reverseComplementRna` — a string in gives a string out.
 * - Content providers (`./seqdata/`): `BytesData`, and the `UndefinedSequenceData` and
 *   `PartiallyDefinedSequenceData` that let a sequence have a known length and unknown bases, as a
 *   GenBank `CONTIG` record does. Subclass the base class to load content lazily.
 * - Python `bytes` semantics on `Uint8Array` underneath (`./pybytes/`), because a `Seq` holds bytes
 *   rather than a string and has to refuse non-ASCII content exactly where Biopython refuses it.
 *
 * Method names are the camelCase of Biopython's and arguments keep Python's positional order; the
 * operators become named methods (`add`, `mul`, `equals`, `contains`, `at`, `slice`). See the package
 * README for the full mapping.
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
