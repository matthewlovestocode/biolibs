/** Python string helpers for the SwissProt parser. */

/**
 * Python `s.rstrip(chars)`: remove trailing characters that appear in `chars`.
 *
 * @example
 * ```ts
 * rstripChars("A; B;", ";");   // "A; B"
 * ```
 */
export function rstripChars(s: string, chars: string): string {
  let end = s.length;
  while (end > 0 && chars.includes(s[end - 1]!)) end -= 1;
  return s.slice(0, end);
}

/** Python `s.split(sep)` for a non-empty separator (identical to JavaScript's `split`). */
export function split(s: string, sep: string): string[] {
  return s.split(sep);
}

/** Python `s.split(sep, 1)`: at most two parts, splitting at the first occurrence. */
export function splitOnce(s: string, sep: string): string[] {
  const i = s.indexOf(sep);
  return i < 0 ? [s] : [s.slice(0, i), s.slice(i + sep.length)];
}

/** Python `s.rsplit(sep, 1)`: at most two parts, splitting at the last occurrence. */
export function rsplitOnce(s: string, sep: string): string[] {
  const i = s.lastIndexOf(sep);
  return i < 0 ? [s] : [s.slice(0, i), s.slice(i + sep.length)];
}
