/**
 * @packageDocumentation
 * `@biolibs/seqfeature`: a TypeScript port of Biopython's `Bio.SeqFeature`, verified against Biopython
 * 1.88 by 6,060 recorded calls — results, exception types *and* messages, warnings, and state after a
 * mutation. 1,291 of those record a refusal, which is the point: a location string out of a real file is
 * as often malformed as not, and a parser needs this layer to fail the way Biopython fails.
 *
 * Coordinates are zero-based and end-exclusive, like a JavaScript `slice`. The GenBank/EMBL text form is
 * one-based and inclusive, and the parsing and writing functions convert in each direction.
 *
 * - `position/`: `ExactPosition`, `UncertainPosition`, `BeforePosition`, `AfterPosition`,
 *   `WithinPosition`, `BetweenPosition`, `OneOfPosition`, `UnknownPosition`, and `Position.fromstring`
 * - `location/`: `SimpleLocation`, `CompoundLocation`, `Location.fromstring` for the GenBank/EMBL
 *   grammar — origin-spanning features included — and `insdcLocationString` and friends for the way back
 * - `seq-feature.ts`: `SeqFeature`, which `extract`s and `translate`s a parent sequence through a
 *   location, reading the feature's own `codon_start` and `transl_table` qualifiers
 * - `reference.ts`: `Reference`, a record's literature citation
 * - `errors.ts`: `LocationParserError` and friends
 */

import { registerPythonClasses } from "@biolibs/core";

// So error messages read `<class 'Bio.SeqFeature.SimpleLocation'>` like Biopython.
registerPythonClasses("Bio.SeqFeature", [
  "SeqFeature", "Reference", "SimpleLocation", "CompoundLocation", "ExactPosition", "UncertainPosition", "UnknownPosition",
  "WithinPosition", "BetweenPosition", "BeforePosition", "AfterPosition", "OneOfPosition",
]);

export * from "./errors.js";
export * from "./position/index.js";
export * from "./location/index.js";
export { SeqFeature, type Qualifiers, type QualifiersInput } from "./seq-feature.js";
export { Reference } from "./reference.js";
