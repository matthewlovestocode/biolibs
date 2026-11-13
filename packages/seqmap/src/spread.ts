/**
 * Pushing labels apart so they do not overlap.
 *
 * Feature labels want to sit next to the feature they name, but on a busy map several features fall within a few
 * pixels of each other and their labels collide. Both functions here move labels the least amount that separates
 * them by `gap`, keeping their order, so each label still points at roughly the right place.
 */

import { ValueError } from "@biolibs/core";
import { TAU, normalizeAngle } from "./polar.js";

/** Check a gap argument shared by both functions. */
function checkGap(gap: number): void {
  if (!Number.isFinite(gap) || gap < 0) throw new ValueError(`gap must be zero or more, got ${gap}`);
}

/** Indices of `values`, ordered by the value they point at. */
function ascendingOrder(values: readonly number[]): number[] {
  return values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
}

/**
 * Move values apart along a line so neighbours are at least `gap` apart, staying within `[low, high]`.
 *
 * Each value moves as little as possible, and the order of the values is kept: the smallest stays the smallest. When
 * `[low, high]` is too short to hold them all at `gap` apart, they are spread evenly across it instead, which is the
 * most readable thing left to do.
 *
 * @param values - The ideal position of each label. Any order; the result comes back in the same order.
 * @param gap - The least distance wanted between neighbours.
 * @param low - The lowest position allowed.
 * @param high - The highest position allowed. Must not be below `low`.
 * @returns A position for each input value, in input order.
 * @throws {@link ValueError} for a non-finite value, a negative gap, or `high` below `low`.
 * @example
 * ```ts
 * spreadApart([10, 11, 12], 5, 0, 100); // [6, 11, 16]
 * spreadApart([0, 0, 0], 10, 0, 100);   // [0, 10, 20]
 * ```
 */
export function spreadApart(values: readonly number[], gap: number, low: number, high: number): number[] {
  checkGap(gap);
  for (const value of values) {
    if (!Number.isFinite(value)) throw new ValueError(`every value must be finite, got ${value}`);
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) throw new ValueError(`low and high must be finite, got ${low} and ${high}`);
  if (high < low) throw new ValueError(`high ${high} is below low ${low}`);
  if (values.length === 0) return [];

  const order = ascendingOrder(values);
  const count = order.length;
  const needed = (count - 1) * gap;
  const result = new Array<number>(count);

  // Not enough room for everything at `gap` apart: share the space out evenly and accept the overlap.
  if (needed > high - low) {
    const step = count > 1 ? (high - low) / (count - 1) : 0;
    order.forEach((index, rank) => { result[index] = count > 1 ? low + rank * step : (low + high) / 2; });
    return result;
  }

  // Subtracting `rank * gap` turns "at least `gap` apart" into plain "non-decreasing", so the positions that move
  // the labels least are the isotonic regression of the shifted values — found by pool-adjacent-violators below.
  const shifted = order.map((index, rank) => values[index]! - rank * gap);
  const placed = poolAdjacentViolators(shifted).map((value, rank) => value + rank * gap);

  // The run may now hang over an end. It fits, so sliding the whole run back inside keeps every gap intact.
  const overshoot = placed[count - 1]! - high;
  const undershoot = low - placed[0]!;
  const shift = overshoot > 0 ? -overshoot : undershoot > 0 ? undershoot : 0;

  order.forEach((index, rank) => { result[index] = placed[rank]! + shift; });
  return result;
}

/**
 * The closest non-decreasing sequence to `values`, by least squares — the pool-adjacent-violators algorithm.
 *
 * Each run of values that would go downwards is replaced by its mean, repeatedly, until nothing goes downwards. The
 * result is the unique sequence that minimises the total squared movement, so labels end up where they were as far
 * as their ordering allows.
 *
 * @param values - The values to fit, in the order they must stay in.
 * @returns A non-decreasing sequence of the same length.
 */
function poolAdjacentViolators(values: readonly number[]): number[] {
  // Each block holds a mean and the number of values pooled into it.
  const means: number[] = [];
  const weights: number[] = [];
  for (const value of values) {
    means.push(value);
    weights.push(1);
    // Merge back while the block before this one sits higher, which would make the sequence decrease.
    while (means.length > 1 && means[means.length - 2]! > means[means.length - 1]!) {
      const mean = means.pop()!;
      const weight = weights.pop()!;
      const previousWeight = weights[weights.length - 1]!;
      const total = previousWeight + weight;
      means[means.length - 1] = (means[means.length - 1]! * previousWeight + mean * weight) / total;
      weights[weights.length - 1] = total;
    }
  }
  return means.flatMap((mean, i) => new Array<number>(weights[i]!).fill(mean));
}

/**
 * Move angles apart around a circle so neighbours are at least `gap` apart.
 *
 * The circle has no ends to push against, so the widest existing gap is used as the seam: labels are spread out from
 * there, which puts the unavoidable movement where there is most room. When the circle cannot hold them all at `gap`
 * apart, they are spaced evenly right round it.
 *
 * @param angles - The ideal angle of each label, in radians. Any order and any range; the result comes back in the
 *   same order, each angle in `[0, TAU)`.
 * @param gap - The least angle wanted between neighbours, in radians.
 * @returns An angle for each input, in input order.
 * @throws {@link ValueError} for a non-finite angle or a negative gap.
 * @example
 * ```ts
 * spreadAround([0, 0.01, 3], 0.2).length; // 3
 * ```
 */
export function spreadAround(angles: readonly number[], gap: number): number[] {
  checkGap(gap);
  for (const angle of angles) {
    if (!Number.isFinite(angle)) throw new ValueError(`every angle must be finite, got ${angle}`);
  }
  if (angles.length === 0) return [];
  if (angles.length === 1) return [normalizeAngle(angles[0]!)];

  const wrapped = angles.map(normalizeAngle);
  const order = ascendingOrder(wrapped);
  const count = order.length;
  const result = new Array<number>(count);

  // The circle cannot hold them: space them evenly from where the first one sits.
  if (count * gap >= TAU) {
    const start = wrapped[order[0]!]!;
    const step = TAU / count;
    order.forEach((index, rank) => { result[index] = normalizeAngle(start + rank * step); });
    return result;
  }

  // Find the widest gap between neighbours going round, counting the wrap from the last back to the first.
  let seam = 0;
  let widest = -1;
  for (let rank = 0; rank < count; rank++) {
    const here = wrapped[order[rank]!]!;
    const next = wrapped[order[(rank + 1) % count]!]!;
    const span = rank === count - 1 ? next + TAU - here : next - here;
    if (span > widest) { widest = span; seam = (rank + 1) % count; }
  }

  // Walk the circle once starting just after the seam, unwrapping angles so they only increase.
  const rotated = Array.from({ length: count }, (_, i) => order[(seam + i) % count]!);
  const unwrapped: number[] = [];
  for (const [i, index] of rotated.entries()) {
    const angle = wrapped[index]!;
    const previous = unwrapped[i - 1];
    unwrapped.push(previous === undefined || angle >= previous ? angle : angle + TAU * Math.ceil((previous - angle) / TAU));
  }

  // The run may use the whole circle but for one gap, so the last label stays clear of the first. Centring the
  // allowance in the seam lets the first label drift back into the space there as well as forward.
  const low = unwrapped[0]! - Math.max(0, (widest - gap) / 2);
  const spread = spreadApart(unwrapped, gap, low, low + TAU - gap);
  rotated.forEach((index, rank) => { result[index] = normalizeAngle(spread[rank]!); });
  return result;
}
