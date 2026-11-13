/**
 * Moving a location through an edit.
 *
 * An edit replaces `template[start, end)` with new text. Every base boundary in the sequence therefore maps to a new
 * boundary, and {@link mapPosition} is that mapping. Positions before the edit are unmoved; positions after it move
 * by the change in length; positions inside the removed stretch have no exact answer, so they collapse to one end of
 * the replacement, chosen by `bias` so a feature's start and end collapse outwards and the feature survives as the
 * part of it that remains.
 *
 * Locations are half-open `[start, end)`, as in Biopython and everywhere else in biolibs.
 */

import { ValueError } from "@biolibs/core";

/** An edit: `[start, end)` of the sequence is replaced by `insert`. */
export interface SequenceEdit {
  /** First base replaced, 0-based. With `end === start` nothing is removed and `insert` goes in before `start`. */
  start: number;
  /** One past the last base replaced. */
  end: number;
  /** The bases put in their place. Empty to delete. */
  insert: string;
}

/**
 * Which way a position inside the removed stretch should collapse.
 *
 * `"start"` sends it to the start of the replacement and `"end"` to its end. A feature's own start uses `"start"`
 * and its end uses `"end"`, so a feature partly inside the edit keeps as much of itself as survives.
 */
export type Bias = "start" | "end";

/**
 * Check an edit against a sequence length.
 *
 * @param edit - The edit.
 * @param length - The sequence length in bases.
 * @throws {@link ValueError} for non-integer bounds, an `end` below its `start`, bounds outside the sequence, or an
 *   `insert` holding anything but letters.
 */
export function checkEdit(edit: SequenceEdit, length: number): void {
  const { start, end, insert } = edit;
  if (!Number.isInteger(start) || !Number.isInteger(end)) throw new ValueError(`edit bounds must be integers, got ${start} and ${end}`);
  if (end < start) throw new ValueError(`edit end ${end} is before its start ${start}`);
  if (start < 0 || end > length) throw new ValueError(`the edit ${start}..${end} is outside a sequence of ${length} bases`);
  if (!/^[A-Za-z]*$/.test(insert)) throw new ValueError(`the inserted bases may only be letters, got '${insert}'`);
}

/**
 * Where a base boundary ends up after an edit.
 *
 * @param position - A boundary from 0 to the sequence length.
 * @param edit - The edit being applied.
 * @param bias - Which way to collapse a position inside the removed stretch.
 * @returns The boundary in the edited sequence.
 * @example
 * ```ts
 * const edit = { start: 10, end: 20, insert: "AAA" }; // ten bases out, three in
 * mapPosition(5, edit, "start");   // 5  — before the edit, unmoved
 * mapPosition(30, edit, "start");  // 23 — after it, moved by -7
 * mapPosition(15, edit, "start");  // 10 — inside it, collapsed to the start
 * mapPosition(15, edit, "end");    // 13 — inside it, collapsed to the end
 * ```
 */
export function mapPosition(position: number, edit: SequenceEdit, bias: Bias): number {
  const { start, end, insert } = edit;
  const delta = insert.length - (end - start);

  // A pure insertion removes nothing, so a boundary exactly at the insertion point is beside the new bases rather
  // than around them: a left edge moves past them and a right edge stays before them. That keeps the inserted bases
  // outside a feature they merely abut, and agrees with `touches`.
  if (start === end) {
    if (position < start) return position;
    if (position > start) return position + delta;
    return bias === "start" ? start + insert.length : start;
  }

  // A replacement does remove bases. A boundary at the very start of it is the left edge of something the
  // replacement falls inside, so it does not move.
  if (position <= start) return position;
  if (position >= end) return position + delta;
  // Inside the stretch that was removed: there is no base left to point at.
  return bias === "start" ? start : start + insert.length;
}

/**
 * Whether an edit cuts through a boundary, i.e. removes bases on both sides of it.
 *
 * A boundary the edit does not cut through only moves, by a fixed amount, so its position object can be shifted and
 * keep its class and fuzziness. One the edit cuts through is a boundary the edit created, known exactly.
 *
 * @param position - The boundary.
 * @param edit - The edit.
 * @returns Whether the boundary falls strictly inside the removed stretch.
 */
export const cutsThrough = (position: number, edit: SequenceEdit): boolean =>
  edit.start < position && position < edit.end;

/**
 * How much the sequence length changes.
 *
 * @param edit - The edit.
 * @returns The change in bases: positive for a net insertion, negative for a net deletion.
 */
export const lengthChange = (edit: SequenceEdit): number => edit.insert.length - (edit.end - edit.start);

/**
 * Whether an edit touches a span, i.e. whether the two overlap at all.
 *
 * A pure insertion (`start === end`) touches a span only when it falls strictly inside it: an insertion exactly at a
 * span's boundary leaves the span alone rather than stretching it, which is what a caller editing next to a feature
 * expects.
 *
 * @param edit - The edit.
 * @param spanStart - The span's start.
 * @param spanEnd - The span's end.
 * @returns Whether the edit changes the bases the span covers.
 */
export function touches(edit: SequenceEdit, spanStart: number, spanEnd: number): boolean {
  if (edit.start === edit.end) return edit.start > spanStart && edit.start < spanEnd;
  return edit.start < spanEnd && spanStart < edit.end;
}
