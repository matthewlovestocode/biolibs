/** Lazy sequence content backed by a 2-bit packed region of a stream. */

import { IndexError } from "@biolibs/core";
import { SequenceDataAbstractBaseClass, rangeLength, sliceIndices, type PySlice, type SeqDataLike } from "@biolibs/seq";
import type { BinaryStream } from "../handles.js";
import { convert, type Blocks } from "./convert.js";

/**
 * The bases of one twoBit record, decoded on demand from the file (Biopython's `_TwoBitSequenceData`).
 * N blocks and soft-masked (lower-case) blocks are applied as bases are read.
 */
export class TwoBitSequenceData extends SequenceDataAbstractBaseClass {
  /** Runs of unknown bases. */
  nBlocks: Blocks = [];
  /** Runs of soft-masked (lower-case) bases. */
  maskBlocks: Blocks = [];

  /** @param stream - The open file. @param offset - Position of the packed bases. @param len - Number of bases. */
  constructor(private readonly stream: BinaryStream, public offset: number, private readonly len: number) {
    super();
  }

  get length(): number {
    return this.len;
  }

  /** Read the bytes covering `[start, end)` and decode them with the given step. */
  private fetch(start: number, end: number, step: number): Uint8Array {
    const byteStart = Math.floor(start / 4);
    const byteEnd = Math.floor((end + 3) / 4);
    this.stream.seek(this.offset + byteStart);
    // Biopython reads these bytes with `np.fromfile(..., count=byteSize)`, and a negative count there means
    // "everything left" rather than being refused as a negative length would be.
    const count = byteEnd - byteStart;
    const data = this.stream.read(count < 0 ? -1 : count);
    return convert(data, start, end, step, this.nBlocks, this.maskBlocks);
  }

  getItem(key: number): number {
    if (key < 0) {
      key += this.len;
      if (key < 0) throw new IndexError("index out of range");
    }
    return this.fetch(key, key + 1, 1)[0]!;
  }

  getSlice(s: PySlice): SeqDataLike {
    const [start, end, step] = sliceIndices(s, this.len);
    if (rangeLength(start, end, step) === 0) return new Uint8Array(0);
    return this.fetch(start, end, step);
  }

  upper(): SeqDataLike {
    const data = new TwoBitSequenceData(this.stream, this.offset, this.len);
    data.nBlocks = this.nBlocks.map((b) => [...b] as [number, number]);
    data.maskBlocks = [];
    return data;
  }

  lower(): SeqDataLike {
    const data = new TwoBitSequenceData(this.stream, this.offset, this.len);
    data.nBlocks = this.nBlocks.map((b) => [...b] as [number, number]);
    data.maskBlocks = [[0, this.len]];
    return data;
  }
}
