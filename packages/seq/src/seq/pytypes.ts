/** Small Python-compatible type helpers used for error messages and argument checks. */

import { ValueError } from "@biolibs/core";
import * as pb from "../pybytes/index.js";

/** Whether `x` looks like a `Seq`/`MutableSeq` (checked structurally, which avoids circular imports). */
export function isSeqLike(x: unknown): x is { toBytes(): Uint8Array; _data: unknown } {
  return x !== null && typeof x === "object" && "_data" in x && typeof (x as { toBytes?: unknown }).toBytes === "function";
}

/** Python's `type(x).__name__`, used in error messages. */
export function tyName(x: unknown): string {
  if (x === null || x === undefined) return "NoneType";
  if (typeof x === "boolean") return "bool";
  if (typeof x === "number") return Number.isInteger(x) ? "int" : "float";
  if (typeof x === "string") return "str";
  if (x instanceof Uint8Array) return "bytes";
  if (isSeqLike(x)) return (x as object).constructor.name; // "Seq" or "MutableSeq"
  if (Array.isArray(x)) return "list";
  return "dict";
}

/** Python's `str(type(x))`, e.g. `<class 'Bio.Seq.Seq'>`. */
export function pyType(x: unknown): string {
  const n = tyName(x);
  return n === "Seq" || n === "MutableSeq" ? `<class 'Bio.Seq.${n}'>` : `<class '${n}'>`;
}

/** Whether `x` is a JavaScript number holding an integer (Python `numbers.Integral`). */
export const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** Python `ord()` for a one-character string. */
export function ord(c: unknown): number {
  if (typeof c !== "string") throw new TypeError(`ord() expected string of length 1, but ${tyName(c)} found`);
  const cps = [...c];
  if (cps.length !== 1) throw new TypeError(`ord() expected a character, but string of length ${cps.length} found`);
  return cps[0]!.codePointAt(0)!;
}

/** Python `ord(c.encode("ASCII"))`: one ASCII character to its byte value. */
export function ordAscii(c: string): number {
  const b = pb.encodeAscii(c);
  if (b.length !== 1) throw new TypeError(`ord() expected a character, but string of length ${b.length} found`);
  return b[0]!;
}

/** A bytearray value from a code point (must be 0..255). */
export function byteFrom(cp: number): number {
  if (cp < 0 || cp > 255) throw new ValueError("byte must be in range(0, 256)");
  return cp;
}
