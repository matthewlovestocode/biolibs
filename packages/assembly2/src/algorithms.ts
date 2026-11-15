/**
 * The overlap finders: given two fragments, where would they join?
 *
 * Each one answers in the same shape — where on the first, where on the second, over how many bases —
 * and the engine takes whichever one the cloning method calls for. The order matters: an algorithm is
 * asked about an ordered pair, and the answer for `(x, y)` is where `x`'s right-hand end meets `y`'s
 * left-hand one, which is not the same question as `(y, x)`.
 */

import { ValueError, warn } from "@biolibs/core";
import { commonSubStrings as commonSubStringsOfText, type Match } from "@biolibs/assembly";
import { type CutSite, type Dseq, type Enzymes, getCutParameters, getCutsites, getLeftEndAsCutsite, getRightEndAsCutsite } from "@biolibs/dseq";
import type { Dseqrecord } from "@biolibs/dseqrecord";
import { textOf } from "./fragment.js";
import { type End, sumIsSticky } from "./pyutils.js";

/** Where two fragments meet: the position on each, and how many bases they share. */
export type Overlap = Match;

/** What every overlap finder looks like, so that the engine can be handed one. */
export type AssemblyAlgorithm = (x: Dseqrecord, y: Dseqrecord, limit: number | null) => Overlap[];

/** @param record - A record. @returns Its sequence in upper case, doubled if it is a circle. */
function query(record: Dseqrecord): string {
  const text = textOf(record).toUpperCase();
  return record.circular ? text + text : text;
}

/**
 * Every stretch the two fragments have in common, of at least `limit` bases — what homologous
 * recombination and in-vivo assembly join at.
 *
 * A circular fragment is searched round the origin, so a stretch may run past the end and back to the
 * start; the matches that are only the tail of such a stretch are dropped.
 *
 * @param x - The first fragment. @param y - The second. @param limit - The shortest stretch that counts.
 * @returns Where they agree.
 * @example
 * ```ts
 * commonSubStrings(new Dseqrecord("TAAAAAAT"), new Dseqrecord("CCaAaAaACC"), 5);
 * // [[1, 2, 6], [1, 3, 5], [2, 2, 5]]
 * ```
 */
export function commonSubStrings(x: Dseqrecord, y: Dseqrecord, limit: number | null = 25): Overlap[] {
  let found = commonSubStringsOfText(query(x), query(y), limit ?? 25);
  if (!x.circular && !y.circular) return found;
  if (x.circular) found = found.filter(([startX]) => startX < x.length);
  if (y.circular) found = found.filter(([, startY]) => startY < y.length);
  // A match cannot be longer than the shorter molecule, however far round the doubled copy it ran.
  const longest = Math.min(x.length, y.length);
  found = found.map(([startX, startY, length]) => [startX, startY, Math.min(length, longest)] as Overlap);
  if (x.length === y.length) {
    const whole = found.find(([, , length]) => length === x.length);
    if (whole !== undefined) return [whole];
  }
  // Where a stretch runs through one molecule's origin but not the other's, the part of it that does
  // not is reported again as a match of its own. That is the same join twice, so it goes.
  const shifted = new Set<string>();
  for (const [startX, startY, length] of found) {
    const throughX = x.circular && startX + length > x.length;
    const throughY = y.circular && startY + length > y.length;
    if (throughX && !throughY) {
      const shift = x.length - startX;
      shifted.add(String([0, startY + shift, length - shift]));
    } else if (!throughX && throughY) {
      const shift = y.length - startY;
      shifted.add(String([startX + shift, 0, length - shift]));
    }
  }
  return found.filter((match) => !shifted.has(String([...match])));
}

/**
 * How far an end should be left out of the search, for an algorithm that chews one strand back.
 *
 * @param end - The end. @param trim - Which kind of end is chewed back.
 * @param fivePrime - Whether this is the left-hand end.
 * @returns How much to cut off that side: a count from the left, or a negative count from the right.
 */
function trimAmount(end: End, trim: string, fivePrime: boolean): number | null {
  if (end[0] === trim) return fivePrime ? end[1].length : -end[1].length;
  return fivePrime ? 0 : null;
}

/**
 * Stretches shared between the right-hand end of one fragment and the left-hand end of the next — what
 * Gibson assembly, In-Fusion and fusion PCR join at.
 *
 * @param x - The first fragment. @param y - The second.
 * @param limit - The shortest stretch that counts.
 * @param trimEnds - `"5'"` or `"3'"` to ignore an overhang of that kind, as the enzymes of those methods
 * chew one strand back before the fragments meet; null to use the molecule as it is.
 * @returns Where they agree.
 * @throws `ValueError` for any other kind of end.
 * @example
 * ```ts
 * terminalOverlap(new Dseqrecord("ttactaAAAAAA"), new Dseqrecord("AAAAAAcgcacg"), 5);
 * // [[6, 0, 6], [7, 0, 5]]
 * ```
 */
export function terminalOverlap(x: Dseqrecord, y: Dseqrecord, limit: number | null = 25, trimEnds: string | null = null): Overlap[] {
  if (trimEnds !== null && trimEnds !== "5'" && trimEnds !== "3'") throw new ValueError("trim_ends must be '5' or '3'");
  let leftX = 0;
  let leftY = 0;
  let textX: string;
  let textY: string;
  if (trimEnds === null) {
    textX = textOf(x).toUpperCase();
    textY = textOf(y).toUpperCase();
  } else {
    const rightX = trimAmount(x.dseq.threePrimeEnd(), trimEnds, false);
    const rightY = trimAmount(y.dseq.threePrimeEnd(), trimEnds, false);
    leftX = trimAmount(x.dseq.fivePrimeEnd(), trimEnds, true) ?? 0;
    leftY = trimAmount(y.dseq.fivePrimeEnd(), trimEnds, true) ?? 0;
    textX = x.dseq.slice(leftX, rightX).toString().toUpperCase();
    textY = y.dseq.slice(leftY, rightY).toString().toUpperCase();
  }
  return commonSubStringsOfText(textX, textY, limit ?? 25)
    .filter(([startX, startY, length]) => startY === 0 && startX + length === textX.length)
    .map(([startX, startY, length]) => [startX + leftX, startY + leftY, length] as Overlap);
}

/** Gibson assembly's exonuclease chews the 5' strand back. @param x - The first fragment. @param y - The second. @param limit - The shortest stretch that counts. @returns Where they agree. */
export function gibsonOverlap(x: Dseqrecord, y: Dseqrecord, limit: number | null = 25): Overlap[] {
  return terminalOverlap(x, y, limit, "5'");
}

/** In-Fusion's enzyme chews the 3' strand back. @param x - The first fragment. @param y - The second. @param limit - The shortest stretch that counts. @returns Where they agree. */
export function inFusionOverlap(x: Dseqrecord, y: Dseqrecord, limit: number | null = 25): Overlap[] {
  return terminalOverlap(x, y, limit, "3'");
}

/** Fusion PCR joins the molecules as they are. @param x - The first fragment. @param y - The second. @param limit - The shortest stretch that counts. @returns Where they agree. */
export function pcrFusionOverlap(x: Dseqrecord, y: Dseqrecord, limit: number | null = 25): Overlap[] {
  return terminalOverlap(x, y, limit, null);
}

/**
 * Whether the two fragments' ends will ligate, and over how much — the sticky-end join.
 *
 * @param x - The first fragment. @param y - The second.
 * @param partial - Whether overhangs that agree over only part of their length may join.
 * @returns The single join, or nothing.
 * @example
 * ```ts
 * stickyEndSubStrings(cutLeft, cutRight);   // [[3, 0, 3]] where the two overhangs are complementary
 * ```
 */
export function stickyEndSubStrings(x: Dseqrecord, y: Dseqrecord, partial = false): Overlap[] {
  const overlap = sumIsSticky(x.dseq.threePrimeEnd(), y.dseq.fivePrimeEnd(), partial);
  return overlap > 0 ? [[x.length - overlap, 0, overlap]] : [];
}

/**
 * Whether the two fragments' ends are both blunt, which ligase will join with nothing in common.
 *
 * @param x - The first fragment. @param y - The second.
 * @returns The single join, of length zero, or nothing.
 * @example
 * ```ts
 * bluntOverlap(new Dseqrecord("AAAAAA"), new Dseqrecord("TTTTTT"));   // [[6, 0, 0]]
 * ```
 */
export function bluntOverlap(x: Dseqrecord, y: Dseqrecord): Overlap[] {
  return x.dseq.threePrimeEnd()[0] === "blunt" && y.dseq.fivePrimeEnd()[0] === "blunt" ? [[x.length, 0, 0]] : [];
}

/**
 * Run several finders and take every answer, which is how a ligation can allow both sticky and blunt ends.
 *
 * @param algorithms - The finders.
 * @returns One finder giving all of their answers, in order.
 */
export function combineAlgorithms(...algorithms: AssemblyAlgorithm[]): AssemblyAlgorithm {
  return (x, y, limit) => algorithms.flatMap((algorithm) => algorithm(x, y, limit));
}

/**
 * The two ends a restriction enzyme's cut leaves: the one on the left-hand piece and the one on the right.
 *
 * @param cut - Where the enzyme cuts.
 * @param sequence - The molecule being cut.
 * @returns The left piece's right-hand end and the right piece's left-hand end.
 * @throws `ValueError` if there is no cut.
 * @example
 * ```ts
 * endsFromCutsite(notIcut, new Dseq("ctcgGCGGCCGCcagcggccg"));   // [["5'", "ggcc"], ["5'", "ggcc"]]
 * ```
 */
export function endsFromCutsite(cut: CutSite | null, sequence: Dseq): [End, End] {
  if (cut === null) throw new ValueError("None is not supported");
  const [watson, crick, ovhg] = getCutParameters(sequence, cut, false);
  if ((ovhg ?? 0) < 0) {
    const stretch = sequence.slice(watson, crick);
    return [["5'", stretch.reverseComplement().toString().toLowerCase()], ["5'", stretch.toString().toLowerCase()]];
  }
  if ((ovhg ?? 0) > 0) {
    const stretch = sequence.slice(crick, watson);
    return [["3'", stretch.toString().toLowerCase()], ["3'", stretch.reverseComplement().toString().toLowerCase()]];
  }
  return [["blunt", ""], ["blunt", ""]];
}

/**
 * Where two fragments would join after being cut with the given enzymes — the Golden Gate and
 * restriction-ligation join.
 *
 * Both molecules are cut in the mind's eye, and every pair of cuts is asked whether the ends it makes
 * would ligate. An end of a linear molecule that is already sticky counts as a cut, so a fragment that
 * arrived digested can still join.
 *
 * @param x - The first fragment. @param y - The second.
 * @param enzymes - The enzymes.
 * @param partial - Whether overhangs that agree over only part of their length may join.
 * @param allowBlunt - Whether two blunt ends may join.
 * @returns Where they would join.
 * @example
 * ```ts
 * restrictionLigationOverlap(new Dseqrecord("ccGAATTCaa"), new Dseqrecord("aaaaGAATTCgg"), [EcoRI]);
 * // [[3, 5, 4]]
 * ```
 */
export function restrictionLigationOverlap(x: Dseqrecord, y: Dseqrecord, enzymes: Enzymes[], partial = false, allowBlunt = false): Overlap[] {
  const cutsX = getCutsites(x.dseq, ...enzymes);
  const cutsY = getCutsites(y.dseq, ...enzymes);
  if (partial) {
    warn("Partial overlaps can return wrong products, see https://github.com/pydna-group/pydna/issues/426", "UserWarning");
  }
  if (!x.circular && x.dseq.rightOvhg !== 0) cutsX.push(getRightEndAsCutsite(x.dseq));
  if (!y.circular && y.dseq.leftOvhg !== 0) cutsY.push(getLeftEndAsCutsite(y.dseq));

  const matches: Overlap[] = [];
  for (const cutX of cutsX) {
    for (const cutY of cutsY) {
      if (allowBlunt && cutX.ovhg === 0 && cutY.ovhg === 0) {
        matches.push([cutX.watson, cutY.watson, 0]);
        continue;
      }
      const overlap = sumIsSticky(endsFromCutsite(cutX, x.dseq)[0], endsFromCutsite(cutY, y.dseq)[1], partial);
      if (overlap === 0) continue;
      const [watsonX, crickX, ovhgX] = getCutParameters(x.dseq, cutX, false);
      const [watsonY, crickY, ovhgY] = getCutParameters(y.dseq, cutY, true);
      // Where the shared stretch starts on each, which for a partial join is short of the whole overhang.
      const startX = ((ovhgX ?? 0) < 0 ? watsonX : crickX) + Math.abs(ovhgX ?? 0) - overlap;
      const startY = (ovhgY ?? 0) < 0 ? watsonY : crickY;
      matches.push([startX, startY, overlap]);
    }
  }
  return matches;
}
