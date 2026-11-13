/**
 * @packageDocumentation
 * `@biolibs/features`: find known elements in a DNA sequence by comparing it with a library of reference pieces.
 *
 * This is the "find features" button of a plasmid editor: given a sequence and a collection of known parts, say
 * which of them are in it and where. Biopython has nothing equivalent — `Bio.Align` would align two sequences and
 * `Bio.motifs` would score a position matrix, but neither answers "which of these 400 standard parts is in my
 * plasmid".
 *
 * **No library ships with this package.** The collections that would fill one carry their own licences, and some of
 * the obvious sources are restricted to non-commercial use, which could not sit inside an MIT package. The library
 * is an argument, so a caller supplies pieces under whatever terms apply to them. See `reference.ts`.
 *
 * Positions are 0-based half-open spans, as elsewhere in biolibs.
 *
 * - `reference.ts`: `ReferencePiece`, `libraryProblems`, `requireLibrary`
 * - `detect.ts`: `DetectedFeature`, `DetectOptions`, `DEFAULT_DETECT`, `detectFeatures`, `bestHits`,
 *   `mismatchBudget`, `Topology`
 * - `annotate.ts`: `asFeature`, `alreadyAnnotated`, `newHits`, `AnnotateOptions`
 *
 * @example
 * ```ts
 * import { asFeature, bestHits, detectFeatures, newHits } from "@biolibs/features";
 *
 * const library = [
 *   { name: "T7 promoter", type: "promoter", sequence: "TAATACGACTCACTATAG" },
 *   { name: "AmpR", type: "CDS", sequence: ampRSequence, note: "from pUC19, L09137" },
 * ];
 *
 * const hits = bestHits(detectFeatures(residues, "circular", library));
 * for (const hit of newHits(hits, record.features)) {
 *   record.features.push(asFeature(hit, { length: residues.length }));
 * }
 * ```
 */

export * from "./reference.js";
export * from "./detect.js";
export * from "./annotate.js";
