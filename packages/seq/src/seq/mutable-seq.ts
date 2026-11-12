/** The mutable `MutableSeq` class. */

import { ValueError } from "@biolibs/core";
import * as pb from "../pybytes/index.js";
import type { PySlice } from "../pybytes/index.js";
import { BytesData, type SeqDataLike } from "../seqdata/index.js";
import { SeqAbstractBaseClass } from "./base/index.js";
import { byteFrom, ord, ordAscii, tyName } from "./pytypes.js";
import { Seq } from "./seq.js";

/**
 * A mutable biological sequence. Supports in-place editing (`set`, `delete`,
 * `append`, `insert`, `pop`, `remove`, `reverse`, `extend`) and the
 * `inplace` flag of the methods inherited from {@link SeqAbstractBaseClass}.
 *
 * @example
 * ```ts
 * const m = new MutableSeq("ACGT");
 * m.set(0, "T");
 * m.append("A");
 * m.toString(); // "TCGTA"
 * ```
 */
export class MutableSeq extends SeqAbstractBaseClass {
  /** @internal */
  _data: BytesData;

  /**
   * @param data - string, bytes, `Seq` or `MutableSeq` (copied).
   * @throws TypeError for other types.
   */
  constructor(data: string | Uint8Array | Seq | MutableSeq) {
    super();
    if (data instanceof Uint8Array) this._data = new BytesData(data, true);
    else if (typeof data === "string") this._data = new BytesData(pb.encodeAscii(data), true);
    else if (data instanceof SeqAbstractBaseClass) this._data = new BytesData(data.toBytes(), true);
    else throw new TypeError("data should be a string, bytearray object, Seq object, or a MutableSeq object");
  }

  /** A new immutable `Seq` (`split`/`rsplit` always return `Seq` parts, as in Biopython). */
  protected makeSeq(data: SeqDataLike): Seq { return new Seq(data); }

  /** A new `MutableSeq`; only plain bytes can back one, so undefined/partial content raises `TypeError` (as in Biopython). */
  protected make(data: SeqDataLike): this {
    // Only plain byte content can back a MutableSeq; undefined/partial providers cannot.
    if (data instanceof Uint8Array) return new MutableSeq(data) as unknown as this;
    if (data instanceof BytesData) return new MutableSeq(data.toBytes()) as unknown as this;
    throw new TypeError("data should be a string, bytearray object, Seq object, or a MutableSeq object");
  }
  /** Replace the stored bytes. */
  protected assignInplace(data: Uint8Array): void { this._data.assign(data); }
  /** Always true for `MutableSeq`. */
  protected get isMutable(): boolean { return true; }

  /**
   * Assign a character or sub-sequence (Python `s[index] = value`).
   *
   * @param index - A position, or a slice (`{start, stop, step}`).
   * @param value - A one-character string for an integer index; a string,
   *   `Seq` or `MutableSeq` for a slice.
   */
  set(index: number | PySlice, value: string | Seq | MutableSeq): void {
    if (typeof index === "number") {
      this._data.setItem(index, byteFrom(ord(value)));
    } else if (value instanceof SeqAbstractBaseClass) {
      this._data.setSlice(index, value.toBytes());
    } else if (typeof value === "string") {
      this._data.setSlice(index, pb.encodeAscii(value));
    } else {
      throw new TypeError(`received unexpected type '${tyName(value)}'`);
    }
  }

  /** Delete a position or slice (Python `del s[index]`). */
  delete(index: number | PySlice): void { this._data.deleteIndex(index); }

  /** Append one ASCII character. */
  append(c: string): void {
    if (typeof c !== "string") throw new TypeError(`'${tyName(c)}' object has no attribute 'encode'`);
    this._data.push(ordAscii(c));
  }

  /** Insert one ASCII character before position `i`. */
  insert(i: number, c: string): void {
    if (typeof c !== "string") throw new TypeError(`'${tyName(c)}' object has no attribute 'encode'`);
    this._data.insertAt(i, ordAscii(c));
  }

  /** Remove and return the character at `i` (default: the last). */
  pop(i = -1): string { return String.fromCharCode(this._data.popAt(i)); }

  /** Remove the first occurrence of a character. @throws {@link ValueError} if absent. */
  remove(item: string): void {
    const cp = ord(item);
    // bytearray.remove raises ValueError for cp > 255, which Biopython reports as "not found".
    const idx = cp > 255 ? -1 : this._data.view.indexOf(cp);
    if (idx < 0) throw new ValueError("value not found in MutableSeq");
    this._data.deleteIndex(idx);
  }

  /** Reverse in place. */
  reverse(): void { this._data.reverse(); }

  /** Append a string, `Seq` or `MutableSeq`. */
  extend(other: string | Seq | MutableSeq): void {
    if (other instanceof SeqAbstractBaseClass) this._data.extendBytes(other.toBytes());
    else if (typeof other === "string") this._data.extendBytes(pb.encodeAscii(other));
    else throw new TypeError("expected a string, Seq or MutableSeq");
  }
}

// --- module-level functions (Bio.Seq.transcribe, ...) ---------------------------
