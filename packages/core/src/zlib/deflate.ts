/**
 * Producing zlib streams (RFC 1950) for the writers that need them.
 *
 * Only *stored* DEFLATE blocks are produced: the data is wrapped in a valid zlib stream, with the header and the
 * Adler-32 checksum, but nothing is actually squeezed. That keeps this a few dozen lines instead of a port of
 * zlib's match finder, and it costs only five bytes per 65535 written.
 *
 * It also means the bytes are **not** the bytes Python's `zlib.compress` would produce for the same input.
 * Nothing can promise that but zlib itself: the compressed form depends on the hash chains, lazy matching and
 * tree construction of the particular implementation. Anything that reads zlib reads these streams, which is
 * what a file format needs; a test that compares a written file byte for byte against Biopython's has to write
 * it uncompressed.
 */

import { adler32 } from "./inflate.js";

/** The largest a stored block may be, since its length is two bytes. */
const MAX_STORED = 0xffff;

/**
 * Wrap data in a zlib stream of stored blocks.
 *
 * @param data - The bytes to wrap.
 * @returns A valid zlib stream that decompresses to `data`.
 */
export function deflateStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / MAX_STORED));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  let at = 0;
  // The zlib header: deflate with a 32 KiB window, no preset dictionary, and the check bits that make the
  // two bytes a multiple of 31. 0x78 0x01 is what level 0 gives.
  out[at++] = 0x78;
  out[at++] = 0x01;
  for (let i = 0; i < blocks; i++) {
    const start = i * MAX_STORED;
    const len = Math.min(MAX_STORED, data.length - start);
    out[at++] = i === blocks - 1 ? 1 : 0;        // BFINAL, with BTYPE 00 for a stored block
    out[at++] = len & 0xff;
    out[at++] = (len >> 8) & 0xff;
    out[at++] = ~len & 0xff;
    out[at++] = (~len >> 8) & 0xff;
    out.set(data.subarray(start, start + len), at);
    at += len;
  }
  const check = adler32(data);
  out[at++] = (check >>> 24) & 0xff;
  out[at++] = (check >>> 16) & 0xff;
  out[at++] = (check >>> 8) & 0xff;
  out[at++] = check & 0xff;
  return out.subarray(0, at);
}
