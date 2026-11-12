/** Python `%`-format and `str.format` building blocks the structure writers need, with Python's errors and rounding. */

import { pyFormatFixed } from "@biolibs/core";

/** Python `OverflowError` (infinite float converted to an integer). */
export class OverflowError extends Error {
  override name = "OverflowError";
}

/** Python `AssertionError` (a failed `assert`, which carries no message). */
export class AssertionError extends Error {
  override name = "AssertionError";
}

/** Python `UnboundLocalError` (a local variable read before assignment). */
export class UnboundLocalError extends Error {
  override name = "UnboundLocalError";
}

/**
 * Python `len(str)`: the number of code points, not UTF-16 units.
 *
 * @param s - The text.
 * @returns Its length in code points.
 */
export function strLen(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/**
 * Python `"%.{digits}f" % x`, including `-0.000` for negative zero and full digits beyond 1e21.
 *
 * @param x - The number.
 * @param digits - Digits after the point.
 * @returns The fixed-point text (`nan`, `inf` and `-inf` for non-finite input).
 */
export function fixed(x: number, digits: number): string {
  if (Object.is(x, -0)) return "-0" + (digits > 0 ? "." + "0".repeat(digits) : "");
  // toFixed switches to exponent notation from 1e21; such values are whole numbers, so BigInt prints them exactly.
  if (Number.isFinite(x) && Math.abs(x) >= 1e21) return BigInt(x).toString() + (digits > 0 ? "." + "0".repeat(digits) : "");
  return pyFormatFixed(x, digits);
}

/**
 * Right-align text in `width` columns, counting code points (`"%8s"`, `"{:8}"` on numbers).
 *
 * @param s - The text.
 * @param width - The minimum width.
 */
export function padLeft(s: string, width: number): string {
  return " ".repeat(Math.max(0, width - strLen(s))) + s;
}

/**
 * Left-align text in `width` columns, counting code points (`"%-4s"`, `"{:<8}"`).
 *
 * @param s - The text.
 * @param width - The minimum width.
 */
export function padRight(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - strLen(s)));
}

/**
 * Python `int(x)` for a float or integer: truncate toward zero.
 *
 * @param x - The number.
 * @throws ValueError-style `Error` for NaN and {@link OverflowError} for infinities, with Python's messages.
 */
export function truncInt(x: number): number {
  if (Number.isNaN(x)) {
    const e = new Error("cannot convert float NaN to integer");
    e.name = "ValueError";
    throw e;
  }
  if (!Number.isFinite(x)) throw new OverflowError("cannot convert float infinity to integer");
  return Math.trunc(x) + 0;
}

/**
 * `"%{width}i" % x`: an integer right-aligned in `width` columns.
 *
 * @param x - A number (floats are truncated, as Python does).
 * @param width - The minimum width.
 */
export function pctI(x: number, width: number): string {
  return padLeft(String(truncInt(x)), width);
}

/**
 * `"%c" % s`: exactly one character.
 *
 * @param s - The text.
 * @param position - 1-based index of the argument in the format's tuple, which Python's message names.
 * @throws TypeError with Python's message unless `s` is one code point long.
 */
export function pctC(s: string, position: number): string {
  const n = strLen(s);
  if (n !== 1) throw new TypeError(`format argument ${position}: %c requires an integer or a unicode character, not a string of length ${n}`);
  return s;
}

/**
 * Python `str.capitalize()`: first character upper case, the rest lower case.
 *
 * @param s - The text.
 */
export function capitalize(s: string): string {
  const [first = "", ...rest] = Array.from(s);
  return first.toUpperCase() + rest.join("").toLowerCase();
}
