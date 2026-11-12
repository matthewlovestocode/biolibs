/** Case conversion, `replace`, and byte translation tables. */

import { ValueError } from "@biolibs/core";
import { concat } from "./basic.js";
import { indexOfRange } from "./search.js";

/** ASCII uppercase (Python `bytes.upper`). */
export function upper(data: Uint8Array): Uint8Array {
  return data.map((c) => (c >= 97 && c <= 122 ? c - 32 : c));
}

/** ASCII lowercase (Python `bytes.lower`). */
export function lower(data: Uint8Array): Uint8Array {
  return data.map((c) => (c >= 65 && c <= 90 ? c + 32 : c));
}

/** Python `bytes.isupper`: at least one cased byte and no lowercase bytes. */
export function isupper(data: Uint8Array): boolean {
  let cased = false;
  for (const c of data) {
    if (c >= 97 && c <= 122) return false;
    if (c >= 65 && c <= 90) cased = true;
  }
  return cased;
}

/** Python `bytes.islower`: at least one cased byte and no uppercase bytes. */
export function islower(data: Uint8Array): boolean {
  let cased = false;
  for (const c of data) {
    if (c >= 65 && c <= 90) return false;
    if (c >= 97 && c <= 122) cased = true;
  }
  return cased;
}

/** Python `bytes.replace(old, new)` (all occurrences; an empty `old` inserts `new` between every byte). */
export function replace(data: Uint8Array, old: Uint8Array, nu: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  if (old.length === 0) {
    parts.push(nu);
    for (let i = 0; i < data.length; i++) { parts.push(data.subarray(i, i + 1), nu); }
    return concat(...parts);
  }
  let i = 0;
  while (true) {
    const j = indexOfRange(data, old, i, data.length);
    if (j < 0) break;
    parts.push(data.subarray(i, j), nu);
    i = j + old.length;
  }
  parts.push(data.subarray(i));
  return concat(...parts);
}

/** Python `bytes.maketrans(frm, to)`: a 256-entry translation table. */
export function maketrans(frm: Uint8Array, to: Uint8Array): Uint8Array {
  if (frm.length !== to.length) throw new ValueError("maketrans arguments must have same length");
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i;
  for (let i = 0; i < frm.length; i++) table[frm[i]!] = to[i]!;
  return table;
}

/** Python `bytes.translate(table, delete)`. */
export function translateBytes(data: Uint8Array, table: Uint8Array | null, del: Uint8Array = new Uint8Array(0)): Uint8Array {
  if (table !== null && table.length !== 256) throw new ValueError("translation table must be 256 characters long");
  const drop = new Set(del);
  const res = new Uint8Array(data.length);
  let n = 0;
  for (const c of data) {
    if (drop.has(c)) continue; // deleted bytes are removed before mapping
    res[n++] = table === null ? c : table[c]!;
  }
  return res.slice(0, n);
}
