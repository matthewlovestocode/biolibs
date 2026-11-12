/** Reader for `twobit` files (UCSC 2-bit packed genomes). */

import { KeyError, MemoryError, ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { decodeAscii } from "../binary/ascii.js";
import { intFromBytes } from "../binary/struct.js";
import { SequenceIterator } from "../interfaces.js";
import type { BinaryStream } from "../handles.js";
import type { Blocks } from "./convert.js";
import { TwoBitSequenceData } from "./data.js";

/** Read `count` unsigned 32-bit values as `np.fromfile` does: as many as the file still has, up to `count`. */
function readWords(stream: BinaryStream, little: boolean, count: number): number[] {
  const bytes = stream.read(count * 4);
  const out: number[] = [];
  for (let i = 0; i + 4 <= bytes.length; i += 4) out.push(intFromBytes(bytes.subarray(i, i + 4), little));
  return out;
}

/** Check that `k` values can be assigned to a column of `n` rows (numpy repeats a single value). */
function checkAssign(k: number, n: number): void {
  if (k !== n && k !== 1) throw new ValueError(`could not broadcast input array from shape (${k},) into shape (${n},)`);
}

/** Largest block table we are willing to build; a corrupt count beyond this would exhaust memory. */
const MAX_BLOCKS = 50_000_000;

/**
 * Join start positions and sizes into `[start, end)` blocks by the same steps Biopython takes with numpy: assign the
 * starts to a column, add starts and sizes (sums wrap at 2**32), assign the sums. When the file ended early the arrays
 * are short, and numpy's broadcasting rules decide whether that is an error. All shape checks happen before anything
 * is allocated.
 *
 * @throws {@link ValueError} with numpy's wording when the shapes cannot be matched.
 * @throws {@link MemoryError} for an absurd block count.
 */
function toBlocks(starts: number[], sizes: number[], count: number): Blocks {
  checkAssign(starts.length, count);
  let m: number;
  if (starts.length === sizes.length) m = starts.length;
  else if (starts.length === 1) m = sizes.length;
  else if (sizes.length === 1) m = starts.length;
  else throw new ValueError(`operands could not be broadcast together with shapes (${starts.length},) (${sizes.length},) `);
  checkAssign(m, count);
  if (count > MAX_BLOCKS) throw new MemoryError(`Unable to allocate ${count} blocks`);
  const at = (xs: number[], i: number): number => xs[xs.length === 1 ? 0 : i]!;
  return Array.from({ length: count }, (_, i) => [at(starts, i), (at(starts, i) + at(sizes, i)) >>> 0] as [number, number]);
}

/**
 * Reads a twoBit file. All names and offsets are read up front; each record's bases are decoded lazily from the file
 * when the sequence is used, so the file's bytes stay in memory as long as the records are used.
 *
 * @throws {@link ValueError} for an empty file, a wrong signature or version, or inconsistent headers.
 */
export class TwoBitIterator extends SequenceIterator {
  get modes(): string { return "b"; }
  /** Sequence by name. */
  readonly sequences = new Map<string, Seq>();
  private readonly names: Iterator<string>;

  /** @param source - The file's bytes. */
  constructor(source: unknown) {
    super(source, null, "twoBit");
    const stream = this.bytes!;
    let data = stream.read(4);
    if (data.length === 0) throw new ValueError("Empty file.");
    let little = true;
    if (intFromBytes(data, true) !== 440477507) {
      little = false;
      if (intFromBytes(data, false) !== 440477507) throw new ValueError("Unknown signature");
    }
    const word = (): number => intFromBytes(stream.read(4), little);
    const version = word();
    if (version === 1) throw new ValueError("version-1 twoBit files with 64-bit offsets for index are currently not supported");
    if (version !== 0) throw new ValueError(`Found unexpected file version ${version}; aborting`);
    const sequenceCount = word();
    if (word() !== 0) throw new ValueError("Found non-zero reserved field; aborting");
    const offsets = new Map<string, number>();
    for (let i = 0; i < sequenceCount; i++) {
      const nameSize = intFromBytes(stream.read(1), little);
      data = stream.read(nameSize);
      const name = decodeAscii(data);
      offsets.set(name, word());
    }
    for (const [name, offset] of offsets) {
      stream.seek(offset);
      const dnaSize = word();
      const sequence = new TwoBitSequenceData(stream, offset, dnaSize);
      const nCount = word();
      const nStarts = readWords(stream, little, nCount);
      const nSizes = readWords(stream, little, nCount);
      sequence.nBlocks = toBlocks(nStarts, nSizes, nCount);
      const maskCount = word();
      const maskStarts = readWords(stream, little, maskCount);
      const maskSizes = readWords(stream, little, maskCount);
      sequence.maskBlocks = toBlocks(maskStarts, maskSizes, maskCount);
      const reserved = word();
      if (reserved !== 0) throw new ValueError(`Found non-zero reserved field ${reserved}`);
      sequence.offset = stream.tell();
      this.sequences.set(name, new Seq(sequence));
    }
    this.names = this.sequences.keys();
  }

  protected nextRecord(): SeqRecord | null {
    const next = this.names.next();
    if (next.done) return null;
    return new SeqRecord(this.sequences.get(next.value)!, next.value);
  }

  /** A record by name (Python `iterator[name]`). @throws {@link KeyError} for an unknown name. */
  get(name: string): SeqRecord {
    const sequence = this.sequences.get(name);
    if (sequence === undefined) throw new KeyError(name);
    return new SeqRecord(sequence, name);
  }

  /** Sequence names, in file order. */
  keys(): IterableIterator<string> {
    return this.sequences.keys();
  }

  /** Number of sequences. */
  get size(): number {
    return this.sequences.size;
  }
}
