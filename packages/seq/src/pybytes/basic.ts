/** Concatenation, repetition, comparison and index validation for bytes. */

import { IndexError } from "@biolibs/core";

/** Concatenate byte arrays. */
export function concat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Python's `bytes * n`: repeat `data` `n` times (empty if `n <= 0`). */
export function repeat(data: Uint8Array, n: number): Uint8Array {
  if (n <= 0) return new Uint8Array(0);
  const out = new Uint8Array(data.length * n);
  for (let i = 0; i < n; i++) out.set(data, i * data.length);
  return out;
}

/** Lexicographic comparison of byte arrays: -1, 0 or 1 (like Python's bytes ordering). */
export function compare(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** Whether two byte arrays have identical contents. */
export function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && compare(a, b) === 0;
}

/** Validate an index for `bytearray` assignment/deletion (negative values count from the end). */
export function checkIndexAssign(len: number, i: number): number {
  const j = i < 0 ? i + len : i;
  if (j < 0 || j >= len) throw new IndexError("bytearray index out of range");
  return j;
}

/** Validate a read index (Python `bytes[i]`); raises `IndexError("index out of range")`. */
export function checkIndex(len: number, i: number): number {
  const j = i < 0 ? i + len : i;
  if (j < 0 || j >= len) throw new IndexError("index out of range");
  return j;
}
