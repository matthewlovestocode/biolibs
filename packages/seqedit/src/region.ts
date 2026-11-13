/**
 * Taking a region out of a record, and turning a whole record over.
 *
 * Both differ from Biopython on purpose, in the same direction as `applyEdit`: a feature that runs past the edge of
 * the region is kept as the part of it inside, where Biopython's `record[a:b]` drops it. The behaviour is selectable
 * so a caller that wants Biopython's answer can have it.
 *
 * A circular record can have a region taken out across its origin, which Biopython's slicing cannot express at all.
 */

import { ValueError } from "@biolibs/core";
import { MutableSeq, Seq } from "@biolibs/seq";
import { CompoundLocation, ExactPosition, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { type AnyLocation, clipLocation, locationLength } from "./locations.js";
import { residuesOf } from "./edit.js";

/** How a region is taken out. */
export interface RegionOptions {
  /**
   * `"clip"` (the default) keeps a feature crossing the region's edge as the part inside. `"drop"` keeps only
   * features wholly inside, as Biopython's `record[a:b]` does.
   */
  edgeFeatures?: "clip" | "drop";
  /** The id for the new record. Defaults to the original's id with the region appended, e.g. `"pUC19:100-600"`. */
  id?: string;
}

/**
 * Whether a record is annotated as circular.
 *
 * Read from the `topology` annotation, which is where GenBank and EMBL files put it and what `@biolibs/seqio`
 * writes. Anything other than `"circular"`, including a missing annotation, counts as linear.
 *
 * @param record - The record.
 * @returns Whether it is circular.
 */
export const isCircular = (record: SeqRecord): boolean => record.annotations.get("topology") === "circular";

/**
 * Take `[start, end)` out of a record as a new linear record, with the features that fall in it.
 *
 * @param record - The record. It is not changed.
 * @param start - First base of the region, 0-based.
 * @param end - One past the last base. On a circular record this may exceed the length, meaning the region runs
 *   across the origin.
 * @param options - Whether to clip features at the edges, and the new record's id.
 * @returns The new record. Its `topology` annotation is `"linear"`, since a piece cut out of a circle is a line.
 * @throws {@link ValueError} for a region outside the record, with `end` below `start`, wrapping a linear record, or
 *   longer than a circular record.
 * @example
 * ```ts
 * const insert = extractRegion(plasmid, 100, 600);
 * insert.seq.length; // 500
 * ```
 */
export function extractRegion(record: SeqRecord, start: number, end: number, options: RegionOptions = {}): SeqRecord {
  const residues = residuesOf(record);
  const length = residues.length;
  const circular = isCircular(record);

  if (!Number.isInteger(start) || !Number.isInteger(end)) throw new ValueError(`region bounds must be integers, got ${start} and ${end}`);
  if (end < start) throw new ValueError(`region end ${end} is before its start ${start}`);
  if (start < 0 || start > length) throw new ValueError(`the region ${start}..${end} is outside a sequence of ${length} bases`);
  if (end > length) {
    if (!circular) throw new ValueError(`the region ${start}..${end} runs past the end of a linear sequence of ${length} bases`);
    if (end - start > length) throw new ValueError(`a region of ${end - start} bases is longer than the ${length}-base sequence`);
  }

  const wraps = end > length;
  const text = wraps ? residues.slice(start) + residues.slice(0, end - length) : residues.slice(start, end);

  const features: SeqFeature[] = [];
  for (const feature of record.features) {
    if (feature.location === null) continue;
    const moved = wraps
      ? clipWrapped(feature.location as AnyLocation, start, end, length)
      : clipLocation(feature.location as AnyLocation, start, end);
    if (moved === null) continue;
    // Under "drop", keep only a feature whose every base is inside the region, as Biopython's slicing does. The
    // comparison is of bases actually covered, so a join losing part of one exon is dropped too.
    if ((options.edgeFeatures ?? "clip") === "drop" && locationLength(feature.location as AnyLocation) !== locationLength(moved)) continue;
    features.push(new SeqFeature(moved, feature.type, feature.id, new Map(feature.qualifiers)));
  }

  const annotations = new Map(record.annotations);
  annotations.set("topology", "linear");
  return new SeqRecord(
    record.seq instanceof MutableSeq ? new MutableSeq(text) : new Seq(text),
    options.id ?? `${record.id ?? "region"}:${start}-${end}`,
    record.name, record.description,
    [...record.dbxrefs], features, annotations,
  );
}

/**
 * Clip a location into a region that runs across the origin of a circular record.
 *
 * The region covers `[start, length)` then `[0, end - length)`, so a location is clipped against both stretches and
 * the pieces re-based onto the new record, where the second stretch follows the first.
 *
 * @param location - The feature's location.
 * @param start - The region's start.
 * @param end - The region's end, past the record's length.
 * @param length - The record's length.
 * @returns The clipped location, or `null` when nothing of it is in the region.
 */
function clipWrapped(location: AnyLocation, start: number, end: number, length: number): AnyLocation | null {
  const head = clipLocation(location, start, length);
  const tail = clipLocation(location, 0, end - length);
  const parts: SimpleLocation[] = [];
  // The head keeps its own offset; the tail follows it, so it moves up by the head's length.
  if (head) parts.push(...partsOf(head));
  if (tail) parts.push(...partsOf(tail).map((part) => new SimpleLocation(
    new ExactPosition(Number(part.start) + (length - start)),
    new ExactPosition(Number(part.end) + (length - start)),
    part.strand, part.ref, part.refDb,
  )));

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  // Two pieces that meet exactly are one stretch after the cut, so join them rather than leaving a spurious join.
  if (parts.length === 2 && Number(parts[0]!.end) === Number(parts[1]!.start) && parts[0]!.strand === parts[1]!.strand) {
    return new SimpleLocation(parts[0]!.start, parts[1]!.end, parts[0]!.strand);
  }
  return new CompoundLocation(parts, location instanceof CompoundLocation ? location.operator : "join");
}

/** The simple parts of a location, as an array. */
const partsOf = (location: AnyLocation): SimpleLocation[] =>
  location instanceof CompoundLocation ? [...location.parts] : [location];

/**
 * Turn a whole record over: the reverse complement of the sequence, with every feature's location mirrored and its
 * strand flipped.
 *
 * This is Biopython's `SeqRecord.reverse_complement` in the case that matters, and it is reused rather than
 * reimplemented: the only thing added is keeping the `topology` annotation, which Biopython drops along with the
 * rest of `annotations` unless asked for them.
 *
 * @param record - The record. It is not changed.
 * @param keepAnnotations - Carry the id, name, description, annotations and dbxrefs over. Defaults to true, which
 *   is what an editor wants; Biopython's own default is to drop them.
 * @returns The reverse-complemented record.
 * @example
 * ```ts
 * const flipped = reverseComplementRecord(record);
 * flipped.features[0]!.location!.strand; // -1 where it was +1
 * ```
 */
export function reverseComplementRecord(record: SeqRecord, keepAnnotations = true): SeqRecord {
  // A feature with no location cannot be flipped, and Biopython (and so the faithful port in @biolibs/seqrecord)
  // raises on one while reading `location.flip`. Here such a feature survives untouched, as it does through
  // `applyEdit`: there is nothing in it to move, and crashing on it would make the record uneditable.
  const placed = record.features.filter((feature) => feature.location !== null);
  const unplaced = record.features.filter((feature) => feature.location === null);

  const source = unplaced.length === 0 ? record : withFeatures(record, placed);
  // Biopython's own defaults keep the features and per-letter annotations and drop everything else; `true` for a
  // field means "copy it from the source record".
  const answer = source.reverseComplement({
    features: true,
    letterAnnotations: true,
    id: keepAnnotations,
    name: keepAnnotations,
    description: keepAnnotations,
    dbxrefs: keepAnnotations,
    annotations: keepAnnotations,
  });
  for (const feature of unplaced) {
    answer.features.push(new SeqFeature(null, feature.type, feature.id, new Map(feature.qualifiers)));
  }
  return answer;
}

/**
 * A copy of a record carrying a different feature list, with everything else shared or copied.
 *
 * @param record - The record to copy.
 * @param features - The features the copy carries.
 * @returns The copy.
 */
function withFeatures(record: SeqRecord, features: SeqFeature[]): SeqRecord {
  const copy = new SeqRecord(
    record.seq, record.id, record.name, record.description,
    [...record.dbxrefs], features, new Map(record.annotations),
  );
  if (record.letterAnnotations.size > 0) copy.letterAnnotations = new Map(record.letterAnnotations);
  return copy;
}

/**
 * Rotate a circular record so that `origin` becomes its first base.
 *
 * The sequence is unchanged as a circle; only where it is written from moves. Features move with it, and one that
 * ends up spanning the new origin becomes a two-part join, which is how GenBank writes such a feature.
 *
 * @param record - The record. It is not changed.
 * @param origin - The base to start from, 0-based.
 * @param options - The new record's id; `edgeFeatures` is not used, since nothing is lost by rotating.
 * @returns The rotated record, still circular.
 * @throws {@link ValueError} if the record is not circular, or `origin` is outside it.
 * @example
 * ```ts
 * const rotated = rotateCircular(plasmid, 1000); // base 1000 becomes base 0
 * ```
 */
export function rotateCircular(record: SeqRecord, origin: number, options: Pick<RegionOptions, "id"> = {}): SeqRecord {
  const residues = residuesOf(record);
  const length = residues.length;
  if (!isCircular(record)) throw new ValueError("only a circular record can be rotated; set its topology annotation to 'circular'");
  if (!Number.isInteger(origin)) throw new ValueError(`origin must be an integer, got ${origin}`);
  if (origin < 0 || origin >= Math.max(1, length)) throw new ValueError(`origin ${origin} is outside a sequence of ${length} bases`);
  if (origin === 0) return record;

  const rotated = extractRegion(record, origin, origin + length, { id: options.id ?? record.id ?? undefined });
  // extractRegion returns a line; a rotated circle is still a circle.
  rotated.annotations.set("topology", "circular");
  return rotated;
}
