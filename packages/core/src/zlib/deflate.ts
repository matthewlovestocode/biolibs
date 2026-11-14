/**
 * DEFLATE compression (RFC 1951) and the zlib wrapper around it (RFC 1950), which `zlib.compress` is in Python.
 *
 * This is zlib 1.2.12's own algorithm, not merely a valid compressor: the hash chains, the lazy matching of
 * `deflate_slow`, where the blocks are split, and the Huffman trees in `deflate-trees.ts` all follow it closely
 * enough that the bytes come out the same. That is what lets a written file be compared with the one Biopython
 * writes, and the golden cases hold Python's own output at every level to prove it.
 *
 * The whole input is in memory, so the sliding window is the input itself; distances are limited the same way,
 * which gives the same matches without the copying.
 */

import { adler32 } from "./inflate.js";
import { BitWriter, BlockTrees, MAX_MATCH, MIN_MATCH, lengthCode } from "./deflate-trees.js";

/** The window size zlib uses by default (`windowBits` 15). */
const W_SIZE = 32768;
/** The mask that wraps a position into the chain array. */
const W_MASK = W_SIZE - 1;
/** How much lookahead `deflate_slow` insists on having. */
const MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
/** The furthest back a match may be found. */
const MAX_DIST = W_SIZE - MIN_LOOKAHEAD;
/** How many hash buckets there are (`memLevel` 8). */
const HASH_SIZE = 1 << 15;
/** The mask for a hash value. */
const HASH_MASK = HASH_SIZE - 1;
/** How far the hash shifts per byte, so that three bytes fill it. */
const HASH_SHIFT = 5;
/** A three-byte match further away than this is not worth coding. */
const TOO_FAR = 4096;
/** How many symbols a block may hold (`memLevel` 8). */
const LIT_BUFSIZE = 1 << 14;
/** The largest a stored block may be. */
const MAX_STORED = 0xffff;

/** What a compression level settles: when to stop looking, and how hard to look. */
interface Config {
  /** Above this match length, the chain is searched a quarter as far. */
  goodLength: number;
  /** Above this length, no lazy match is tried. */
  maxLazy: number;
  /** A match this long ends the search. */
  niceLength: number;
  /** How many chain links to follow. */
  maxChain: number;
  /** Whether this level uses lazy matching (`deflate_slow`) rather than `deflate_fast`. */
  slow: boolean;
}

/** zlib's `configuration_table`, which is what a level means. */
const CONFIGS: readonly Config[] = [
  { goodLength: 0, maxLazy: 0, niceLength: 0, maxChain: 0, slow: false },        // 0: stored
  { goodLength: 4, maxLazy: 4, niceLength: 8, maxChain: 4, slow: false },
  { goodLength: 4, maxLazy: 5, niceLength: 16, maxChain: 8, slow: false },
  { goodLength: 4, maxLazy: 6, niceLength: 32, maxChain: 32, slow: false },
  { goodLength: 4, maxLazy: 4, niceLength: 16, maxChain: 16, slow: true },
  { goodLength: 8, maxLazy: 16, niceLength: 32, maxChain: 32, slow: true },
  { goodLength: 8, maxLazy: 16, niceLength: 128, maxChain: 128, slow: true },
  { goodLength: 8, maxLazy: 32, niceLength: 128, maxChain: 256, slow: true },
  { goodLength: 32, maxLazy: 128, niceLength: 258, maxChain: 1024, slow: true },
  { goodLength: 32, maxLazy: 258, niceLength: 258, maxChain: 4096, slow: true },
];

/** The compressor's state for one input: the chains, the block being built and the output. */
class Deflator {
  // Zero means "nothing here", as it does in zlib, where NIL is 0: a chain that starts at position 0 is
  // indistinguishable from an empty one, so zlib never matches against the first byte of the input. Reproducing
  // that blind spot is what makes the first match land in the same place.
  private readonly head = new Int32Array(HASH_SIZE);
  private readonly prev: Int32Array;
  private insH = 0;
  private strStart = 0;
  private lookahead: number;
  private blockStart = 0;
  private matchStart = 0;
  private matchLength = MIN_MATCH - 1;
  private prevLength = MIN_MATCH - 1;
  private prevMatch = 0;
  private matchAvailable = false;
  private readonly symbols = new Uint8Array(LIT_BUFSIZE * 3);
  private symbolCount = 0;
  private readonly trees = new BlockTrees();
  private readonly out = new BitWriter();

  /** @param input - The whole input. @param config - The level's settings. */
  constructor(private readonly input: Uint8Array, private readonly config: Config) {
    this.prev = new Int32Array(Math.max(1, input.length));
    this.lookahead = input.length;
    this.trees.initBlock();
  }

  /** @param h - The running hash. @param c - The next byte. @returns The hash with that byte rolled in. */
  private updateHash(h: number, c: number): number { return ((h << HASH_SHIFT) ^ c) & HASH_MASK; }

  /**
   * Put the three bytes at `str` into the hash chains.
   *
   * @param str - The position. @returns Where the chain for those bytes previously started.
   */
  private insertString(str: number): number {
    this.insH = this.updateHash(this.insH, this.input[str + MIN_MATCH - 1]!);
    const head = this.head[this.insH]!;
    this.prev[str & W_MASK] = head;
    this.head[this.insH] = str;
    return head;
  }

  /**
   * The longest match for the current position, looking down one hash chain.
   *
   * @param curMatchStart - Where the chain starts.
   * @returns How long the best match is, capped by the lookahead.
   */
  private longestMatch(curMatchStart: number): number {
    const { input } = this;
    let chainLength = this.config.maxChain;
    const scan = this.strStart;
    let bestLen = this.prevLength;
    let niceMatch = this.config.niceLength;
    const limit = this.strStart > MAX_DIST ? this.strStart - MAX_DIST : 0;
    const strend = this.strStart + MAX_MATCH;
    let scanEnd1 = input[scan + bestLen - 1]!;
    let scanEnd = input[scan + bestLen]!;
    let curMatch = curMatchStart;
    if (this.prevLength >= this.config.goodLength) chainLength >>= 2;
    if (niceMatch > this.lookahead) niceMatch = this.lookahead;
    do {
      const match = curMatch;
      if (input[match + bestLen] !== scanEnd || input[match + bestLen - 1] !== scanEnd1
        || input[match] !== input[scan] || input[match + 1] !== input[scan + 1]) continue;
      let s = scan + 2, m = match + 2;
      while (s < strend && input[s] === input[m]) { s++; m++; }
      const len = MAX_MATCH - (strend - s);
      if (len > bestLen) {
        this.matchStart = curMatch;
        bestLen = len;
        if (len >= niceMatch) break;
        scanEnd1 = input[scan + bestLen - 1]!;
        scanEnd = input[scan + bestLen]!;
      }
    } while ((curMatch = this.prev[curMatch & W_MASK]!) > limit && --chainLength !== 0);
    return bestLen <= this.lookahead ? bestLen : this.lookahead;
  }

  /**
   * Count one literal or match, and say whether the block should be closed.
   *
   * @param dist - The distance, or zero for a literal. @param lc - The literal, or the length less
   *   {@link MIN_MATCH}.
   * @returns Whether the block is full, or no longer worth keeping whole.
   */
  private tally(dist: number, lc: number): boolean {
    this.symbols[this.symbolCount * 3] = dist & 0xff;
    this.symbols[this.symbolCount * 3 + 1] = (dist >> 8) & 0xff;
    this.symbols[this.symbolCount * 3 + 2] = lc;
    this.symbolCount += 1;
    this.trees.tally(dist, lc);
    // A block ends when the symbol buffer is full, and only then. Older zlib also gave up early on a block that
    // was not compressing (its TRUNCATE_BLOCK); 1.2.12 dropped that when the buffers were reworked, so a block
    // here runs to the full `lit_bufsize - 1` symbols however badly it is going.
    return this.symbolCount === LIT_BUFSIZE - 1;
  }

  /** Write the block built so far. @param last - Whether it ends the stream. */
  private flushBlock(last: boolean): void {
    const storedLen = this.strStart - this.blockStart;
    this.trees.flushBlock(this.out, this.symbols, this.symbolCount, this.input, this.blockStart, storedLen, last);
    this.blockStart = this.strStart;
    this.symbolCount = 0;
  }

  /** Compress the whole input with lazy matching, which is what levels 4 and up use. */
  private deflateSlow(): void {
    const { input, config } = this;
    while (this.lookahead !== 0) {
      let hashHead = 0;
      if (this.lookahead >= MIN_MATCH) hashHead = this.insertString(this.strStart);
      this.prevLength = this.matchLength;
      this.prevMatch = this.matchStart;
      this.matchLength = MIN_MATCH - 1;
      if (hashHead !== 0 && this.prevLength < config.maxLazy && this.strStart - hashHead <= MAX_DIST) {
        this.matchLength = this.longestMatch(hashHead);
        if (this.matchLength <= 5 && this.matchLength === MIN_MATCH && this.strStart - this.matchStart > TOO_FAR) {
          this.matchLength = MIN_MATCH - 1;
        }
      }
      if (this.prevLength >= MIN_MATCH && this.matchLength <= this.prevLength) {
        // The previous position's match was at least as good, so code that one and skip over it.
        const maxInsert = this.strStart + this.lookahead - MIN_MATCH;
        const bflush = this.tally(this.strStart - 1 - this.prevMatch, this.prevLength - MIN_MATCH);
        this.lookahead -= this.prevLength - 1;
        let left = this.prevLength - 2;
        do {
          if (++this.strStart <= maxInsert) this.insertString(this.strStart);
        } while (--left !== 0);
        this.matchAvailable = false;
        this.matchLength = MIN_MATCH - 1;
        this.strStart += 1;
        if (bflush) this.flushBlock(false);
      } else if (this.matchAvailable) {
        if (this.tally(0, input[this.strStart - 1]!)) this.flushBlock(false);
        this.strStart += 1;
        this.lookahead -= 1;
      } else {
        this.matchAvailable = true;
        this.strStart += 1;
        this.lookahead -= 1;
      }
    }
    if (this.matchAvailable) {
      this.tally(0, input[this.strStart - 1]!);
      this.matchAvailable = false;
    }
  }

  /** Compress the whole input without lazy matching, which is what levels 1 to 3 use. */
  private deflateFast(): void {
    const { input, config } = this;
    while (this.lookahead !== 0) {
      let hashHead = 0;
      if (this.lookahead >= MIN_MATCH) hashHead = this.insertString(this.strStart);
      if (hashHead !== 0 && this.strStart - hashHead <= MAX_DIST) {
        this.matchLength = this.longestMatch(hashHead);
      }
      let bflush: boolean;
      if (this.matchLength >= MIN_MATCH) {
        bflush = this.tally(this.strStart - this.matchStart, this.matchLength - MIN_MATCH);
        this.lookahead -= this.matchLength;
        // Only short matches are inserted into the chains, as zlib does for speed.
        if (this.matchLength <= config.maxLazy && this.lookahead >= MIN_MATCH) {
          this.matchLength -= 1;
          do { this.strStart += 1; this.insertString(this.strStart); } while (--this.matchLength !== 0);
          this.strStart += 1;
        } else {
          this.strStart += this.matchLength;
          this.matchLength = 0;
          this.insH = input[this.strStart]!;
          this.insH = this.updateHash(this.insH, input[this.strStart + 1]!);
        }
      } else {
        bflush = this.tally(0, input[this.strStart]!);
        this.lookahead -= 1;
        this.strStart += 1;
      }
      if (bflush) this.flushBlock(false);
    }
  }

  /** Compress the input and return the raw DEFLATE data. @returns The compressed bytes. */
  run(): Uint8Array {
    if (this.input.length === 0) {
      // Nothing to code: one empty static block, as zlib emits for an empty input.
      this.flushBlock(true);
      return this.out.done();
    }
    // zlib primes the hash with the first two bytes before the first insertion.
    this.insH = this.input[0]!;
    if (this.input.length > 1) this.insH = this.updateHash(this.insH, this.input[1]!);
    if (this.config.slow) this.deflateSlow();
    else this.deflateFast();
    this.flushBlock(true);
    return this.out.done();
  }
}

/**
 * Compress with stored blocks only, which is what level 0 means.
 *
 * @param data - The bytes to wrap.
 * @returns The raw DEFLATE data.
 */
function storedBlocks(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / MAX_STORED));
  const out = new Uint8Array(blocks * 5 + data.length);
  let at = 0;
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
  return out.subarray(0, at);
}

/**
 * Compress data as raw DEFLATE, with no zlib header or checksum.
 *
 * @param data - The bytes to compress. @param level - 0 to 9; 6 by default, as in zlib.
 * @returns The compressed bytes.
 */
export function deflateRaw(data: Uint8Array, level = 6): Uint8Array {
  if (level === 0) return storedBlocks(data);
  return new Deflator(data, CONFIGS[level]!).run();
}

/**
 * Compress data as a zlib stream: a two-byte header, the DEFLATE data, and an Adler-32 checksum.
 *
 * @param data - The bytes to compress. @param level - 0 to 9; 6 by default, as `zlib.compress` uses.
 * @returns The stream, byte for byte what Python's `zlib.compress(data, level)` returns.
 */
export function deflate(data: Uint8Array, level = 6): Uint8Array {
  const body = deflateRaw(data, level);
  const out = new Uint8Array(body.length + 6);
  // The header's level bits, as zlib's `deflateInit2` sets them: 0 below level 2, 1 up to 5, 2 for 6, 3 above.
  const flevel = level < 2 ? 0 : level < 6 ? 1 : level === 6 ? 2 : 3;
  out[0] = 0x78;
  out[1] = (flevel << 6) | (31 - (((0x78 << 8) + (flevel << 6)) % 31));
  out.set(body, 2);
  const check = adler32(data);
  out[body.length + 2] = (check >>> 24) & 0xff;
  out[body.length + 3] = (check >>> 16) & 0xff;
  out[body.length + 4] = (check >>> 8) & 0xff;
  out[body.length + 5] = check & 0xff;
  return out;
}

