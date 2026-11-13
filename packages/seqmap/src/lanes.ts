/**
 * Stacking overlapping features into lanes.
 *
 * A sequence usually annotates overlapping features — a gene, its promoter and the CDS inside it — and drawing them
 * on one line hides all but the topmost. {@link packLanes} assigns each one the lowest free lane, so a map can draw
 * lane 0 nearest the sequence and stack the rest outwards, using as few lanes as a greedy pass can manage.
 *
 * Spans are half-open `[start, end)` base boundaries, like everything else in biolibs, so a feature ending where
 * another begins does not overlap it and the two share a lane.
 */

import { ValueError } from "@biolibs/core";

/** A half-open span of a sequence, `[start, end)`. */
export interface Span {
  /** First base covered. */
  start: number;
  /** One past the last base covered. Must not be below `start`. */
  end: number;
}

/**
 * Put each span in the lowest lane where it does not overlap something already there.
 *
 * Spans are considered longest-first within a starting position, so a long feature takes the inner lane and the
 * short ones that sit inside it stack above — the arrangement a reader expects.
 *
 * @param spans - The spans to place. Any order; the result comes back in the same order.
 * @param padding - Extra space in bases that must separate two spans sharing a lane. Useful when a map draws a label
 *   inside each block. Defaults to 0.
 * @returns The lane index for each span, in input order, counting from 0.
 * @throws {@link ValueError} for a non-finite bound, an `end` below its `start`, or a negative padding.
 * @example
 * ```ts
 * packLanes([{ start: 0, end: 100 }, { start: 50, end: 150 }, { start: 200, end: 300 }]);
 * // [0, 1, 0] — the third fits back in the first lane
 * ```
 */
export function packLanes(spans: readonly Span[], padding = 0): number[] {
  if (!Number.isFinite(padding) || padding < 0) throw new ValueError(`padding must be zero or more, got ${padding}`);
  for (const span of spans) {
    if (!Number.isFinite(span.start) || !Number.isFinite(span.end)) throw new ValueError(`span bounds must be finite, got ${span.start}..${span.end}`);
    if (span.end < span.start) throw new ValueError(`span end ${span.end} is before its start ${span.start}`);
  }

  // Earliest first, and among those starting together the longest first so it takes the inner lane.
  const order = spans.map((_, i) => i).sort((a, b) => {
    const byStart = spans[a]!.start - spans[b]!.start;
    if (byStart !== 0) return byStart;
    const byLength = (spans[b]!.end - spans[b]!.start) - (spans[a]!.end - spans[a]!.start);
    return byLength !== 0 ? byLength : a - b;
  });

  const lanes: number[] = [];
  const result = new Array<number>(spans.length);
  for (const index of order) {
    const span = spans[index]!;
    let lane = lanes.findIndex((end) => end <= span.start);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = span.end + padding;
    result[index] = lane;
  }
  return result;
}

/**
 * How many lanes a set of spans needs.
 *
 * @param spans - The spans to place.
 * @param padding - As {@link packLanes}.
 * @returns The lane count, 0 for no spans.
 */
export function laneCount(spans: readonly Span[], padding = 0): number {
  const lanes = packLanes(spans, padding);
  return lanes.length === 0 ? 0 : Math.max(...lanes) + 1;
}

/**
 * Split a span that runs past the end of a circular sequence into the one or two pieces a map can draw.
 *
 * A feature on a plasmid may cross the origin, in which case it is drawn as two arcs: one to the end of the sequence
 * and one from the start. Everything else comes back unchanged, as a single piece.
 *
 * @param span - The span, whose `end` may exceed `length`.
 * @param length - The sequence length in bases.
 * @returns One piece, or two when the span crosses the origin, in the order they are met going forwards.
 * @throws {@link ValueError} for a length that is not positive, an `end` below its `start`, or a span longer than
 *   the sequence (which would wrap onto itself).
 * @example
 * ```ts
 * splitAtOrigin({ start: 2600, end: 2800 }, 2686); // [{ start: 2600, end: 2686 }, { start: 0, end: 114 }]
 * ```
 */
export function splitAtOrigin(span: Span, length: number): Span[] {
  if (!Number.isFinite(length) || length <= 0) throw new ValueError(`length must be a positive number, got ${length}`);
  if (span.end < span.start) throw new ValueError(`span end ${span.end} is before its start ${span.start}`);
  if (span.end - span.start > length) throw new ValueError(`span of ${span.end - span.start} bases is longer than the ${length}-base sequence`);
  if (span.end <= length) return [{ start: span.start, end: span.end }];
  return [{ start: span.start, end: length }, { start: 0, end: span.end - length }];
}
