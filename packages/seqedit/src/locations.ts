/**
 * Carrying a feature's location through an edit.
 *
 * Biopython's `SeqRecord` slicing keeps only the features that fall wholly inside the slice and drops the rest. That
 * is right for slicing, but an editor needs more: when a gene is half deleted the annotation should survive as the
 * half that remains, not vanish. So {@link editLocation} clips rather than drops.
 *
 * Where the two overlap they agree exactly, which the golden tests measure against Biopython 1.88:
 *
 * - A boundary the edit did not cut through is *shifted*, not rebuilt, so its class and fuzziness survive — a
 *   `BeforePosition` stays a `BeforePosition` and a `WithinPosition` keeps its range, as Biopython's
 *   `location + offset` does.
 * - A boundary the edit did cut through becomes an `ExactPosition`, because the edit created it and it is known
 *   exactly. There is nothing in Biopython to compare this with: it drops the feature instead.
 * - A `CompoundLocation` carries each part through and keeps its operator; one left with a single part collapses to
 *   a `SimpleLocation`.
 */

import { CompoundLocation, ExactPosition, type Position, SimpleLocation } from "@biolibs/seqfeature";
import { type SequenceEdit, cutsThrough, mapPosition } from "./shift.js";

/** A location as this package handles it: a simple span or a join of them. */
export type AnyLocation = SimpleLocation | CompoundLocation;

/**
 * The span of one part of a location, as plain numbers.
 *
 * Fuzzy positions are read as their numeric value, which is what `valueOf()` gives and what Biopython's `int()`
 * gives.
 *
 * @param part - A simple location.
 * @returns Its start and end as numbers.
 */
export const spanOf = (part: SimpleLocation): { start: number; end: number } => ({
  start: Number(part.start), end: Number(part.end),
});

/**
 * Move a boundary through an edit, keeping its class when the edit only shifted it.
 *
 * @param original - The position as it was.
 * @param was - Its numeric value.
 * @param edit - The edit.
 * @param bias - Which way to collapse a boundary inside the removed stretch.
 * @returns The new position: the original shifted (class and fuzziness kept), or an exact position where the edit
 *   cut through it and so created the boundary itself.
 */
function movePosition(original: Position, was: number, edit: SequenceEdit, bias: "start" | "end"): Position {
  const moved = mapPosition(was, edit, bias);
  return cutsThrough(was, edit) ? new ExactPosition(moved) : (original.add(moved - was) as Position);
}

/**
 * Carry one simple location through an edit.
 *
 * @param part - The location.
 * @param edit - The edit.
 * @returns The moved location, or `null` when the edit removes every base it covered.
 */
function editPart(part: SimpleLocation, edit: SequenceEdit): SimpleLocation | null {
  const { start, end } = spanOf(part);
  // The start collapses towards the start of the replacement and the end towards its end, so a feature that is only
  // partly removed keeps the part of itself that survives.
  const newStart = movePosition(part.start, start, edit, "start");
  const newEnd = movePosition(part.end, end, edit, "end");
  if (Number(newEnd) <= Number(newStart)) return null;
  return new SimpleLocation(newStart, newEnd, part.strand, part.ref, part.refDb);
}

/**
 * Carry a location through an edit, clipping it to the bases that remain.
 *
 * @param location - A `SimpleLocation` or `CompoundLocation`.
 * @param edit - The edit being applied.
 * @returns The moved location, or `null` when nothing of it is left. A `CompoundLocation` whose parts are reduced to
 *   one comes back as a `SimpleLocation`.
 * @example
 * ```ts
 * const gene = new SimpleLocation(100, 200, 1);
 * editLocation(gene, { start: 0, end: 50, insert: "" });    // 50..150, strand kept
 * editLocation(gene, { start: 150, end: 250, insert: "" }); // 100..150, the half that survives
 * editLocation(gene, { start: 0, end: 300, insert: "" });   // null
 * ```
 */
export function editLocation(location: AnyLocation, edit: SequenceEdit): AnyLocation | null {
  if (location instanceof CompoundLocation) {
    const parts = location.parts.map((part) => editPart(part, edit)).filter((part): part is SimpleLocation => part !== null);
    if (parts.length === 0) return null;
    // A join of one is not a join; Biopython's own location arithmetic collapses these too.
    if (parts.length === 1) return parts[0]!;
    return new CompoundLocation(parts, location.operator);
  }
  return editPart(location, edit);
}

/**
 * Move a location by a fixed offset.
 *
 * This is Biopython's `location + offset`, and delegates to the port's own `shift`, so every position's class and
 * fuzziness is kept. The golden tests compare it with Biopython directly.
 *
 * @param location - A `SimpleLocation` or `CompoundLocation`.
 * @param offset - Bases to move it by; may be negative.
 * @returns The moved location.
 * @example
 * ```ts
 * shiftLocation(new SimpleLocation(10, 20, 1), 100); // 110..120
 * ```
 */
export function shiftLocation(location: AnyLocation, offset: number): AnyLocation {
  return location.shift(offset) as AnyLocation;
}

/**
 * The span a location covers, from its lowest start to its highest end, ignoring the gaps in a join.
 *
 * @param location - A `SimpleLocation` or `CompoundLocation`.
 * @returns The outermost bounds as numbers.
 */
export function locationExtent(location: AnyLocation): { start: number; end: number } {
  return { start: Number(location.start), end: Number(location.end) };
}

/**
 * How many bases a location actually covers, counting the parts of a join and not the gaps between them.
 *
 * @param location - A `SimpleLocation` or `CompoundLocation`.
 * @returns The base count.
 * @example
 * ```ts
 * locationLength(new CompoundLocation([new SimpleLocation(0, 10), new SimpleLocation(20, 30)])); // 20
 * ```
 */
export function locationLength(location: AnyLocation): number {
  if (location instanceof CompoundLocation) {
    return location.parts.reduce((total, part) => total + (Number(part.end) - Number(part.start)), 0);
  }
  return Number(location.end) - Number(location.start);
}

/**
 * Clip a location to a window of the sequence and re-base it on that window, which is what cutting a region out of a
 * record needs.
 *
 * A boundary inside the window is shifted and keeps its class; one outside is cut back to the window's edge and
 * becomes exact.
 *
 * @param location - A `SimpleLocation` or `CompoundLocation`.
 * @param windowStart - First base of the window, 0-based.
 * @param windowEnd - One past the last base.
 * @returns The clipped location, with positions counted from `windowStart`, or `null` when the location lies wholly
 *   outside the window.
 * @example
 * ```ts
 * clipLocation(new SimpleLocation(90, 150, 1), 100, 200); // 0..50 — the part inside, re-based
 * ```
 */
export function clipLocation(location: AnyLocation, windowStart: number, windowEnd: number): AnyLocation | null {
  if (location instanceof CompoundLocation) {
    const parts = location.parts
      .map((part) => clipPart(part, windowStart, windowEnd))
      .filter((part): part is SimpleLocation => part !== null);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0]!;
    return new CompoundLocation(parts, location.operator);
  }
  return clipPart(location, windowStart, windowEnd);
}

/**
 * Clip one simple location to a window and re-base it.
 *
 * @param part - The location.
 * @param windowStart - First base of the window.
 * @param windowEnd - One past the last base.
 * @returns The clipped location, or `null` when none of it is in the window.
 */
function clipPart(part: SimpleLocation, windowStart: number, windowEnd: number): SimpleLocation | null {
  const { start, end } = spanOf(part);
  const clippedStart = Math.max(start, windowStart);
  const clippedEnd = Math.min(end, windowEnd);
  if (clippedEnd <= clippedStart) return null;
  return new SimpleLocation(
    // A boundary already inside the window is only shifted, so it keeps its class and fuzziness, as Biopython's
    // slicing does; one cut back to the window's edge is known exactly.
    start >= windowStart ? (part.start.add(-windowStart) as Position) : new ExactPosition(clippedStart - windowStart),
    end <= windowEnd ? (part.end.add(-windowStart) as Position) : new ExactPosition(clippedEnd - windowStart),
    part.strand, part.ref, part.refDb,
  );
}
