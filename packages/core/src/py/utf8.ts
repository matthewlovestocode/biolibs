/** Python's own UTF-8 decoding errors, which some readers report verbatim. */

import { ValueError } from "../errors.js";

/** Where a UTF-8 sequence goes wrong, and why. */
interface Utf8Fault {
  /** The index of the sequence's first byte. */
  at: number;
  /** How many bytes of it are acceptable, which decides whether Python names one byte or a range. */
  valid: number;
  /** Which of Python's three reasons applies. */
  reason: "invalid start byte" | "invalid continuation byte" | "unexpected end of data";
}

/**
 * The first place a run of bytes stops being valid UTF-8.
 *
 * @param bytes - The bytes to check.
 * @returns What is wrong and where, or null when they decode.
 */
export function utf8Fault(bytes: Uint8Array): Utf8Fault | null {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    let len: number;
    if (b < 0x80) { i += 1; continue; }
    else if (b >= 0xc2 && b <= 0xdf) len = 2;
    else if (b >= 0xe0 && b <= 0xef) len = 3;
    else if (b >= 0xf0 && b <= 0xf4) len = 4;
    else return { at: i, valid: 1, reason: "invalid start byte" };
    // The sequences that would encode a value two ways, or one that does not exist, are rejected on their
    // second byte, which is why Python blames a continuation byte for them.
    const lowest = b === 0xe0 ? 0xa0 : b === 0xf0 ? 0x90 : 0x80;
    const highest = b === 0xed ? 0x9f : b === 0xf4 ? 0x8f : 0xbf;
    let valid = 1;
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k];
      if (c === undefined) return { at: i, valid, reason: "unexpected end of data" };
      const low = k === 1 ? lowest : 0x80;
      const high = k === 1 ? highest : 0xbf;
      if (c < low || c > high) return { at: i, valid, reason: "invalid continuation byte" };
      valid += 1;
    }
    i += len;
  }
  return null;
}

/**
 * Python's message for a `bytes.decode()` that fails.
 *
 * @param bytes - The bytes that were being decoded. @param fault - What is wrong with them.
 * @returns The text of Python's `UnicodeDecodeError`.
 */
export function utf8ErrorMessage(bytes: Uint8Array, fault: Utf8Fault): string {
  const where = fault.valid === 1
    ? `byte 0x${bytes[fault.at]!.toString(16).padStart(2, "0")} in position ${fault.at}`
    : `bytes in position ${fault.at}-${fault.at + fault.valid - 1}`;
  return `'utf-8' codec can't decode ${where}: ${fault.reason}`;
}

/**
 * Python's `bytes.decode()`: UTF-8, strict, with Python's own error.
 *
 * @param bytes - The bytes to decode.
 * @returns The text.
 * @throws {@link ValueError} with Python's wording, since `UnicodeDecodeError` is a `ValueError` there.
 */
export function pyDecodeUtf8(bytes: Uint8Array): string {
  const fault = utf8Fault(bytes);
  if (fault !== null) throw new ValueError(utf8ErrorMessage(bytes, fault));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/**
 * Python's `bytes.decode("ASCII")`, whose complaint is worded differently again.
 *
 * @param bytes - The bytes to decode.
 * @returns The text.
 * @throws {@link ValueError} with Python's wording.
 */
export function pyDecodeAscii(bytes: Uint8Array): string {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i]! > 127) {
      throw new ValueError(`'ascii' codec can't decode byte 0x${bytes[i]!.toString(16).padStart(2, "0")} in position ${i}: ordinal not in range(128)`);
    }
  }
  return String.fromCharCode(...bytes);
}
