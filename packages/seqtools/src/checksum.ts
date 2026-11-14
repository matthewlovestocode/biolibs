/** Sequence checksums (Biopython's `Bio.SeqUtils.CheckSum`): CRC32, CRC64, GCG and SEGUID. */

import { MutableSeq, Seq } from "@biolibs/seq";
import { ValueError, pyTypeName } from "@biolibs/core";
import { asText } from "./args.js";
import { base64, sha1 } from "@biolibs/core";

const encoder = new TextEncoder();

/** What Python's `bytes(seq)` gives for text-like input, falling back to UTF-8 for plain strings. */
function toBytes(seq: unknown): Uint8Array {
  if (seq instanceof Uint8Array) return seq;
  if (seq instanceof Seq || seq instanceof MutableSeq) return encoder.encode(seq.toString());
  if (typeof seq === "string") return encoder.encode(seq);
  // `bytes(5)` is five zero bytes and `bytes([65, 66])` is b"AB".
  if (typeof seq === "number" && Number.isInteger(seq)) {
    if (seq < 0) throw new ValueError("negative count");
    return new Uint8Array(seq);
  }
  if (Array.isArray(seq) && seq.every((x) => typeof x === "number" && Number.isInteger(x))) {
    if (seq.some((x) => x < 0 || x > 255)) throw new ValueError("bytes must be in range(0, 256)");
    return Uint8Array.from(seq as number[]);
  }
  throw new TypeError(`'${pyTypeName(seq)}' object has no attribute 'encode'`);
}

/** The CRC-32 lookup table (reflected polynomial 0xEDB88320). */
const CRC32_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * CRC-32 of a sequence (the same value as `binascii.crc32`).
 *
 * @param seq - Text (UTF-8 encoded), `Seq`, `MutableSeq` or bytes.
 * @returns An unsigned 32-bit integer.
 * @example
 * ```ts
 * crc32("ACGTACGTACGT");   // 3524452261
 * ```
 */
export function crc32(seq: unknown): number {
  let crc = 0xffffffff;
  for (const b of toBytes(seq)) crc = CRC32_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The high-word lookup table of the SWISS-PROT CRC-64 (polynomial 0xD8000000 in the high word). */
const CRC64_TABLE_H = ((): number[] => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let partL = i;
    let partH = 0;
    for (let j = 0; j < 8; j++) {
      const rflag = partL & 1;
      partL = partL >>> 1;
      if (partH & 1) partL = (partL | (1 << 31)) >>> 0;
      partH = partH >>> 1;
      if (rflag) partH = (partH ^ 3623878656) >>> 0;
    }
    table.push(partH);
  }
  return table;
})();

/**
 * The items Python iterates over in `seq`: characters for text and sequences, elements for arrays.
 *
 * @param needsStr - The error to raise for a non-text item, as the function's first operation would.
 */
function* items(seq: unknown, needsStr: string): Generator<string> {
  if (Array.isArray(seq) || seq instanceof Uint8Array) {
    for (const x of seq as ArrayLike<unknown> & Iterable<unknown>) {
      if (typeof x !== "string") throw new TypeError(needsStr);
      const n = [...x].length;
      if (n !== 1) throw new TypeError(`ord() expected a character, but string of length ${n} found`);
      yield x;
    }
    return;
  }
  yield* asText(seq, "iter");
}

/**
 * CRC-64 as used by SWISS-PROT, formatted like `"CRC-32CF9B38C0D1B2D9"`.
 *
 * @param s - Text or sequence; each character's code is used.
 * @example
 * ```ts
 * crc64("ACGTACGTACGTACGT");
 * ```
 */
export function crc64(s: unknown): string {
  let crcl = 0;
  let crch = 0;
  for (const c of items(s, "ord() expected string of length 1, but int found")) {
    const shr = ((crch & 255) << 24) >>> 0;
    const temp1h = crch >>> 8;
    const temp1l = ((crcl >>> 8) | shr) >>> 0;
    const idx = (crcl ^ c.codePointAt(0)!) & 255;
    crch = (temp1h ^ CRC64_TABLE_H[idx]!) >>> 0;
    crcl = temp1l;
  }
  return `CRC-${crch.toString(16).toUpperCase().padStart(8, "0")}${crcl.toString(16).toUpperCase().padStart(8, "0")}`;
}

/**
 * GCG checksum: a position-weighted sum of the upper-cased letters, modulo 10000.
 *
 * @throws TypeError if upper-casing a character gives more than one character (Python's `ord()` error).
 * @example
 * ```ts
 * gcg("ACGTACGTACGTACGT");
 * ```
 */
export function gcg(seq: unknown): number {
  let index = 0;
  let checksum = 0;
  for (const char of items(seq, "'int' object has no attribute 'upper'")) {
    index += 1;
    const upper = [...char.toUpperCase()];
    if (upper.length !== 1) throw new TypeError(`ord() expected a character, but string of length ${upper.length} found`);
    checksum += index * upper[0]!.codePointAt(0)!;
    if (index === 57) index = 0;
  }
  return checksum % 10000;
}

/**
 * SEGUID: the base64 SHA-1 of the upper-cased sequence with the padding removed.
 * Case is folded for ASCII letters only, on the UTF-8 bytes.
 *
 * @example
 * ```ts
 * seguid("ACGTACGTACGTACGT");
 * ```
 */
export function seguid(seq: unknown): string {
  const bytes = toBytes(seq).map((b) => (b >= 97 && b <= 122 ? b - 32 : b));
  return base64(sha1(bytes)).replace(/=+$/, "");
}
