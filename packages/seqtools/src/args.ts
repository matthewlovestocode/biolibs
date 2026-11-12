/** Argument helpers shared by the SeqUtils functions. */

import { Seq, MutableSeq } from "@biolibs/seq";
import { ValueError, pyTypeName } from "@biolibs/core";

/** What the functions accept as a sequence: plain text, `Seq` or `MutableSeq`. */
export type SeqLike = string | Seq | MutableSeq;

/**
 * The text of a sequence argument.
 *
 * @param use - The operation Python applies first, which decides the error message.
 * @throws TypeError for anything that is not text or a sequence object.
 */
export function asText(seq: unknown, use: "count" | "len" | "subscript" | "iter" | "lower" = "count"): string {
  if (typeof seq === "string") return seq;
  if (seq instanceof Seq || seq instanceof MutableSeq) return seq.toString();
  // Python's message depends on the first operation applied to the argument.
  const t = pyTypeName(seq);
  if (use === "len") throw new TypeError(`object of type '${t}' has no len()`);
  if (use === "subscript") throw new TypeError(`'${t}' object is not subscriptable`);
  if (use === "iter") throw new TypeError(`'${t}' object is not iterable`);
  throw new TypeError(`'${t}' object has no attribute '${use}'`);
}

/**
 * Python's `range(0, stop, step)` as a list of starts, with its argument checks.
 *
 * @throws TypeError for a non-integer step, {@link ValueError} for a zero step.
 */
export function rangeStarts(stop: number, step: unknown): number[] {
  if (typeof step === "boolean") step = Number(step); // Python's bool is an int
  if (typeof step !== "number" || !Number.isInteger(step)) throw new TypeError(`'${pyTypeName(step)}' object cannot be interpreted as an integer`);
  if (step === 0) throw new ValueError("range() arg 3 must not be zero");
  const out: number[] = [];
  if (step > 0) for (let i = 0; i < stop; i += step) out.push(i);
  else for (let i = 0; i > stop; i += step) out.push(i);
  return out;
}
