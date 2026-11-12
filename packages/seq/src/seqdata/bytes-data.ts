/** Fully defined content (Python `bytes` / `bytearray`). */

import { ValueError } from "@biolibs/core";
import * as pb from "../pybytes/index.js";
import type { PySlice } from "../pybytes/index.js";
import { SequenceDataAbstractBaseClass } from "./abstract.js";

/**
 * Fully defined sequence content backed by a growable byte buffer. Used for
 * immutable `Seq` data and, with the mutation methods, for `MutableSeq`
 * (Python `bytes` / `bytearray`).
 */
export class BytesData extends SequenceDataAbstractBaseClass {
  /** Backing storage; may be larger than `len` so appends are amortised O(1). */
  protected buf: Uint8Array;
  /** Number of valid bytes in `buf`. */
  protected len: number;

  /**
   * @param data - Initial content; copied.
   * @param byteArray - True for mutable (Python `bytearray`) storage; only affects error messages.
   */
  constructor(data: Uint8Array = new Uint8Array(0), readonly byteArray = false) {
    super();
    this.buf = data.slice();
    this.len = data.length;
  }

  /** Number of bytes currently held. */
  get length(): number { return this.len; }

  /** A live view of the content (not a copy). */
  get view(): Uint8Array { return this.buf.subarray(0, this.len); }

  /** One byte. Out-of-range indices raise `IndexError` with Python's text (`bytearray index out of range` for mutable data). */
  getItem(index: number): number {
    return this.buf[this.byteArray ? pb.checkIndexAssign(this.len, index) : pb.checkIndex(this.len, index)]!;
  }

  /** A copy of the sliced bytes (any slice, including negative steps). */
  getSlice(s: PySlice): Uint8Array {
    return pb.bytesSlice(this.view, s.start ?? null, s.stop ?? null, s.step ?? null);
  }

  /** A copy of the content (so callers cannot alias mutable storage). */
  toBytes(): Uint8Array { return this.view.slice(); }

  // --- mutation (bytearray semantics), used by MutableSeq -----------------

  /** Replace the whole content. */
  assign(data: Uint8Array): void { this.buf = data.slice(); this.len = data.length; }

  /** Python `bytearray.append`. */
  push(b: number): void {
    if (this.len === this.buf.length) {
      const nb = new Uint8Array(Math.max(16, this.buf.length * 2));
      nb.set(this.view);
      this.buf = nb;
    }
    this.buf[this.len++] = b;
  }

  /** Python `bytearray.extend`. */
  extendBytes(data: Uint8Array): void { this.assign(pb.concat(this.view, data)); }

  /** Python `bytearray.insert(i, b)` (index clamped like list.insert). */
  insertAt(i: number, b: number): void {
    const n = this.len;
    if (i < 0) { i += n; if (i < 0) i = 0; } else if (i > n) i = n;
    this.assign(pb.concat(this.view.subarray(0, i), Uint8Array.of(b), this.view.subarray(i)));
  }

  /** Python `bytearray.pop(i)`. */
  popAt(i: number): number {
    const j = pb.checkIndexAssign(this.len, i); // Biopython indexes first, so the message is the index one

    const v = this.buf[j]!;
    this.assign(pb.concat(this.view.subarray(0, j), this.view.subarray(j + 1)));
    return v;
  }

  /** Python `bytearray.reverse`. */
  reverse(): void { this.view.reverse(); }

  /** Python `bytearray[i] = byte`. */
  setItem(index: number, b: number): void {
    this.buf[pb.checkIndexAssign(this.len, index)] = b;
  }

  /** Python `bytearray[slice] = value` (extended slices need equal length). */
  setSlice(s: PySlice, value: Uint8Array): void {
    const [start, stop, step] = pb.sliceIndices(s, this.len);
    if (step === 1) {
      const a = start;
      const b = Math.max(start, stop);
      this.assign(pb.concat(this.view.subarray(0, a), value, this.view.subarray(b)));
      return;
    }
    const n = pb.rangeLength(start, stop, step);
    if (value.length === 0) { this.deleteIndex(s); return; } // CPython: assigning b"" to an extended slice deletes it
    if (value.length !== n) {
      throw new ValueError(`attempt to assign bytes of size ${value.length} to extended slice of size ${n}`);
    }
    const copy = this.view.slice();
    for (let k = 0, j = start; k < n; k++, j += step) copy[j] = value[k]!;
    this.assign(copy);
  }

  /** Python `del bytearray[index or slice]`. */
  deleteIndex(index: number | PySlice): void {
    if (typeof index === "number") {
      const j = pb.checkIndexAssign(this.len, index);
      this.assign(pb.concat(this.view.subarray(0, j), this.view.subarray(j + 1)));
      return;
    }
    const [start, stop, step] = pb.sliceIndices(index, this.len);
    const n = pb.rangeLength(start, stop, step);
    const drop = new Set<number>();
    for (let k = 0, j = start; k < n; k++, j += step) drop.add(j);
    const out: number[] = [];
    for (let i = 0; i < this.len; i++) if (!drop.has(i)) out.push(this.buf[i]!);
    this.assign(Uint8Array.from(out));
  }
}
