/** `bytes.split`, `rsplit`, `strip` family, `removeprefix`, `removesuffix`. */

import { ValueError } from "@biolibs/core";
import { endswith, indexOfRange, startswith } from "./search.js";

/** ASCII whitespace as recognised by `bytes.split()`/`strip()`: space, \t \n \r \v \f. */
const isSpace = (c: number) => c === 32 || (c >= 9 && c <= 13);

/** Python `bytes.split(sep, maxsplit)`; `sep === null` splits on ASCII whitespace. */
export function split(data: Uint8Array, sep: Uint8Array | null, maxsplit = -1): Uint8Array[] {
  const out: Uint8Array[] = [];
  let max = maxsplit < 0 ? Infinity : maxsplit;
  const n = data.length;
  if (sep === null) {
    let i = 0;
    while (max-- > 0) {
      while (i < n && isSpace(data[i]!)) i++;
      if (i === n) break;
      const j = i;
      i++;
      while (i < n && !isSpace(data[i]!)) i++;
      out.push(data.slice(j, i));
    }
    if (i < n) {
      // maxsplit reached: skip whitespace, keep the remainder whole.
      while (i < n && isSpace(data[i]!)) i++;
      if (i !== n) out.push(data.slice(i));
    }
    return out;
  }
  if (sep.length === 0) throw new ValueError("empty separator");
  let i = 0;
  while (max-- > 0) {
    const j = indexOfRange(data, sep, i, n);
    if (j < 0) break;
    out.push(data.slice(i, j));
    i = j + sep.length;
  }
  out.push(data.slice(i));
  return out;
}

/** Python `bytes.rsplit(sep, maxsplit)`. */
export function rsplit(data: Uint8Array, sep: Uint8Array | null, maxsplit = -1): Uint8Array[] {
  const out: Uint8Array[] = [];
  let max = maxsplit < 0 ? Infinity : maxsplit;
  if (sep === null) {
    let i = data.length - 1;
    while (max-- > 0) {
      while (i >= 0 && isSpace(data[i]!)) i--;
      if (i < 0) break;
      const j = i;
      i--;
      while (i >= 0 && !isSpace(data[i]!)) i--;
      out.push(data.slice(i + 1, j + 1));
    }
    if (i >= 0) {
      while (i >= 0 && isSpace(data[i]!)) i--;
      if (i >= 0) out.push(data.slice(0, i + 1));
    }
    return out.reverse();
  }
  if (sep.length === 0) throw new ValueError("empty separator");
  let end = data.length;
  while (max-- > 0) {
    let j = -1;
    for (let k = end - sep.length; k >= 0; k--) {
      let ok = true;
      for (let m = 0; m < sep.length; m++) if (data[k + m] !== sep[m]) { ok = false; break; }
      if (ok) { j = k; break; }
    }
    if (j < 0) break;
    out.push(data.slice(j + sep.length, end));
    end = j;
  }
  out.push(data.slice(0, end));
  return out.reverse();
}

/** Python `bytes.strip/lstrip/rstrip`; `chars === null` strips ASCII whitespace. */
export function strip(data: Uint8Array, chars: Uint8Array | null, left = true, right = true): Uint8Array {
  const set = chars === null ? null : new Set(chars);
  const drop = (c: number) => (set === null ? isSpace(c) : set.has(c));
  let a = 0;
  let b = data.length;
  if (left) while (a < b && drop(data[a]!)) a++;
  if (right) while (b > a && drop(data[b - 1]!)) b--;
  return data.slice(a, b);
}

/** Python `bytes.removeprefix`. */
export function removeprefix(data: Uint8Array, prefix: Uint8Array): Uint8Array {
  return prefix.length && startswith(data, prefix) ? data.slice(prefix.length) : data.slice();
}

/** Python `bytes.removesuffix`. */
export function removesuffix(data: Uint8Array, suffix: Uint8Array): Uint8Array {
  return suffix.length && endswith(data, suffix) ? data.slice(0, data.length - suffix.length) : data.slice();
}
