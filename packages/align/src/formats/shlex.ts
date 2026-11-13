/** Python's `shlex.split(line)` (POSIX mode, no comments). */

import { ValueError } from "@biolibs/core";

/**
 * Split a string into words the way a POSIX shell would: white space separates words, single quotes keep everything,
 * double quotes keep everything but allow `\"` and `\\`, and a backslash outside quotes escapes the next character.
 *
 * @param text - The text to split.
 * @returns The words.
 * @throws ValueError for an unclosed quotation or a trailing backslash.
 */
export function shlexSplit(text: string): string[] {
  const words: string[] = [];
  let word = "";
  let inWord = false;
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    const c = chars[i++]!;
    if (/\s/.test(c) && " \t\r\n".includes(c)) {
      if (inWord) { words.push(word); word = ""; inWord = false; }
    } else if (c === "'") {
      inWord = true;
      let closed = false;
      while (i < chars.length) { const d = chars[i++]!; if (d === "'") { closed = true; break; } word += d; }
      if (!closed) throw new ValueError("No closing quotation");
    } else if (c === '"') {
      inWord = true;
      let closed = false;
      while (i < chars.length) {
        const d = chars[i++]!;
        if (d === '"') { closed = true; break; }
        if (d === "\\") {
          if (i >= chars.length) throw new ValueError("No escaped character");
          const e = chars[i++]!;
          // Inside double quotes a backslash only escapes `"` and `\`; otherwise it stays.
          word += e === '"' || e === "\\" ? e : "\\" + e;
        } else word += d;
      }
      if (!closed) throw new ValueError("No closing quotation");
    } else if (c === "\\") {
      if (i >= chars.length) throw new ValueError("No escaped character");
      inWord = true;
      word += chars[i++]!;
    } else { inWord = true; word += c; }
  }
  if (inWord) words.push(word);
  return words;
}
