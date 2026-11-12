/** Shared types for records. */

import type { LetterValue } from "./restricted-dict.js";

/** Free-form annotations: key to value (strings, numbers, lists, ...). */
export type AnnotationsInput = Map<string, unknown> | Record<string, unknown>;

/** Per-letter annotations as accepted by the constructor and setter. */
export type LetterAnnotationsInput = Map<string, LetterValue> | Record<string, LetterValue>;

/** Convert annotations given as a plain object to a `Map`; `Map`s are used as they are (shared, like a Python dict). */
export function toMap<V>(input: Map<string, V> | Record<string, V>): Map<string, V> {
  return input instanceof Map ? input : new Map(Object.entries(input));
}

/** Python's `isinstance(x, dict)` for annotation arguments. */
export function isDict(x: unknown): x is Map<string, unknown> | Record<string, unknown> {
  return x instanceof Map || (x !== null && typeof x === "object" && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype);
}
