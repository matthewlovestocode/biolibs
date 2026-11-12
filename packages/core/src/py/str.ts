/** Python's `str` whitespace handling, which differs slightly from JavaScript's `\s`. */

import { IndexError } from "../errors.js";

/** The characters Python's `str.split()`, `strip()` and friends treat as whitespace. */
const WS = " \\t\\n\\r\\x0b\\x0c\\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const LEADING = new RegExp(`^[${WS}]+`);
const TRAILING = new RegExp(`[${WS}]+$`);
const FIRST_WORD = new RegExp(`^[${WS}]*([^${WS}]+)`);

/** Python `str.strip()`. */
export function pyStrip(s: string): string {
  return s.replace(LEADING, "").replace(TRAILING, "");
}

/** Python `str.rstrip()`. */
export function pyRstrip(s: string): string {
  return s.replace(TRAILING, "");
}

/**
 * `s.split(None, 1)[0]`: the first whitespace-delimited word.
 *
 * @throws {@link IndexError} ("list index out of range") if `s` is empty or only whitespace.
 */
export function pyFirstWord(s: string): string {
  const m = FIRST_WORD.exec(s);
  if (m === null) throw new IndexError("list index out of range");
  return m[1]!;
}

/** Python `str.islower()`: at least one cased character and none upper-case. */
export function pyIsLower(s: string): boolean {
  return s === s.toLowerCase() && s !== s.toUpperCase();
}

/** Python `str.split()` with no arguments: the whitespace-separated words. */
export function pySplit(s: string): string[] {
  return s.split(new RegExp(`[${WS}]+`)).filter((w) => w.length > 0);
}

/** Python `str.isascii()`. */
export function pyIsAscii(s: string): boolean {
  return !/[^\x00-\x7f]/.test(s);
}

/** Python `str.isprintable()`: no control, format, surrogate, private-use, unassigned or separator characters other than the ASCII space. */
export function pyIsPrintable(s: string): boolean {
  return !/[\p{C}\p{Z}]/u.test(s.replaceAll(" ", ""));
}
