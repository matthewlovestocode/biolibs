/** The immutable `Seq` class. */

import { ValueError } from "@biolibs/core";
import * as pb from "../pybytes/index.js";
import {
  BytesData,
  PartiallyDefinedSequenceData,
  SequenceDataAbstractBaseClass,
  UndefinedSequenceData,
  type SeqDataLike,
} from "../seqdata/index.js";
import { SeqAbstractBaseClass } from "./base/index.js";

/** Content of one defined segment: text, bytes, an array of byte values (Python `bytes([..])`), or another sequence. */
export type SegmentContent = string | Uint8Array | number[] | SeqAbstractBaseClass;

/**
 * An immutable biological sequence (DNA, RNA or protein) of ASCII residues.
 *
 * Construct from a string, bytes, another sequence, a content provider, `null`
 * with a length (undefined content), or a position-to-content map with a
 * length (partially defined content).
 *
 * @example
 * ```ts
 * const s = new Seq("ATGGCC");
 * s.reverseComplement().toString(); // "GGCCAT"
 * s.translate().toString();         // "MA"
 * ```
 */
export class Seq extends SeqAbstractBaseClass {
  /** @internal */
  _data: SequenceDataAbstractBaseClass;

  /**
   * @param data - Content: string, bytes, `Seq`, `MutableSeq`, provider, `null`, or a map of start → content.
   * @param length - Required when `data` is `null` or a map; the total length.
   * @throws {@link ValueError} for a missing/negative length, overlapping or oversize map data.
   * @throws TypeError for unsupported `data` types.
   */
  constructor(data: string | Uint8Array | SeqAbstractBaseClass | SequenceDataAbstractBaseClass | Map<number, SegmentContent> | Record<number, SegmentContent> | null, length?: number | null) {
    super();
    if (data === null || data === undefined) {
      if (length === null || length === undefined) throw new ValueError("length must not be None if data is None");
      if (length === 0) this._data = new BytesData();
      else if (length < 0) throw new ValueError("length must not be negative.");
      else this._data = new UndefinedSequenceData(length);
    } else if (data instanceof SequenceDataAbstractBaseClass) {
      this._data = data;
    } else if (data instanceof Uint8Array) {
      this._data = new BytesData(data);
    } else if (data instanceof SeqAbstractBaseClass) {
      this._data = new BytesData(data.toBytes());
    } else if (typeof data === "string") {
      this._data = new BytesData(pb.encodeAscii(data));
    } else if (typeof data === "object") {
      if (length === null || length === undefined) throw new ValueError("length must not be None if data is a dictionary");
      if (length === 0) this._data = new BytesData();
      else if (length < 0) throw new ValueError("length must not be negative.");
      else this._data = Seq.fromSegments(data, length);
    } else {
      throw new TypeError("data should be a string, bytes, bytearray, Seq, or MutableSeq object");
    }
  }

  /** Build content from a `start -> segment` map, merging touching segments. */
  private static fromSegments(
    data: Map<number, SegmentContent> | Record<number, SegmentContent>,
    length: number,
  ): SequenceDataAbstractBaseClass {
    const entries = data instanceof Map ? [...data] : Object.entries(data).map(([k, v]) => [Number(k), v] as const);
    const starts = entries.map(([k]) => k).sort((a, b) => a - b);
    const lookup = new Map(entries);
    let current = 0;
    let end = -1;
    const segs = new Map<number, Uint8Array>();
    for (const start of starts) {
      const raw = lookup.get(start)!;
      let seq: Uint8Array;
      if (typeof raw === "string") seq = pb.encodeAscii(raw);
      else if (raw instanceof Uint8Array) seq = raw.slice();
      else if (raw instanceof SeqAbstractBaseClass) seq = raw.toBytes();
      // Python's bytes(x) also accepts any iterable of ints 0..255; values outside that range raise.
      else if (Array.isArray(raw) && raw.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) seq = Uint8Array.from(raw as number[]);
      else throw new ValueError("Expected bytes-like objects or strings");
      if (start < end) throw new ValueError("Sequence data are overlapping.");
      else if (start === end) segs.set(current, pb.concat(segs.get(current)!, seq));
      else { segs.set(start, seq); current = start; }
      end = start + seq.length;
    }
    if (end > length) throw new ValueError("Provided sequence data extend beyond sequence length.");
    if (end === length && current === 0) return new BytesData(segs.get(current)!);
    return new PartiallyDefinedSequenceData(length, segs);
  }

  /** A new `Seq` (used by `split`, `rsplit`, and translation of undefined content). */
  protected makeSeq(data: SeqDataLike): Seq { return new Seq(data); }

  /** A new `Seq` of the same kind. */
  protected make(data: SeqDataLike): this { return new Seq(data) as unknown as this; }
  /** Immutable: in-place edits are refused. */
  protected assignInplace(): void { throw new TypeError("Sequence is immutable"); }
  /** Always false for `Seq`. */
  protected get isMutable(): boolean { return false; }

  /** Hash of the content (Python `hash(seq)`); numeric values differ from CPython's. */
  hashCode(): number { return this._data.hashCode(); }
}
