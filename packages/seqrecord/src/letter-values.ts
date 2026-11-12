/** Python sequence operations on per-letter annotation values (strings and arrays). */

import { pyTypeName } from "@biolibs/core";
import { sliceIndices, rangeLength, type PySlice } from "@biolibs/seq";
import type { LetterValue } from "./restricted-dict.js";

/** `len(value)`. @throws TypeError if the value has no length. */
export function letterLength(value: unknown): number {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  if (value instanceof Map) return value.size;
  throw new TypeError(`object of type '${pyTypeName(value)}' has no len()`);
}

/** `value[slice]` for a string or array, with Python slice semantics. */
export function sliceLetters(value: LetterValue, s: PySlice): LetterValue {
  const [start, stop, step] = sliceIndices(s, value.length);
  const n = rangeLength(start, stop, step);
  const indices = Array.from({ length: n }, (_, k) => start + k * step);
  return typeof value === "string" ? indices.map((i) => value[i]).join("") : indices.map((i) => value[i]);
}

/**
 * `a + b` for per-letter values: strings with strings, lists with lists.
 *
 * @throws TypeError with Python's message for any other combination.
 */
export function concatLetters(a: LetterValue, b: unknown): LetterValue {
  if (typeof a === "string" && typeof b === "string") return a + b;
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (typeof a === "string") throw new TypeError(`can only concatenate str (not "${pyTypeName(b)}") to str`);
  if (Array.isArray(a)) throw new TypeError(`can only concatenate list (not "${pyTypeName(b)}") to list`);
  throw new TypeError(`unsupported operand type(s) for +: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}
