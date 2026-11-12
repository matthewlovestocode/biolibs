/** A small Python `"%..." % value` formatter for one numeric value, enough for `Array.format`. */

import { OverflowError, TypeErrorPy, ValueError, pyFloatRepr, pyFormatFixed } from "./py-errors.js";

/** Pad `body` to `width` the way printf does (`-` left-justifies, `0` pads with zeros after the sign). */
function pad(sign: string, body: string, width: number, left: boolean, zero: boolean): string {
  const len = sign.length + body.length;
  if (len >= width) return sign + body;
  if (left) return sign + body + " ".repeat(width - len);
  if (zero) return sign + "0".repeat(width - len) + body;
  return " ".repeat(width - len) + sign + body;
}

/** Python's exponent style: at least two digits, always signed. */
function fixExponent(s: string): string {
  return s.replace(/e([+-])(\d)$/, "e$10$2");
}

/** `%e` with `prec` decimals. */
function expo(x: number, prec: number): string {
  return fixExponent(x.toExponential(prec));
}

/** `%g` with `prec` significant digits (`alt` keeps trailing zeros). */
function general(x: number, prec: number, alt: boolean): string {
  if (prec === 0) prec = 1;
  if (x === 0) return alt ? (0).toFixed(prec - 1) : "0";
  const exp = Number(x.toExponential(prec - 1).split("e")[1]);
  let s: string;
  if (exp >= -4 && exp < prec) {
    s = pyFormatFixed(x, prec - 1 - exp);
    if (!alt && s.includes(".")) s = s.replace(/\.?0+$/, "");
  } else {
    s = expo(x, prec - 1);
    if (!alt) s = s.replace(/\.?0+e/, "e");
  }
  return s;
}

/**
 * Format `value` with a Python `%` format string containing exactly one conversion.
 *
 * @param fmt - For example `"%i"`, `"%.1f"`, `"%5.2e"`, `"%s"`.
 * @param value - The number to format.
 * @param isInt - Whether the value is an integer (affects `%s`, which prints `1` for an integer and `1.0` for a float).
 * @throws {@link ValueError} for an unsupported or incomplete conversion.
 * @throws {@link TypeErrorPy} when the string has no conversion for the value ("not all arguments converted...").
 */
export function percentFormat(fmt: string, value: number, isInt: boolean): string {
  let out = "";
  let used = false;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i]!;
    if (c !== "%") { out += c; continue; }
    const m = /^%([-+ #0]*)(\d*)(?:\.(\d*))?[hlL]?(.?)/.exec(fmt.slice(i));
    const [whole, flags = "", w = "", p, t = ""] = m!;
    if (t === "") throw new ValueError("incomplete format");
    i += whole.length - 1;
    if (t === "%") {
      if (whole !== "%%") throw new ValueError(`stray % at position ${i - whole.length + 1} or unexpected format character '%' at position ${i}`);
      out += "%";
      continue;
    }
    if (used) throw new TypeErrorPy("not enough arguments for format string (got 1)");
    used = true;
    const left = flags.includes("-");
    const width = w === "" ? 0 : Number(w);
    const precision = p === undefined ? undefined : p === "" ? 0 : Number(p);
    const plus = flags.includes("+") ? "+" : flags.includes(" ") ? " " : "";
    const alt = flags.includes("#");
    const zero = flags.includes("0") && !left;
    let sign = value < 0 || Object.is(value, -0) && "fFeEgG".includes(t) ? "-" : plus;
    const a = Math.abs(value);
    let body: string;
    if ("diu".includes(t)) {
      if (Number.isNaN(value)) throw new ValueError("cannot convert float NaN to integer");
      if (!Number.isFinite(value)) throw new OverflowError("cannot convert float infinity to integer");
      body = String(Math.trunc(a));
      if (precision !== undefined) body = body.padStart(precision, "0");
      sign = Math.trunc(value) < 0 ? "-" : plus;
    } else if ("fFeEgG".includes(t)) {
      if (!Number.isFinite(value)) {
        body = Number.isNaN(value) ? "nan" : "inf";
        if (t === t.toUpperCase()) body = body.toUpperCase();
        out += pad(Number.isNaN(value) ? plus : sign, body, width, left, false);
        continue;
      }
      const prec = precision ?? 6;
      const lower = t.toLowerCase();
      body = lower === "f" ? pyFormatFixed(a, prec) : lower === "e" ? expo(a, prec) : general(a, prec, alt);
      if (t === t.toUpperCase()) body = body.toUpperCase();
    } else if ("xXo".includes(t)) {
      if (!isInt) throw new TypeErrorPy(`format argument: %${t} requires an integer, not float`);
      body = a.toString(t === "o" ? 8 : 16);
      if (t === "X") body = body.toUpperCase();
    } else if ("sra".includes(t)) {
      body = isInt ? String(value) : pyFloatRepr(value);
      if (value < 0) { sign = "-"; body = body.replace(/^-/, ""); } else sign = "";
      if (precision !== undefined) body = body.slice(0, precision);
      out += pad(sign, body, width, left, false);
      continue;
    } else {
      throw new ValueError(`unsupported format character '${t}' (0x${t.charCodeAt(0).toString(16)}) at index ${i}`);
    }
    out += pad(sign, body, width, left, zero && !("diu".includes(t) && precision !== undefined));
  }
  if (!used) throw new TypeErrorPy("not all arguments converted during string formatting (required 0, got 1)");
  return out;
}
