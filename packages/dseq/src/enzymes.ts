/**
 * What the end-modifying enzymes do to a molecule's ends: pydna's `fill_in`, `T4` and the nibbles.
 *
 * These are the enzymes a cloning protocol reaches for between a digest and a ligation — a polymerase
 * filling a recessed 3' end in, T4 DNA polymerase bringing both ends to blunt, an exonuclease chewing one
 * strand back, terminal transferase adding a tail, USER excising uracils. Each is a small change to the
 * dscode string, which is why they read as translations of it.
 *
 * They are free functions for the same reason the cutting ones are: the molecule does not need to know
 * about them.
 */

import { COMPLEMENT, TO_CRICK_TAIL, TO_WATSON_TAIL } from "./data/dscode.js";
import { reverseComplementCode, toCrick, toWatson, translateCode } from "./alphabet.js";
import { Dseq } from "./dseq.js";

/** The bases a polymerase is given when the caller does not say, which is all of them. */
const ALL_NUCLEOTIDES = "GATCRYWSMKHBVDN";

/**
 * The bases an enzyme has to work with, in both cases.
 *
 * The two enzymes disagree about an empty string: `fill_in` only treats `None` as "all of them", so an
 * empty string leaves it nothing to add, while `T4` tests for falsiness and so takes an empty string as
 * all of them. Both are kept.
 *
 * @param nucleotides - What the caller asked for.
 * @param emptyMeansAll - Whether an empty string stands for every base.
 * @returns The set to work with.
 */
function nucleotideSet(nucleotides: string | null | undefined, emptyMeansAll: boolean): Set<string> {
  const missing = nucleotides === null || nucleotides === undefined || (emptyMeansAll && nucleotides === "");
  const letters = missing ? ALL_NUCLEOTIDES : nucleotides;
  return new Set([...letters.toLowerCase(), ...letters.toUpperCase()]);
}

/**
 * How far a recessed end can be filled in: the overhang's bases, up to the first one not on offer.
 *
 * @param overhang - The overhang's bases. @param nucleotides - The bases available.
 * @returns The stretch that can be added.
 */
function stuffer(overhang: string, nucleotides: Set<string>): string {
  let out = "";
  for (const base of reverseComplementCode(overhang)) {
    if (!nucleotides.has(base)) break;
    out += base;
  }
  return out;
}

/**
 * The lower strand after filling in the left end, with the overhang that leaves.
 *
 * @param d - The molecule. @param nucleotides - The bases available.
 * @returns The new lower strand and the new left overhang.
 * @throws TypeError for a single strand, which has no overhang to add to — Python adds a number to
 *   `None` and gives up.
 */
function fillInLeft(d: Dseq, nucleotides: Set<string>): [string, number] {
  const [type, overhang] = d.fivePrimeEnd();
  const added = type === "5'" ? stuffer(overhang, nucleotides) : "";
  if (d.ovhg === null) throw new TypeError("unsupported operand type(s) for +: 'NoneType' and 'int'");
  return [d.crick + added, d.ovhg + added.length];
}

/**
 * The upper strand after filling in the right end.
 *
 * @param d - The molecule. @param nucleotides - The bases available.
 * @returns The new upper strand.
 */
function fillInRight(d: Dseq, nucleotides: Set<string>): string {
  const [type, overhang] = d.threePrimeEnd();
  return d.watson + (type === "5'" ? stuffer(overhang, nucleotides) : "");
}

/**
 * Fill both recessed 3' ends in, as Klenow or any polymerase without an exonuclease does.
 *
 * @param d - The molecule. @param nucleotides - The bases available; all of them by default.
 * @returns The molecule with its 5' overhangs made double stranded, as far as the bases allow.
 */
export function fillIn(d: Dseq, nucleotides: string | null = null): Dseq {
  const set = nucleotideSet(nucleotides, false);
  const [crick, ovhg] = fillInLeft(d, set);
  return new Dseq(fillInRight(d, set), crick, ovhg);
}

/** The same as {@link fillIn}, under pydna's other name for it. */
export const klenow = fillIn;

/**
 * Bring both ends to blunt, as T4 DNA polymerase does: a 5' overhang is filled in, a 3' overhang is
 * chewed back, and whatever is left over at either end is trimmed to the last base that is on offer.
 *
 * @param d - The molecule. @param nucleotides - The bases available; all of them by default.
 * @returns The blunted molecule.
 */
export function t4(d: Dseq, nucleotides: string | null = null): Dseq {
  const set = nucleotideSet(nucleotides, true);
  const [leftType, leftOverhang] = d.fivePrimeEnd();
  let crick: string;
  let ovhg: number;
  if (leftType === "5'") {
    [crick, ovhg] = fillInLeft(d, set);
  } else {
    ovhg = 0;
    crick = leftType === "3'" ? d.crick.slice(0, -leftOverhang.length) : d.crick;
  }
  // Both strands are then trimmed back to the last base the polymerase was given.
  let x = crick.length - 1;
  while (x >= 0 && !set.has(crick[x]!)) x -= 1;
  ovhg = x - crick.length + 1 + ovhg;
  crick = crick.slice(0, x + 1);
  if (crick === "") ovhg = 0;
  const [rightType, rightOverhang] = d.threePrimeEnd();
  let watson = d.watson;
  if (rightType === "5'") watson = fillInRight(d, set);
  else if (rightType === "3'") watson = d.watson.slice(0, -rightOverhang.length);
  let y = watson.length - 1;
  while (y >= 0 && !set.has(watson[y]!)) y -= 1;
  watson = watson.slice(0, y + 1);
  return new Dseq(watson, crick, ovhg);
}

/** The same as {@link t4}, under pydna's other name for it. */
export const T4 = t4;

/**
 * Throw both single-stranded ends away, as mung bean nuclease does.
 *
 * @param d - The molecule.
 * @returns What was double stranded, and nothing else.
 */
export function nibbleToBlunt(d: Dseq): Dseq {
  return new Dseq(d.getParts().middle);
}

/** The same as {@link nibbleToBlunt}, under pydna's other name for it. */
export const mung = nibbleToBlunt;

/**
 * Chew the upper strand back from the left end, leaving the lower strand alone.
 *
 * @param d - The molecule. @param n - How many bases to remove.
 * @returns The molecule with that much of its upper strand gone from the left.
 */
export function nibbleFivePrimeLeft(d: Dseq, n = 1): Dseq {
  const upto = n + Math.max(0, d.ovhg ?? 0);
  return new Dseq(crickTail(d.code.slice(0, upto)) + d.code.slice(upto));
}

/**
 * Chew the upper strand back from the right end.
 *
 * @param d - The molecule. @param n - How many bases to remove.
 * @returns The molecule with that much of its upper strand gone from the right.
 */
export function nibbleFivePrimeRight(d: Dseq, n = 1): Dseq {
  const ovhg = d.rightOvhg === null ? d.length : d.rightOvhg;
  const from = d.length - n - Math.max(0, ovhg);
  return new Dseq(d.code.slice(0, from) + watsonTail(d.code.slice(from)));
}

/**
 * Chew the lower strand back from the left end.
 *
 * @param d - The molecule. @param n - How many bases to remove.
 * @returns The molecule with that much of its lower strand gone from the left.
 */
export function nibbleThreePrimeLeft(d: Dseq, n = 1): Dseq {
  const ovhg = d.ovhg === null ? d.length : d.ovhg;
  const upto = n - Math.min(0, ovhg);
  return new Dseq(watsonTail(d.code.slice(0, upto)) + d.code.slice(upto));
}

/**
 * Chew the lower strand back from the right end.
 *
 * @param d - The molecule. @param n - How many bases to remove.
 * @returns The molecule with that much of its lower strand gone from the right.
 */
export function nibbleThreePrimeRight(d: Dseq, n = 1): Dseq {
  const ovhg = d.rightOvhg === null ? d.length : d.rightOvhg;
  const from = d.length - n + Math.min(0, ovhg);
  return new Dseq(d.code.slice(0, from) + crickTail(d.code.slice(from)));
}

/** The same as {@link nibbleFivePrimeLeft}, under pydna's older name for it. */
export const exo1Front = nibbleFivePrimeLeft;
/** The same as {@link nibbleFivePrimeRight}, under pydna's older name for it. */
export const exo1End = nibbleFivePrimeRight;

/**
 * Turn a stretch into lower-strand-only positions, which is what removing the upper strand comes to.
 *
 * @param code - The stretch, as dscode.
 * @returns It with only the lower strand left, and the positions that had none dropped from the front.
 */
function crickTail(code: string): string {
  const bases = translateCode(translateCode(toCrick(code), COMPLEMENT), TO_CRICK_TAIL);
  return bases.replace(/^ +/, "");
}

/**
 * Turn a stretch into upper-strand-only positions.
 *
 * @param code - The stretch, as dscode.
 * @returns It with only the upper strand left, and the positions that had none dropped from the front.
 */
function watsonTail(code: string): string {
  return translateCode(toWatson(code), TO_WATSON_TAIL).replace(/^ +/, "");
}

/**
 * Add a tail to both 3' ends, as terminal transferase does — one A by default, which is what makes a
 * fragment ready for TA cloning.
 *
 * @param d - The molecule. @param nucleotides - The bases to add.
 * @returns The molecule with the tail on both strands.
 * @throws TypeError for a single strand, which has no overhang to add to.
 */
export function terminalTransferase(d: Dseq, nucleotides = "a"): Dseq {
  const ovhg = d.ovhg;
  if (ovhg === null) {
    throw new TypeError("'>=' not supported between instances of 'NoneType' and 'int'");
  }
  return new Dseq(d.watson + nucleotides, d.crick + nucleotides, ovhg >= 0 ? ovhg + nucleotides.length : ovhg);
}

/**
 * Excise the uracils, as the USER enzyme does: every U:A pair loses its upper strand and every A:U pair
 * its lower one.
 *
 * @param d - The molecule.
 * @returns The molecule with a single-stranded gap wherever a uracil was.
 */
export function user(d: Dseq): Dseq {
  const swapped = [...d.code].map((ch) => USER_SWAP[ch] ?? ch).join("");
  return new Dseq(swapped);
}

/** What `user` puts in place of each uracil-bearing position. */
const USER_SWAP: Record<string, string> = { U: "Z", u: "z", O: "E", o: "e" };
