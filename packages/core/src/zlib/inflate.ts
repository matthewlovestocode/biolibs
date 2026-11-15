/**
 * DEFLATE decompression (RFC 1951) and the zlib wrapper around it (RFC 1950), which `zlib.decompress` is in
 * Python.
 *
 * Written out here rather than taken from the host: these packages use no platform modules, so that a reader
 * works the same under Node, a browser and a bundler. Only decompression is needed to *read* a compressed file;
 * nothing here compresses.
 */

import { ValueError } from "../errors.js";

/** Raised for data that is not valid DEFLATE or zlib, as Python's `zlib.error` is. */
export class ZlibError extends ValueError {
  override name = "error";
}

/** Reads a bit stream least-significant bit first, which is the order DEFLATE packs its codes in. */
class BitReader {
  private pos = 0;
  private bit = 0;

  /** @param data - The compressed bytes. */
  constructor(private readonly data: Uint8Array) {}

  /**
   * @param n - How many bits to take (at most 24).
   * @returns Those bits as a number, the first bit read being the least significant.
   * @throws {@link ZlibError} past the end of the data.
   */
  bits(n: number): number {
    let out = 0;
    for (let i = 0; i < n; i++) {
      if (this.pos >= this.data.length) throw new ZlibError("Error -5 while decompressing data: incomplete or truncated stream");
      out |= ((this.data[this.pos]! >> this.bit) & 1) << i;
      this.bit += 1;
      if (this.bit === 8) { this.bit = 0; this.pos += 1; }
    }
    return out;
  }

  /** Drop the rest of the current byte, which a stored block starts after. */
  align(): void {
    if (this.bit !== 0) { this.bit = 0; this.pos += 1; }
  }

  /** @param n - How many whole bytes to take. @returns Them, from the aligned position. */
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.data.length) throw new ZlibError("Error -5 while decompressing data: incomplete or truncated stream");
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** @returns How many bytes have been consumed, rounded up to a whole byte. */
  get consumed(): number { return this.pos + (this.bit === 0 ? 0 : 1); }
}

/** A canonical Huffman decoding table: how many codes there are of each length, and the symbols in order. */
interface Huffman {
  /** `counts[n]` is the number of codes of length `n`. */
  counts: number[];
  /** The symbols, ordered by code length and then by symbol. */
  symbols: number[];
}

/**
 * Build the decoding table for a set of code lengths, as RFC 1951 section 3.2.2 describes.
 *
 * @param lengths - The code length of each symbol; zero for a symbol that has no code.
 * @returns Its decoding table.
 */
function huffman(lengths: readonly number[]): Huffman {
  const counts = new Array<number>(16).fill(0);
  for (const l of lengths) counts[l] = counts[l]! + 1;
  counts[0] = 0;
  const offsets = new Array<number>(16).fill(0);
  for (let n = 1; n < 16; n++) offsets[n] = offsets[n - 1]! + counts[n - 1]!;
  const symbols = new Array<number>(lengths.length).fill(0);
  lengths.forEach((l, sym) => { if (l !== 0) { symbols[offsets[l]!] = sym; offsets[l] = offsets[l]! + 1; } });
  return { counts, symbols };
}

/**
 * Read one Huffman code and return the symbol it stands for.
 *
 * Codes are packed most significant bit first within a code, so the value is built up a bit at a time and
 * compared against the first code of each length.
 *
 * @param br - The bit stream. @param h - The decoding table.
 * @returns The symbol.
 * @throws {@link ZlibError} for a code the table does not have.
 */
function decodeSymbol(br: BitReader, h: Huffman): number {
  let code = 0, first = 0, index = 0;
  for (let len = 1; len < 16; len++) {
    code |= br.bits(1);
    const count = h.counts[len]!;
    if (code - first < count) return h.symbols[index + (code - first)]!;
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new ZlibError("Error -3 while decompressing data: invalid code lengths set");
}

/** Extra bits and base length of each length symbol 257..285. */
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
/** Extra bits and base distance of each distance symbol 0..29. */
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** The order the code-length code lengths are stored in for a dynamic block. */
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** The fixed literal/length table of a block that uses the default codes. */
function fixedLiteral(): Huffman {
  const lengths = new Array<number>(288);
  for (let i = 0; i < 288; i++) lengths[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
  return huffman(lengths);
}

/** Growable output that also serves as the back-reference window. */
class Output {
  private buf = new Uint8Array(1 << 16);
  /** How many bytes have been written. */
  length = 0;

  /** @param n - How many more bytes are about to be written. */
  private room(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.length + n) size *= 2;
    const bigger = new Uint8Array(size);
    bigger.set(this.buf.subarray(0, this.length));
    this.buf = bigger;
  }

  /** @param b - Bytes to append. */
  push(b: Uint8Array): void { this.room(b.length); this.buf.set(b, this.length); this.length += b.length; }

  /** @param byte - One byte to append. */
  pushByte(byte: number): void { this.room(1); this.buf[this.length] = byte; this.length += 1; }

  /**
   * Copy a run from earlier in the output, which is how DEFLATE encodes a repeat.
   *
   * @param distance - How far back the run starts. @param length - How long it is; it may overlap itself.
   * @throws {@link ZlibError} for a distance reaching before the start of the data.
   */
  copy(distance: number, length: number): void {
    if (distance > this.length) throw new ZlibError("Error -3 while decompressing data: invalid distance too far back");
    this.room(length);
    let from = this.length - distance;
    for (let i = 0; i < length; i++) { this.buf[this.length] = this.buf[from]!; this.length += 1; from += 1; }
  }

  /** @returns Just the bytes written. */
  done(): Uint8Array { return this.buf.slice(0, this.length); }
}

/**
 * Walk a raw DEFLATE stream, writing the decompressed bytes if asked for them.
 *
 * The walk is the same whether or not the output is wanted, so one function does both: {@link inflateRaw} wants
 * the bytes, while the zlib wrapper needs only to know where the compressed data ends so that it can find the
 * checksum after it.
 *
 * @param data - The compressed bytes, possibly followed by more.
 * @param out - Where to write the result, or null to walk without building it.
 * @returns How many bytes of `data` the stream occupies.
 * @throws {@link ZlibError} for data that is not valid DEFLATE.
 */
function inflateInto(data: Uint8Array, out: Output | null): number {
  const br = new BitReader(data);
  const fixedLit = fixedLiteral();
  const fixedDist = huffman(new Array<number>(30).fill(5));

  for (;;) {
    const last = br.bits(1);
    const type = br.bits(2);
    if (type === 0) {
      // A stored block: the length, its complement, then the bytes themselves.
      br.align();
      const header = br.bytes(4);
      const len = header[0]! | (header[1]! << 8), nlen = header[2]! | (header[3]! << 8);
      if ((len ^ 0xffff) !== nlen) throw new ZlibError("Error -3 while decompressing data: invalid stored block lengths");
      const block = br.bytes(len);
      out?.push(block);
    } else if (type === 1 || type === 2) {
      let lit = fixedLit, dist = fixedDist;
      if (type === 2) {
        // A dynamic block carries its own two tables, themselves Huffman-coded.
        const hlit = br.bits(5) + 257, hdist = br.bits(5) + 1, hclen = br.bits(4) + 4;
        const clens = new Array<number>(19).fill(0);
        for (let i = 0; i < hclen; i++) clens[CLEN_ORDER[i]!] = br.bits(3);
        const clenTable = huffman(clens);
        const lengths: number[] = [];
        while (lengths.length < hlit + hdist) {
          const sym = decodeSymbol(br, clenTable);
          if (sym < 16) lengths.push(sym);
          else if (sym === 16) {
            const prev = lengths[lengths.length - 1];
            if (prev === undefined) throw new ZlibError("Error -3 while decompressing data: invalid bit length repeat");
            for (let n = br.bits(2) + 3; n > 0; n--) lengths.push(prev);
          } else if (sym === 17) for (let n = br.bits(3) + 3; n > 0; n--) lengths.push(0);
          else for (let n = br.bits(7) + 11; n > 0; n--) lengths.push(0);
        }
        lit = huffman(lengths.slice(0, hlit));
        dist = huffman(lengths.slice(hlit, hlit + hdist));
      }
      for (;;) {
        const sym = decodeSymbol(br, lit);
        if (sym < 256) out?.pushByte(sym);
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          if (li >= LENGTH_BASE.length) throw new ZlibError("Error -3 while decompressing data: invalid literal/length code");
          const length = LENGTH_BASE[li]! + br.bits(LENGTH_EXTRA[li]!);
          const ds = decodeSymbol(br, dist);
          if (ds >= DIST_BASE.length) throw new ZlibError("Error -3 while decompressing data: invalid distance code");
          const distance = DIST_BASE[ds]! + br.bits(DIST_EXTRA[ds]!);
          out?.copy(distance, length);
        }
      }
    } else {
      throw new ZlibError("Error -3 while decompressing data: invalid block type");
    }
    if (last) break;
  }
  return br.consumed;
}

/**
 * Decompress raw DEFLATE data, with no zlib header or checksum.
 *
 * @param data - The compressed bytes.
 * @returns The decompressed bytes.
 * @throws {@link ZlibError} for data that is not valid DEFLATE.
 */
export function inflateRaw(data: Uint8Array): Uint8Array {
  const out = new Output();
  inflateInto(data, out);
  return out.done();
}

/**
 * Decompress raw DEFLATE data that something else may follow, and say where it ended.
 *
 * A container that puts its own trailer after the compressed data, as gzip does, has no other way to
 * find that trailer: a DEFLATE stream does not say how long it is until it has been read.
 *
 * @param data - The compressed bytes, possibly followed by more.
 * @returns The decompressed bytes, and how many bytes of `data` the stream occupied.
 * @throws {@link ZlibError} for data that is not valid DEFLATE, or that stops before the stream does.
 * @example
 * ```ts
 * const { data, consumed } = inflateRawPrefix(Uint8Array.of(0x4b, 0x04, 0x00, 0xff, 0xff));
 * data;       // Uint8Array [ 97 ], the letter "a"
 * consumed;   // 3, so two bytes follow the stream
 * ```
 */
export function inflateRawPrefix(data: Uint8Array): { data: Uint8Array; consumed: number } {
  const out = new Output();
  const consumed = inflateInto(data, out);
  return { data: out.done(), consumed };
}

/**
 * Adler-32, the checksum a zlib stream ends with.
 *
 * @param data - The bytes to sum.
 * @returns The checksum.
 */
export function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Decompress a zlib stream: a two-byte header, the DEFLATE data, and an Adler-32 checksum.
 *
 * @param data - The compressed bytes, as Python's `zlib.compress` produces them.
 * @returns The decompressed bytes.
 * @throws {@link ZlibError} for a bad header, bad data, or a checksum that does not match.
 */
export function inflate(data: Uint8Array): Uint8Array {
  if (data.length < 2) throw new ZlibError("Error -5 while decompressing data: incomplete or truncated stream");
  const cmf = data[0]!, flg = data[1]!;
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) {
    throw new ZlibError("Error -3 while decompressing data: incorrect header check");
  }
  // A preset dictionary would need one we do not have; nothing that writes these files uses one.
  if ((flg & 0x20) !== 0) throw new ZlibError("Error -3 while decompressing data: need dictionary");
  const body = data.subarray(2);
  const out = new Output();
  const consumed = inflateInto(body, out);
  const result = out.done();
  // The checksum follows the compressed data, big-endian. A stream cut short of it is accepted, as the
  // decompressed bytes are all there.
  const tail = data.subarray(2 + consumed);
  if (tail.length >= 4) {
    const want = ((tail[0]! << 24) | (tail[1]! << 16) | (tail[2]! << 8) | tail[3]!) >>> 0;
    if (want !== adler32(result)) throw new ZlibError("Error -3 while decompressing data: incorrect data check");
  }
  return result;
}
