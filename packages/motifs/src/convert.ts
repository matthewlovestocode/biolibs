/** Python's `int(x)` and `float(x)` for attribute values that may be missing. */

import { pyFloat, pyInt } from "@biolibs/core";

/** `int(value)`. @throws TypeError for null (Python's message), ValueError for text that is not an integer. */
export function intOf(value: string | null): number {
  if (value === null) throw new TypeError("int() argument must be a string, a bytes-like object or a real number, not 'NoneType'");
  return pyInt(value);
}

/** `float(value)`. @throws TypeError for null (Python's message), ValueError for text that is not a number. */
export function floatOf(value: string | null): number {
  if (value === null) throw new TypeError("float() argument must be a string or a real number, not 'NoneType'");
  return pyFloat(value);
}

