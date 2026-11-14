/** Python's `format_string % args` for the common conversions, and the `PyFloat` marker for whole-number floats. */

import { ValueError } from "../errors.js";
import { pyFloatRepr, pyFormatFixed, pyFormatG } from "./num.js";
import { pyRepr, pyStr, pyTypeName, PyTuple } from "./repr.js";

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

/**
 * The number a `%d`/`%f`-type conversion takes (`PyFloat` and booleans count).
 *
 * @param arg - The value supplied. @param conv - The conversion character.
 * @param position - Which argument this is, counting from one; Python names it in the message.
 * @returns The number. @throws TypeError worded as Python words it.
 */
function realNumber(arg: unknown, conv: string, position: number | null): number {
  if (arg instanceof PyFloat) return arg.value;
  if (typeof arg === "number") return arg;
  if (typeof arg === "boolean") return arg ? 1 : 0;
  // `position` is null for Python's single-value form, which names no index.
  const where = position === null ? "format argument" : `format argument ${position}`;
  throw new TypeError(`${where}: %${conv} requires a real number, not ${pyTypeName(arg)}`);
}

/**
 * Python's `fmt % args` (printf-style formatting).
 *
 * Supports the conversions `d i u f F e E g G s r a c %`, the flags `-`, `+`, space, `#` and `0`, and width and precision (not `*`).
 *
 * Python words an argument complaint differently depending on the right-hand operand: `"%f" % "x"` says
 * `format argument: %f requires...` while `"%f" % ("x",)` says `format argument 1: ...`. A single
 * argument that is not a {@link PyTuple} is therefore taken as the first form, and anything else -- a
 * `PyTuple`, several values, or none -- as the second.
 *
 * @param fmt - The format string.
 * @param args - The values, in order (Python's tuple on the right of `%`). Pass a single `PyTuple` to
 *   mean a one-element tuple rather than a bare value.
 * @throws TypeError for a missing or surplus argument or a wrong type, ValueError for an unsupported format character.
 */
export function pyPercent(fmt: string, ...args: unknown[]): string {
  // A lone PyTuple is Python's tuple form with that tuple's contents; anything else is taken as given.
  const tupleForm = args.length !== 1 || args[0] instanceof PyTuple;
  const values: unknown[] = args.length === 1 && args[0] instanceof PyTuple
    ? [...(args[0] as PyTuple)]
    : args;
  let used = 0;
  let specs = 0;
  const out = fmt.replace(/%([-+ #0]*)(\d+)?(?:\.(\d*))?([a-zA-Z%])/g, (_m, flags: string, width: string | undefined, prec: string | undefined, conv: string, at: number) => {
    if (conv === "%") return "%";
    specs += 1;
    if (used >= values.length) {
      throw new TypeError(`not enough arguments for format string (got ${values.length})`);
    }
    const arg = values[used++];
    const p = prec === undefined ? undefined : prec === "" ? 0 : Number(prec);
    let body: string, sign = "";
    const numeric = "diufFeEgG".includes(conv);
    if (numeric) {
      let x = realNumber(arg, conv, tupleForm ? used : null);
      if (conv === "d" || conv === "i" || conv === "u") {
        if (!Number.isFinite(x)) throw new ValueError(`cannot convert float ${pyFloatRepr(x)} to integer`);
        x = Math.trunc(x);
        body = String(Math.abs(x));
        if (p !== undefined) body = body.padStart(p, "0");
      } else if (conv === "f" || conv === "F") body = pyFormatFixed(Math.abs(x), p ?? 6);
      else if (conv === "e" || conv === "E") body = formatExp(Math.abs(x), p ?? 6, conv === "E");
      else body = pyFormatG(Math.abs(x), p ?? 6, flags.includes("#"));
      if (!Number.isFinite(x) && conv !== "d") body = body.replace(/^-/, "");
      if (conv === "G" || conv === "F") body = body.toUpperCase();
      if (x < 0 || Object.is(x, -0)) sign = "-"; else if (flags.includes("+")) sign = "+"; else if (flags.includes(" ")) sign = " ";
    } else if (conv === "s") { body = typeof arg === "number" && !Number.isInteger(arg) ? pyFloatRepr(arg) : pyStr(arg); if (p !== undefined) body = Array.from(body).slice(0, p).join(""); }
    else if (conv === "r" || conv === "a") { body = pyRepr(arg); if (p !== undefined) body = Array.from(body).slice(0, p).join(""); }
    else if (conv === "c") body = typeof arg === "number" ? String.fromCodePoint(arg) : String(arg);
    // Python counts from the `%` itself, and `at` is where this match began -- `indexOf` would find the
    // first identical conversion rather than this one.
    else throw new ValueError(`unsupported format %${conv} at position ${at}`);
    const w = width === undefined ? 0 : Number(width);
    const text = sign + body;
    if (text.length >= w) return text;
    if (flags.includes("-")) return text.padEnd(w);
    if (flags.includes("0") && numeric) return sign + body.padStart(w - sign.length, "0");
    return text.padStart(w);
  });
  if (used < values.length) {
    throw new TypeError(
      `not all arguments converted during string formatting (required ${specs}, got ${values.length})`);
  }
  // A `%` that began no conversion is a stray one, which Python refuses rather than passing through. The
  // scan skips a `%%` pair, since that is an escaped percent and not the start of anything.
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] !== "%") continue;
    if (fmt[i + 1] === "%") { i += 1; continue; }
    if (!/^%[-+ #0]*\d*(?:\.\d*)?[a-zA-Z]/.test(fmt.slice(i))) {
      throw new ValueError(`stray % at position ${i}`);
    }
    // Step past the conversion this `%` began, so its characters are not scanned again.
    i += /^%[-+ #0]*\d*(?:\.\d*)?[a-zA-Z]/.exec(fmt.slice(i))![0].length - 1;
  }
  return out;
}
