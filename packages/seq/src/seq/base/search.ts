/** Layer 2 of the shared base: searching, prefix/suffix tests and splitting. */

import { ValueError } from "@biolibs/core";
import * as pb from "../../pybytes/index.js";
import { looseBytes, subBytes, type SubLike } from "../args.js";
import { isInt, pyType, tyName } from "../pytypes.js";
import type { Seq } from "../seq.js";
import { SeqCoreBase } from "./core.js";

/** Search methods: `count`, `find`, `index`, `search`, `startswith`, `split`, ... */
export abstract class SeqSearchBase extends SeqCoreBase {
  /** Python `bytes.count`: non-overlapping occurrences of `sub` in `[start, end)`. */
  count(sub: SubLike, start?: number | null, end?: number | null): number {
    return this._data.count(subBytes(sub), start, end);
  }

  /** Occurrences of `sub` counting overlaps (e.g. `"AAAA"` has 3 of `"AA"`). */
  countOverlap(sub: SubLike, start?: number | null, end?: number | null): number {
    const b = subBytes(sub);
    const data = this._data;
    let overlap = 0;
    let s: number | null | undefined = start;
    while (true) {
      s = data.find(b, s, end) + 1;
      if (s !== 0) overlap += 1;
      else return overlap;
    }
  }

  /** Whether `item` (a string, sequence, bytes or a byte value) occurs in the sequence (Python `in`). */
  contains(item: SubLike | number): boolean {
    const enc: unknown = item instanceof SeqCoreBase ? item.toBytes() : typeof item === "string" ? pb.encodeAscii(item) : item;
    this.requireDefined();
    if (typeof item === "number") {
      if (!isInt(item) || item < 0 || item > 255) throw new ValueError("byte must be in range(0, 256)");
      return this._data.toBytes().includes(item);
    }
    if (enc instanceof Uint8Array) return this._data.contains(enc);
    throw new TypeError(`a bytes-like object is required, not '${tyName(item)}'`);
  }

  /** Lowest index of `sub` in `[start, end)`, or -1. */
  find(sub: SubLike, start?: number | null, end?: number | null): number {
    return this._data.find(subBytes(sub), start, end);
  }

  /** Highest index of `sub` in `[start, end)`, or -1. */
  rfind(sub: SubLike, start?: number | null, end?: number | null): number {
    return this._data.rfind(subBytes(sub), start, end);
  }

  /** Like `find` but throws {@link ValueError} when absent. */
  index(sub: SubLike, start?: number | null, end?: number | null): number {
    return this._data.index(subBytes(sub), start, end);
  }

  /** Like `rfind` but throws {@link ValueError} when absent. */
  rindex(sub: SubLike, start?: number | null, end?: number | null): number {
    return this._data.rindex(subBytes(sub), start, end);
  }

  /**
   * Find several subsequences at once, yielding `[position, subsequence]`
   * pairs in position order. Like Biopython, the final position is not examined.
   */
  *search(subs: Iterable<SubLike>): Generator<[number, string]> {
    // Group subsequences by length: length -> set of byte strings.
    const subdict = new Map<number, Uint8Array[]>();
    let index = 0;
    for (const sub of subs) {
      let b: Uint8Array;
      if (sub instanceof SeqCoreBase) b = sub.toBytes();
      else if (typeof sub === "string") b = pb.encodeAscii(sub);
      else if (sub instanceof Uint8Array) b = sub;
      else throw new TypeError(`subs[${index}]: a Seq, MutableSeq, str, bytes, or bytearray object is required, not '${pyType(sub)}'`);
      const list = subdict.get(b.length) ?? [];
      if (!list.some((x) => pb.equal(x, b))) list.push(b);
      subdict.set(b.length, list);
      index++;
    }
    for (let start = 0; start < this.length - 1; start++) {
      for (const [length, group] of subdict) {
        const stop = start + length;
        for (const sub of group) {
          // The slice may be undefined content; comparing then raises, as in Biopython.
          const part = this._data.getSlice({ start, stop });
          const matches = part instanceof Uint8Array ? pb.equal(part, sub) : part.eq(sub);
          if (matches) {
            yield [start, pb.decodeUtf8(sub)];
            break;
          }
        }
      }
    }
  }

  /** Convert str/Seq (and tuples of them) to bytes without validating other types. */
  private tailConvert(x: unknown): unknown {
    if (Array.isArray(x)) return x.map((p) => (p instanceof SeqCoreBase ? p.toBytes() : pb.encodeAscii(p as string)));
    return looseBytes(x);
  }

  /** Validate the (already converted) argument of `startswith`/`endswith`: bytes or an array of bytes. */
  private tailArg(raw: unknown, method: string): Uint8Array | Uint8Array[] {
    const x = raw;
    if (Array.isArray(x)) return x as Uint8Array[];
    if (x instanceof Uint8Array) return x;
    throw new TypeError(`${method} first arg must be bytes or a tuple of bytes, not ${tyName(x)}`);
  }

  /** Whether the sequence starts with `prefix` (a string/sequence, or an array of alternatives). */
  startswith(prefix: SubLike | SubLike[], start?: number | null, end?: number | null): boolean {
    const conv = this.tailConvert(prefix);
    this.requireDefined();
    const p = this.tailArg(conv, "startswith");
    const bytes = this._data;
    return (Array.isArray(p) ? p : [p]).some((q) => bytes.startswith(q, start, end));
  }

  /** Whether the sequence ends with `suffix` (a string/sequence, or an array of alternatives). */
  endswith(suffix: SubLike | SubLike[], start?: number | null, end?: number | null): boolean {
    const conv = this.tailConvert(suffix);
    this.requireDefined();
    const p = this.tailArg(conv, "endswith");
    const bytes = this._data;
    return (Array.isArray(p) ? p : [p]).some((q) => bytes.endswith(q, start, end));
  }

  /** Convert and validate the separator of `split`/`rsplit`. Content is read before type errors are raised, like Biopython. */
  private sepArg(sep: unknown): Uint8Array | null {
    if (sep === null || sep === undefined) { this.requireDefined(); return null; }
    const v = looseBytes(sep);
    this.requireDefined();
    if (v instanceof Uint8Array) return v;
    throw new TypeError(`a bytes-like object is required, not '${tyName(sep)}'`);
  }

  /** Split on `sep` (or whitespace); returns `Seq` parts. */
  split(sep: SubLike | null = null, maxsplit = -1): Seq[] {
    return this._data.split(this.sepArg(sep), maxsplit).map((p) => this.makeSeq(p));
  }

  /** Split from the right; returns `Seq` parts. */
  rsplit(sep: SubLike | null = null, maxsplit = -1): Seq[] {
    return this._data.rsplit(this.sepArg(sep), maxsplit).map((p) => this.makeSeq(p));
  }

  // --- editing -------------------------------------------------------------
}
