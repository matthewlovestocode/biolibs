/**
 * Turning hits into `SeqFeature` annotations, and telling which of them a record already has.
 *
 * Nothing here changes a record: {@link asFeature} builds a feature and {@link newHits} says which hits are not
 * already annotated, leaving the caller to decide what to add. An automatic detector that silently rewrote a
 * curated annotation would be worse than useless.
 */

import { ValueError } from "@biolibs/core";
import { CompoundLocation, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import type { DetectedFeature } from "./detect.js";

/** How a hit becomes a feature. */
export interface AnnotateOptions {
  /** The sequence length, needed to split a hit that wraps a circular sequence into a join. */
  length?: number;
  /** A `/note` recording how the feature was found. Defaults to a sentence naming the identity. Pass `""` for none. */
  note?: string;
}

/**
 * Build a `SeqFeature` for a hit.
 *
 * The feature gets the piece's name as a `/label` as well as a type-appropriate qualifier (`/gene` for a gene or
 * CDS, `/label` otherwise), because a name that survives a round trip through GenBank has to be in a qualifier the
 * reader looks at. The piece's own `note` is kept alongside the detection note.
 *
 * @param hit - A hit from `detectFeatures`.
 * @param options - The sequence length (for a wrapping hit) and the note to record.
 * @returns The feature, with an exact location on the strand the hit was found on.
 * @throws {@link ValueError} if the hit wraps but no `length` was given.
 * @example
 * ```ts
 * const feature = asFeature(hit, { length: 2686 });
 * feature.qualifiers.get("label"); // ["AmpR"]
 * ```
 */
export function asFeature(hit: DetectedFeature, options: AnnotateOptions = {}): SeqFeature {
  if (hit.wraps && options.length === undefined) {
    throw new ValueError("a hit that wraps the origin needs the sequence length, so it can be written as a join");
  }
  const location = hit.wraps
    ? new CompoundLocation([
      new SimpleLocation(hit.start, options.length!, hit.strand),
      new SimpleLocation(0, hit.end - options.length!, hit.strand),
    ])
    : new SimpleLocation(hit.start, hit.end, hit.strand);

  const percent = (hit.identity * 100).toFixed(hit.identity === 1 ? 0 : 1);
  const note = options.note ?? `found by comparison with a reference sequence, ${percent}% identical`;
  const qualifiers = new Map<string, unknown>([["label", [hit.piece.name]]]);
  if (hit.piece.type === "gene" || hit.piece.type === "CDS") qualifiers.set("gene", [hit.piece.name]);
  const notes = [hit.piece.note, note].filter((n): n is string => n !== undefined && n !== "");
  if (notes.length > 0) qualifiers.set("note", notes);

  return new SeqFeature(location, hit.piece.type, hit.piece.name, qualifiers);
}

/**
 * Whether a record already annotates what a hit found.
 *
 * A hit counts as already annotated when an existing feature has the same name (in `/gene`, `/label`, `/product` or
 * the feature's id), or when a feature of the same type covers at least `minCover` of the hit's bases. The second
 * test is what catches a curated annotation under a different name.
 *
 * @param hit - The hit.
 * @param features - The record's existing features.
 * @param minCover - How much of the hit a same-type feature must cover to count, as a fraction. Defaults to 0.5.
 * @returns Whether the hit is already annotated.
 * @throws {@link ValueError} for a `minCover` outside 0 to 1.
 */
export function alreadyAnnotated(hit: DetectedFeature, features: readonly SeqFeature[], minCover = 0.5): boolean {
  if (!Number.isFinite(minCover) || minCover < 0 || minCover > 1) throw new ValueError(`minCover must be between 0 and 1, got ${minCover}`);
  const wanted = hit.piece.name.toLowerCase();
  const size = hit.end - hit.start;

  for (const feature of features) {
    for (const key of ["gene", "label", "product", "standard_name"]) {
      const value = feature.qualifiers.get(key);
      const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
      if (values.some((v) => String(v).toLowerCase() === wanted)) return true;
    }
    if (feature.id.toLowerCase() === wanted) return true;

    if (feature.type === hit.piece.type && feature.location !== null && size > 0) {
      const overlap = Math.min(hit.end, Number(feature.location.end)) - Math.max(hit.start, Number(feature.location.start));
      if (overlap / size >= minCover) return true;
    }
  }
  return false;
}

/**
 * The hits a record does not already annotate.
 *
 * @param hits - Hits from `detectFeatures`.
 * @param features - The record's existing features.
 * @param minCover - As {@link alreadyAnnotated}.
 * @returns The hits worth offering, in the order they came in.
 * @example
 * ```ts
 * const worthAdding = newHits(detectFeatures(residues, "circular", library), record.features);
 * for (const hit of worthAdding) record.features.push(asFeature(hit, { length: residues.length }));
 * ```
 */
export const newHits = (hits: readonly DetectedFeature[], features: readonly SeqFeature[], minCover = 0.5): DetectedFeature[] =>
  hits.filter((hit) => !alreadyAnnotated(hit, features, minCover));
