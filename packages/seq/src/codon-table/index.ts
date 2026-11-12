/**
 * @packageDocumentation
 * Genetic code tables, a port of Biopython's `Bio.Data.CodonTable`.
 *
 * All 27 NCBI translation tables are registered at import time in six
 * flavours (DNA, RNA, generic DNA/RNA, and an ambiguity-aware version of
 * each), keyed by NCBI id and by name. Use `ambiguousGenericById` or
 * `ambiguousGenericByName` for the tables used by `translate`.
 *
 * - `errors.ts`: `TranslationError`
 * - `forward-table.ts`: codon lookups
 * - `codon-table.ts`: `CodonTable` and NCBI table classes
 * - `ambiguity.ts`: IUPAC ambiguity resolution
 * - `registry.ts`: the registries and `registerNcbiTable`
 */

export * from "./errors.js";
export * from "./forward-table.js";
export * from "./codon-table.js";
export * from "./ambiguity.js";
export * from "./registry.js";
