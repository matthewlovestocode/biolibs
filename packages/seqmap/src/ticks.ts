/**
 * The scale along a sequence map: choosing a round interval between tick marks, and the positions they fall at.
 *
 * A scale is readable only when its interval is a number people count in, so {@link tickStep} picks from 1, 2 and 5
 * times a power of ten — the same rule chart axes use.
 */

import { ValueError } from "@biolibs/core";

/**
 * A round interval between ticks that puts roughly `target` of them along a sequence.
 *
 * @param length - The sequence length in bases.
 * @param target - How many ticks are wanted. Defaults to 10.
 * @returns An interval of 1, 2 or 5 times a power of ten, never less than 1. A sequence of zero length gives 1.
 * @throws {@link ValueError} for a negative length or a target below 1.
 * @example
 * ```ts
 * tickStep(2686);     // 200  — 13 ticks
 * tickStep(2686, 5);  // 500  — 5 ticks
 * tickStep(45000);    // 5000
 * ```
 */
export function tickStep(length: number, target = 10): number {
  if (!Number.isFinite(length) || length < 0) throw new ValueError(`length must be a non-negative number, got ${length}`);
  if (!Number.isFinite(target) || target < 1) throw new ValueError(`target must be at least 1, got ${target}`);
  if (length === 0) return 1;

  const rough = length / target;
  if (rough <= 1) return 1;
  // Split the rough interval into a power of ten and a leading digit, then move the digit to the nearest of 1, 2, 5
  // and 10. "Nearest" is judged on the log scale, so the thresholds are the geometric means of each pair: rounding
  // up instead would always give fewer ticks than asked for.
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const leading = rough / magnitude;
  const nice = leading < Math.SQRT2 ? 1 : leading < Math.sqrt(10) ? 2 : leading < Math.sqrt(50) ? 5 : 10;
  return Math.max(1, nice * magnitude);
}

/**
 * The positions ticks fall at along a sequence.
 *
 * @param length - The sequence length in bases.
 * @param step - The interval between ticks, as {@link tickStep} gives it.
 * @param circular - True for a circular sequence, where position `length` is the same place as position 0 and so is
 *   left out. A linear sequence keeps both ends.
 * @returns The positions, ascending, starting at 0.
 * @throws {@link ValueError} for a negative length or a step that is not positive.
 * @example
 * ```ts
 * tickPositions(1000, 250, false); // [0, 250, 500, 750, 1000]
 * tickPositions(1000, 250, true);  // [0, 250, 500, 750]
 * ```
 */
export function tickPositions(length: number, step: number, circular: boolean): number[] {
  if (!Number.isFinite(length) || length < 0) throw new ValueError(`length must be a non-negative number, got ${length}`);
  if (!Number.isFinite(step) || step <= 0) throw new ValueError(`step must be a positive number, got ${step}`);
  if (length === 0) return [];

  const positions: number[] = [];
  for (let position = 0; position < length; position += step) positions.push(position);
  // A line has two visible ends, so it gets a tick at the far end unless a step already landed there.
  if (!circular && positions[positions.length - 1] !== length) positions.push(length);
  return positions;
}

/**
 * A tick's label, in the units a map of this size would use.
 *
 * @param position - The base position.
 * @param step - The interval between ticks, which decides whether kb is worth using.
 * @returns `"1,200"` for a fine scale, `"1.2 kb"` once ticks are 1000 bases apart or more.
 * @example
 * ```ts
 * tickLabel(1200, 200);   // "1,200"
 * tickLabel(1200, 1000);  // "1.2 kb"
 * tickLabel(2000, 1000);  // "2 kb"
 * ```
 */
export function tickLabel(position: number, step: number): string {
  if (step < 1000) return position.toLocaleString("en-US");
  const kb = position / 1000;
  // Keep one decimal only when it says something: 2 kb, not 2.0 kb.
  return `${Number.isInteger(kb) ? kb : Number(kb.toFixed(1))} kb`;
}
