/** Helpers for the many kinds of sequence an `Alignment` can hold: strings, `Seq`, `MutableSeq`, `SeqRecord`, lists, bytes. */

import { IndexError } from "@biolibs/core";
import { MutableSeq, Seq, UndefinedSequenceError, reverseComplement, sliceIndices } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";

/** Python `len(sequence)`. @throws TypeError for objects without a length. */
export function lengthOf(sequence: unknown): number {
  if (sequence instanceof SeqRecord) {
    if (sequence.seq === null) throw new TypeError("object of type 'NoneType' has no len()");
    return sequence.seq.length;
  }
  const n = (sequence as { length?: number } | null)?.length;
  if (typeof n !== "number") throw new TypeError(`object of type '${sequence === null ? "NoneType" : typeof sequence}' has no len()`);
  return n;
}

/** The sequence a record wraps, or the value itself (`try: sequence = sequence.seq`). */
export const unwrap = (sequence: unknown): unknown => (sequence instanceof SeqRecord ? sequence.seq : sequence);

/**
 * `reverse_complement(sequence)` as Biopython's module function applies it: strings and `Seq`/`MutableSeq` give the same
 * kind, records give a new record (with default metadata).
 *
 * @throws TypeError for kinds that have no reverse complement (lists, bytes).
 */
export function reverseComplementOf(sequence: unknown): unknown {
  if (typeof sequence === "string") return reverseComplement(sequence);
  if (sequence instanceof Seq || sequence instanceof MutableSeq) return reverseComplement(sequence as Seq);
  if (sequence instanceof SeqRecord) return sequence.reverseComplement();
  throw new TypeError(`'${sequence === null ? "NoneType" : typeof sequence}' object has no attribute 'encode'`);
}

/** Placeholder for positions of a partially defined sequence that have no content; reading one raises `UndefinedSequenceError`. */
const UNDEFINED = "\u0000";

/**
 * The text of a partially defined `Seq` with {@link UNDEFINED} where there is no content, so that the position-based
 * slicing the alignment code does only fails (as Biopython's does) when it touches an undefined position.
 */
function partialText(seq: Seq): string {
  const parts: string[] = [];
  let at = 0;
  for (const [a, b] of seq.definedRanges) {
    parts.push(UNDEFINED.repeat(a - at), String(seq.slice(a, b)));
    at = b;
  }
  parts.push(UNDEFINED.repeat(seq.length - at));
  return parts.join("");
}

/** Raise Biopython's error if text read from a partially defined sequence includes undefined positions. */
function checkDefined(text: string): string {
  if (text.includes(UNDEFINED)) throw new UndefinedSequenceError("Sequence content is only partially defined");
  return text;
}

/** A sequence reduced to what the indexing code needs: its text, or its items. */
export type Items = { text: string } | { list: unknown[] };

/** `str` and `Seq` count as text (Python `isinstance(sequence, (str, Seq))`); everything else is a list of items. */
export function itemsOf(sequence: unknown): Items {
  const s = unwrap(sequence);
  if (typeof s === "string") return { text: s };
  if (s instanceof Seq) return { text: s.defined ? s.toString() : partialText(s) };
  if (s instanceof MutableSeq) return { list: Array.from(s.toString()) };
  if (s instanceof Uint8Array) return { list: Array.from(s) };
  if (Array.isArray(s)) return { list: s };
  throw new TypeError(`'${s === null ? "NoneType" : typeof s}' object is not subscriptable`);
}

/** Python `s[a:b]` on text, by code point, with negative indices wrapping. */
export function sliceText(text: string, a: number, b: number): string {
  const cps = Array.from(text);
  const [start, stop] = sliceIndices({ start: a, stop: b }, cps.length);
  return start < stop ? checkDefined(cps.slice(start, stop).join("")) : "";
}

/** Python `s[a:b]` on a list. */
export function sliceList<T>(items: T[], a: number, b: number): T[] {
  const [start, stop] = sliceIndices({ start: a, stop: b }, items.length);
  return start < stop ? items.slice(start, stop) : [];
}

/** Python `x[i]` on text or a list: negative indices wrap; out of range is an IndexError. */
export function itemAt(items: Items, i: number): unknown {
  if ("text" in items) {
    const cps = Array.from(items.text);
    const k = i < 0 ? i + cps.length : i;
    if (k < 0 || k >= cps.length) throw new IndexError("string index out of range");
    return checkDefined(cps[k]!);
  }
  const k = i < 0 ? i + items.list.length : i;
  if (k < 0 || k >= items.list.length) throw new IndexError("list index out of range");
  return items.list[k];
}

/** NumPy's out-of-bounds message for `array[i]` on an axis. */
export function boundsError(i: number, size: number, axis = 0): IndexError {
  return new IndexError(`index ${i} is out of bounds for axis ${axis} with size ${size}`);
}

/** NumPy's `array[i]` for a 1-D array of numbers. @throws {@link IndexError} out of bounds. */
export function npAt(a: number[], i: number): number {
  const k = i < 0 ? i + a.length : i;
  if (k < 0 || k >= a.length) throw boundsError(i, a.length);
  return a[k]!;
}

/** `np.cumsum`. */
export function cumsum(a: number[]): number[] {
  let t = 0;
  return a.map((v) => (t += v));
}

/** `a.searchsorted(v, side="right")`: the first position whose value is greater than `v`. */
export function searchRight(a: number[], v: number): number {
  let i = 0;
  while (i < a.length && a[i]! <= v) i++;
  return i;
}

/** `a.searchsorted(v, side="left")`: the first position whose value is at least `v`. */
export function searchLeft(a: number[], v: number): number {
  let i = 0;
  while (i < a.length && a[i]! < v) i++;
  return i;
}
