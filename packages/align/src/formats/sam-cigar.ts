/** Turning a SAM CIGAR string (and the MD tag) into alignment coordinates. */

import { NotImplementedError, pyInt } from "@biolibs/core";

/** What the CIGAR parser found. */
export interface CigarResult {
  /** `[target, query]` coordinate pairs, one per boundary. */
  coordinates: [number, number][];
  /** Letters of the operations behind each coordinate pair after the first. */
  operations: number[];
  /** True if `=`, `X` or `N` occurred, so the operations are worth keeping. */
  storeOperations: boolean;
  /** Final query position. */
  queryPos: number;
  /** Hard clip at the left end, if any. */
  hardClipLeft: number | null;
  /** Hard clip at the right end, if any. */
  hardClipRight: number | null;
  /** With the target: the target start of every block. */
  starts: number[];
  /** With the target: the size of every block. */
  sizes: number[];
  /** With the target: the query letters that line up with the reference. */
  target: string;
}

/** Python's `s[:n]` for a non-negative `n`. */
const head = (s: string, n: number): string => Array.from(s).slice(0, n).join("");
/** Python's `s[n:]` for a non-negative `n`. */
const tail = (s: string, n: number): string => Array.from(s).slice(n).join("");

/**
 * Walk a CIGAR string the way Biopython's SAM reader does, with or without collecting the target letters (needed for the
 * MD tag).
 *
 * Characters that are not operations pile up in `number`, so a malformed length fails only when an operation uses it,
 * with the message Python's `int()` gives.
 *
 * @param cigar - The CIGAR string.
 * @param targetPos0 - Zero-based target start.
 * @param query - The query text (used only when `withTarget`).
 * @param withTarget - Also collect the aligned target letters, block starts and block sizes.
 * @throws NotImplementedError for padding (`P`).
 */
export function parseCigar(cigar: string, targetPos0: number, query: string, withTarget: boolean): CigarResult {
  let targetPos = targetPos0, queryPos = 0;
  const coordinates: [number, number][] = [[targetPos, queryPos]];
  const operations: number[] = [];
  const starts = [targetPos];
  const sizes: number[] = [];
  let size = 0, number = "", seq = query, target = "";
  let storeOperations = false;
  let hardClipLeft: number | null = null, hardClipRight: number | null = null;
  for (const letter of cigar) {
    let length: number;
    if (letter === "M" || letter === "=" || letter === "X") {
      length = pyInt(number);
      targetPos += length; queryPos += length;
      if (withTarget) { target += head(seq, length); seq = tail(seq, length); size += length; }
      if (letter !== "M") storeOperations = true;
    } else if (letter === "I") {
      length = pyInt(number);
      queryPos += length;
      if (withTarget) seq = tail(seq, length);
    } else if (letter === "S") {
      length = pyInt(number);
      if (queryPos === 0) coordinates[0]![1] += length;
      queryPos += length;
      if (withTarget) seq = tail(seq, length);
      number = "";
      continue;
    } else if (letter === "D") {
      length = pyInt(number);
      targetPos += length;
      if (withTarget) { size += length; starts.push(targetPos); sizes.push(size); size = 0; }
    } else if (letter === "N") {
      length = pyInt(number);
      targetPos += length;
      if (withTarget) { starts.push(targetPos); sizes.push(size); size = 0; }
      storeOperations = true;
    } else if (letter === "H") {
      if (queryPos === 0) hardClipLeft = pyInt(number); else hardClipRight = pyInt(number);
      number = "";
      continue;
    } else if (letter === "P") throw new NotImplementedError("padding operator is not yet implemented");
    else { number += letter; continue; }
    coordinates.push([targetPos, queryPos]);
    operations.push(letter.charCodeAt(0));
    number = "";
  }
  if (withTarget) sizes.push(size);
  return { coordinates, operations, storeOperations, queryPos, hardClipLeft, hardClipRight, starts, sizes, target };
}

/**
 * Rebuild the reference letters from the aligned query letters and an MD tag.
 *
 * @param md - The MD tag value.
 * @param aligned - The query letters that line up with the reference (from {@link parseCigar}).
 * @returns The target letters, block by block concatenated.
 */
export function targetFromMd(md: string, aligned: string): string {
  let seq = aligned, target = "", number = "";
  const letters = Array.from(md);
  let i = 0;
  const isBase = (c: string): boolean => "ACGTNacgtn".includes(c);
  const flush = (): void => { if (number) { const n = pyInt(number); target += head(seq, n); seq = tail(seq, n); number = ""; } };
  while (i < letters.length) {
    const letter = letters[i++]!;
    if (isBase(letter)) { flush(); target += letter; seq = tail(seq, 1); }
    else if (letter === "^") {
      flush();
      let ended = true;
      let last = "";
      while (i < letters.length) {
        last = letters[i++]!;
        if (!isBase(last)) { ended = false; break; }
        target += last;
      }
      if (ended) break;
      number = last;
    } else number += letter;
  }
  if (number) target += head(seq, pyInt(number));
  return target;
}
