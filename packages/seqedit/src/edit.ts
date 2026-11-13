/**
 * Editing a record: the sequence changes and every feature follows.
 *
 * The record is never changed in place — like the rest of biolibs, and like Biopython's `SeqRecord` operations, a
 * new record comes back. Annotations, dbxrefs and the id, name and description are carried over as they are; the
 * caller knows whether an edit invalidates them, and silently dropping an accession would lose more than it saved.
 *
 * Per-letter annotations are the one thing that cannot simply be carried over, since they are as long as the
 * sequence. They are edited in step with it: the stretch covering the removed bases is dropped, and the inserted
 * bases get `fill` (a space for a string, `null` for a list) because nothing is known about them.
 */

import { ValueError } from "@biolibs/core";
import { MutableSeq, Seq } from "@biolibs/seq";
import { SeqFeature } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { type AnyLocation, editLocation, locationLength } from "./locations.js";
import { type SequenceEdit, checkEdit, lengthChange } from "./shift.js";

/** How an edit treats the features it cuts through. */
export interface EditOptions {
  /**
   * `"clip"` (the default) keeps a feature the edit cuts through as the part of it that survives. `"drop"` removes
   * any feature the edit touches, which is what Biopython's slicing does.
   */
  cutFeatures?: "clip" | "drop";
  /** What to put in per-letter annotations for the inserted bases. A space for strings, `null` for lists. */
  fill?: string;
}

/** Clip features and fill per-letter annotations with a space. */
export const DEFAULT_EDIT_OPTIONS: Required<EditOptions> = { cutFeatures: "clip", fill: " " };

/**
 * Tidy up typed or pasted bases: upper case, and spaces, line breaks and position numbers dropped.
 *
 * @param text - The text as typed.
 * @returns The cleaned bases. Characters that are not letters, digits or whitespace are left in, so a caller can
 *   report them.
 * @example
 * ```ts
 * cleanBases("  1 acgt acgt \n 9 acgt"); // "ACGTACGTACGT"
 * ```
 */
export const cleanBases = (text: string): string => text.toUpperCase().replace(/[\s\d]/g, "");

/**
 * The sequence of a record as a plain string.
 *
 * @param record - The record.
 * @returns The sequence, or `""` for a record without one.
 * @throws {@link ValueError} if the record's sequence is undefined (a `SeqIO.index` placeholder, say).
 */
export function residuesOf(record: SeqRecord): string {
  const seq = record.seq;
  if (seq === null || seq === undefined) return "";
  try {
    return seq.toString();
  } catch (error) {
    throw new ValueError(`the record '${record.id ?? "?"}' has no readable sequence: ${String(error)}`);
  }
}

/**
 * Apply an edit to a record, moving every feature to match.
 *
 * @param record - The record to edit. It is not changed.
 * @param edit - The edit: `[start, end)` replaced by `insert`.
 * @param options - How to treat features the edit cuts through; see {@link DEFAULT_EDIT_OPTIONS}.
 * @returns A new record with the edited sequence and the features that survive.
 * @throws {@link ValueError} for an edit outside the sequence, with `end` below `start`, or with a non-letter in
 *   `insert`.
 * @example
 * ```ts
 * const edited = applyEdit(record, { start: 100, end: 110, insert: "GGGG" });
 * edited.seq.length; // six shorter than before
 * ```
 */
export function applyEdit(record: SeqRecord, edit: SequenceEdit, options: EditOptions = {}): SeqRecord {
  const o = { ...DEFAULT_EDIT_OPTIONS, ...options };
  const residues = residuesOf(record);
  checkEdit(edit, residues.length);

  const edited = residues.slice(0, edit.start) + edit.insert + residues.slice(edit.end);
  const features: SeqFeature[] = [];
  for (const feature of record.features) {
    if (feature.location === null) {
      // A feature with no location has nothing to move, so it survives untouched.
      features.push(cloneFeature(feature, null));
      continue;
    }
    const moved = moveFeature(feature.location as AnyLocation, edit, o.cutFeatures);
    if (moved === null) continue;
    features.push(cloneFeature(feature, moved));
  }

  const answer = new SeqRecord(
    sameKind(record.seq, edited),
    record.id, record.name, record.description,
    [...record.dbxrefs], features, new Map(record.annotations),
  );
  copyLetterAnnotations(record, answer, edit, o.fill);
  return answer;
}

/**
 * Move a feature's location through an edit under the chosen policy.
 *
 * @param location - The feature's location.
 * @param edit - The edit.
 * @param policy - `"clip"` keeps the surviving part; `"drop"` removes a feature the edit cuts through.
 * @returns The new location, or `null` if the feature does not survive.
 */
function moveFeature(location: AnyLocation, edit: SequenceEdit, policy: "clip" | "drop"): AnyLocation | null {
  const moved = editLocation(location, edit);
  if (moved === null) return null;
  if (policy === "clip") return moved;
  // Under "drop", a feature survives only if the edit changed none of the bases it covered. That is the bases the
  // location actually covers, not its outermost extent, so a join losing part of one exon is caught too.
  return locationLength(location) === locationLength(moved) ? moved : null;
}

/** A copy of a feature with a different location, keeping its type, id and qualifiers. */
function cloneFeature(feature: SeqFeature, location: AnyLocation | null): SeqFeature {
  return new SeqFeature(location, feature.type, feature.id, new Map(feature.qualifiers));
}

/** A sequence of the same class as the original, so a `MutableSeq` record stays mutable. */
function sameKind(original: Seq | MutableSeq | null, text: string): Seq | MutableSeq {
  return original instanceof MutableSeq ? new MutableSeq(text) : new Seq(text);
}

/**
 * Edit each per-letter annotation in step with the sequence.
 *
 * @param from - The record being edited.
 * @param to - The record being built.
 * @param edit - The edit.
 * @param fill - What the inserted bases get: this character for a string, `null` for a list.
 */
function copyLetterAnnotations(from: SeqRecord, to: SeqRecord, edit: SequenceEdit, fill: string): void {
  const source = from.letterAnnotations;
  if (source.size === 0) return;
  for (const [key, value] of source) {
    if (typeof value === "string") {
      to.letterAnnotations.set(key, value.slice(0, edit.start) + fill.repeat(edit.insert.length) + value.slice(edit.end));
    } else {
      const inserted = new Array<null>(edit.insert.length).fill(null);
      to.letterAnnotations.set(key, [...value.slice(0, edit.start), ...inserted, ...value.slice(edit.end)]);
    }
  }
}

/**
 * Replace a stretch of a record's sequence.
 *
 * @param record - The record. It is not changed.
 * @param start - First base replaced, 0-based.
 * @param end - One past the last base replaced.
 * @param bases - The bases put in their place.
 * @param options - As {@link applyEdit}.
 * @returns The edited record.
 */
export const replaceBases = (record: SeqRecord, start: number, end: number, bases: string, options?: EditOptions): SeqRecord =>
  applyEdit(record, { start, end, insert: bases }, options);

/**
 * Insert bases before a position, stretching no feature: a feature whose boundary is exactly `at` keeps its length,
 * and only a feature with `at` strictly inside it grows.
 *
 * @param record - The record. It is not changed.
 * @param at - The base the insertion goes before, 0-based. `record.seq.length` appends.
 * @param bases - The bases to insert.
 * @param options - As {@link applyEdit}.
 * @returns The edited record.
 */
export const insertBases = (record: SeqRecord, at: number, bases: string, options?: EditOptions): SeqRecord =>
  applyEdit(record, { start: at, end: at, insert: bases }, options);

/**
 * Delete a stretch of a record's sequence.
 *
 * @param record - The record. It is not changed.
 * @param start - First base deleted, 0-based.
 * @param end - One past the last base deleted.
 * @param options - As {@link applyEdit}.
 * @returns The edited record.
 */
export const deleteBases = (record: SeqRecord, start: number, end: number, options?: EditOptions): SeqRecord =>
  applyEdit(record, { start, end, insert: "" }, options);

/**
 * Apply several edits to a record at once.
 *
 * The edits are given in the coordinates of the *original* record and must not overlap, which is what a caller with
 * a list of changes to make actually has. They are applied from the end backwards, so each one's coordinates are
 * still valid when its turn comes.
 *
 * @param record - The record. It is not changed.
 * @param edits - The edits, in any order.
 * @param options - As {@link applyEdit}.
 * @returns The edited record.
 * @throws {@link ValueError} if two edits overlap, or for any edit {@link checkEdit} rejects.
 * @example
 * ```ts
 * applyEdits(record, [
 *   { start: 10, end: 20, insert: "" },
 *   { start: 100, end: 100, insert: "GAATTC" },
 * ]);
 * ```
 */
export function applyEdits(record: SeqRecord, edits: readonly SequenceEdit[], options: EditOptions = {}): SeqRecord {
  const length = residuesOf(record).length;
  for (const edit of edits) checkEdit(edit, length);

  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!;
    const current = ordered[i]!;
    // Two edits conflict when one's span reaches into the other's. Insertions at the same point are ambiguous too.
    const overlapping = current.start < previous.end || (current.start === previous.start && current.start === current.end);
    if (overlapping) throw new ValueError(`the edits ${previous.start}..${previous.end} and ${current.start}..${current.end} overlap`);
  }

  // Back to front, so an earlier edit's coordinates are untouched by a later one.
  let answer = record;
  for (let i = ordered.length - 1; i >= 0; i--) answer = applyEdit(answer, ordered[i]!, options);
  return answer;
}

/**
 * How much an edit changes a record's length, without applying it.
 *
 * @param edit - The edit.
 * @returns The change in bases.
 */
export const editLengthChange = lengthChange;
