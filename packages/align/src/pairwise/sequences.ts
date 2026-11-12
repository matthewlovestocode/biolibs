/**
 * Turning the sequences given to the aligner into arrays of integer indices (what Biopython's C code works on),
 * and checking them against the substitution matrix.
 */

import { ValueError, pyTypeName } from "@biolibs/core";
import { MutableSeq, Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import type { SubstitutionArray } from "../substitution-matrices/index.js";

/** What the aligner accepts as a sequence. */
export type SequenceInput = string | Uint8Array | Int32Array | Seq | MutableSeq | SeqRecord | readonly unknown[];

/** Whether the value is "bytes-like" in Biopython's check (`bytes`, `Seq`, `MutableSeq`, `SeqRecord`). */
const isBytesLike = (x: unknown): x is Uint8Array | Seq | MutableSeq | SeqRecord =>
  x instanceof Uint8Array || x instanceof Seq || x instanceof MutableSeq || x instanceof SeqRecord;

/** The code points of a string (Python `str` indexes by code point, not UTF-16 unit). */
const codePoints = (s: string): Int32Array => Int32Array.from(Array.from(s), (c) => c.codePointAt(0)!);

/** The bytes of a `bytes`-like value. @throws TypeError for a record without a sequence. */
function bytesOf(x: Uint8Array | Seq | MutableSeq | SeqRecord): Uint8Array {
  if (x instanceof Uint8Array) return x;
  if (x instanceof SeqRecord) {
    if (x.seq === null) throw new TypeError("SeqRecord has no sequence");
    return x.seq.toBytes();
  }
  return x.toBytes();
}

/**
 * Position of an item in the alphabet, as Python's `alphabet.index(item)` finds it: a string alphabet is searched
 * as a substring, a tuple or list by equality.
 *
 * @throws {@link ValueError} when the item is absent.
 */
function indexIn(alphabet: string | readonly unknown[], item: unknown): number {
  if (typeof alphabet === "string") {
    if (typeof item !== "string") throw new TypeError(`must be str, not ${item === null ? "NoneType" : typeof item}`);
    const i = alphabet.indexOf(item);
    if (i < 0) throw new ValueError("substring not found");
    return i;
  }
  const i = alphabet.findIndex((x) => x === item);
  if (i < 0) throw new ValueError(`tuple.index(x): x not in tuple`);
  return i;
}

/**
 * Convert one sequence the way `PairwiseAligner.score` and `align` do before calling the C code.
 *
 * @param seq - The sequence.
 * @param matrix - The substitution matrix, whose alphabet maps list items to indices.
 * @param built - Alphabet being built from list items when there is no matrix (shared between the two sequences).
 * @throws {@link ValueError} for an item missing from the alphabet.
 * @throws TypeError for an object that is not a sequence.
 */
export function convertSequence(seq: unknown, matrix: SubstitutionArray | null, built: unknown[]): Int32Array {
  if (isBytesLike(seq)) return Int32Array.from(bytesOf(seq));
  if (typeof seq === "string") return codePoints(seq);
  if (seq instanceof Int32Array) return seq;
  if (ArrayBuffer.isView(seq)) throw new ValueError(`sequence has incorrect data type '${(seq as { constructor: { name: string } }).constructor.name}'`);
  if (!seq || typeof (seq as Iterable<unknown>)[Symbol.iterator] !== "function") throw new TypeError(`'${pyTypeName(seq)}' object is not iterable`);
  const items = [...(seq as Iterable<unknown>)];
  if (matrix === null) {
    for (const item of items) if (!built.some((letter) => letter === item)) built.push(item);
    return Int32Array.from(items, (item) => built.findIndex((letter) => letter === item));
  }
  return Int32Array.from(items, (item) => indexIn(matrix.alphabet as string | string[], item));
}

/**
 * Check (and for string alphabets, map) the indices against the substitution matrix, as `_prepare_indices` does.
 * Letters are mapped through the alphabet when it is a string; otherwise they must already be valid row numbers.
 *
 * @throws {@link ValueError} for an out-of-range item or a letter not in the alphabet.
 */
export function prepareIndices(matrix: SubstitutionArray, ...sequences: Int32Array[]): void {
  const alphabet = matrix.alphabet;
  if (typeof alphabet === "string") {
    // Biopython sizes its lookup table by the widest character in the alphabet: 256, 65536 or all of Unicode.
    const widest = Math.max(0, ...Array.from(alphabet, (c) => c.codePointAt(0)!));
    const size = widest < 256 ? 256 : widest < 65536 ? 65536 : 0x110000;
    const mapping = new Map<number, number>();
    Array.from(alphabet).forEach((c, i) => mapping.set(c.codePointAt(0)!, i));
    for (const seq of sequences) {
      for (let i = 0; i < seq.length; i++) {
        const cp = seq[i]!;
        if (cp < 0) throw new ValueError(`sequence item ${i} is negative (${cp})`);
        if (cp >= size) throw new ValueError(`sequence item ${i} is out of bound (${cp}, should be < ${size})`);
        const mapped = mapping.get(cp);
        if (mapped === undefined) throw new ValueError("sequence contains letters not in the alphabet");
        seq[i] = mapped;
      }
    }
    return;
  }
  const m = matrix.shape[0]!;
  for (const seq of sequences) {
    for (let i = 0; i < seq.length; i++) {
      const v = seq[i]!;
      if (v < 0) throw new ValueError(`sequence item ${i} is negative (${v})`);
      if (v >= m) throw new ValueError(`sequence item ${i} is out of bound (${v}, should be < ${m})`);
    }
  }
}

/** Python's complaint when a sequence is empty. @throws {@link ValueError} */
export function checkNotEmpty(seq: Int32Array): void {
  if (seq.length === 0) throw new ValueError("sequence has zero length");
}
