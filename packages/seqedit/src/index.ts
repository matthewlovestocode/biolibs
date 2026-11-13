/**
 * @packageDocumentation
 * `@biolibs/seqedit`: editing a `SeqRecord` while keeping its features true.
 *
 * Biopython can slice a record and add records together, but both are lossy for an editor: `record[a:b]` keeps only
 * the features wholly inside the slice and drops the rest, and there is no operation for "replace these bases and
 * move the annotations". This package supplies that, and agrees with Biopython exactly where their behaviour
 * overlaps: a feature wholly outside an edit keeps its class, strand, fuzzy positions and qualifiers, and
 * `edgeFeatures: "drop"` reproduces Biopython's slicing.
 *
 * Positions are 0-based half-open spans, as in Biopython's `SimpleLocation`. Records are never changed in place.
 *
 * - `shift.ts`: `SequenceEdit`, `Bias`, `mapPosition`, `lengthChange`, `touches`, `checkEdit`
 * - `locations.ts`: `editLocation`, `shiftLocation`, `clipLocation`, `locationExtent`, `locationLength`, `spanOf`
 * - `edit.ts`: `applyEdit`, `applyEdits`, `replaceBases`, `insertBases`, `deleteBases`, `cleanBases`, `residuesOf`,
 *   `EditOptions`
 * - `region.ts`: `extractRegion`, `reverseComplementRecord`, `rotateCircular`, `isCircular`, `RegionOptions`
 *
 * @example
 * ```ts
 * import { applyEdit, extractRegion, insertBases } from "@biolibs/seqedit";
 *
 * // Delete ten bases; a gene spanning them survives as the part that remains.
 * const shorter = applyEdit(record, { start: 100, end: 110, insert: "" });
 *
 * // Put a restriction site in without stretching the feature next to it.
 * const tagged = insertBases(record, 500, "GAATTC");
 *
 * // Cut an insert out, keeping the features that cross its edges as their surviving parts.
 * const insert = extractRegion(plasmid, 100, 600);
 * ```
 */

export * from "./shift.js";
export * from "./locations.js";
export * from "./edit.js";
export * from "./region.js";
