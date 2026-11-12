/**
 * @packageDocumentation
 * `@biolibs/seqfeature`: a TypeScript port of Biopython's `Bio.SeqFeature`.
 *
 * - `position/`: `ExactPosition`, `BeforePosition`, `WithinPosition`, ... and `Position.fromstring`
 * - `location/`: `SimpleLocation`, `CompoundLocation` and `Location.fromstring`
 * - `seq-feature.ts`: `SeqFeature`
 * - `reference.ts`: `Reference`
 * - `errors.ts`: `LocationParserError` and friends
 */

export * from "./errors.js";
export * from "./position/index.js";
export * from "./location/index.js";
export { SeqFeature, type Qualifiers, type QualifiersInput } from "./seq-feature.js";
export { Reference } from "./reference.js";
