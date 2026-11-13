/** Python's `format_string % args` for the common conversions, and the `PyFloat` marker for whole-number floats. */

import { ValueError } from "../errors.js";
import { pyFloatRepr, pyFormatFixed, pyFormatG } from "./num.js";
import { pyRepr, pyStr, pyTypeName } from "./repr.js";

/** A Python `float`: JavaScript numbers that are whole count as `int`, so a float with a whole value is wrapped. */
export class PyFloat {
  /** @param value - The number. */
  constructor(readonly value: number) {}
  /** @returns Python's `str(float)`. */
  toString(): string { return pyFloatRepr(this.value); }
  /** @returns Python's `repr(float)`. */
  repr(): string { return pyFloatRepr(this.value); }
}

/** `%e` text: `d.dddde+XX` with at least two exponent digits. */
function formatExp(x: number, precision: number, upper: boolean): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf";
  const [mant, e] = x.toExponential(precision).split("e") as [string, string];
  const exp = Number(e);
  const s = `${mant}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  return upper ? s.toUpperCase() : s;
}

/** The number a `%d`/`%f`-type conversion takes (`PyFloat` and booleans count). */
function realNumber(arg: unknown, conv: string): number {
  if (arg instanceof PyFloat) return arg.value;
  if (typeof arg === "number") return arg;
  if (typeof arg === "boolean") return arg ? 1 : 0;
  throw new TypeError(`format argument: %${conv} requires a real number, not ${pyTypeName(arg)}`);
}

/**
 * Python's `fmt % args` (printf-style formatting).
 *
 * Supports the conversions `d i u f F e E g G s r a c %`, the flags `-`, `+`, space, `#` and `0`, and width and precision (not `*`).
 *
 * @param fmt - The format string.
 * @param args - The values, in order (Python's tuple on the right of `%`).
 * @throws TypeError for a missing or surplus argument or a wrong type, ValueError for an unsupported format character.
 */
export function pyPercent(fmt: string, ...args: unknown[]): string {
  let used = 0;
  let specs = 0;
  const out = fmt.replace(/%([-+ #0]*)(\d+)?(?:\.(\d*))?([a-zA-Z%])/g, (_m, flags: string, width: string | undefined, prec: string | undefined, conv: string) => {
    if (conv === "%") return "%";
    specs += 1;
    if (used >= args.length) throw new TypeError(`not enough arguments for format string (got ${args.length})`);
    const arg = args[used++];
    const p = prec === undefined ? undefined : prec === "" ? 0 : Number(prec);
    let body: string, sign = "";
    const numeric = "diufFeEgG".includes(conv);
    if (numeric) {
      let x = realNumber(arg, conv);
      if (conv === "d" || conv === "i" || conv === "u") {
        if (!Number.isFinite(x)) throw new ValueError(`cannot convert float ${pyFloatRepr(x)} to integer`);
        x = Math.trunc(x);
        body = String(Math.abs(x));
        if (p !== undefined) body = body.padStart(p, "0");
      } else if (conv === "f" || conv === "F") body = pyFormatFixed(Math.abs(x), p ?? 6);
      else if (conv === "e" || conv === "E") body = formatExp(Math.abs(x), p ?? 6, conv === "E");
      else body = pyFormatG(Math.abs(x), p ?? 6);
      if (!Number.isFinite(x) && conv !== "d") body = body.replace(/^-/, "");
      if (conv === "G" || conv === "F") body = body.toUpperCase();
      if (x < 0 || Object.is(x, -0)) sign = "-"; else if (flags.includes("+")) sign = "+"; else if (flags.includes(" ")) sign = " ";
    } else if (conv === "s") { body = typeof arg === "number" && !Number.isInteger(arg) ? pyFloatRepr(arg) : pyStr(arg); if (p !== undefined) body = Array.from(body).slice(0, p).join(""); }
    else if (conv === "r" || conv === "a") { body = pyRepr(arg); if (p !== undefined) body = Array.from(body).slice(0, p).join(""); }
    else if (conv === "c") body = typeof arg === "number" ? String.fromCodePoint(arg) : String(arg);
    else throw new ValueError(`unsupported format %${conv} at position ${fmt.indexOf(_m) + _m.length - 1}`);
    const w = width === undefined ? 0 : Number(width);
    const text = sign + body;
    if (text.length >= w) return text;
    if (flags.includes("-")) return text.padEnd(w);
    if (flags.includes("0") && numeric) return sign + body.padStart(w - sign.length, "0");
    return text.padStart(w);
  });
  if (used < args.length) throw new TypeError(`not all arguments converted during string formatting (required ${specs}, got ${args.length})`);
  return out;
}
