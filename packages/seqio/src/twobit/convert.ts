/** Decoding of 2-bit packed DNA (a port of Biopython's C helper `_twoBitIO.convert`). */

import { RuntimeError } from "@biolibs/core";

/** A list of `[start, end)` blocks, as read from the file (unsigned 32-bit values). */
export type Blocks = [number, number][];

/** The four letters stored in each 2-bit code, in order of the code: 00 T, 01 C, 10 A, 11 G. */
const LETTERS = "TCAG";

/**
 * Unpack bases `[start, end)` from `data`, which must hold exactly the bytes that cover them.
 *
 * @throws {@link RuntimeError} if the number of bytes is wrong (for example when the file is truncated).
 */
function extract(data: Uint8Array, start: number, end: number): string {
  const byteStart = Math.floor(start / 4);
  const byteEnd = Math.floor((end + 3) / 4);
  if (data.length !== byteEnd - byteStart) throw new RuntimeError(`unexpected number of bytes ${data.length} (expected ${byteEnd - byteStart})`);
  let out = "";
  for (let p = start; p < end; p++) {
    const byte = data[Math.floor(p / 4) - byteStart]!;
    out += LETTERS[(byte >> (6 - 2 * (p % 4))) & 3];
  }
  return out;
}

/** Replace the parts of `sequence` (covering `[start, end)`) that fall into N blocks with `N`. */
function applyNs(sequence: string[], start: number, end: number, blocks: Blocks): void {
  for (const [blockStart0, blockEnd0] of blocks) {
    let blockStart = blockStart0;
    let blockEnd = blockEnd0;
    if (blockEnd < start) continue;
    if (end < blockStart) break; // blocks are sorted, so nothing further can overlap
    if (blockStart < start) blockStart = start;
    if (end < blockEnd) blockEnd = end;
    for (let j = blockStart - start; j < blockEnd - start; j++) sequence[j] = "N";
  }
}

/** Lower-case the parts of `sequence` that fall into masked blocks (adding 32 to the letter, as the C code does). */
function applyMask(sequence: string[], start: number, end: number, blocks: Blocks): void {
  for (const [blockStart0, blockEnd0] of blocks) {
    let blockStart = blockStart0;
    let blockEnd = blockEnd0;
    if (blockEnd < start) continue;
    if (end < blockStart) break;
    if (blockStart < start) blockStart = start;
    if (end < blockEnd) blockEnd = end;
    for (let j = blockStart - start; j < blockEnd - start; j++) sequence[j] = String.fromCharCode(sequence[j]!.charCodeAt(0) + 32);
  }
}

/**
 * Turn packed bytes into the DNA letters for positions `start`, `start + step`, ... up to `end`.
 *
 * `size` is `trunc((end - start) / step)`, as in the C original, which for steps above 1 can be one
 * shorter than the slice Python would give.
 *
 * @param data - The bytes covering `[start, end)` (or the reversed range when `step` is negative).
 * @returns The letters as bytes.
 */
export function convert(data: Uint8Array, start: number, end: number, step: number, nBlocks: Blocks, maskBlocks: Blocks): Uint8Array {
  const size = Math.trunc((end - start) / step);
  let letters: string[];
  if (step === 1) {
    letters = [...extract(data, start, end)];
    applyNs(letters, start, end, nBlocks);
    applyMask(letters, start, end, maskBlocks);
    return Uint8Array.from(letters.map((c) => c.charCodeAt(0)));
  }
  let fullStart: number;
  let fullEnd: number;
  let current: number;
  if (start <= end) {
    fullStart = start; fullEnd = end; current = 0;
  } else {
    // A negative step: decode the covered range, then read it backwards.
    fullStart = end + 1; fullEnd = start + 1; current = start - end - 1;
  }
  const full = [...extract(data, fullStart, fullEnd)];
  applyNs(full, fullStart, fullEnd, nBlocks);
  applyMask(full, fullStart, fullEnd, maskBlocks);
  const out = new Uint8Array(Math.max(0, size));
  for (let i = 0; i < size; i++, current += step) out[i] = full[current]!.charCodeAt(0);
  return out;
}
