/**
 * Melting a molecule: where a duplex comes apart when it is heated, and what is left when it does.
 *
 * A short double-stranded stretch held between single-stranded ones will let go before a long one does,
 * so pydna finds those stretches with a regular expression over the dscode string — one pattern for a
 * stretch that would come away as a single strand, another for one whose two sides stay double stranded —
 * and then cuts the molecule at them. `melt` puts the two together: it first sheds the single strands,
 * then breaks what is left at every site short enough to melt, and hands back all the pieces.
 */

import { ValueError } from "@biolibs/core";
import { DS_LETTERS, FIVE_PRIME_SS_LETTERS, THREE_PRIME_SS_LETTERS, TO_CRICK_TAIL,
  TO_WATSON_TAIL } from "./data/dscode.js";
import { translateCode } from "./alphabet.js";
import { circularSlice, replaceWith } from "./circular.js";
import { applyCut, type CutSite, cutsOverlap, getCutsitePairs } from "./cut.js";
import { Dseq } from "./dseq.js";

/** Python's `re.PatternError`, which a pattern that cannot be compiled raises. */
export class PatternError extends ValueError {
  override name = "PatternError";
}

/** @param letters - Letters for a character class. @returns Them, escaped. */
const cls = (letters: string): string => letters.replace(/[\\\]^-]/g, "\\$&");

/**
 * Refuse a length that would make the quantifier impossible, where Python refuses it.
 *
 * @param length - The longest stretch that melts.
 * @throws {@link PatternError} for a length below one, which makes `{1,0}` -- and because the two
 *   patterns are the same length, Python always reports the same position.
 */
function requireLength(length: number): void {
  if (length < 1) throw new PatternError("min repeat greater than max repeat at position 68");
}

/**
 * The pattern for a stretch that would come away as a single strand: double-stranded, no longer than
 * `length`, with one strand's single-stranded run on one side and nothing of either on the other.
 *
 * @param length - The longest stretch that melts.
 * @returns The pattern, with a `watson` and a `crick` branch.
 */
export function ssMeltRegex(length: number): RegExp {
  requireLength(length);
  const w = cls(FIVE_PRIME_SS_LETTERS), c = cls(THREE_PRIME_SS_LETTERS), ds = cls(DS_LETTERS);
  return new RegExp(
    `(?<watson>((?<=[${c}]))([${ds}]{1,${length}})((?=[^${w}${ds}])))`
    + `|(?<crick>((?<=[${w}]))([${ds}]{1,${length}})((?=[^${c}${ds}])))`, "g",
  );
}

/**
 * The pattern for a stretch whose melting leaves both sides double stranded: one strand's run on one
 * side and the other strand's on the other, or an end of a linear molecule.
 *
 * @param length - The longest stretch that melts. @param circular - Whether the molecule is a circle.
 * @returns The pattern, with a `watson` and a `crick` branch.
 */
export function dsMeltRegex(length: number, circular: boolean): RegExp {
  requireLength(length);
  const w = cls(FIVE_PRIME_SS_LETTERS), c = cls(THREE_PRIME_SS_LETTERS), ds = cls(DS_LETTERS);
  const start = circular ? "" : "|^", end = circular ? "" : "|$";
  return new RegExp(
    `(?<watson>((?<=[${w}])${start})([${ds}]{1,${length}})((?=[${c}])${end}))`
    + `|(?<crick>((?<=[${c}])${start})([${ds}]{1,${length}})((?=[${w}])${end}))`, "g",
  );
}

/**
 * The dscode to search, with a circle padded on both sides so that a site across the origin is found.
 *
 * @param d - The molecule. @param length - The longest stretch that melts.
 * @returns What to search, and how far it was shifted.
 */
function searchable(d: Dseq, length: number): { text: string; spacer: number } {
  if (!d.circular) return { text: d.code, spacer: 0 };
  return { text: d.code.slice(-length) + d.code + d.code.slice(0, length), spacer: length };
}

/**
 * Where single-stranded stretches would come away.
 *
 * @param d - The molecule. @param length - The longest stretch that melts.
 * @returns The stretches to take off each strand, as `[start, end]` pairs.
 */
export function getSsMeltsites(d: Dseq, length: number): [[number, number][], [number, number][]] {
  const { text, spacer } = searchable(d, length);
  let watson: [number, number][] = [];
  let crick: [number, number][] = [];
  for (const m of text.matchAll(ssMeltRegex(length))) {
    const span: [number, number] = [m.index - spacer, m.index + m[0].length - spacer];
    if (m.groups?.["watson"] !== undefined) watson.push(span);
    else crick.push(span);
  }
  if (d.circular) {
    // A site that begins in the padding belongs to the copy before or after this one.
    watson = watson.filter(([start]) => start >= 0 && start <= d.length);
    crick = crick.filter(([start]) => start >= 0 && start <= d.length);
  }
  return [watson, crick];
}

/**
 * Where the molecule would break while both sides stay double stranded.
 *
 * @param d - The molecule. @param length - The longest stretch that melts.
 * @returns The breaks, written as cut sites with no enzyme behind them.
 */
export function getDsMeltsites(d: Dseq, length: number): CutSite[] {
  if (length < 1) return [];
  const { text, spacer } = searchable(d, length);
  const cuts: CutSite[] = [];
  for (const m of text.matchAll(dsMeltRegex(length, d.circular))) {
    const [start, end] = [m.index, m.index + m[0].length];
    if (m.groups?.["watson"] !== undefined) cuts.push({ watson: end - spacer, ovhg: end - start, enzyme: null });
    else cuts.push({ watson: start - spacer, ovhg: start - end, enzyme: null });
  }
  return cuts.filter((cut) => cut.watson >= 0 && cut.watson <= d.length);
}

/**
 * Take the given stretches off one strand each, keeping them as single-stranded molecules of their own.
 *
 * @param d - The molecule. @param watsonCutpairs - Stretches to take off the upper strand.
 * @param crickCutpairs - Stretches to take off the lower strand.
 * @returns What is left, and the single strands that came away.
 */
export function shedSsDna(d: Dseq, watsonCutpairs: readonly [number, number][] = [],
  crickCutpairs: readonly [number, number][] = []): [Dseq, Dseq[]] {
  const strands: Dseq[] = [];
  let code = d.code;
  for (const [x, y] of watsonCutpairs) {
    const stretch = circularSlice(code, x, y);
    strands.push(Dseq.quick(translateCode(stretch, TO_WATSON_TAIL)));
    code = replaceWith(code, x, y, translateCode(stretch, TO_CRICK_TAIL));
  }
  for (const [x, y] of crickCutpairs) {
    const stretch = circularSlice(code, x, y);
    strands.push(Dseq.quick(translateCode(stretch, TO_CRICK_TAIL)));
    code = replaceWith(code, x, y, translateCode(stretch, TO_WATSON_TAIL));
  }
  return [Dseq.quick(code, d.circular), strands];
}

/**
 * Shed every single strand that would come away at this temperature.
 *
 * @param d - The molecule. @param length - The longest stretch that melts.
 * @returns What is left, and the single strands that came away.
 */
export function meltSsDna(d: Dseq, length: number): [Dseq, Dseq[]] {
  const [watson, crick] = getSsMeltsites(d, length);
  return shedSsDna(d, watson, crick);
}

/**
 * Widen a melting cut over the single-stranded stretch beside it, so that the fragment it makes keeps
 * that stretch.
 *
 * @param d - The molecule. @param cut - The cut, or null. @param isRight - Whether it is a fragment's
 *   right-hand cut.
 * @returns The widened cut, or null.
 */
export function shiftMeltCutsite(d: Dseq, cut: CutSite | null, isRight: boolean): CutSite | null {
  if (cut === null) return null;
  const n = d.code.length;
  let { watson } = cut;
  let ovhg = cut.ovhg ?? 0;
  const { enzyme } = cut;
  let iterations = 0;
  /** Whether a position is still worth looking at; a circle is walked at most once round. */
  const within = (pos: number): boolean => {
    if (!d.circular) return pos >= 0 && pos < n;
    const ok = iterations < n;
    iterations += 1;
    return ok;
  };
  const at = (pos: number): string => d.code[((pos % n) + n) % n] ?? "";
  const isWatsonSs = (pos: number): boolean => FIVE_PRIME_SS_LETTERS.includes(at(pos));
  const isCrickSs = (pos: number): boolean => THREE_PRIME_SS_LETTERS.includes(at(pos));
  if (ovhg > 0) {
    if (isRight) {
      let prev = watson - ovhg - 1;
      while (within(prev) && isWatsonSs(prev)) { ovhg += 1; prev -= 1; }
    } else {
      while (within(watson) && isCrickSs(watson)) { ovhg += 1; watson += 1; }
    }
  } else if (ovhg < 0) {
    if (isRight) {
      while (within(watson - 1) && isCrickSs(watson - 1)) { ovhg -= 1; watson -= 1; }
    } else {
      let next = watson - ovhg;
      while (within(next) && isWatsonSs(next)) { ovhg -= 1; next += 1; }
    }
  }
  if (d.circular) watson = ((watson % n) + n) % n;
  return { watson, ovhg, enzyme };
}

/**
 * Widen both cuts of every pair.
 *
 * @param d - The molecule. @param pairs - The pairs to widen.
 * @returns The widened pairs, with the repeats a circle produces dropped.
 */
export function shiftMeltCutsitePairs(d: Dseq, pairs: readonly [CutSite | null, CutSite | null][]):
[CutSite | null, CutSite | null][] {
  const out = pairs.map(([left, right]): [CutSite | null, CutSite | null] =>
    [shiftMeltCutsite(d, left, false), shiftMeltCutsite(d, right, true)]);
  if (!d.circular) return out;
  const seen = new Set<string>();
  const key = (cut: CutSite | null): string =>
    cut === null ? "-" : `${cut.watson},${cut.ovhg},${cut.enzyme?.name ?? ""}`;
  return out.filter((pair) => {
    const k = `${key(pair[0])}|${key(pair[1])}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Melt a molecule: every piece it falls into when stretches up to `length` long come apart.
 *
 * @param d - The molecule. @param length - The longest stretch that melts.
 * @returns The pieces: the single strands that came away first, then what the rest broke into. Nothing
 *   at all for a length below one, and the whole molecule when strands came away but nothing broke.
 */
export function melt(d: Dseq, length: number): Dseq[] {
  if (!length || length < 1) return [];
  const [rest, strands] = meltSsDna(d, length);
  const cutsites = getDsMeltsites(rest, length);
  const pairs = shiftMeltCutsitePairs(d, getCutsitePairs(d, cutsites));
  let result = pairs.map(([left, right]) => applyCut(rest, left, right, true));
  // A circle whose two cuts cross each other breaks into a pair of single strands instead, which takes
  // another round of melting to find.
  if (d.circular && pairs.length === 2 && cutsOverlap(pairs[0]![0], pairs[0]![1], d.length)) {
    result = melt(result[0]!, length);
  }
  if (strands.length > 0 && result.length === 0) result = [rest];
  return [...strands, ...result];
}
