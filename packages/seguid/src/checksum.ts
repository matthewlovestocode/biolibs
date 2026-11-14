/**
 * SEGUID v2: a checksum that identifies a sequence rather than naming it.
 *
 * The checksum is the base64 of a SHA-1 over the sequence, with the `=` padding dropped, which gives 27
 * characters. What makes the variants differ is what goes into the hash: `lsseguid` hashes one strand as
 * it is, `csseguid` first rotates a circle to its lexicographically smallest reading so that two records
 * of the same plasmid with different origins agree, `ldseguid` hashes both strands of a duplex with the
 * smaller one first, and `cdseguid` does both at once. The result is stable across tools, which is why
 * pydna uses it to identify a construct.
 */

import { AssertionError, base64, sha1, ValueError } from "@biolibs/core";
import { assertComplementary, assertInAlphabet, tableFactory } from "./tables.js";

/** Which form of the answer the caller wants. */
export type Form = "long" | "short" | "both";

/** The prefix each variant puts in front of its checksum. */
const PREFIX = { seguid: "seguid=", lsseguid: "lsseguid=", csseguid: "csseguid=", ldseguid: "ldseguid=",
  cdseguid: "cdseguid=" } as const;

/** How many characters the short form keeps. */
const SHORT = 6;

/** @param bytes - A digest. @returns It in base64 with the URL-safe characters, as the variants use. */
const urlsafe = (bytes: Uint8Array): string => base64(bytes).replace(/\+/g, "-").replace(/\//g, "_");

/**
 * The checksum itself: a SHA-1 over the text, base64 without its padding.
 *
 * @param seq - What to hash. @param alphabet - The symbols it may use.
 * @param encode - Which base64 alphabet to use.
 * @returns The 27-character checksum.
 * @throws AssertionError for an empty sequence and ValueError for a symbol outside the alphabet.
 */
function checksum(seq: string, alphabet: string, encode: (bytes: Uint8Array) => string): string {
  if (seq === "") throw new AssertionError("A sequence must not be empty");
  assertInAlphabet(seq, tableFactory(alphabet).keys());
  const bytes = Uint8Array.from([...seq].map((c) => c.charCodeAt(0)));
  return encode(sha1(bytes)).replace(/=+$/, "");
}

/**
 * @param prefix - The variant's prefix. @param csum - The checksum. @param form - Which form to give.
 * @returns The checksum in that form: the prefixed checksum, its first six characters, or both.
 */
function formed(prefix: string, csum: string, form: Form): string | [string, string] {
  if (form === "both") return [csum.slice(0, SHORT), prefix + csum];
  if (form === "short") return csum.slice(0, SHORT);
  return prefix + csum;
}

/**
 * The original SEGUID, which is a plain base64 SHA-1 of one strand.
 *
 * @param seq - The sequence. @param alphabet - The symbols it may use. @param form - Which form to give.
 * @returns The checksum.
 */
export function seguid(seq: string, alphabet = "{DNA}", form: Form = "long"): string | [string, string] {
  return formed(PREFIX.seguid, checksum(seq, alphabet, base64), form);
}

/**
 * The checksum of one strand of a linear molecule.
 *
 * @param seq - The sequence. @param alphabet - The symbols it may use. @param form - Which form to give.
 * @returns The checksum.
 */
export function lsseguid(seq: string, alphabet = "{DNA}", form: Form = "long"): string | [string, string] {
  return formed(PREFIX.lsseguid, checksum(seq, alphabet, urlsafe), form);
}

/**
 * The checksum of one strand of a circular molecule, which is read from wherever makes it smallest so
 * that the origin does not matter.
 *
 * @param seq - The sequence. @param alphabet - The symbols it may use. @param form - Which form to give.
 * @returns The checksum.
 */
export function csseguid(seq: string, alphabet = "{DNA}", form: Form = "long"): string | [string, string] {
  return formed(PREFIX.csseguid, checksum(rotateToMin(seq), alphabet, urlsafe), form);
}

/**
 * The checksum of a linear duplex: both strands, the smaller one first so that which strand is called
 * which does not matter.
 *
 * @param watson - One strand. @param crick - The other, read in the opposite direction.
 * @param alphabet - The symbols they may use. @param form - Which form to give.
 * @returns The checksum.
 * @throws AssertionError for an empty strand, strands of different lengths or a single-stranded
 *   alphabet, and ValueError for strands that are not complementary.
 */
export function ldseguid(watson: string, crick: string, alphabet = "{DNA}", form: Form = "long"):
string | [string, string] {
  if (watson === "") throw new AssertionError("Watson sequence must not be empty");
  if (crick === "") throw new AssertionError("Crick sequence must not be empty");
  if (watson.length !== crick.length) throw new AssertionError();
  assertComplementary(watson, crick, alphabet);
  if (new Set(tableFactory(alphabet).values()).size <= 1) {
    throw new AssertionError("Was a single-stranded alphabet used by mistake?");
  }
  // The gap and the separator have to be in the alphabet for the check over the joined text.
  const extended = `${alphabet},--,;;`;
  const spec = watson < crick ? `${watson};${crick}` : `${crick};${watson}`;
  return formed(PREFIX.ldseguid, checksum(spec, extended, urlsafe), form);
}

/**
 * The checksum of a circular duplex: both strands, each read from wherever makes it smallest.
 *
 * @param watson - One strand. @param crick - The other, read in the opposite direction.
 * @param alphabet - The symbols they may use. @param form - Which form to give.
 * @returns The checksum.
 * @throws The same as {@link ldseguid}.
 */
export function cdseguid(watson: string, crick: string, alphabet = "{DNA}", form: Form = "long"):
string | [string, string] {
  if (watson === "") throw new AssertionError("Watson sequence must not be empty");
  if (crick === "") throw new AssertionError("Crick sequence must not be empty");
  if (watson.length !== crick.length) throw new AssertionError();
  assertComplementary(watson, crick, alphabet);
  const amountWatson = minRotation(watson);
  const watsonMin = rotate(watson, amountWatson);
  const amountCrick = minRotation(crick);
  const crickMin = rotate(crick, amountCrick);
  // Whichever strand reads smaller leads, and the other is rotated by the same amount so that the two
  // still line up.
  const [w, c] = watsonMin < crickMin
    ? [watsonMin, rotate(crick, -amountWatson)]
    : [crickMin, rotate(watson, -amountCrick)];
  const long = ldseguid(w, c, alphabet, "long") as string;
  return formed(PREFIX.cdseguid, long.slice(PREFIX.ldseguid.length), form);
}

/**
 * @param seq - A sequence. @param amount - How far to move the origin.
 * @returns The sequence read from there.
 */
export function rotate(seq: string, amount = 0): string {
  if (seq.length === 0) return seq;
  const by = ((amount % seq.length) + seq.length) % seq.length;
  return by > 0 ? seq.slice(by) + seq.slice(0, by) : seq;
}

/**
 * @param seq - A sequence.
 * @returns It read from wherever makes it lexicographically smallest.
 */
export function rotateToMin(seq: string): string {
  return rotate(seq, minRotation(seq));
}

/**
 * Where a sequence's lexicographically smallest rotation begins (Booth's algorithm, in the form the
 * `seguid` package implements it).
 *
 * @param seq - The sequence.
 * @returns How far round that reading starts.
 */
export function minRotation(seq: string): number {
  const doubled = seq + seq;
  const n = seq.length, total = n * 2;
  let previous: string | null = null, repeats = 0, old = 0, k = 0, w = "";
  while (k < total) {
    let i = k, j = k + 1;
    while (j < total && doubled.charCodeAt(i) <= doubled.charCodeAt(j)) {
      i = doubled.charCodeAt(i) === doubled.charCodeAt(j) ? i + 1 : k;
      j += 1;
    }
    while (k < i + 1) {
      k += j - i;
      previous = w;
      w = doubled.slice(old, k);
      old = k;
      if (w === previous) repeats += 1;
      else { previous = w; repeats = 1; }
      if (w.length * repeats === n) return old - i;
    }
  }
  return 0;
}
