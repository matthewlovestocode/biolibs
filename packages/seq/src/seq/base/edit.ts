/** Layer 3 of the shared base: stripping, case, replacement and joining. */

import * as pb from "../../pybytes/index.js";
import { looseBytes, type SubLike } from "../args.js";
import { tyName } from "../pytypes.js";
import { SEQ_RECORD_BRAND } from "../seq-record-brand.js";
import { SeqCoreBase } from "./core.js";
import { SeqSearchBase } from "./search.js";

/** `sep.join(parts)` for strings. */
function joinStrings(sep: string, parts: string[]): string { return parts.join(sep); }

/** Editing methods: `strip` family, `upper`/`lower`, `replace`, `join`, ... */
export abstract class SeqEditBase extends SeqSearchBase {
  /** Convert and validate the `chars` argument of the strip family (null means whitespace). */
  private charsArg(chars: unknown): Uint8Array | null {
    if (chars === null || chars === undefined) { this.requireDefined(); return null; }
    const v = looseBytes(chars);
    this.requireDefined();
    if (v instanceof Uint8Array) return v;
    throw new TypeError("argument must be None or a string, Seq, MutableSeq, or bytes-like object");
  }

  /** Remove leading and trailing characters in `chars` (default: whitespace). */
  strip(chars: SubLike | null = null, inplace = false): this {
    return this.result(this._data.strip(this.charsArg(chars)), inplace);
  }

  /** Remove leading characters in `chars`. */
  lstrip(chars: SubLike | null = null, inplace = false): this {
    return this.result(this._data.lstrip(this.charsArg(chars)), inplace);
  }

  /** Remove trailing characters in `chars`. */
  rstrip(chars: SubLike | null = null, inplace = false): this {
    return this.result(this._data.rstrip(this.charsArg(chars)), inplace);
  }

  /** Convert and validate a prefix/suffix argument. */
  private affixArg(x: unknown): Uint8Array {
    const v = looseBytes(x);
    this.requireDefined();
    if (v instanceof Uint8Array) return v;
    throw new TypeError("argument must be a string, Seq, MutableSeq, or bytes-like object");
  }

  /** Remove `prefix` if present. */
  removeprefix(prefix: SubLike, inplace = false): this {
    return this.result(this._data.removeprefix(this.affixArg(prefix)), inplace);
  }

  /** Remove `suffix` if present. */
  removesuffix(suffix: SubLike, inplace = false): this {
    return this.result(this._data.removesuffix(this.affixArg(suffix)), inplace);
  }

  /** Uppercase copy (ASCII). */
  upper(inplace = false): this { return this.result(this._data.upper(), inplace); }

  /** Lowercase copy (ASCII). */
  lower(inplace = false): this { return this.result(this._data.lower(), inplace); }

  /** Whether all cased characters are uppercase (false when there are none). */
  isupper(): boolean { return this._data.isupper(); }

  /** Whether all cased characters are lowercase (false when there are none). */
  islower(): boolean { return this._data.islower(); }

  /** Replace every `old` with `nu`. */
  replace(old: SubLike, nu: SubLike, inplace = false): this {
    const o = looseBytes(old);
    const n = looseBytes(nu);
    if (!(o instanceof Uint8Array) || !(n instanceof Uint8Array)) throw new TypeError(`a bytes-like object is required, not '${tyName(!(o instanceof Uint8Array) ? old : nu)}'`);
    return this.result(this._data.replace(o, n), inplace);
  }

  /**
   * Concatenate `other`'s items with this sequence as the separator
   * (Python `sep.join(iterable)`).
   */
  join(other: SubLike | Iterable<SubLike>): this {
    if (other instanceof SeqCoreBase) return this.make(pb.encodeAscii(joinStrings(this.toString(), [...other.toString()])));
    if (typeof other === "string") return this.make(pb.encodeAscii(joinStrings(this.toString(), [...other])));
    if (other !== null && typeof other === "object" && (other as unknown as Record<symbol, unknown>)[SEQ_RECORD_BRAND]) {
      throw new TypeError("Iterable cannot be a SeqRecord");
    }
    const parts: string[] = [];
    if (other === null || other === undefined || typeof (other as Iterable<unknown>)[Symbol.iterator] !== "function") {
      throw new TypeError(`'${tyName(other)}' object is not iterable`);
    }
    for (const c of other as Iterable<unknown>) {
      if (c !== null && typeof c === "object" && (c as Record<symbol, unknown>)[SEQ_RECORD_BRAND]) throw new TypeError("Iterable cannot contain SeqRecords");
      if (!(typeof c === "string" || c instanceof SeqCoreBase)) throw new TypeError("Input must be an iterable of Seq objects, MutableSeq objects, or strings");
      parts.push(String(c));
    }
    return this.make(pb.encodeAscii(joinStrings(this.toString(), parts)));
  }

  // --- biology -------------------------------------------------------------
}
