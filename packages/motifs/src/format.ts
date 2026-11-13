/** Small Python-formatting helpers: `%6.2f`, `%6d`, and the way Python prints special floats and sequences of numbers. */

import { pyFormatFixed, pyFormatG } from "@biolibs/core";

/**
 * `"%{width}.{digits}f" % x` (and `f"{x:{width}.{digits}f}"`): fixed-point text right-aligned in `width` columns.
 *
 * @param x - The number (`nan`, `inf` and `-inf` print as Python does).
 * @param width - Minimum width.
 * @param digits - Digits after the point.
 */
export function fixedWidth(x: number, width: number, digits: number): string {
  const s = Object.is(x, -0) ? "-" + pyFormatFixed(0, digits) : pyFormatFixed(x, digits);
  return s.padStart(width);
}

/** `"%{width}d" % n`. @param n - An integer. @param width - Minimum width. */
export function intWidth(n: number, width: number): string {
  return String(n).padStart(width);
}

/**
 * `"%.{precision}g" % x` (see `pyFormatG` in `@biolibs/core`).
 *
 * @param x - The number.
 * @param precision - Significant digits.
 */
export function formatG(x: number, precision = 6): string {
  return pyFormatG(x, precision);
}
