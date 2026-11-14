/**
 * @packageDocumentation
 * bigBed files: a BED file turned into an indexed, compressed binary file (Biopython's `Bio.Align.bigbed`).
 *
 * - `autosql.ts`: `AutoSQLTable` and `Field`, the declaration of the columns
 * - `indexes.ts`: the file header, the zoom headers, the chromosome B+ tree and the R tree over the data
 * - `iterator.ts`: `BigBedIterator`, which reads the alignments and searches by chromosome region
 * - `bigpsl.ts`, `bigmaf.ts`: the two formats built on it, which differ only in what their columns hold, with
 *   `bigpsl-write.ts` and `bigmaf-write.ts` writing them and `declarations.ts` holding their columns
 * - `writer.ts`: `BigBedWriter`, with `summaries.ts`, `range-tree.ts`, `write-indexes.ts`, `extra-index.ts`
 *   and `pack.ts` behind it
 */

import { registerFormat } from "../registry.js";
import { BigBedIterator } from "./iterator.js";
import { BigMafIterator } from "./bigmaf.js";
import { BigPslIterator } from "./bigpsl.js";
import { BigBedWriter } from "./writer.js";
import { BigMafWriter } from "./bigmaf-write.js";
import { BigPslWriter } from "./bigpsl-write.js";

export * from "./autosql.js";
export * from "./declarations.js";
export * from "./indexes.js";
export * from "./iterator.js";
export * from "./writer.js";
export * from "./summaries.js";
export * from "./range-tree.js";
export * from "./write-indexes.js";
export * from "./extra-index.js";
export * from "./pack.js";
export * from "./bigpsl.js";
export * from "./bigmaf.js";
export * from "./bigpsl-write.js";
export * from "./bigmaf-write.js";

// One registration per format, here rather than in each file, so that the reader and the writer of a format
// arrive together.
registerFormat("bigbed", { AlignmentIterator: BigBedIterator as never, AlignmentWriter: BigBedWriter as never });
registerFormat("bigpsl", { AlignmentIterator: BigPslIterator as never, AlignmentWriter: BigPslWriter as never });
registerFormat("bigmaf", { AlignmentIterator: BigMafIterator as never, AlignmentWriter: BigMafWriter as never });
