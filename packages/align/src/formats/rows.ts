/** Helpers shared by the alignment format modules. */

import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";

/** Python's bare `Exception`. */
export class PythonException extends Error {
  override name = "Exception";
}

/** Python's `AssertionError` (a failed `assert`). */
export class AssertionError extends Error {
  override name = "AssertionError";
}

/** The rows of an alignment as text with gaps, in order (Python `for line in alignment`). @param alignment - An alignment. */
export function rowsOf(alignment: Alignment): string[] {
  return Array.from({ length: alignment.size }, (_, i) => alignment.get(i) as string);
}

/** `text.encode()`. @param s - A string. */
export const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

/** `bytes.decode()` of an ungapped sequence. @param b - Bytes. */
export const decode = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Python `str.split()` on white space. @param s - A string. */
export const words = (s: string): string[] => s.split(/\s+/).filter((w) => w.length > 0);

/** Python `s.rstrip()`. @param s - A string. */
export const rstrip = (s: string): string => s.replace(/[ \t\n\r\x0b\x0c]+$/, "");

/** Python `s.strip()`. @param s - A string. */
export const strip = (s: string): string => rstrip(s).replace(/^[ \t\n\r\x0b\x0c]+/, "");

/**
 * Python `s.split(None, 1)`: the first word and the rest after the white space that follows it.
 *
 * @param s - A string.
 * @returns Zero, one or two parts.
 */
export function splitFirst(s: string): string[] {
  const m = /^\s*(\S+)(?:\s+([\s\S]*))?$/.exec(s);
  if (!m) return [];
  return m[2] === undefined || m[2] === "" ? [m[1]!] : [m[1]!, m[2]!];
}

/** A `SeqRecord` of a sequence with an id and description, as the parsers build them. */
export function recordOf(seq: string, id: string, description: string): SeqRecord {
  return new SeqRecord(new Seq(seq), id, undefined, description);
}
