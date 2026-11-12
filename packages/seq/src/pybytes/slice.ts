/** Python `slice` objects and index arithmetic. */

import { ValueError } from "@biolibs/core";

/** A Python `slice(start, stop, step)`. `null`/`undefined` mean "omitted". */
export interface PySlice {
  /** First index; negative counts from the end; omitted means the start in the direction of travel. */
  start?: number | null;
  /** Stop index (exclusive); negative counts from the end; omitted means the far end. */
  stop?: number | null;
  /** Stride; negative walks backwards; zero is invalid. Omitted means 1. */
  step?: number | null;
}

/** Python's floor division for integers. */
export const floorDiv = (a: number, b: number): number => Math.floor(a / b);

/** Python's modulo: the result has the sign of the divisor. */
export const pyMod = (a: number, b: number): number => ((a % b) + b) % b;

/**
 * Equivalent of Python's `slice.indices(length)`.
 *
 * @param s - The slice.
 * @param length - Length of the sequence being sliced.
 * @returns `[start, stop, step]` normalised so they can be used directly with `range`.
 * @throws {@link ValueError} if `step` is zero.
 */
export function sliceIndices(s: PySlice, length: number): [number, number, number] {
  if (length < 0) throw new ValueError("length should not be negative");
  const step = s.step ?? 1;
  if (step === 0) throw new ValueError("slice step cannot be zero");
  const lower = step < 0 ? -1 : 0;
  const upper = step < 0 ? length - 1 : length;
  // Clamp one bound the way CPython's PySlice_AdjustIndices does.
  const adjust = (v: number | null | undefined, dflt: number): number => {
    if (v === null || v === undefined) return dflt;
    if (v < 0) {
      v += length;
      return v < lower ? lower : v;
    }
    return v > upper ? upper : v;
  };
  const start = adjust(s.start, step < 0 ? upper : lower);
  const stop = adjust(s.stop, step < 0 ? lower : upper);
  return [start, stop, step];
}

/** Number of items in `range(start, stop, step)`. */
export function rangeLength(start: number, stop: number, step: number): number {
  if (step > 0) return start < stop ? Math.ceil((stop - start) / step) : 0;
  return stop < start ? Math.ceil((start - stop) / -step) : 0;
}

/**
 * Slice a Python `range(a, b)` (step 1) with a slice, as `range(a, b)[s]` does.
 *
 * @returns The `start`, `stop` and `step` of the resulting range.
 */
export function rangeSlice(a: number, b: number, s: PySlice): { start: number; stop: number; step: number } {
  const [st, sp, step] = sliceIndices(s, Math.max(0, b - a));
  return { start: a + st, stop: a + sp, step };
}

/**
 * Slice bytes with a stop that may be `null` (meaning "to the end in the
 * direction of travel"), like Python's `data[start:stop:step]`.
 */
export function bytesSlice(data: Uint8Array, start: number | null, stop: number | null, step: number | null): Uint8Array {
  const [a, b, st] = sliceIndices({ start, stop, step }, data.length);
  if (st === 1) return a < b ? data.slice(a, b) : new Uint8Array(0);
  const n = rangeLength(a, b, st);
  const out = new Uint8Array(n);
  for (let i = 0, j = a; i < n; i++, j += st) out[i] = data[j]!;
  return out;
}
