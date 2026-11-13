/** Small Python-formatting helpers: `%6.2f`, `%6d`, and the way Python prints special floats and sequences of numbers. */

import { pyFormatFixed } from "@biolibs/core";

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
 * `"%.{precision}g" % x`: the shorter of fixed and exponent notation with `precision` significant digits and no
 * trailing zeros (`1`, `0.1`, `1e-05`, `1.5e+20`).
 *
 * @param x - The number.
 * @param precision - Significant digits.
 */
export function formatG(x: number, precision = 6): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf";
  const p = precision === 0 ? 1 : precision;
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  const [mant, e] = x.toExponential(p - 1).split("e") as [string, string];
  const exp = Number(e);
  if (exp < -4 || exp >= p) {
    const m = mant.includes(".") ? mant.replace(/0+$/, "").replace(/\.$/, "") : mant;
    return `${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  const s = x.toFixed(Math.max(0, p - 1 - exp));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
