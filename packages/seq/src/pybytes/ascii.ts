/** ASCII and UTF-8 text <-> bytes, with Python's error messages. */

import { ValueError } from "@biolibs/core";

/** Encode a string as ASCII bytes (Python `str.encode("ASCII")`). */
export function encodeAscii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 127) {
      const cp = s.codePointAt(i)!;
      const shown = cp <= 0xff ? "\\x" + cp.toString(16).padStart(2, "0") : cp <= 0xffff ? "\\u" + cp.toString(16).padStart(4, "0") : "\\U" + cp.toString(16).padStart(8, "0");
      throw new ValueError(`'ascii' codec can't encode character '${shown}' in position ${i}: ordinal not in range(128)`);
    }
    out[i] = c;
  }
  return out;
}

/** Decode ASCII bytes to a string (Python `bytes.decode("ASCII")`). */
export function decodeAscii(b: Uint8Array): string {
  let s = "";
  // Chunked to keep String.fromCharCode's argument list small for big genomes.
  for (let i = 0; i < b.length; i += 8192) {
    const chunk = b.subarray(i, Math.min(b.length, i + 8192));
    for (let j = 0; j < chunk.length; j++) {
      if (chunk[j]! > 127) {
        throw new ValueError(`'ascii' codec can't decode byte 0x${chunk[j]!.toString(16).padStart(2, "0")} in position ${i + j}: ordinal not in range(128)`);
      }
    }
    s += String.fromCharCode(...chunk);
  }
  return s;
}

/** Decode UTF-8 bytes to a string (Python `bytes.decode()`). */
export function decodeUtf8(b: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    throw new ValueError("'utf-8' codec can't decode bytes: invalid start byte");
  }
}
