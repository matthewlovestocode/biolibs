/** Small Python-string helpers used by the INSDC (GenBank/EMBL) scanners. */

import { IndexError, ValueError } from "@biolibs/core";

/** Python's `line[i]`: throws `IndexError` instead of giving `undefined` past the end. */
export function charAt(s: string, i: number): string {
  if (i >= s.length || i < -s.length) throw new IndexError("string index out of range");
  return s[i < 0 ? s.length + i : i]!;
}

/** Python `str.isdigit()` for ASCII digits (non-empty, digits only). */
export function isDigit(s: string): boolean {
  return /^[0-9]+$/.test(s);
}

/** Python `s.split(None, 1)`: up to two parts; the second keeps its trailing whitespace but loses leading whitespace. */
export function splitFirst(s: string): string[] {
  const m = /^[\s\x1c-\x1f\x85]*(\S+)(?:[\s\x1c-\x1f\x85]+([\s\S]*))?$/.exec(s);
  if (!m) return [];
  return m[2] === undefined || m[2] === "" ? [m[1]!] : [m[1]!, m[2]];
}

/** Python `s.rsplit(None, 1)`: the text before the last word, and that word (surrounding whitespace removed). */
export function rsplitLast(s: string): string[] {
  const t = s.replace(/[\s\x1c-\x1f\x85]+$/, "");
  const m = /^([\s\S]*?)[\s\x1c-\x1f\x85]+(\S+)$/.exec(t);
  if (!m) return t ? [t] : [];
  return [m[1]!.replace(/[\s\x1c-\x1f\x85]+$/, ""), m[2]!];
}

/** Unpack exactly two items, raising Python's `ValueError` otherwise. */
export function unpackTwo<T>(items: T[]): [T, T] {
  if (items.length < 2) throw new ValueError(`not enough values to unpack (expected 2, got ${items.length})`);
  if (items.length > 2) throw new ValueError(`too many values to unpack (expected 2, got ${items.length})`);
  return [items[0]!, items[1]!];
}

/** Replace every run of two spaces with one, repeatedly (`while "  " in s: s = s.replace("  ", " ")`). */
export function collapseSpaces(s: string): string {
  while (s.includes("  ")) s = s.replaceAll("  ", " ");
  return s;
}

/** Python `s.rsplit(None, n)`: split from the right on whitespace at most `n` times. */
export function rsplitWords(s: string, n: number): string[] {
  const parts: string[] = [];
  let rest = s.replace(/[\s\x1c-\x1f\x85]+$/, "");
  for (let i = 0; i < n; i++) {
    const m = /^([\s\S]*?)[\s\x1c-\x1f\x85]+(\S+)$/.exec(rest);
    if (!m) break;
    parts.unshift(m[2]!);
    rest = m[1]!.replace(/[\s\x1c-\x1f\x85]+$/, "");
  }
  return rest || parts.length ? [rest, ...parts] : [];
}

/** Unpack exactly `n` items, raising Python's `ValueError` otherwise. */
export function unpackN<T>(items: T[], n: number): T[] {
  if (items.length < n) throw new ValueError(`not enough values to unpack (expected ${n}, got ${items.length})`);
  if (items.length > n) throw new ValueError(`too many values to unpack (expected ${n}, got ${items.length})`);
  return items;
}

/** Python `s.split(None, maxsplit)`: whitespace-separated words, the last one keeping the rest of the line. */
export function splitMax(s: string, maxsplit: number): string[] {
  const parts: string[] = [];
  let rest = s.replace(/^[\s\x1c-\x1f\x85]+/, "");
  while (rest.length > 0 && parts.length < maxsplit) {
    const m = /^(\S+)(?:[\s\x1c-\x1f\x85]+|$)/.exec(rest);
    if (!m) break;
    parts.push(m[1]!);
    rest = rest.slice(m[0].length);
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}
