/**
 * Python's `urllib.parse.urlencode(params, doseq=True)`, which is what turns a request's parameters
 * into the query string or POST body.
 *
 * It differs from `encodeURIComponent` and `URLSearchParams` in ways that change the bytes sent: a
 * space becomes `+`, `~` is left alone and `!*'()` are escaped, a list repeats its key once per
 * element, and anything that is not text goes through `str()` first.
 */
import { UnicodeEncodeError } from "./errors.js";
import { pyText } from "./pytext.js";

/** The characters `quote` never escapes: letters, digits and `_.-~`. */
const SAFE = /[A-Za-z0-9_.\-~]/;
const HEX = "0123456789ABCDEF";

/**
 * Text as UTF-8 bytes, refusing what Python refuses.
 *
 * @param text - The text. @returns Its UTF-8 encoding.
 * @throws {@link UnicodeEncodeError} for a surrogate with no partner, worded as Python words it: the
 *   position counts whole characters, and a run of several is reported as a range.
 */
function utf8(text: string): Uint8Array {
  const points = [...text];           // iterating a string yields whole characters, and a lone surrogate on its own
  const lone = (i: number) => points[i]!.length === 1 && points[i]! >= "\ud800" && points[i]! <= "\udfff";
  const first = points.findIndex((_, i) => lone(i));
  if (first !== -1) {
    let last = first;
    while (last + 1 < points.length && lone(last + 1)) last++;
    const where =
      last === first
        ? `character '\\u${points[first]!.charCodeAt(0).toString(16).padStart(4, "0")}' in position ${first}`
        : `characters in position ${first}-${last}`;
    throw new UnicodeEncodeError(`'utf-8' codec can't encode ${where}: surrogates not allowed`);
  }
  return new TextEncoder().encode(text);
}

/**
 * Python's `urllib.parse.quote_plus`: percent-escape everything but letters, digits and `_.-~`, and
 * write a space as `+`.
 *
 * @param value - Text, encoded as UTF-8 first, or bytes, escaped as they are.
 * @returns The escaped text, in ASCII.
 * @throws {@link UnicodeEncodeError} for text holding a surrogate with no partner.
 * @example
 * ```ts
 * quotePlus("Opuntia[orgn] AND rpl16");   // "Opuntia%5Borgn%5D+AND+rpl16"
 * quotePlus("~tilde");                    // "~tilde"
 * quotePlus("é");                         // "%C3%A9"
 * ```
 */
export function quotePlus(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? utf8(value) : value;
  let out = "";
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    if (byte === 0x20) out += "+";
    else if (byte < 0x80 && SAFE.test(char)) out += char;
    else out += `%${HEX[byte >> 4]}${HEX[byte & 15]}`;
  }
  return out;
}

/**
 * Python's `urlencode(params, doseq=True)`.
 *
 * @param params - The parameters, in the order they are to be written.
 * @returns `key=value` pairs joined with `&`. An array gives one pair per element, and none if it is
 *   empty; anything that is not text or bytes is written as Python's `str()` writes it.
 * @throws {@link UnicodeEncodeError} for a key or value holding a surrogate with no partner.
 * @example
 * ```ts
 * urlencode(new Map<string, unknown>([["db", "pubmed"], ["id", [1, 2]], ["retmax", 5]]));
 * // "db=pubmed&id=1&id=2&retmax=5"
 * ```
 */
export function urlencode(params: Map<string, unknown>): string {
  const pairs: string[] = [];
  for (const [key, value] of params) {
    const name = quotePlus(key);
    if (typeof value === "string" || value instanceof Uint8Array) pairs.push(`${name}=${quotePlus(value)}`);
    else if (Array.isArray(value)) {
      for (const element of value) pairs.push(`${name}=${quotePlus(element instanceof Uint8Array ? element : pyText(element))}`);
    } else pairs.push(`${name}=${quotePlus(pyText(value))}`);
  }
  return pairs.join("&");
}
