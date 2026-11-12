/** `datetime.strptime(text, "%Y.%m.%d")`. */

import { ValueError } from "@biolibs/core";
import { dateText } from "../abi/datetime.js";

/**
 * Parse a `YYYY.MM.DD` date like Python's `strptime`, giving midnight UTC as a JavaScript `Date`.
 *
 * @throws {@link ValueError} if the text does not match, has trailing characters, or is not a real date.
 */
export function dateFromStrptime(text: string): Date {
  // Same field patterns as `_strptime`: a four-digit year, month 1-12 and day 1-31, each with an optional leading zero.
  const m = /^(\d\d\d\d)\.(1[0-2]|0[1-9]|[1-9])\.(3[0-1]|[1-2]\d|0[1-9]|[1-9]| [1-9])/.exec(text);
  if (!m) throw new ValueError(`time data ${pyQuote(text)} does not match format '%Y.%m.%d'`);
  if (m[0].length !== text.length) throw new ValueError(`unconverted data remains: ${text.slice(m[0].length)}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3]!.trim())];
  dateText([y, mo, d]); // validates the calendar date with Python's messages
  return new Date(Date.UTC(y, mo - 1, d));
}

/** Python `repr()` of a string. */
function pyQuote(s: string): string {
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replaceAll("'", "\\'")}'`;
}
