/** Python's `int(str)` for decimal text. */

import { ValueError } from "@biolibs/core";
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
  const m = /^\s*([+-]?)(\d+(?:_\d+)*)\s*$/.exec(text);
  if (!m) throw new ValueError(`invalid literal for int() with base 10: ${pyRepr(text)}`);
  const n = Number(m[2]!.replaceAll("_", ""));
  return m[1] === "-" ? -n : n;
}
