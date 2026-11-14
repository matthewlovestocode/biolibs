/**
 * pydna's dscode alphabet: one letter per base pair.
 *
 * A double-stranded molecule is held as a single string in which each character stands for one position
 * and says what is on both strands there: `G` is G over C, `P` is a G with nothing opposite it, `Q` is a
 * C on the lower strand alone, `0`-`9` are loops and `!`-`;` mismatches. Reading a strand off is then one
 * translation, and finding the sticky ends is one regular expression, which is what this module provides.
 *
 * The tables themselves are generated from pydna by `reference/gen_pydna_data.py` into `data/dscode.ts`.
 */

import { ValueError } from "@biolibs/core";
import { BASEPAIR_TO_CODE, COMPLEMENT, DS_LETTERS, FIVE_PRIME_SS_LETTERS, THREE_PRIME_SS_LETTERS, TO_CRICK,
  TO_FULL, TO_WATSON } from "./data/dscode.js";

/**
 * Put every character of a dscode string through one of the 256-entry tables.
 *
 * @param data - The dscode string. @param table - The table, as `data/dscode.ts` holds it.
 * @returns The translated string.
 */
export function translateCode(data: string, table: string): string {
  let out = "";
  for (let i = 0; i < data.length; i++) out += table[data.charCodeAt(i)] ?? data[i]!;
  return out;
}

/** @param data - A dscode string. @returns The upper strand, with a space where it has no base. */
export const toWatson = (data: string): string => translateCode(data, TO_WATSON);
/** @param data - A dscode string. @returns The lower strand as it reads against the upper one. */
export const toCrick = (data: string): string => translateCode(data, TO_CRICK);
/** @param data - A dscode string. @returns The blunt, fully double-stranded reading of it. */
export const toFull = (data: string): string => translateCode(data, TO_FULL);

/**
 * @param data - A dscode string.
 * @returns It reverse-complemented: every position's strands swapped, and the whole thing reversed.
 */
export const reverseComplementCode = (data: string): string =>
  [...translateCode(data, COMPLEMENT)].reverse().join("");

/**
 * The code letter for one base pair.
 *
 * @param watson - The upper strand's character, or a space. @param crick - The lower strand's.
 * @returns The code letter.
 * @throws ValueError with pydna's own wording for a pair that cannot exist.
 */
export function pairToCode(watson: string, crick: string): string {
  const code = BASEPAIR_TO_CODE.get(watson + crick);
  if (code === undefined) throw new ValueError(`Base mismatch in representation: ('${watson}', '${crick}')`);
  return code;
}

/** The pieces `getParts` splits a molecule into, under pydna's own names. */
export interface DseqParts {
  /** The upper strand's 5' overhang at the left end. */
  stickyLeft5: string;
  /** The lower strand's 3' overhang at the left end. */
  stickyLeft3: string;
  /** Everything that is double stranded. */
  middle: string;
  /** The upper strand's 3' overhang at the right end. */
  stickyRight3: string;
  /** The lower strand's 5' overhang at the right end. */
  stickyRight5: string;
  /** The whole molecule when it is upper strand only. */
  singleWatson: string;
  /** The whole molecule when it is lower strand only. */
  singleCrick: string;
}

/** @param letters - Letters for a regular expression's character class. @returns Them, escaped. */
const cls = (letters: string): string => letters.replace(/[\\\]^-]/g, "\\$&");

/** pydna's own regular expression for splitting a molecule into overhangs and double-stranded middle. */
const PARTS = new RegExp(
  `^([${cls(FIVE_PRIME_SS_LETTERS)}]*)([${cls(THREE_PRIME_SS_LETTERS)}]*)(?=[${cls(DS_LETTERS)}])`
  + `(.*)(?<=[${cls(DS_LETTERS)}])([${cls(FIVE_PRIME_SS_LETTERS)}]*)([${cls(THREE_PRIME_SS_LETTERS)}]*)`
  + `|^([${cls(FIVE_PRIME_SS_LETTERS)}]+)|^([${cls(THREE_PRIME_SS_LETTERS)}]+)`,
);

/**
 * Split a dscode string into its overhangs and its double-stranded middle.
 *
 * @param data - The dscode string.
 * @returns The pieces; all of them are empty strings when nothing matched, as pydna's are.
 */
export function getParts(data: string): DseqParts {
  const m = PARTS.exec(data);
  const g = (i: number): string => m?.[i] ?? "";
  return {
    stickyLeft5: g(1), stickyLeft3: g(2), middle: g(3), stickyRight3: g(4), stickyRight5: g(5),
    singleWatson: g(6), singleCrick: g(7),
  };
}

/** Where a molecule is split in two: an upper-strand-only position next to a lower-strand-only one. */
const BREAKS = new RegExp(
  `(.{0,3})([${cls(FIVE_PRIME_SS_LETTERS)}][${cls(THREE_PRIME_SS_LETTERS)}]`
  + `|[${cls(THREE_PRIME_SS_LETTERS)}][${cls(FIVE_PRIME_SS_LETTERS)}])(.{0,3})`, "g",
);

/**
 * Find the places where a molecule falls apart.
 *
 * @param data - The dscode string.
 * @returns One report per break, with its position and the strands around it, as pydna formats them.
 */
export function dsBreaks(data: string): string[] {
  const out: string[] = [];
  for (const m of data.matchAll(BREAKS)) {
    const [watson, crick] = representationTuple(m[0]!);
    out.push(`[${m.index}:${m.index + m[0]!.length}]\n${watson}\n${crick}\n`);
  }
  return out;
}

/** The characters pydna puts in place of a long run when it shortens a molecule for printing. */
const PLACEHOLDER_3 = "~", PLACEHOLDER_5 = "+", INTERVAL = ".";

/**
 * The two strands as pydna prints them, with long runs shortened.
 *
 * @param data - The dscode string. @param lengthLimit - Above this length the pieces are shortened.
 * @param chunk - How many characters of a shortened overhang are kept at each end.
 * @returns The upper and lower strands, the lower one in the order it is printed under the upper.
 */
export function representationTuple(data: string, lengthLimit = 30, chunk = 4): [string, string] {
  const parts = getParts(data);
  // pydna unpacks `get_parts` into its own names in the other order here, so what it shortens as a 5'
  // overhang is the 3' one and the other way round. That is reproduced: it decides which placeholder
  // character each shortened end gets.
  let { stickyLeft5, stickyLeft3, middle } = parts;
  let stickyRight5 = parts.stickyRight3, stickyRight3 = parts.stickyRight5;
  if (data.length > lengthLimit) {
    const limit = Math.floor(lengthLimit / 3);
    const shorten = (s: string, filler: string): string =>
      s.length > limit ? s.slice(0, chunk) + filler.repeat(2) + s.slice(-chunk) : s;
    stickyLeft5 = shorten(stickyLeft5, PLACEHOLDER_5);
    stickyLeft3 = shorten(stickyLeft3, PLACEHOLDER_3);
    if (middle.length > limit) middle = middle.slice(0, 4) + INTERVAL.repeat(2) + middle.slice(-4);
    stickyRight5 = shorten(stickyRight5, PLACEHOLDER_5);
    stickyRight3 = shorten(stickyRight3, PLACEHOLDER_3);
  }
  const processed = (stickyLeft5 || stickyLeft3) + middle + (stickyRight5 || stickyRight3)
    || parts.singleWatson + parts.singleCrick;
  return [toWatson(processed).replace(/\s+$/, ""), toCrick(processed).replace(/\s+$/, "")];
}
