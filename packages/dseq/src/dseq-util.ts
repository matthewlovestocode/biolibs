/**
 * The pieces `Dseq` is built from that do not need the class itself: trimming, the overlap search its
 * constructor anneals with, which kind of end a molecule has, and Python's own docstring cleanup.
 */

import { type DseqParts, toCrick, toWatson } from "./alphabet.js";

/** What kind of end a molecule has: a 5' or 3' overhang, a blunt end, or one strand only. */
export type EndType = "blunt" | "5'" | "3'" | "single";

/** How long a molecule may be before its figure shortens its runs. */
export const LENGTH_LIMIT_FOR_REPR = 30;

/** @param text - Any string. @returns It without leading or trailing spaces, as Python's `strip` leaves it. */
export const strip = (text: string): string => text.replace(/^ +| +$/g, "");

/**
 * All maximal common substrings of two strings that are at least `limit` long.
 *
 * pydna gets these from a suffix array in `pydivsufsort` and then sorts them by length, longest first,
 * ties by position. Only the longest matters to the one caller here — the constructor, which anneals two
 * strands — so this returns the longest match and how many there are of that length, which is what
 * decides between an answer and pydna's "more than one way of annealing" refusal.
 *
 * @param x - One string. @param y - The other. @param limit - The shortest match worth reporting.
 * @returns The first match in pydna's ordering and how many share its length, or null for no match.
 */
export function longestCommonSubstring(x: string, y: string, limit: number):
{ posX: number; posY: number; length: number; ties: number } | null {
  let best: { posX: number; posY: number; length: number } | null = null;
  let ties = 0;
  for (let i = 0; i < x.length; i++) {
    for (let j = 0; j < y.length; j++) {
      // Only the start of a maximal match is considered, so each match is found once.
      if (x[i] !== y[j] || (i > 0 && j > 0 && x[i - 1] === y[j - 1])) continue;
      let length = 0;
      while (i + length < x.length && j + length < y.length && x[i + length] === y[j + length]) length += 1;
      if (length < limit) continue;
      if (best === null || length > best.length) { best = { posX: i, posY: j, length }; ties = 1; }
      // pydna's sort breaks a tie on position, so the first one in index order wins.
      else if (length === best.length) ties += 1;
    }
  }
  return best === null ? null : { ...best, ties };
}
/**
 * Which end a molecule has, from its overhangs.
 *
 * @param parts - The molecule's pieces. @param sticky5 - The 5' overhang's bases.
 * @param sticky3 - The 3' overhang's bases.
 * @returns The kind of end and its bases in lower case, in pydna's own order of preference.
 */
export function endOf(parts: DseqParts, sticky5: string, sticky3: string): [EndType, string] {
  const singleWatson = toWatson(parts.singleWatson);
  const singleCrick = [...toCrick(parts.singleCrick)].reverse().join("");
  if (singleWatson) return ["single", singleWatson.toLowerCase()];
  if (singleCrick) return ["single", singleCrick.toLowerCase()];
  if (sticky5 === "" && sticky3 === "") return ["blunt", ""];
  if (sticky5) return ["5'", sticky5.toLowerCase()];
  return ["3'", sticky3.toLowerCase()];
}

/**
 * Python's `inspect.cleandoc`: drop the first line's indentation, then the common indentation of the rest.
 *
 * @param text - The text. @returns It cleaned up as Python would leave it.
 */
export function cleandoc(text: string): string {
  const lines = text.split("\n");
  let margin = Infinity;
  for (const line of lines.slice(1)) {
    const stripped = line.replace(/^ +/, "");
    if (stripped !== "") margin = Math.min(margin, line.length - stripped.length);
  }
  const out = [lines[0]!.replace(/^ +/, ""), ...lines.slice(1).map((l) => (Number.isFinite(margin) ? l.slice(margin) : l))];
  while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
  while (out.length > 0 && out[0]!.trim() === "") out.shift();
  return out.join("\n");
}
