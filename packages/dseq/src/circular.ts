/**
 * Indexing a circle: pydna's `CircularBytes`.
 *
 * A circular molecule has no first position, so reading from it has to wrap. pydna gives its dscode
 * string a `bytes` subclass with that behaviour, and these are the same operations over a plain string.
 * The semantics are peculiar in places and are kept as they are: a slice whose stop is not past its start
 * is read as going all the way round, and a search that would only match across the origin does not
 * count.
 */

import { ValueError, ZeroDivisionError } from "@biolibs/core";

/** Python's `IndexError`, which indexing an empty circle raises. */
export class IndexErrorPy extends ValueError {
  override name = "IndexError";
}

/**
 * One position of a circle, counted round as many times as needed.
 *
 * @param data - The circle. @param index - The position, of any size or sign.
 * @returns The character there.
 * @throws {@link IndexErrorPy} for an empty circle.
 */
export function circularAt(data: string, index: number): string {
  const n = data.length;
  if (n === 0) throw new IndexErrorPy("CircularBytes index out of range (empty bytes)");
  return data[((index % n) + n) % n]!;
}

/**
 * A stretch of a circle, wrapping as far as it needs to.
 *
 * @param data - The circle. @param start - Where to start, counted round; the origin by default.
 * @param stop - Where to stop, counted round; one turn from `start` by default.
 * @param step - How far to move each time, which may be negative.
 * @returns The characters, in the order the walk visits them.
 * @throws ValueError for a step of zero.
 */
export function circularSlice(data: string, start?: number | null, stop?: number | null, step?: number | null): string {
  const n = data.length;
  if (n === 0) return "";
  const by = step === undefined || step === null ? 1 : step;
  if (by === 0) throw new ValueError("slice step cannot be zero");
  let from: number, to: number;
  if (by > 0) {
    from = start === undefined || start === null ? 0 : start;
    if (stop === undefined || stop === null) to = from < 0 ? 0 : n;
    else to = stop;
    // A stop that is not past the start means a whole turn, not an empty slice.
    while (to <= from) to += n;
  } else {
    from = start === undefined || start === null ? n - 1 : start;
    to = stop === undefined || stop === null ? -1 : stop;
    while (to >= from) to -= n;
  }
  // pydna stops after one turn, or two when the step is a multiple of the length.
  const limit = by % n === 0 ? n : n * 2;
  let out = "";
  let count = 0;
  for (let i = from; by > 0 ? i < to : i > to; i += by) {
    out += data[((i % n) + n) % n]!;
    count += 1;
    if (count > limit) break;
  }
  return out;
}

/**
 * A fixed number of characters from a position, wrapping round.
 *
 * @param data - The circle. @param start - Where to start. @param length - How many to take.
 * @returns Them, or nothing for an empty circle or a length of zero or less.
 */
export function cutaround(data: string, start: number, length: number): string {
  const n = data.length;
  if (n === 0 || length <= 0) return "";
  const from = ((start % n) + n) % n;
  let out = "";
  for (let i = 0; i < length; i++) out += data[(from + i) % n]!;
  return out;
}

/**
 * Where a stretch first occurs on a circle.
 *
 * @param data - The circle. @param sub - What to look for. @param start - Where to start looking.
 * @returns The position, or -1; a match that only exists across the origin does not count, which is what
 *   pydna's own search over the doubled string comes to.
 */
export function circularFind(data: string, sub: string, start = 0): number {
  const n = data.length;
  if (n === 0) return -1;
  const doubled = data + data;
  const found = doubled.slice(0, n + sub.length - 1).indexOf(sub, start);
  return found === -1 || found >= n ? -1 : found;
}

/**
 * The same circle read from a different starting point.
 *
 * pydna writes this as `self[shift:] + self[:shift]` over its own wrapping slices, so a shift larger
 * than the circle does not simply wrap: both halves run a whole turn and the result comes out longer
 * than the circle. That is kept, because the slices it rests on are kept.
 *
 * @param data - The circle. @param shift - How far to move the origin.
 * @returns The rotated circle.
 * @throws ZeroDivisionError for an empty circle, which pydna divides by its own length.
 */
export function circularShifted(data: string, shift: number): string {
  if (data.length === 0) throw new ZeroDivisionError("division by zero");
  if (shift % data.length === 0) return data;
  return circularSlice(data, shift, null) + circularSlice(data, null, shift);
}

/**
 * Python's own slicing of a string, which a linear molecule uses.
 *
 * @param data - The string. @param start - Where to start. @param stop - Where to stop.
 * @param step - How far to move each time, which may be negative.
 * @returns The characters the walk visits.
 * @throws ValueError for a step of zero.
 */
export function pythonSlice(data: string, start?: number | null, stop?: number | null, step?: number | null): string {
  const n = data.length;
  const by = step === undefined || step === null ? 1 : step;
  if (by === 0) throw new ValueError("slice step cannot be zero");
  // A negative index counts from the end, and both ends are clamped to the string.
  const clamp = (i: number, low: number, high: number): number => Math.min(Math.max(i, low), high);
  let from: number, to: number;
  if (by > 0) {
    from = start === undefined || start === null ? 0 : clamp(start < 0 ? start + n : start, 0, n);
    to = stop === undefined || stop === null ? n : clamp(stop < 0 ? stop + n : stop, 0, n);
  } else {
    from = start === undefined || start === null ? n - 1 : clamp(start < 0 ? start + n : start, -1, n - 1);
    to = stop === undefined || stop === null ? -1 : clamp(stop < 0 ? stop + n : stop, -1, n - 1);
  }
  let out = "";
  for (let i = from; by > 0 ? i < to : i > to; i += by) out += data[i]!;
  return out;
}

/**
 * Put something else in place of one stretch of a circle.
 *
 * @param data - The circle. @param start - Where the stretch begins. @param end - Where it ends, which
 *   may be before `start` when the stretch crosses the origin. @param replacement - What to put there.
 * @returns The new circle, read from the same origin.
 * @throws ValueError when the replacement is not the same length as what it replaces.
 */
export function replaceWith(data: string, start: number, end: number, replacement: string): string {
  const shifted = circularShifted(data, start);
  const stop = end < start ? end + data.length : end;
  if (replacement.length !== stop - start) {
    throw new ValueError("Replacement length must match the length of the subsequence");
  }
  // The tail is taken with the wrapping slice, so a replacement as long as the whole circle still
  // leaves one turn of it behind, as pydna's does.
  return circularShifted(replacement + circularSlice(shifted, replacement.length, data.length), -start);
}
