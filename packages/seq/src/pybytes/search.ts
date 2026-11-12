/** `bytes.find`, `rfind`, `index`, `rindex`, `count`, `startswith`, `endswith`. */

import { ValueError } from "@biolibs/core";

/**
 * Clamp optional `start`/`end` like CPython's `ADJUST_INDICES`.
 *
 * @returns Adjusted `[start, end]`, both within `[0, len]`.
 */
export function adjust(len: number, start?: number | null, end?: number | null): [number, number] {
  let s = start ?? 0;
  let e = end ?? len;
  if (e > len) e = len;
  else if (e < 0) { e += len; if (e < 0) e = 0; }
  if (s < 0) { s += len; if (s < 0) s = 0; }
  return [s, e];
}

/** Index of the first occurrence of `sub` in `data[from, to)` or -1. */
export function indexOfRange(data: Uint8Array, sub: Uint8Array, from: number, to: number): number {
  const last = to - sub.length;
  /** Try every start position; `continue outer` abandons a candidate at its first differing byte. */
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < sub.length; j++) if (data[i + j] !== sub[j]) continue outer;
    return i;
  }
  return -1;
}

/** Python `bytes.find`. */
export function find(data: Uint8Array, sub: Uint8Array, start?: number | null, end?: number | null): number {
  const [s, e] = adjust(data.length, start, end);
  if (e - s < sub.length) return -1;
  return indexOfRange(data, sub, s, e);
}

/** Python `bytes.rfind`. */
export function rfind(data: Uint8Array, sub: Uint8Array, start?: number | null, end?: number | null): number {
  const [s, e] = adjust(data.length, start, end);
  if (e - s < sub.length) return -1;
  for (let i = e - sub.length; i >= s; i--) {
    let ok = true;
    for (let j = 0; j < sub.length; j++) if (data[i + j] !== sub[j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

/** Python `bytes.index` (raises instead of returning -1). */
export function index(data: Uint8Array, sub: Uint8Array, start?: number | null, end?: number | null): number {
  const i = find(data, sub, start, end);
  if (i < 0) throw new ValueError("subsection not found");
  return i;
}

/** Python `bytes.rindex`. */
export function rindex(data: Uint8Array, sub: Uint8Array, start?: number | null, end?: number | null): number {
  const i = rfind(data, sub, start, end);
  if (i < 0) throw new ValueError("subsection not found");
  return i;
}

/** Python `bytes.count`: non-overlapping occurrences within `[start, end)`. */
export function count(data: Uint8Array, sub: Uint8Array, start?: number | null, end?: number | null): number {
  const [s, e] = adjust(data.length, start, end);
  const n = e - s;
  if (n < 0) return 0;
  if (sub.length === 0) return n + 1;
  let c = 0;
  let i = s;
  while (true) {
    const j = indexOfRange(data, sub, i, e);
    if (j < 0) return c;
    c++;
    i = j + sub.length;
  }
}

/** Python `bytes.startswith` for a single prefix. */
export function startswith(data: Uint8Array, prefix: Uint8Array, start?: number | null, end?: number | null): boolean {
  const len = data.length;
  const [s, e] = adjust(len, start, end);
  if (s > len - prefix.length) return false;
  if (e - s < prefix.length) return false;
  for (let j = 0; j < prefix.length; j++) if (data[s + j] !== prefix[j]) return false;
  return true;
}

/** Python `bytes.endswith` for a single suffix. */
export function endswith(data: Uint8Array, suffix: Uint8Array, start?: number | null, end?: number | null): boolean {
  const len = data.length;
  let [s, e] = adjust(len, start, end);
  if (e - s < suffix.length || s > len) return false;
  if (e - suffix.length > s) s = e - suffix.length;
  if (e - s < suffix.length) return false;
  for (let j = 0; j < suffix.length; j++) if (data[s + j] !== suffix[j]) return false;
  return true;
}
