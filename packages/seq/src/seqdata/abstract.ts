/**
 * The abstract content-provider base class and shared helpers.
 * Mirrors Biopython's `SequenceDataAbstractBaseClass` and `UndefinedSequenceError`.
 */

import { ValueError } from "@biolibs/core";
import * as pb from "../pybytes/index.js";
import type { PySlice } from "../pybytes/index.js";

/**
 * Raised when the content of an undefined (or partially defined) sequence is
 * requested. Subclass of {@link ValueError}, as in Biopython.
 */
export class UndefinedSequenceError extends ValueError {
  /** @param message - What was requested of the undefined content. */
  constructor(message: string) {
    super(message);
    this.name = "UndefinedSequenceError";
  }
}

/** Sentinel returned by `add`/`radd` to signal Python's `NotImplemented`. */
export const NOT_IMPLEMENTED: unique symbol = Symbol("NotImplemented");

/** Anything that can supply sequence content. */
export type SeqDataLike = Uint8Array | SequenceDataAbstractBaseClass;

/**
 * Abstract base class for sequence content providers.
 *
 * Subclasses implement {@link SequenceDataAbstractBaseClass.length},
 * {@link SequenceDataAbstractBaseClass.getItem} and
 * {@link SequenceDataAbstractBaseClass.getSlice}; every other method is
 * implemented here in terms of {@link SequenceDataAbstractBaseClass.toBytes}
 * and may be overridden for sequences that are not fully defined.
 *
 * `getSlice` must return raw bytes or a provider for the requested region, or
 * throw {@link UndefinedSequenceError}. A zero-size slice must give empty bytes.
 */
export abstract class SequenceDataAbstractBaseClass {
  /** Number of residues (Python `__len__`). */
  abstract get length(): number;

  /**
   * One byte by index (Python `__getitem__(int)`).
   * @param index - Position; negative values count from the end where supported.
   */
  abstract getItem(index: number): number;

  /**
   * A region of the data (Python `__getitem__(slice)`).
   * @param s - Python-style slice.
   */
  abstract getSlice(s: PySlice): SeqDataLike;

  /** All content as bytes (Python `bytes(self)`); throws if not fully defined. */
  toBytes(): Uint8Array {
    const r = this.getSlice({});
    return r instanceof Uint8Array ? r : r.toBytes();
  }

  /** Hash of the content (Python `__hash__`); throws if undefined. Values differ from CPython's. */
  hashCode(): number {
    let h = 0x811c9dc5; // FNV-1a
    for (const b of this.toBytes()) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h | 0;
  }

  /** Equality with bytes or another provider (Python `__eq__`). */
  eq(other: SeqDataLike): boolean {
    return pb.equal(this.toBytes(), bytesOf(other));
  }

  /** Python `__lt__`. */
  lt(other: SeqDataLike): boolean { return pb.compare(this.toBytes(), bytesOf(other)) < 0; }
  /** Python `__le__`. */
  le(other: SeqDataLike): boolean { return pb.compare(this.toBytes(), bytesOf(other)) <= 0; }
  /** Python `__gt__`. */
  gt(other: SeqDataLike): boolean { return pb.compare(this.toBytes(), bytesOf(other)) > 0; }
  /** Python `__ge__`. */
  ge(other: SeqDataLike): boolean { return pb.compare(this.toBytes(), bytesOf(other)) >= 0; }

  /**
   * Python `__add__`. Returns {@link NOT_IMPLEMENTED} when either side is
   * undefined so the caller can try the right operand's `radd`.
   */
  add(other: SeqDataLike): SeqDataLike | typeof NOT_IMPLEMENTED {
    try {
      return pb.concat(this.toBytes(), bytesOf(other));
    } catch (e) {
      if (e instanceof UndefinedSequenceError) return NOT_IMPLEMENTED;
      throw e;
    }
  }

  /** Python `__radd__`: `other + self`. */
  radd(other: SeqDataLike): SeqDataLike | typeof NOT_IMPLEMENTED {
    return pb.concat(bytesOf(other), this.toBytes());
  }

  /** Python `__mul__`: repeat `n` times. */
  mul(n: number): SeqDataLike {
    return pb.repeat(this.toBytes(), n);
  }

  /** Python `in`: whether `item` occurs as a substring. */
  contains(item: Uint8Array): boolean {
    return pb.find(this.toBytes(), item) >= 0;
  }

  /** Decode the content as text. */
  decode(encoding: "utf-8" | "ascii" = "utf-8"): string {
    const b = this.toBytes();
    return encoding === "ascii" ? pb.decodeAscii(b) : pb.decodeUtf8(b);
  }

  /** Python `bytes.count` on `data[start:end]`. */
  count(sub: Uint8Array, start?: number | null, end?: number | null): number { return pb.count(this.toBytes(), sub, start, end); }
  /** Python `bytes.find`. */
  find(sub: Uint8Array, start?: number | null, end?: number | null): number { return pb.find(this.toBytes(), sub, start, end); }
  /** Python `bytes.rfind`. */
  rfind(sub: Uint8Array, start?: number | null, end?: number | null): number { return pb.rfind(this.toBytes(), sub, start, end); }
  /** Python `bytes.index`; throws {@link ValueError} when absent. */
  index(sub: Uint8Array, start?: number | null, end?: number | null): number { return pb.index(this.toBytes(), sub, start, end); }
  /** Python `bytes.rindex`. */
  rindex(sub: Uint8Array, start?: number | null, end?: number | null): number { return pb.rindex(this.toBytes(), sub, start, end); }
  /** Python `bytes.startswith` (single prefix). */
  startswith(prefix: Uint8Array, start?: number | null, end?: number | null): boolean { return pb.startswith(this.toBytes(), prefix, start, end); }
  /** Python `bytes.endswith` (single suffix). */
  endswith(suffix: Uint8Array, start?: number | null, end?: number | null): boolean { return pb.endswith(this.toBytes(), suffix, start, end); }
  /** Python `bytes.split`. */
  split(sep: Uint8Array | null = null, maxsplit = -1): Uint8Array[] { return pb.split(this.toBytes(), sep, maxsplit); }
  /** Python `bytes.rsplit`. */
  rsplit(sep: Uint8Array | null = null, maxsplit = -1): Uint8Array[] { return pb.rsplit(this.toBytes(), sep, maxsplit); }
  /** Python `bytes.strip`. */
  strip(chars: Uint8Array | null = null): Uint8Array { return pb.strip(this.toBytes(), chars); }
  /** Python `bytes.lstrip`. */
  lstrip(chars: Uint8Array | null = null): Uint8Array { return pb.strip(this.toBytes(), chars, true, false); }
  /** Python `bytes.rstrip`. */
  rstrip(chars: Uint8Array | null = null): Uint8Array { return pb.strip(this.toBytes(), chars, false, true); }
  /** Python `bytes.removeprefix`. */
  removeprefix(prefix: Uint8Array): Uint8Array { return pb.removeprefix(this.toBytes(), prefix); }
  /** Python `bytes.removesuffix`. */
  removesuffix(suffix: Uint8Array): Uint8Array { return pb.removesuffix(this.toBytes(), suffix); }
  /** ASCII uppercase copy. */
  upper(): SeqDataLike { return pb.upper(this.toBytes()); }
  /** ASCII lowercase copy. */
  lower(): SeqDataLike { return pb.lower(this.toBytes()); }
  /** Whether all cased bytes are uppercase (false if none are cased). */
  isupper(): boolean { return pb.isupper(this.toBytes()); }
  /** Whether all cased bytes are lowercase (false if none are cased). */
  islower(): boolean { return pb.islower(this.toBytes()); }
  /** Copy with every `old` replaced by `nu`. */
  replace(old: Uint8Array, nu: Uint8Array): SeqDataLike { return pb.replace(this.toBytes(), old, nu); }
  /** Python `bytes.translate(table, delete)`. */
  translate(table: Uint8Array | null, del: Uint8Array = new Uint8Array(0)): SeqDataLike { return pb.translateBytes(this.toBytes(), table, del); }

  /** Whether every residue is known. Zero-length data are always defined. */
  get defined(): boolean { return true; }

  /** `[start, end)` ranges with known content. */
  get definedRanges(): [number, number][] {
    const n = this.length;
    return n > 0 ? [[0, n]] : [];
  }
}

/** Raw bytes of a provider or bytes (Python `bytes(x)`). */
export function bytesOf(x: SeqDataLike): Uint8Array {
  return x instanceof Uint8Array ? x : x.toBytes();
}

/** Length of bytes or a provider. */
export function lenOf(x: SeqDataLike): number {
  return x instanceof Uint8Array ? x.length : x.length;
}
