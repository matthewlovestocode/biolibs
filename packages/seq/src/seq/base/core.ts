/**
 * Layer 1 of the shared `Seq`/`MutableSeq` base: storage, indexing, comparison,
 * arithmetic and the `inplace` mechanism.
 */

import * as pb from "../../pybytes/index.js";
import type { PySlice } from "../../pybytes/index.js";
import {
  BytesData,
  PartiallyDefinedSequenceData,
  SequenceDataAbstractBaseClass,
  UndefinedSequenceData,
  addData,
  toData,
  type SeqDataLike,
} from "../../seqdata/index.js";
import { isInt, tyName } from "../pytypes.js";
import type { Seq } from "../seq.js";

/**
 * Storage, indexing, comparison and arithmetic shared by `Seq` and `MutableSeq`.
 * Extended by {@link SeqSearchBase}, then {@link SeqEditBase}, then
 * `SeqAbstractBaseClass` (see `base/`), which together mirror Biopython's
 * `_SeqAbstractBaseClass`.
 */
export abstract class SeqCoreBase {
  /** The content provider. Treat as internal. @internal */
  abstract _data: SequenceDataAbstractBaseClass;

  /** Make a new sequence of the same class. @internal */
  protected abstract make(data: SeqDataLike): this;

  /** Replace the content in place, or throw for immutable sequences. @internal */
  protected abstract assignInplace(data: Uint8Array): void;

  /**
   * A new immutable `Seq` from raw content. Needed by `split`, `rsplit` and the
   * undefined-content branch of `translate`, which always return `Seq` (as
   * Biopython does). Declared abstract so this base never imports `Seq`,
   * which would create a circular import.
   * @internal
   */
  protected abstract makeSeq(data: SeqDataLike): Seq;

  /** Whether in-place operations are allowed. @internal */
  protected abstract get isMutable(): boolean;

  /** Number of residues (Python `len`). */
  get length(): number { return this._data.length; }

  /** All content as bytes (Python `bytes(seq)`). @throws {@link UndefinedSequenceError} if not fully defined. */
  toBytes(): Uint8Array { return this._data.toBytes(); }

  /** The sequence as a string (Python `str(seq)`). @throws {@link UndefinedSequenceError} if not fully defined. */
  toString(): string { return pb.decodeAscii(this._data.toBytes()); }

  /** Truncated representation, e.g. `Seq('ACGT')` or `Seq(None, length=10)`. */
  repr(): string {
    const data = this._data;
    const name = this.constructor.name;
    if (data instanceof UndefinedSequenceData) return `Seq(None, length=${this.length})`;
    if (data instanceof PartiallyDefinedSequenceData) {
      const items: string[] = [];
      for (const [position, seq0] of data.segments) {
        let s: string;
        if (seq0.length > 60) s = `${pb.decodeAscii(seq0.subarray(0, 54))}...${pb.decodeAscii(seq0.subarray(seq0.length - 3))}`;
        else s = pb.decodeAscii(seq0);
        items.push(`${position}: '${s}'`);
      }
      return `Seq({${items.join(", ")}}, length=${this.length})`;
    }
    const bytes = data.toBytes();
    if (bytes.length > 60) {
      return `${name}('${pb.decodeAscii(bytes.subarray(0, 54))}...${pb.decodeAscii(bytes.subarray(bytes.length - 3))}')`;
    }
    return `${name}('${pb.decodeAscii(bytes)}')`;
  }

  /** Iterate over the characters (Python `iter`). */
  [Symbol.iterator](): Iterator<string> {
    return pb.decodeAscii(this._data.toBytes())[Symbol.iterator]();
  }

  // --- comparison ----------------------------------------------------------

  /** Bytes to compare against; null if `other` is not comparable. */
  private cmpBytes(other: unknown): SeqDataLike | null {
    let o: SeqDataLike | null = null;
    if (other instanceof SeqCoreBase) o = other._data;
    else if (typeof other === "string") o = pb.encodeAscii(other); // may raise before content is read
    else if (other instanceof Uint8Array) o = other;
    this.requireDefined(); // Biopython reads bytes(self._data) before judging other types
    return o;
  }

  /** Content equality with a `Seq`, `MutableSeq`, string or bytes (Python `==`). */
  equals(other: unknown): boolean {
    const o = this.cmpBytes(other);
    return o === null ? false : this._data.eq(o);
  }

  /** Resolve the right-hand side of `<`, `<=`, `>`, `>=`, or raise Python's `TypeError` for unsupported types. */
  private order(other: unknown, op: "<" | "<=" | ">" | ">="): SeqDataLike {
    const o = this.cmpBytes(other);
    if (o === null) throw new TypeError(`'${op}' not supported between instances of '${this.isMutable ? "bytearray" : "bytes"}' and '${tyName(other)}'`);
    return o;
  }

  /** Python `<`. */
  lt(other: unknown): boolean { return this._data.lt(this.order(other, "<")); }

  /** Python `<=`. */
  le(other: unknown): boolean { return this._data.le(this.order(other, "<=")); }

  /** Python `>`. */
  gt(other: unknown): boolean { return this._data.gt(this.order(other, ">")); }

  /** Python `>=`. */
  ge(other: unknown): boolean { return this._data.ge(this.order(other, ">=")); }

  // --- indexing -------------------------------------------------------------

  /**
   * One character by index; negative indices count from the end (Python `s[i]`).
   * @throws {@link IndexError} if out of range.
   */
  at(index: number): string {
    if (!isInt(index)) throw new TypeError("sequence indices must be integers");
    return String.fromCharCode(this._data.getItem(index));
  }

  /** A sub-sequence with Python slice semantics (`s[start:stop:step]`). */
  slice(start?: number | null, stop?: number | null, step?: number | null): this {
    return this.make(this._data.getSlice({ start, stop, step }));
  }

  /** One character for a number (same as `at`). */
  get(index: number): string;
/** Sub-sequence for a slice object. */

  get(index: PySlice): this;

  get(index: number | PySlice): string | this {
    return typeof index === "number" ? this.at(index) : this.slice(index.start, index.stop, index.step);
  }

  // --- arithmetic -----------------------------------------------------------

  /**
   * Concatenate with a sequence or string (Python `s + other`).
   * @throws TypeError for unsupported operand types.
   */
  add(other: string | SeqCoreBase): this {
    if (other instanceof SeqCoreBase) return this.make(addData(this._data, other._data));
    if (typeof other === "string") return this.make(addData(this._data, toData(pb.encodeAscii(other))));
    throw new TypeError(`unsupported operand type(s) for +: '${this.constructor.name}' and '${tyName(other)}'`);
  }

  /** `other + this` for a string (Python `radd`). */
  radd(other: string | SeqCoreBase): this {
    if (other instanceof SeqCoreBase) return other.add(this) as unknown as this;
    if (typeof other === "string") return this.make(addData(toData(pb.encodeAscii(other)), this._data));
    // Runtime guard for untyped callers: raw bytes cannot be concatenated with a sequence.
    if ((other as unknown) instanceof Uint8Array) throw new TypeError(`can't concat ${this.constructor.name} to bytes`);
    // Python's list.__add__ reports its own wording before Seq is consulted.
    if (Array.isArray(other)) throw new TypeError(`can only concatenate list (not "${this.constructor.name}") to list`);
    throw new TypeError(`unsupported operand type(s) for +: '${tyName(other)}' and '${this.constructor.name}'`);
  }

  /** Shared body of `mul`/`rmul`/`imul`: validate an integer count and repeat the content. */
  private mulData(n: unknown): this {
    if (!isInt(n)) throw new TypeError(`can't multiply ${this.constructor.name} by non-int type`);
    return this.make(this._data.mul(n));
  }

  /** Repeat `n` times (Python `s * n`). */
  mul(n: number): this { return this.mulData(n); }

  /** Python `n * s`. */
  rmul(n: number): this { return this.mulData(n); }

  /** Python `s *= n`. Returns a new sequence, as Biopython does (not in place). */
  imul(n: number): this { return this.mulData(n); }

  // --- searching --------------------------------------------------------------

  /** Raise the same error as `bytes(self._data)` if content is not fully defined. */
  protected requireDefined(): void {
    if (!this._data.defined) this._data.toBytes();
  }

  /** Return a new sequence from `data`, or apply it in place and return `this`. */
  protected result(data: SeqDataLike, inplace: boolean): this {
    if (inplace) {
      if (!(this._data instanceof BytesData) || !this.isMutable) throw new TypeError("Sequence is immutable");
      this.assignInplace(data instanceof Uint8Array ? data : data.toBytes());
      return this;
    }
    return this.make(data);
  }

  /** Whether every residue is known. */
  get defined(): boolean { return this._data.defined; }

  /** `[start, end)` ranges whose content is known. */
  get definedRanges(): [number, number][] { return this._data.definedRanges; }
}
