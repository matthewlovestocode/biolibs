/** Python numeric and character builtins whose behaviour differs from JavaScript's. */

import { ValueError } from "../errors.js";

/**
 * Python's `round(x)` for floats: ties go to the nearest *even* integer
 * (`round(2.5)` is 2, `round(3.5)` is 4), unlike `Math.round`.
 */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/**
 * Python's `chr(n)`.
 *
 * @throws {@link ValueError} ("chr() arg not in range(0x110000)") for values outside the Unicode range.
 */
export function pyChr(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) throw new ValueError("chr() arg not in range(0x110000)");
  return String.fromCodePoint(n);
}
