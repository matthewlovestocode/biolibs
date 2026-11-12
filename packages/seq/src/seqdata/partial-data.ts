/** Content defined only in some ranges. */

import { IndexError } from "@biolibs/core";
import * as pb from "../pybytes/index.js";
import type { PySlice } from "../pybytes/index.js";
import {
  NOT_IMPLEMENTED,
  SequenceDataAbstractBaseClass,
  UndefinedSequenceError,
  bytesOf,
  lenOf,
  type SeqDataLike,
} from "./abstract.js";
import { UndefinedSequenceData } from "./undefined-data.js";

/**
 * Sequence of known length defined only in some ranges. Created by
 * `new Seq({0: "ACGT", 10: "TT"}, 12)`.
 *
 * The map is `start -> bytes` for each defined segment, in insertion order.
 */
export class PartiallyDefinedSequenceData extends SequenceDataAbstractBaseClass {
  /** Defined segments: start offset to content. Not copied; do not mutate. */
  readonly segments: Map<number, Uint8Array>;

  /**
   * @param _length - Total length including undefined gaps (negative raises `ValueError`).
   * @param segments - `start -> bytes` for each defined run, in order. Must not overlap.
   */
  constructor(private readonly _length: number, segments: Map<number, Uint8Array>) {
    super();
    pb.sliceIndices({ stop: 0 }, _length); // raises ValueError for a negative length
    this.segments = segments;
  }

  /** The declared length, including undefined stretches. */
  get length(): number { return this._length; }

  /** One byte, or {@link UndefinedSequenceError} if that position is in a gap. Matches Biopython, including raising `UndefinedSequenceError` (not a wrap-around) for negative keys. */
  getItem(key: number): number {
    if (this._length <= key) throw new IndexError("sequence index out of range");
    for (const [start, seq] of this.segments) {
      if (start <= key && key < start + seq.length) return seq[key - start]!;
    }
    throw new UndefinedSequenceError(`Sequence at position ${key} is undefined`);
  }

  /**
   * Slice the sequence, keeping which stretches are defined.
   *
   * Result forms (as in Biopython): empty bytes for an empty slice; plain
   * bytes if the slice lands entirely on one defined run; an
   * {@link UndefinedSequenceData} if it touches no defined run; otherwise a new
   * {@link PartiallyDefinedSequenceData}.
   *
   * The work is: for each defined segment, work out which of its bytes the
   * slice selects and where they land in the result; then merge segments that
   * end up adjacent. Negative steps visit the segments back to front, so the
   * resulting map is reversed to keep segments in result order.
   */
  getSlice(key: PySlice): SeqDataLike {
    const [a0, b0, step] = pb.sliceIndices(key, this._length);
    const size = pb.rangeLength(a0, b0, step); // number of residues in the result
    if (size === 0) return new Uint8Array(0);

    // Step 1: carve each defined segment down to the bytes the slice selects.
    let data = new Map<number, Uint8Array>();
    for (const [s0, d0] of this.segments) {
      let s = s0;
      let d = d0;
      // `range(-s, -s + length)[key]`: the slice expressed relative to this segment's start,
      // so `indices.start`/`stop` are offsets into the segment's own bytes.
      const indices = pb.rangeSlice(-s, -s + this._length, key);
      let e: number | null = indices.stop;
      if (step > 0) {
        if (e <= 0) continue; // the slice ends before this segment begins
        // If the slice starts before the segment, the first selected byte is the first
        // one that lines up with the stride.
        s = indices.start < 0 ? pb.pyMod(indices.start, step) : indices.start;
      } else {
        if (e < 0) e = null; // a negative stop means "run to the start of the segment"
        const last = d.length - 1;
        // If the slice starts after the segment's end, walk back to the first aligned byte.
        s = indices.start > last ? last + pb.pyMod(indices.start - last, step) : indices.start;
        if (s < 0) continue; // nothing of this segment is selected
      }
      // Where the first selected byte falls in the result.
      const start = pb.floorDiv(s - indices.start, step);
      d = pb.bytesSlice(d, s, e, step);
      if (d.length) data.set(start, d);
    }
    if (data.size === 0) return new UndefinedSequenceData(size); // slice fell entirely in gaps

    // Step 2: merge segments that touch each other in the result.
    let end = -1;
    let previous = 0;
    const items = [...data];
    data = new Map();
    for (const [start, seq] of items) {
      if (end === start) data.set(previous, pb.concat(data.get(previous)!, seq));
      else { data.set(start, seq); previous = start; }
      end = start + seq.length;
    }
    // Step 3: one run covering the whole result is simply bytes.
    if (data.size === 1) {
      const seq = data.get(0);
      if (seq !== undefined && seq.length === size) return seq;
    }
    // Reverse slices produced segments back to front.
    if (step < 0) data = new Map([...data].reverse());
    return new PartiallyDefinedSequenceData(size, data);
  }

  /** Reading the whole content raises {@link UndefinedSequenceError}. */
  toBytes(): Uint8Array { throw new UndefinedSequenceError("Sequence content is only partially defined"); }

  /** Concatenate. Defined segments from both sides are kept; touching segments are merged into one. */
  add(other: SeqDataLike): SeqDataLike | typeof NOT_IMPLEMENTED {
    const length = this.length + lenOf(other);
    const data = new Map(this.segments);
    const items = [...this.segments];
    const [start, seq] = items[items.length - 1]!;
    const end = start + seq.length;
    let ob: Uint8Array | null = null;
    try {
      ob = bytesOf(other);
    } catch (e) {
      if (!(e instanceof UndefinedSequenceError)) throw e;
    }
    if (ob === null) {
      if (other instanceof PartiallyDefinedSequenceData) {
        const otherItems = [...other.segments];
        if (end === this.length) {
          // Our last segment touches the end: it may join the other's first.
          const [os, oseq] = otherItems.shift()!;
          if (os === 0) data.set(start, pb.concat(data.get(start)!, oseq));
          else data.set(this.length + os, oseq);
        }
        for (const [os, oseq] of otherItems) data.set(this.length + os, oseq);
      }
      // An UndefinedSequenceData adds no defined segments.
    } else if (end === this.length) {
      data.set(start, pb.concat(data.get(start)!, ob));
    } else {
      data.set(this.length, ob);
    }
    return new PartiallyDefinedSequenceData(length, data);
  }

  /** `other + this`, shifting this sequence's segments right by `other`'s length. */
  radd(other: SeqDataLike): SeqDataLike {
    const length = lenOf(other) + this.length;
    let ob: Uint8Array | null = null;
    try {
      ob = bytesOf(other);
    } catch (e) {
      if (!(e instanceof UndefinedSequenceError)) throw e;
    }
    const data = new Map<number, Uint8Array>();
    if (ob === null) {
      for (const [s, seq] of this.segments) data.set(lenOf(other) + s, seq);
    } else {
      data.set(0, ob);
      const items = [...this.segments];
      const [s0, seq0] = items.shift()!;
      if (s0 === 0) data.set(0, pb.concat(data.get(0)!, seq0));
      else data.set(ob.length + s0, seq0);
      for (const [s, seq] of items) data.set(ob.length + s, seq);
    }
    return new PartiallyDefinedSequenceData(length, data);
  }

  /** Repeat `n` times, joining a segment that touches the next repetition's first one. */
  mul(n: number): SeqDataLike {
    const length = this._length;
    const items = [...this.segments];
    const data = new Map<number, Uint8Array>();
    let end = -1;
    let previous = 0;
    let start = 0;
    let seq: Uint8Array = new Uint8Array(0);
    for (let i = 0; i < n; i++) {
      for (const [s0, q] of items) {
        start = s0 + i * length;
        seq = q;
        if (end === start) data.set(previous, pb.concat(data.get(previous)!, q));
        else { data.set(start, q); previous = start; }
      }
      // Mirrors Biopython: uses the last segment of this repetition.
      end = start + seq.length;
    }
    return new PartiallyDefinedSequenceData(length * n, data);
  }

  /** Uppercase each defined segment. */
  upper(): SeqDataLike {
    return new PartiallyDefinedSequenceData(this._length, mapSegments(this.segments, pb.upper));
  }
  /** Lowercase each defined segment. */
  lower(): SeqDataLike {
    return new PartiallyDefinedSequenceData(this._length, mapSegments(this.segments, pb.lower));
  }
  /** Cannot tell: raises {@link UndefinedSequenceError}. */
  isupper(): boolean { throw new UndefinedSequenceError("Sequence content is only partially defined"); }
  /** Cannot tell: raises {@link UndefinedSequenceError}. */
  islower(): boolean { throw new UndefinedSequenceError("Sequence content is only partially defined"); }

  /** Map each defined segment through a byte table (used by complement); gaps stay gaps. */
  translate(table: Uint8Array | null, del: Uint8Array = new Uint8Array(0)): SeqDataLike {
    return new PartiallyDefinedSequenceData(this._length, mapSegments(this.segments, (b) => pb.translateBytes(b, table, del)));
  }

  /** Same-length replacement is applied to each defined segment; otherwise raises {@link UndefinedSequenceError}. */
  replace(old: Uint8Array, nu: Uint8Array): SeqDataLike {
    if (old.length !== nu.length) {
      throw new UndefinedSequenceError("Sequence content is only partially defined; substring \nreplacement cannot be performed reliably");
    }
    return new PartiallyDefinedSequenceData(this._length, mapSegments(this.segments, (b) => pb.replace(b, old, nu)));
  }

  /** Always false (some residues are unknown). */
  get defined(): boolean { return false; }

  /** The `[start, end)` extent of every defined segment, in segment order. */
  get definedRanges(): [number, number][] {
    return [...this.segments].map(([start, seq]) => [start, start + seq.length]);
  }
}

/** Apply `f` to every segment, keeping offsets and order. */
export function mapSegments(m: Map<number, Uint8Array>, f: (b: Uint8Array) => Uint8Array): Map<number, Uint8Array> {
  return new Map([...m].map(([k, v]) => [k, f(v)]));
}
