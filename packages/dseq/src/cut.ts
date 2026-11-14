/**
 * Cutting a double-stranded molecule with restriction enzymes: pydna's `Dseq.cut` and what it is built on.
 *
 * A cut is a position on the upper strand together with the enzyme's overhang, which is enough to place
 * the break on both strands. The fragments then follow from taking each neighbouring pair of cuts — with
 * the two ends standing in for a missing cut on a linear molecule, and the first cut used twice on a
 * circular one — and reading the two strands between them.
 *
 * These are free functions rather than methods so that `Dseq` itself does not have to know about
 * enzymes, which keeps the two files from importing each other.
 */

import { ValueError } from "@biolibs/core";
import { RestrictionBatch, RestrictionType } from "@biolibs/restriction";
import { Seq } from "@biolibs/seq";
import { Dseq } from "./dseq.js";
import { toWatson } from "./alphabet.js";

/**
 * Where a molecule is cut: the position on the upper strand, the enzyme's overhang, and the enzyme.
 *
 * The enzyme is null for the cut that stands in for one of a linear molecule's own ends.
 */
export interface CutSite {
  /** Where the upper strand is cut, counted from the molecule's start. */
  watson: number;
  /** How far the lower strand's cut is from the upper one: negative for a 5' overhang. */
  ovhg: number | null;
  /** The enzyme that cuts there, or null for an end of the molecule. */
  enzyme: RestrictionType | null;
}

/** Anything that can be given where enzymes are wanted: one, several, or a batch of them. */
export type Enzymes = RestrictionType | RestrictionBatch | readonly (RestrictionType | RestrictionBatch)[];

/**
 * Flatten the enzyme arguments, as pydna's `flatten` does: one enzyme, a batch, or any nesting of either.
 *
 * @param enzymes - What the caller passed.
 * @param dedupe - Drop repeats, keeping the first of each. True for finding cut sites, where pydna passes
 *   the list through `dict.fromkeys`; **false** for counting them, where `number_of_cuts` uses the flat
 *   list as it comes, so naming an enzyme twice counts its sites twice.
 * @returns The enzymes, in the order they were seen.
 */
export function enzymeList(enzymes: readonly Enzymes[], dedupe = true): RestrictionType[] {
  const out: RestrictionType[] = [];
  const walk = (item: Enzymes): void => {
    if (item instanceof RestrictionType) out.push(item);
    else for (const inner of item as Iterable<RestrictionType | RestrictionBatch>) walk(inner);
  };
  for (const item of enzymes) walk(item);
  return dedupe ? out.filter((e, i) => out.indexOf(e) === i) : out;
}

/**
 * The position of each strand's cut, and the overhang between them.
 *
 * @param d - The molecule. @param cut - The cut, or null for one of the molecule's own ends.
 * @param isLeft - Which end a null cut stands for.
 * @returns The upper strand's position, the lower strand's, and the overhang.
 * @throws TypeError for a single-stranded molecule, whose ends have no overhang to compare — Python
 *   compares `None` with a number and gives up.
 */
export function getCutParameters(d: Dseq, cut: CutSite | null, isLeft: boolean): [number, number, number | null] {
  if (cut !== null) {
    const watson = cut.watson;
    let crick = watson - (cut.ovhg ?? 0);
    if (d.circular) crick = ((crick % d.length) + d.length) % d.length;
    return [watson, crick, cut.ovhg];
  }
  if (isLeft) {
    const [watson, crick] = leftEndPosition(d);
    return [watson, crick, d.ovhg];
  }
  // At the right end the overhang does not matter to the caller.
  const [watson, crick] = rightEndPosition(d);
  return [watson, crick, d.watsonOvhg];
}

/**
 * @param d - A molecule.
 * @returns Where each strand starts at the left end.
 * @throws TypeError for a single strand, which has no overhang.
 */
export function leftEndPosition(d: Dseq): [number, number] {
  const ovhg = requireOvhg(d.ovhg, ">");
  // `+ 0` so that negating a zero overhang gives 0 and not -0, which Python has no notion of.
  return ovhg > 0 ? [ovhg, 0] : [0, -ovhg + 0];
}

/**
 * @param d - A molecule.
 * @returns Where each strand ends at the right end.
 * @throws TypeError for a single strand, which has no overhang.
 */
export function rightEndPosition(d: Dseq): [number, number] {
  const ovhg = requireOvhg(d.watsonOvhg, "<");
  return ovhg < 0 ? [d.length + ovhg, d.length] : [d.length, d.length - ovhg];
}

/**
 * @param ovhg - An overhang. @param operator - Which comparison the caller was about to make.
 * @returns The overhang.
 * @throws TypeError when it is null, with the message Python gives for comparing `None` with a number.
 */
function requireOvhg(ovhg: number | null, operator: ">" | "<"): number {
  if (ovhg === null) {
    throw new TypeError(`'${operator}' not supported between instances of 'NoneType' and 'int'`);
  }
  return ovhg;
}

/**
 * Whether a cut falls inside a stretch that is double stranded, with its whole recognition site present.
 *
 * A cut found on the blunt reading of the molecule can still be impossible: the site may lie across a
 * single-stranded end, or the overhang the enzyme would leave may not be there to leave. An enzyme that
 * cuts twice gets a second chance against its other recognition site.
 *
 * @param d - The molecule. @param cut - The cut to check.
 * @returns Whether the molecule can really be cut there.
 */
export function cutsiteIsValid(d: Dseq, cut: CutSite): boolean {
  const enzyme = cut.enzyme;
  const [watson, crick, ovhg] = getCutParameters(d, cut, true);
  const overhang = (ovhg ?? 0) < 0 ? d.slice(watson, crick) : d.slice(crick, watson);
  if (overhang.ovhg !== 0 || overhang.watsonOvhg !== 0) return false;
  if (siteIsWhole(d, watson, enzyme?.fst5 ?? null, enzyme?.size ?? 0)) return true;
  // An enzyme that cuts twice may be here for its second site.
  if (enzyme === null || enzyme.scd5 === null) return false;
  return siteIsWhole(d, watson, enzyme.scd5, enzyme.size);
}

/**
 * Whether the recognition site at a given offset from a cut is present and double stranded.
 *
 * @param d - The molecule. @param watson - Where the upper strand is cut.
 * @param offset - How far the site starts before that cut. @param size - The site's length.
 * @returns Whether it is all there.
 */
function siteIsWhole(d: Dseq, watson: number, offset: number | null, size: number): boolean {
  let start = watson - (offset ?? 0);
  if (start < 0) start += d.length;
  let end = start + size;
  if (d.circular) end %= d.length;
  const site = d.slice(start, end);
  return site.length !== 0 && site.ovhg === 0 && site.watsonOvhg === 0;
}

/**
 * Every place the given enzymes can cut this molecule.
 *
 * @param d - The molecule. @param enzymes - The enzymes, as one, several or a batch.
 * @returns The cuts, in order along the molecule; ties on position go to the enzyme with the shorter
 *   recognition site and then the earlier name, which is how Biopython orders enzymes.
 */
export function getCutsites(d: Dseq, ...enzymes: Enzymes[]): CutSite[] {
  const out: CutSite[] = [];
  for (const enzyme of enzymeList(enzymes)) {
    // Biopython reports 1-based positions on the blunt reading of the molecule.
    for (const position of enzyme.search(new Seq(d.toString()), !d.circular)) {
      out.push({ watson: position - 1, ovhg: enzyme.ovhg, enzyme });
    }
  }
  return out.filter((cut) => cutsiteIsValid(d, cut)).sort((a, b) =>
    a.watson - b.watson || (a.ovhg ?? 0) - (b.ovhg ?? 0)
    || (a.enzyme && b.enzyme ? RestrictionType.compare(a.enzyme, b.enzyme) : 0));
}

/**
 * Whether two cuts cross each other, which would make the fragment between them impossible.
 *
 * @param left - One cut. @param right - The other. @param length - The molecule's length.
 * @returns Whether the stretches the two cuts span overlap.
 */
export function cutsOverlap(left: CutSite | null, right: CutSite | null, length: number): boolean {
  if (left === null || right === null) return false;
  if (left.watson === right.watson && left.ovhg === right.ovhg && left.enzyme === right.enzyme) return false;
  const mod = (x: number): number => ((x % length) + length) % length;
  /** The stretch a cut spans, from the earlier strand's break to the later one's. */
  const bounds = (cut: CutSite): [number, number] => {
    const watson = mod(cut.watson), crick = mod(cut.watson - (cut.ovhg ?? 0));
    return (cut.ovhg ?? 0) > 0 ? [crick, watson] : [watson, crick];
  };
  /** A stretch, split in two where it crosses the origin. */
  const segments = ([start, end]: [number, number]): [number, number][] =>
    start <= end ? [[start, end]] : [[start, end + length], [start - length, end]];
  for (const a of segments(bounds(left))) {
    for (const b of segments(bounds(right))) {
      if (a[0] < b[1] && a[1] > b[0]) return true;
    }
  }
  return false;
}

/**
 * The fragment between two cuts.
 *
 * @param d - The molecule. @param leftCut - The cut at its left, or null for the molecule's own end.
 * @param rightCut - The cut at its right, or null for its own end.
 * @param allowOverlap - Build the fragment even when the two cuts cross.
 * @returns The fragment, with the ends the two cuts leave.
 * @throws ValueError when the cuts cross and `allowOverlap` is not set.
 */
export function applyCut(d: Dseq, leftCut: CutSite | null, rightCut: CutSite | null, allowOverlap = false): Dseq {
  if (!allowOverlap && cutsOverlap(leftCut, rightCut, d.length)) {
    throw new ValueError(`Cuts by ${String(leftCut?.enzyme)} ${String(rightCut?.enzyme)} overlap.`);
  }
  const [leftWatson, leftCrick, ovhgLeft] = getCutParameters(d, leftCut, true);
  const [rightWatson, rightCrick] = getCutParameters(d, rightCut, false);
  return new Dseq(
    toWatson(d.slice(leftWatson, rightWatson).code),
    toWatson(d.slice(leftCrick, rightCrick).reverseComplement().code),
    ovhgLeft,
  );
}

/**
 * Pair the cuts up so that each pair spans one fragment.
 *
 * @param d - The molecule. @param cutsites - The cuts, in order.
 * @returns The pairs: a linear molecule's own two ends stand in at either side, and a circular one's
 *   first cut is used again at the end to close the last fragment.
 */
export function getCutsitePairs(d: Dseq, cutsites: readonly CutSite[]): [CutSite | null, CutSite | null][] {
  if (cutsites.length === 0) return [];
  const list: (CutSite | null)[] = d.circular
    ? [...cutsites, cutsites[0]!]
    : [null, ...cutsites, null];
  return list.slice(0, -1).map((cut, i) => [cut, list[i + 1]!]);
}

/**
 * Cut a molecule with enzymes.
 *
 * @param d - The molecule. @param enzymes - The enzymes, as one, several or a batch.
 * @returns The fragments, in order along the molecule; nothing at all when no enzyme cuts.
 */
export function cut(d: Dseq, ...enzymes: Enzymes[]): Dseq[] {
  return getCutsitePairs(d, getCutsites(d, ...enzymes)).map(([left, right]) => applyCut(d, left, right));
}

/**
 * @param d - A molecule.
 * @returns Its left end written as a cut, so that it can stand in for one.
 * @throws ValueError for a circular molecule, which has no ends, and TypeError for a single strand,
 *   which has no overhang to compare.
 */
export function getLeftEndAsCutsite(d: Dseq): CutSite {
  if (d.circular) throw new ValueError("Circular sequences do not have a left end");
  const ovhg = requireOvhg(d.leftOvhg, ">");
  return { watson: ovhg > 0 ? ovhg : 0, ovhg, enzyme: null };
}

/**
 * @param d - A molecule.
 * @returns Its right end written as a cut.
 * @throws ValueError for a circular molecule, which has no ends, and TypeError for a single strand.
 */
export function getRightEndAsCutsite(d: Dseq): CutSite {
  if (d.circular) throw new ValueError("Circular sequences do not have a right end");
  const ovhg = requireOvhg(d.rightOvhg, ">");
  return { watson: ovhg > 0 ? d.length : d.length + ovhg, ovhg, enzyme: null };
}

/**
 * The enzymes of a batch that cut this molecule a given number of times.
 *
 * pydna searches the molecule as a linear one here whatever its topology, because it leaves Biopython's
 * `linear` argument at its default — so a circular molecule's counts miss a site that straddles the
 * origin, even though `getCutsites` finds it. That is reproduced.
 *
 * @param d - The molecule. @param batch - The enzymes to try.
 * @param times - How many cuts an enzyme must make, or null for any number above zero.
 * @returns A batch of the enzymes that qualify.
 */
export function cuttersBy(d: Dseq, batch: RestrictionBatch, times: number | null): RestrictionBatch {
  const out = new RestrictionBatch();
  for (const [enzyme, sites] of batch.search(new Seq(d.toString()))) {
    if (times === null ? sites.length > 0 : sites.length === times) out.addNocheck(enzyme);
  }
  return out;
}
