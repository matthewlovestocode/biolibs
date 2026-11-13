/** Python numeric and character builtins whose behaviour differs from JavaScript's. */

import { ValueError } from "../errors.js";
import { pyRepr } from "./repr.js";
import { pyStrip } from "./str.js";

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

/**
 * Python's `float(text)` for strings: accepts surrounding whitespace, a sign, digits with single underscores
 * between them, a decimal point, an exponent, and `inf`/`infinity`/`nan` in any case.
 *
 * @example
 * ```ts
 * pyFloat(" 1_0.5e1 ");   // 105
 * ```
 * @throws {@link ValueError} ("could not convert string to float: 'x'") for anything else.
 */
export function pyFloat(text: string): number {
  const t = pyStrip(text);
  const digits = "\\d(?:_?\\d)*";
  const m = new RegExp(`^([+-]?)(?:(inf(?:inity)?)|(nan)|((?:${digits})?(?:\\.(?:${digits})?)?)(?:[eE]([+-]?${digits}))?)$`, "i").exec(t);
  const mantissaOk = m && (m[2] || m[3] || /\d/.test(m[4] ?? ""));
  if (!m || !mantissaOk) throw new ValueError(`could not convert string to float: ${pyRepr(text)}`);
  if (m[2]) return m[1] === "-" ? -Infinity : Infinity;
  if (m[3]) return NaN;
  const value = Number(`${m[4]!.replaceAll("_", "")}e${(m[5] ?? "0").replaceAll("_", "")}`);
  return m[1] === "-" ? -value : value;
}

/**
 * Python's `"%.{digits}f" % x`: fixed-point text where exact ties round to the even digit
 * (`toFixed` rounds them away from zero).
 *
 * @example
 * ```ts
 * pyFormatFixed(0.03125, 4);   // "0.0312"
 * ```
 */
export function pyFormatFixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf";
  const exact = Math.abs(x).toFixed(Math.min(100, digits + 60));
  const dot = exact.indexOf(".");
  const rest = exact.slice(dot + 1 + digits);
  if (/^50*$/.test(rest)) {
    const kept = exact.slice(0, digits === 0 ? dot : dot + 1 + digits);
    const lastDigit = Number(kept[kept.length - 1]);
    if (lastDigit % 2 === 0) return (x < 0 || Object.is(x, -0) ? "-" : "") + kept;
  }
  return x.toFixed(digits);
}

/**
 * Python's `sum()` of floats. CPython 3.12+ adds them with Neumaier compensation, so the result can
 * differ in the last bits from a plain left-to-right sum.
 *
 * @example
 * ```ts
 * pySum([0.1, 0.2, 0.3]);   // 0.6 (a naive sum gives 0.6000000000000001)
 * ```
 */
export function pySum(values: Iterable<number>): number {
  let sum = 0;
  let compensation = 0;
  for (const x of values) {
    const t = sum + x;
    // Keep what the addition rounded away, using whichever operand is larger as the reference.
    if (Math.abs(sum) >= Math.abs(x)) compensation += sum - t + x;
    else compensation += x - t + sum;
    sum = t;
  }
  // Do not let the correction turn an infinite or NaN sum into NaN.
  return compensation !== 0 && Number.isFinite(compensation) ? sum + compensation : sum;
}

/**
 * Python's `repr()` of a float: shortest round-trip digits, `.0` on whole numbers, and scientific
 * notation (`1e-05`, `2.5e-08`, `1e+16`) outside `1e-4 <= |x| < 1e16`.
 *
 * @example
 * ```ts
 * pyFloatRepr(0);          // "0.0"
 * pyFloatRepr(2.5e-8);     // "2.5e-08"
 * ```
 */
export function pyFloatRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x < 0 ? "-inf" : "inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const abs = Math.abs(x);
  if (abs >= 1e-4 && abs < 1e16) {
    const t = String(x);
    return t.includes(".") || t.includes("e") ? t : t + ".0";
  }
  // Scientific: mantissa digits from JavaScript's shortest form, exponent with at least two digits.
  const [mant, exp] = x.toExponential().split("e") as [string, string];
  const e = Number(exp);
  return `${mant}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
}

/**
 * `"%.{precision}g" % x` (and `format(x, "g")`): the shorter of fixed and exponent notation with `precision` significant digits and no
 * trailing zeros (`1`, `0.1`, `1e-05`, `1.5e+20`).
 *
 * @param x - The number.
 * @param precision - Significant digits.
 */
export function pyFormatG(x: number, precision = 6): string {
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
