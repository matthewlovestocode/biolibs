/** Python slice and key helpers shared by the matrix and motif classes. */

import { sliceIndices, type PySlice } from "@biolibs/seq";

export type { PySlice };

/** A slice as the arguments of Python's `slice(start, stop, step)`; missing parts are `null`/`undefined`. */
export function isSlice(x: unknown): x is PySlice {
  return x !== null && typeof x === "object" && !Array.isArray(x) && !ArrayBuffer.isView(x);
}

/**
 * The indices `slice.indices(length)` selects.
 *
 * @param s - The slice.
 * @param length - Length of the sequence sliced.
 * @returns The selected indices in order.
 */
export function rangeOf(s: PySlice, length: number): number[] {
  const [start, stop, step] = sliceIndices(s, length);
  const out: number[] = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
  else for (let i = start; i > stop; i += step) out.push(i);
  return out;
}

/** `values[slice]` for an array. @param values - The array. @param s - The slice. */
export function sliceArray<T>(values: readonly T[], s: PySlice): T[] {
  return rangeOf(s, values.length).map((i) => values[i]!);
}

/** `values[::-1]`. @param values - The array. */
export function reversed<T>(values: readonly T[]): T[] {
  return [...values].reverse();
}
