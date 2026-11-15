/**
 * A twoBit file read a window at a time, for genomes too large to load.
 *
 * `TwoBitIterator` is Biopython's reader and needs the whole file in memory. This reads the same format
 * through a {@link ByteSource}: the list of sequences when the file is opened, one sequence's block
 * tables the first time it is used, and then only the packed bytes that cover each range asked for. It
 * is not a port, since Biopython has nothing like it, and is tested by comparing every answer with
 * `TwoBitIterator`'s on the same bytes. The decoding itself is the ported `convert`.
 */
import { IndexError, KeyError, ValueError } from "@biolibs/core";
import type { ByteSource } from "../range.js";
import { convert, type Blocks } from "./convert.js";

/** How much is read when the file is opened: enough for the header and a few hundred sequence names. */
const FIRST_READ = 4096;
/** How much more is read at a time if the list of sequences is longer than that. */
const INDEX_CHUNK = 65536;
const SIGNATURE = 0x1a412743;

/** Where one sequence's parts are in the file, read the first time it is used. */
interface Layout {
  /** The number of bases. */
  length: number;
  /** Runs of unknown bases, as `[start, end)`, in order. */
  nBlocks: Blocks;
  /** Runs of soft-masked bases, as `[start, end)`, in order. */
  maskBlocks: Blocks;
  /** The position in the file of the packed bases. */
  packed: number;
  /** Whether each table is in order, which decides whether it can be searched by bisection. */
  sorted: { n: boolean; mask: boolean };
}

/**
 * Whether a block table is in order, by start and by end. Real files are; a table that is not has to
 * be handled exactly as `convert` handles it, which is to stop at the first block beyond the window.
 *
 * @param blocks - A block table. @returns True if both starts and ends never decrease.
 */
function inOrder(blocks: Blocks): boolean {
  return blocks.every((block, i) => i === 0 || (blocks[i - 1]![0] <= block[0] && blocks[i - 1]![1] <= block[1]));
}

/**
 * The blocks that can touch `[start, end)`, found by bisection so that a chromosome with a hundred
 * thousand masked runs is not walked from the beginning for every window.
 *
 * @param blocks - A block table. @param sorted - Whether it is {@link inOrder}.
 * @param start - Window start. @param end - Window end.
 * @returns For a table in order, the blocks from the first that ends at or after `start` to the last
 *   that starts at or before `end`, which are the only ones `convert` would act on. For a table out of
 *   order, all of it, so that `convert` treats it as it always has.
 */
function near(blocks: Blocks, sorted: boolean, start: number, end: number): Blocks {
  if (!sorted) return blocks;
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (blocks[mid]![1] < start) low = mid + 1;
    else high = mid;
  }
  let last = low;
  while (last < blocks.length && blocks[last]![0] <= end) last++;
  return blocks.slice(low, last);
}

/**
 * A twoBit file opened for reading in parts.
 *
 * @example
 * ```ts
 * import { TwoBitWindow, blobSource } from "@biolibs/seqio";
 *
 * const genome = await TwoBitWindow.open(blobSource(file));   // reads the list of sequences only
 * genome.names;                                    // ["chr1", "chr2", ...]
 * await genome.lengthOf("chr1");                   // 248956422
 * await genome.fetch("chr1", 1_000_000, 1_000_060);   // 60 bases, for about 15 bytes read
 * ```
 */
export class TwoBitWindow {
  /** The sequence names, in file order. */
  readonly names: readonly string[];
  private readonly layouts = new Map<string, Promise<Layout>>();

  private constructor(
    private readonly source: ByteSource,
    private readonly little: boolean,
    private readonly offsets: ReadonlyMap<string, number>,
  ) {
    this.names = [...offsets.keys()];
  }

  /**
   * Open a twoBit file, reading its header and its list of sequences.
   *
   * @param source - Where to read the file from: {@link blobSource}, {@link urlSource} or {@link bytesSource}.
   * @returns The opened file.
   * @throws {@link ValueError} for an empty file, a wrong signature or version, or a list of sequences
   *   that runs past the end of the file. The first three are worded as `TwoBitIterator` words them.
   */
  static async open(source: ByteSource): Promise<TwoBitWindow> {
    let buffer = await source.read(0, Math.min(source.size, FIRST_READ));
    if (buffer.length === 0) throw new ValueError("Empty file.");
    let bufferStart = 0;
    let position = 0;
    /** Make sure `count` bytes from the current position are in the buffer. @returns A view over them. */
    const take = async (count: number): Promise<DataView> => {
      if (position + count > bufferStart + buffer.length) {
        bufferStart = position;
        buffer = await source.read(position, position + Math.max(count, INDEX_CHUNK));
        if (buffer.length < count) throw new ValueError("The list of sequences runs past the end of the file.");
      }
      const view = new DataView(buffer.buffer, buffer.byteOffset + position - bufferStart, count);
      position += count;
      return view;
    };

    const signature = await take(4);
    let little = true;
    if (signature.getUint32(0, true) !== SIGNATURE) {
      little = false;
      if (signature.getUint32(0, false) !== SIGNATURE) throw new ValueError("Unknown signature");
    }
    const version = (await take(4)).getUint32(0, little);
    if (version === 1) throw new ValueError("version-1 twoBit files with 64-bit offsets for index are currently not supported");
    if (version !== 0) throw new ValueError(`Found unexpected file version ${version}; aborting`);
    const count = (await take(4)).getUint32(0, little);
    if ((await take(4)).getUint32(0, little) !== 0) throw new ValueError("Found non-zero reserved field; aborting");

    const offsets = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      const nameSize = (await take(1)).getUint8(0);
      const name = await take(nameSize);
      let text = "";
      for (let j = 0; j < nameSize; j++) text += String.fromCharCode(name.getUint8(j));
      offsets.set(text, (await take(4)).getUint32(0, little));
    }
    return new TwoBitWindow(source, little, offsets);
  }

  /**
   * Read `count` 32-bit numbers starting at `position`.
   *
   * @param position - Where they start. @param count - How many. @param name - The sequence, for the error.
   * @returns The numbers.
   * @throws {@link ValueError} if the file ends before them.
   */
  private async words(position: number, count: number, name: string): Promise<number[]> {
    const bytes = await this.source.read(position, position + 4 * count);
    if (bytes.length < 4 * count) throw new ValueError(`The file ends inside the record for ${name}.`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    return Array.from({ length: count }, (_, i) => view.getUint32(4 * i, this.little));
  }

  /**
   * One sequence's length and block tables, read from the file once and remembered.
   *
   * @param name - The sequence. @returns Its layout.
   * @throws {@link KeyError} for a name that is not in the file.
   */
  private layout(name: string): Promise<Layout> {
    const known = this.layouts.get(name);
    if (known) return known;
    const offset = this.offsets.get(name);
    if (offset === undefined) throw new KeyError(name);
    const reading = (async (): Promise<Layout> => {
      const [length, nCount] = (await this.words(offset, 2, name)) as [number, number];
      // The N-block starts and sizes, then the count of masked blocks, in one read.
      const ns = await this.words(offset + 8, 2 * nCount + 1, name);
      const maskCount = ns[2 * nCount]!;
      const maskAt = offset + 8 + 8 * nCount + 4;
      // The masked-block starts and sizes, then the reserved word.
      const masks = await this.words(maskAt, 2 * maskCount + 1, name);
      if (masks[2 * maskCount] !== 0) throw new ValueError(`Found non-zero reserved field ${masks[2 * maskCount]}`);
      const blocks = (words: number[], count: number): Blocks =>
        Array.from({ length: count }, (_, i) => [words[i]!, (words[i]! + words[count + i]!) >>> 0] as [number, number]);
      const nBlocks = blocks(ns, nCount);
      const maskBlocks = blocks(masks, maskCount);
      return { length, nBlocks, maskBlocks, packed: maskAt + 8 * maskCount + 4, sorted: { n: inOrder(nBlocks), mask: inOrder(maskBlocks) } };
    })();
    this.layouts.set(name, reading);
    return reading;
  }

  /**
   * How many bases a sequence has.
   *
   * @param name - The sequence. @returns Its length.
   * @throws {@link KeyError} for a name that is not in the file.
   */
  async lengthOf(name: string): Promise<number> {
    return (await this.layout(name)).length;
  }

  /**
   * The runs of unknown and of soft-masked bases in a sequence, which a viewer can draw without
   * fetching any bases.
   *
   * @param name - The sequence. @returns Its N blocks and masked blocks, each as `[start, end)` in order.
   * @throws {@link KeyError} for a name that is not in the file.
   */
  async blocksOf(name: string): Promise<{ nBlocks: Blocks; maskBlocks: Blocks }> {
    const { nBlocks, maskBlocks } = await this.layout(name);
    return { nBlocks, maskBlocks };
  }

  /**
   * Read part of a sequence.
   *
   * @param name - The sequence.
   * @param start - The first base wanted, counting from 0.
   * @param end - One past the last base wanted.
   * @returns The bases, with unknown stretches as `N` and soft-masked stretches in lower case, exactly
   *   as `TwoBitIterator` gives them. Reads one byte from the file for every four bases.
   * @throws {@link KeyError} for a name that is not in the file.
   * @throws {@link IndexError} unless `0 <= start <= end <= length`. Nothing is clamped, so that a
   *   window reaching off the end of a chromosome is noticed.
   * @throws RuntimeError if the file ends before the bases asked for.
   */
  async fetch(name: string, start: number, end: number): Promise<string> {
    const layout = await this.layout(name);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > layout.length) {
      throw new IndexError(`range ${start}:${end} is outside ${name}, which has ${layout.length} bases`);
    }
    if (start === end) return "";
    const bytes = await this.source.read(layout.packed + Math.floor(start / 4), layout.packed + Math.floor((end + 3) / 4));
    const letters = convert(bytes, start, end, 1, near(layout.nBlocks, layout.sorted.n, start, end), near(layout.maskBlocks, layout.sorted.mask, start, end));
    let text = "";
    for (let i = 0; i < letters.length; i += 0x8000) text += String.fromCharCode(...letters.subarray(i, i + 0x8000));
    return text;
  }
}
