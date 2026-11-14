/** Python's `int(str)` for decimal text. */

import { ValueError } from "../errors.js";
import { pyRepr } from "./repr.js";

/**
 * Parse text the way Python's `int()` does: optional surrounding whitespace,
 * an optional sign, and digits that may be grouped with single underscores.
 *
 * @param text - The text to parse.
 * @returns The integer value.
 * @throws {@link ValueError} with Python's message if the text is not an integer.
 */
export function pyInt(text: string): number {
  // `\p{Nd}`, not `\d`: Python accepts any Unicode decimal digit, so int("٣") is 3. Only the digits
  // themselves are permissive -- the sign, the underscores and the surrounding whitespace are not.
  const m = /^\s*([+-]?)(\p{Nd}+(?:_\p{Nd}+)*)\s*$/u.exec(text);
  if (!m) throw new ValueError(`invalid literal for int() with base 10: ${pyRepr(text)}`);
  const digits = [...m[2]!.replaceAll("_", "")].map(digitValue).join("");
  const n = Number(digits);
  // `+ 0` so that int("-0") is 0 and not negative zero: Python has one integer zero, and a -0 leaking
  // out here compares unequal to 0 under Object.is and prints as "0", so it misleads twice over.
  return (m[1] === "-" ? -n : n) + 0;
}

/**
 * The value of one Unicode decimal digit, as an ASCII digit.
 *
 * Unicode lays each decimal script out as ten consecutive code points starting at its own zero, so the
 * value is the distance from whichever of the preceding nine code points is the lowest that is still a
 * digit.
 *
 * @param ch - A single character in category Nd.
 * @returns It as `"0"`–`"9"`.
 */
function digitValue(ch: string): string {
  const cp = ch.codePointAt(0)!;
  let zero = cp;
  while (zero > 0 && cp - zero < 9 && /\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero -= 1;
  return String(cp - zero);
}
