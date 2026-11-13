/**
 * @packageDocumentation
 * bigBed files: a BED file turned into an indexed, compressed binary file (Biopython's `Bio.Align.bigbed`).
 *
 * - `autosql.ts`: `AutoSQLTable` and `Field`, the declaration of the columns
 * - `indexes.ts`: the file header, the zoom headers, the chromosome B+ tree and the R tree over the data
 * - `iterator.ts`: `BigBedIterator`, which reads the alignments and searches by chromosome region
 * - `bigpsl.ts`, `bigmaf.ts`: the two formats built on it, which differ only in what their columns hold
 */

export * from "./autosql.js";
export * from "./indexes.js";
export * from "./iterator.js";
export * from "./bigpsl.js";
export * from "./bigmaf.js";
