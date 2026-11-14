/**
 * The Huffman side of DEFLATE compression: zlib's `trees.c`, which decides how each block is coded.
 *
 * Everything here follows zlib 1.2.12 step by step, because the output has to be the same bytes: which of the
 * three block types is used, how ties between them are broken, how the code lengths are capped and shuffled
 * when a tree is too deep, and the order the code-length tree itself is sent in.
 */

/** How many literal/length codes there are, the end-of-block code included. */
const L_CODES = 286;
/** How many distance codes. */
const D_CODES = 30;
/** How many codes the code-length tree has. */
const BL_CODES = 19;
/** The deepest a literal/length or distance code may be. */
const MAX_BITS = 15;
/** The deepest a code-length code may be. */
const MAX_BL_BITS = 7;
/** The code that ends a block. */
const END_BLOCK = 256;
/** The number of literal codes, before the length codes start. */
const LITERALS = 256;
/** The shortest match that is worth coding. */
export const MIN_MATCH = 3;
/** The longest match a single code can carry. */
export const MAX_MATCH = 258;

/** Extra bits carried by each length code. */
const EXTRA_LBITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
/** Extra bits carried by each distance code. */
const EXTRA_DBITS = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** Extra bits carried by the three repeat codes of the code-length tree. */
const EXTRA_BLBITS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7];
/** The order the code-length tree's own lengths are sent in. */
const BL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** The length code of each match length, and the shortest length each code stands for. */
const lengthCode = new Uint8Array(MAX_MATCH - MIN_MATCH + 1);
const baseLength = new Int32Array(L_CODES - LITERALS - 1);
/** The distance code of each distance (the second half in 128-byte steps), and each code's shortest distance. */
const distCode = new Uint8Array(512);
const baseDist = new Int32Array(D_CODES);

// zlib builds these at run time in `tr_static_init`; the same loops here keep the two in step by construction.
{
  let length = 0;
  for (let code = 0; code < L_CODES - LITERALS - 2; code++) {
    baseLength[code] = length;
    for (let n = 0; n < (1 << EXTRA_LBITS[code]!); n++) lengthCode[length++] = code;
  }
  // Length 258 has a code of its own, which the loop above would otherwise give to the previous one.
  baseLength[L_CODES - LITERALS - 2] = 0;
  lengthCode[length - 1] = L_CODES - LITERALS - 2;

  let dist = 0;
  let code = 0;
  for (; code < 16; code++) {
    baseDist[code] = dist;
    for (let n = 0; n < (1 << EXTRA_DBITS[code]!); n++) distCode[dist++] = code;
  }
  dist >>= 7;
  for (; code < D_CODES; code++) {
    baseDist[code] = dist << 7;
    for (let n = 0; n < (1 << (EXTRA_DBITS[code]! - 7)); n++) distCode[256 + dist++] = code;
  }
}

/** @param dist - A match distance. @returns The distance code for it. */
const dCode = (dist: number): number => (dist < 256 ? distCode[dist]! : distCode[256 + (dist >>> 7)]!);

/** One Huffman tree: a code and a length for each symbol, with the frequencies it was built from. */
interface Tree {
  /** Each symbol's code, bit-reversed ready to send. */
  code: Uint16Array;
  /** Each symbol's code length, zero for a symbol with no code. */
  len: Uint8Array;
  /** Each symbol's frequency, which building the tree consumes. */
  freq: Uint16Array;
}

/** @param size - How many symbols. @returns An empty tree of that size. */
const newTree = (size: number): Tree => ({ code: new Uint16Array(size), len: new Uint8Array(size), freq: new Uint16Array(size) });

/** @param code - A code of `len` bits. @param len - Its length. @returns The code with its bits reversed. */
function biReverse(code: number, len: number): number {
  let value = 0, rest = code;
  for (let i = 0; i < len; i++) { value = (value << 1) | (rest & 1); rest >>>= 1; }
  return value;
}

/**
 * Give every symbol with a length the next code of that length, as RFC 1951 section 3.2.2 requires.
 *
 * @param tree - The tree, whose codes this fills in. @param maxCode - The largest symbol in use.
 * @param blCount - How many codes there are of each length.
 */
function genCodes(tree: Tree, maxCode: number, blCount: Int32Array): void {
  const nextCode = new Int32Array(MAX_BITS + 1);
  let code = 0;
  for (let bits = 1; bits <= MAX_BITS; bits++) {
    code = (code + blCount[bits - 1]!) << 1;
    nextCode[bits] = code;
  }
  for (let n = 0; n <= maxCode; n++) {
    const len = tree.len[n]!;
    if (len === 0) continue;
    tree.code[n] = biReverse(nextCode[len]!, len);
    nextCode[len] = nextCode[len]! + 1;
  }
}

/** What a tree is built from: its static counterpart, where its extra bits start, and how deep it may be. */
interface TreeDesc {
  /** The tree being built. */
  tree: Tree;
  /** The lengths of the matching static tree, for comparing the two block types; null for the code-length tree. */
  staticLen: Uint8Array | null;
  /** Extra bits per symbol beyond `base`. */
  extra: readonly number[];
  /** The first symbol that carries extra bits. */
  base: number;
  /** How many symbols the tree may have. */
  elems: number;
  /** The deepest code allowed. */
  maxLength: number;
  /** The largest symbol in use, which building the tree works out. */
  maxCode: number;
}

/** The state one block's trees are built in: the heap, and the running cost of each block type. */
class BlockTrees {
  /** The literal/length tree. */
  readonly dynLtree = newTree(2 * L_CODES + 1);
  /** The distance tree. */
  readonly dynDtree = newTree(2 * D_CODES + 1);
  /** The tree that codes the other two trees' lengths. */
  readonly blTree = newTree(2 * BL_CODES + 1);
  /** How many bits a dynamic block would take. */
  optLen = 0;
  /** How many bits a static block would take. */
  staticLen = 0;
  private readonly heap = new Int32Array(2 * L_CODES + 1);
  private heapLen = 0;
  private heapMax = 0;
  private readonly depth = new Uint8Array(2 * L_CODES + 1);
  private readonly blCount = new Int32Array(MAX_BITS + 1);

  /** @param n - A node. @param m - Another. @param tree - Their tree. @returns Whether `n` sorts before `m`. */
  private smaller(tree: Tree, n: number, m: number): boolean {
    return tree.freq[n]! < tree.freq[m]!
      || (tree.freq[n] === tree.freq[m] && this.depth[n]! <= this.depth[m]!);
  }

  /** Restore the heap after its root changed. @param tree - The tree. @param k - Where to sink from. */
  private pqdownheap(tree: Tree, k: number): void {
    const v = this.heap[k]!;
    let at = k;
    let j = at << 1;
    while (j <= this.heapLen) {
      if (j < this.heapLen && this.smaller(tree, this.heap[j + 1]!, this.heap[j]!)) j++;
      if (this.smaller(tree, v, this.heap[j]!)) break;
      this.heap[at] = this.heap[j]!;
      at = j;
      j <<= 1;
    }
    this.heap[at] = v;
  }

  /**
   * Work out each symbol's code length from the tree's shape, capping and reshuffling where it is too deep.
   *
   * @param desc - The tree being built.
   */
  private genBitlen(desc: TreeDesc): void {
    const { tree, staticLen, extra, base, maxCode, maxLength } = desc;
    let overflow = 0;
    this.blCount.fill(0);
    tree.len[this.heap[this.heapMax]!] = 0;
    let h = this.heapMax + 1;
    for (; h < 2 * L_CODES + 1; h++) {
      const n = this.heap[h]!;
      let bits = tree.len[tree.code[n]!]!;   // `Dad` is kept in `code` while the tree is being built
      bits += 1;
      if (bits > maxLength) { bits = maxLength; overflow++; }
      tree.len[n] = bits;
      if (n > maxCode) continue;
      this.blCount[bits] = this.blCount[bits]! + 1;
      let xbits = 0;
      if (n >= base) xbits = extra[n - base]!;
      const f = tree.freq[n]!;
      this.optLen += f * (bits + xbits);
      if (staticLen !== null) this.staticLen += f * (staticLen[n]! + xbits);
    }
    if (overflow === 0) return;
    // Too many deep codes: move one up a level at a time until the tree fits, as zlib does.
    do {
      let bits = maxLength - 1;
      while (this.blCount[bits] === 0) bits--;
      this.blCount[bits] = this.blCount[bits]! - 1;
      this.blCount[bits + 1] = this.blCount[bits + 1]! + 2;
      this.blCount[maxLength] = this.blCount[maxLength]! - 1;
      overflow -= 2;
    } while (overflow > 0);
    for (let bits = maxLength; bits !== 0; bits--) {
      let n = this.blCount[bits]!;
      while (n !== 0) {
        const m = this.heap[--h]!;
        if (m > maxCode) continue;
        if (tree.len[m] !== bits) {
          this.optLen += (bits - tree.len[m]!) * tree.freq[m]!;
          tree.len[m] = bits;
        }
        n--;
      }
    }
  }

  /**
   * Build one Huffman tree from its frequencies.
   *
   * @param desc - The tree to build, whose `maxCode` this sets.
   */
  buildTree(desc: TreeDesc): void {
    const { tree, staticLen, elems } = desc;
    let maxCode = -1;
    this.heapLen = 0;
    this.heapMax = 2 * L_CODES + 1;
    for (let n = 0; n < elems; n++) {
      if (tree.freq[n] !== 0) { this.heap[++this.heapLen] = maxCode = n; this.depth[n] = 0; }
      else tree.len[n] = 0;
    }
    // A tree needs two leaves, so a block with fewer gets a second one for free.
    while (this.heapLen < 2) {
      const node = this.heap[++this.heapLen] = maxCode < 2 ? ++maxCode : 0;
      tree.freq[node] = 1;
      this.depth[node] = 0;
      this.optLen -= 1;
      if (staticLen !== null) this.staticLen -= staticLen[node]!;
    }
    desc.maxCode = maxCode;
    for (let n = this.heapLen >> 1; n >= 1; n--) this.pqdownheap(tree, n);
    let node = elems;
    do {
      const n = this.heap[1]!;
      this.heap[1] = this.heap[this.heapLen--]!;
      this.pqdownheap(tree, 1);
      const m = this.heap[1]!;
      this.heap[--this.heapMax] = n;
      this.heap[--this.heapMax] = m;
      tree.freq[node] = tree.freq[n]! + tree.freq[m]!;
      this.depth[node] = Math.max(this.depth[n]!, this.depth[m]!) + 1;
      // `Dad` lives in `code` until `genCodes` overwrites it, as it does in zlib's union.
      tree.code[n] = tree.code[m] = node;
      this.heap[1] = node++;
      this.pqdownheap(tree, 1);
    } while (this.heapLen >= 2);
    this.heap[--this.heapMax] = this.heap[1]!;
    this.genBitlen(desc);
    genCodes(tree, desc.maxCode, this.blCount);
  }

  /** Count how the code-length tree would code one tree's lengths. @param tree - The tree. @param maxCode - Its largest symbol. */
  private scanTree(tree: Tree, maxCode: number): void {
    let prevlen = -1;
    let nextlen = tree.len[0]!;
    let count = 0;
    let maxCount = 7, minCount = 4;
    if (nextlen === 0) { maxCount = 138; minCount = 3; }
    tree.len[maxCode + 1] = 0xff;
    for (let n = 0; n <= maxCode; n++) {
      const curlen = nextlen;
      nextlen = tree.len[n + 1]!;
      if (++count < maxCount && curlen === nextlen) continue;
      else if (count < minCount) this.blTree.freq[curlen] = this.blTree.freq[curlen]! + count;
      else if (curlen !== 0) {
        if (curlen !== prevlen) this.blTree.freq[curlen] = this.blTree.freq[curlen]! + 1;
        this.blTree.freq[16] = this.blTree.freq[16]! + 1;
      } else if (count <= 10) this.blTree.freq[17] = this.blTree.freq[17]! + 1;
      else this.blTree.freq[18] = this.blTree.freq[18]! + 1;
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) { maxCount = 138; minCount = 3; }
      else if (curlen === nextlen) { maxCount = 6; minCount = 3; }
      else { maxCount = 7; minCount = 4; }
    }
  }

  /** Send one tree's code lengths. @param out - Where to write. @param tree - The tree. @param maxCode - Its largest symbol. */
  private sendTree(out: BitWriter, tree: Tree, maxCode: number): void {
    let prevlen = -1;
    let nextlen = tree.len[0]!;
    let count = 0;
    let maxCount = 7, minCount = 4;
    if (nextlen === 0) { maxCount = 138; minCount = 3; }
    for (let n = 0; n <= maxCode; n++) {
      const curlen = nextlen;
      nextlen = tree.len[n + 1]!;
      if (++count < maxCount && curlen === nextlen) continue;
      else if (count < minCount) {
        do { out.sendCode(curlen, this.blTree); } while (--count !== 0);
      } else if (curlen !== 0) {
        if (curlen !== prevlen) { out.sendCode(curlen, this.blTree); count--; }
        out.sendCode(16, this.blTree);
        out.sendBits(count - 3, 2);
      } else if (count <= 10) {
        out.sendCode(17, this.blTree);
        out.sendBits(count - 3, 3);
      } else {
        out.sendCode(18, this.blTree);
        out.sendBits(count - 11, 7);
      }
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) { maxCount = 138; minCount = 3; }
      else if (curlen === nextlen) { maxCount = 6; minCount = 3; }
      else { maxCount = 7; minCount = 4; }
    }
  }

  /** Build the code-length tree. @returns How many of its lengths have to be sent. */
  private buildBlTree(lMaxCode: number, dMaxCode: number): number {
    this.scanTree(this.dynLtree, lMaxCode);
    this.scanTree(this.dynDtree, dMaxCode);
    this.buildTree({ tree: this.blTree, staticLen: null, extra: EXTRA_BLBITS, base: 0, elems: BL_CODES, maxLength: MAX_BL_BITS, maxCode: 0 });
    let maxBlindex = BL_CODES - 1;
    for (; maxBlindex >= 3; maxBlindex--) {
      if (this.blTree.len[BL_ORDER[maxBlindex]!] !== 0) break;
    }
    this.optLen += 3 * (maxBlindex + 1) + 5 + 5 + 4;
    return maxBlindex;
  }

  /**
   * Finish one block: choose the cheapest of the three block types and write it.
   *
   * @param out - Where to write. @param symbols - The block's literals and matches, three bytes each.
   * @param symbolCount - How many of them there are. @param input - The input, for a stored block.
   * @param blockStart - Where the block's input starts. @param storedLen - How long it is.
   * @param last - Whether this is the final block.
   */
  flushBlock(out: BitWriter, symbols: Uint8Array, symbolCount: number, input: Uint8Array,
    blockStart: number, storedLen: number, last: boolean): void {
    const lDesc: TreeDesc = { tree: this.dynLtree, staticLen: STATIC_LTREE.len, extra: EXTRA_LBITS, base: LITERALS + 1, elems: L_CODES, maxLength: MAX_BITS, maxCode: 0 };
    const dDesc: TreeDesc = { tree: this.dynDtree, staticLen: STATIC_DTREE.len, extra: EXTRA_DBITS, base: 0, elems: D_CODES, maxLength: MAX_BITS, maxCode: 0 };
    this.buildTree(lDesc);
    this.buildTree(dDesc);
    const maxBlindex = this.buildBlTree(lDesc.maxCode, dDesc.maxCode);
    let optLenb = (this.optLen + 3 + 7) >>> 3;
    const staticLenb = (this.staticLen + 3 + 7) >>> 3;
    if (staticLenb <= optLenb) optLenb = staticLenb;

    if (storedLen + 4 <= optLenb) {
      // A stored block is cheaper: four bytes of overhead against the coded block's own.
      out.sendBits((0 << 1) + (last ? 1 : 0), 3);
      out.windup();
      out.writeU16(storedLen);
      out.writeU16(~storedLen & 0xffff);
      out.writeBytes(input.subarray(blockStart, blockStart + storedLen));
    } else if (staticLenb === optLenb) {
      out.sendBits((1 << 1) + (last ? 1 : 0), 3);
      this.compressBlock(out, symbols, symbolCount, STATIC_LTREE, STATIC_DTREE);
    } else {
      out.sendBits((2 << 1) + (last ? 1 : 0), 3);
      this.sendAllTrees(out, lDesc.maxCode + 1, dDesc.maxCode + 1, maxBlindex + 1);
      this.compressBlock(out, symbols, symbolCount, this.dynLtree, this.dynDtree);
    }
    this.initBlock();
    if (last) out.windup();
  }

  /** Send the three trees that a dynamic block starts with. */
  private sendAllTrees(out: BitWriter, lcodes: number, dcodes: number, blcodes: number): void {
    out.sendBits(lcodes - 257, 5);
    out.sendBits(dcodes - 1, 5);
    out.sendBits(blcodes - 4, 4);
    for (let rank = 0; rank < blcodes; rank++) out.sendBits(this.blTree.len[BL_ORDER[rank]!]!, 3);
    this.sendTree(out, this.dynLtree, lcodes - 1);
    this.sendTree(out, this.dynDtree, dcodes - 1);
  }

  /** Send the block's literals and matches with the trees chosen for it. */
  private compressBlock(out: BitWriter, symbols: Uint8Array, symbolCount: number, ltree: Tree, dtree: Tree): void {
    for (let i = 0; i < symbolCount; i++) {
      const dist = symbols[i * 3]! | (symbols[i * 3 + 1]! << 8);
      const lc = symbols[i * 3 + 2]!;
      if (dist === 0) {
        out.sendCode(lc, ltree);
      } else {
        const code = lengthCode[lc]!;
        out.sendCode(code + LITERALS + 1, ltree);
        let extra = EXTRA_LBITS[code]!;
        if (extra !== 0) out.sendBits(lc - baseLength[code]!, extra);
        const d = dist - 1;
        const dcode = dCode(d);
        out.sendCode(dcode, dtree);
        extra = EXTRA_DBITS[dcode]!;
        if (extra !== 0) out.sendBits(d - baseDist[dcode]!, extra);
      }
    }
    out.sendCode(END_BLOCK, ltree);
  }

  /** Start a new block: clear the frequencies and the two running costs. */
  initBlock(): void {
    this.dynLtree.freq.fill(0);
    this.dynDtree.freq.fill(0);
    this.blTree.freq.fill(0);
    this.dynLtree.freq[END_BLOCK] = 1;
    this.optLen = 0;
    this.staticLen = 0;
  }

  /**
   * Count one literal or match towards the block's trees.
   *
   * @param dist - The match distance, or zero for a literal. @param lc - The literal, or the match length less
   *   {@link MIN_MATCH}.
   */
  tally(dist: number, lc: number): void {
    if (dist === 0) {
      this.dynLtree.freq[lc] = this.dynLtree.freq[lc]! + 1;
    } else {
      const d = dist - 1;
      this.dynLtree.freq[lengthCode[lc]! + LITERALS + 1] = this.dynLtree.freq[lengthCode[lc]! + LITERALS + 1]! + 1;
      this.dynDtree.freq[dCode(d)] = this.dynDtree.freq[dCode(d)]! + 1;
    }
  }
}

/** Writes bits least significant first, which is how DEFLATE packs its codes. */
export class BitWriter {
  private buf = new Uint8Array(1 << 16);
  private at = 0;
  private bitBuf = 0;
  private bitCount = 0;

  /** @param n - How many more bytes are about to be written. */
  private room(n: number): void {
    if (this.at + n <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.at + n) size *= 2;
    const bigger = new Uint8Array(size);
    bigger.set(this.buf.subarray(0, this.at));
    this.buf = bigger;
  }

  /** @param value - The bits to send. @param length - How many of them. */
  sendBits(value: number, length: number): void {
    this.bitBuf |= (value << this.bitCount) & 0xffff;
    if (this.bitCount + length > 16) {
      this.room(2);
      this.buf[this.at++] = this.bitBuf & 0xff;
      this.buf[this.at++] = (this.bitBuf >> 8) & 0xff;
      this.bitBuf = value >>> (16 - this.bitCount);
      this.bitCount += length - 16;
    } else {
      this.bitCount += length;
    }
  }

  /** @param symbol - The symbol to send. @param tree - The tree holding its code. */
  sendCode(symbol: number, tree: { code: Uint16Array; len: Uint8Array }): void {
    this.sendBits(tree.code[symbol]!, tree.len[symbol]!);
  }

  /** Flush whole bytes out of the bit buffer. */
  private biFlush(): void {
    if (this.bitCount === 16) {
      this.room(2);
      this.buf[this.at++] = this.bitBuf & 0xff;
      this.buf[this.at++] = (this.bitBuf >> 8) & 0xff;
      this.bitBuf = 0;
      this.bitCount = 0;
    } else if (this.bitCount >= 8) {
      this.room(1);
      this.buf[this.at++] = this.bitBuf & 0xff;
      this.bitBuf >>= 8;
      this.bitCount -= 8;
    }
  }

  /** Pad to a byte boundary, which a stored block and the end of the stream both need. */
  windup(): void {
    if (this.bitCount > 8) {
      this.room(2);
      this.buf[this.at++] = this.bitBuf & 0xff;
      this.buf[this.at++] = (this.bitBuf >> 8) & 0xff;
    } else if (this.bitCount > 0) {
      this.room(1);
      this.buf[this.at++] = this.bitBuf & 0xff;
    }
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  /** @param value - A sixteen-bit number to write whole, as a stored block's length. */
  writeU16(value: number): void {
    this.room(2);
    this.buf[this.at++] = value & 0xff;
    this.buf[this.at++] = (value >> 8) & 0xff;
  }

  /** @param data - Bytes to write whole, as a stored block's contents. */
  writeBytes(data: Uint8Array): void {
    this.room(data.length);
    this.buf.set(data, this.at);
    this.at += data.length;
  }

  /** @returns Everything written so far. */
  done(): Uint8Array { return this.buf.slice(0, this.at); }
}

/** The static literal/length tree, which a fixed-Huffman block uses. */
const STATIC_LTREE: Tree = newTree(L_CODES + 2);
/** The static distance tree. */
const STATIC_DTREE: Tree = newTree(D_CODES);

// The fixed trees of RFC 1951 section 3.2.6, with their codes generated the same way as a dynamic tree's.
{
  const blCount = new Int32Array(MAX_BITS + 1);
  for (let n = 0; n < L_CODES + 2; n++) {
    STATIC_LTREE.len[n] = n < 144 ? 8 : n < 256 ? 9 : n < 280 ? 7 : 8;
    blCount[STATIC_LTREE.len[n]!] = blCount[STATIC_LTREE.len[n]!]! + 1;
  }
  genCodes(STATIC_LTREE, L_CODES + 1, blCount);
  const dCount = new Int32Array(MAX_BITS + 1);
  for (let n = 0; n < D_CODES; n++) { STATIC_DTREE.len[n] = 5; dCount[5] = dCount[5]! + 1; }
  genCodes(STATIC_DTREE, D_CODES - 1, dCount);
}

export { BlockTrees, lengthCode, L_CODES };
