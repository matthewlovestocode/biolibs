/**
 * Reading a gzip file (RFC 1952), the way Python's `gzip` module reads one.
 *
 * Every file the Protein Data Bank serves is gzipped, and Biopython unpacks each as it arrives. This is
 * that step, with the same answers for a file that is not gzip, is cut short, or fails its checksum.
 */
import { ZlibError, inflateRawPrefix, pyBytesRepr } from "@biolibs/core";
import { BadGzipFile, EOFError } from "./errors.js";

/** Python's wording for a file that ends too soon, wherever in the file that is. */
const CUT_SHORT = "Compressed file ended before the end-of-stream marker was reached";

/** The CRC-32 table for the polynomial gzip uses. */
const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/**
 * CRC-32, the checksum a gzip member ends with (the same value as Python's `zlib.crc32`).
 *
 * @param data - The bytes to sum.
 * @returns The checksum, as an unsigned 32-bit number.
 * @example
 * ```ts
 * crc32(new TextEncoder().encode("hello"));   // 907060870
 * ```
 */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param data - The file. @param at - Where four bytes start. @returns Them as a little-endian unsigned number. */
const u32 = (data: Uint8Array, at: number): number =>
  (data[at]! | (data[at + 1]! << 8) | (data[at + 2]! << 16) | (data[at + 3]! << 24)) >>> 0;

/**
 * Step over a gzip member's header.
 *
 * @param data - The file. @param start - Where the member starts.
 * @returns Where its compressed data starts.
 * @throws {@link BadGzipFile} if it does not start as gzip does, and {@link EOFError} if it stops inside the header.
 */
function skipHeader(data: Uint8Array, start: number): number {
  const magic = data.subarray(start, start + 2);
  if (magic.length < 2 || magic[0] !== 0x1f || magic[1] !== 0x8b) throw new BadGzipFile(`Not a gzipped file (${pyBytesRepr(magic)})`);
  if (start + 10 > data.length) throw new EOFError(CUT_SHORT);
  if (data[start + 2] !== 8) throw new BadGzipFile("Unknown compression method");
  const flags = data[start + 3]!;
  let pos = start + 10;
  /** Move on `n` bytes, which must be there. */
  const skip = (n: number): void => {
    if (pos + n > data.length) throw new EOFError(CUT_SHORT);
    pos += n;
  };
  /** Move past a zero-terminated string. */
  const skipText = (): void => {
    for (;;) {
      skip(1);
      if (data[pos - 1] === 0) return;
    }
  };
  if (flags & 4) {
    skip(2);
    skip(data[pos - 2]! | (data[pos - 1]! << 8));
  }
  if (flags & 8) skipText();
  if (flags & 16) skipText();
  if (flags & 2) skip(2);
  return pos;
}

/**
 * Decompress a gzip file: Python's `gzip.decompress`, and what `gzip.open(...).read()` gives.
 *
 * A file may hold several members one after another, which decompress to their contents joined; zero
 * bytes after a member are padding and are ignored; and an empty file decompresses to nothing.
 *
 * @param data - The gzip file.
 * @returns What it holds.
 * @throws {@link BadGzipFile} if it is not gzip, or its checksum or length is wrong; {@link EOFError} if
 * it is cut short; and core's `ZlibError` if the compressed data itself is damaged.
 * @example
 * ```ts
 * const gz = Uint8Array.of(0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 0xff, 0x4b, 0x04, 0x00, 0x43, 0xbe, 0xb7, 0xe8, 1, 0, 0, 0);
 * new TextDecoder().decode(gunzip(gz));   // "a"
 * ```
 */
export function gunzip(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let pos = 0;
  while (pos < data.length) {
    pos = skipHeader(data, pos);
    let member: { data: Uint8Array; consumed: number };
    try {
      member = inflateRawPrefix(data.subarray(pos));
    } catch (error) {
      if (error instanceof ZlibError && error.message.includes("incomplete or truncated stream")) throw new EOFError(CUT_SHORT);
      throw error;
    }
    pos += member.consumed;
    if (pos + 8 > data.length) throw new EOFError(CUT_SHORT);
    const want = u32(data, pos), got = crc32(member.data);
    if (want !== got) throw new BadGzipFile(`CRC check failed 0x${want.toString(16)} != 0x${got.toString(16)}`);
    if (u32(data, pos + 4) !== member.data.length >>> 0) throw new BadGzipFile("Incorrect length of data produced");
    pos += 8;
    while (pos < data.length && data[pos] === 0) pos += 1;
    parts.push(member.data);
  }
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
