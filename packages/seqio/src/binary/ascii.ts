/** ASCII conversions with Python's strictness. */

import { ValueError } from "@biolibs/core";

/**
 * Decode bytes as ASCII, like `bytes.decode("ASCII")`.
 *
 * @throws {@link ValueError} (Python's `UnicodeDecodeError`) for a byte above 127.
 */
export function decodeAscii(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b > 127) throw new ValueError(`'ascii' codec can't decode byte 0x${b.toString(16).padStart(2, "0")} in position ${i}: ordinal not in range(128)`);
    out += String.fromCharCode(b);
  }
  return out;
}

/**
 * Encode text as ASCII, like `str.encode("ASCII")`.
 *
 * @throws {@link ValueError} (Python's `UnicodeEncodeError`) for a character above U+007F.
 */
export function encodeAscii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 127) throw new ValueError(`'ascii' codec can't encode character '\\u${c.toString(16).padStart(4, "0")}' in position ${i}: ordinal not in range(128)`);
    out[i] = c;
  }
  return out;
}

/** Read exactly `length` bytes or fail (the helper several Biopython readers call `_read`). */
export function readExact(stream: { read(n: number): Uint8Array }, length: number, message?: string): Uint8Array {
  const data = stream.read(length);
  if (data.length < length) throw new ValueError(message ?? `Cannot read ${length} bytes from stream`);
  return data;
}
