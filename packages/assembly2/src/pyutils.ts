/**
 * Small things pydna keeps in `pydna.utils` that the engine needs, and the list manipulations it does
 * on an assembly.
 */

import { ValueError } from "@biolibs/core";
import { reverseComplement } from "@biolibs/seq";

/** One end of a molecule: whether it is blunt or which strand hangs over, and the overhanging bases. */
export type End = [kind: string, overhang: string];

/**
 * Whether the right-hand end of one molecule and the left-hand end of the next will stick together, and
 * over how many bases.
 *
 * With `partial` the ends need not match over their whole length: the longest run where the one's tail
 * is the other's head counts. That can join molecules whose overhangs are of different lengths.
 *
 * @param threePrime - The right-hand end of the first molecule.
 * @param fivePrime - The left-hand end of the second.
 * @param partial - Whether a part of each overhang may do.
 * @returns How many bases hold them together; 0 if nothing does.
 * @example
 * ```ts
 * sumIsSticky(["5'", "aatt"], ["5'", "aatt"]);        // 4
 * sumIsSticky(["5'", "aatt"], ["5'", "aat"], true);   // 3
 * sumIsSticky(["blunt", ""], ["blunt", ""]);          // 0
 * ```
 */
export function sumIsSticky(threePrime: End, fivePrime: End, partial = false): number {
  const [kind1, overhang1] = threePrime;
  const [kind2, overhang2] = fivePrime;
  if (kind2 !== "blunt" && kind2 === kind1 && overhang2 === reverseComplement(overhang1)) return overhang1.length;
  if (!partial) return 0;
  if (kind1 !== kind2 || kind2 === "blunt") return 0;
  // One of the two is flipped so that the question becomes whether one's tail is the other's head.
  const first = kind2 === "5'" ? reverseComplement(overhang1) : overhang1;
  const second = kind2 === "3'" ? reverseComplement(overhang2) : overhang2;
  for (let length = Math.min(first.length, second.length); length >= 1; length--) {
    if (first.slice(first.length - length) === second.slice(0, length)) return length;
  }
  return 0;
}

/**
 * Python's `deduplicate`: the items with later repeats left out, in the order they first appeared.
 *
 * @param items - The items.
 * @param same - When two items count as the same. Identity and value equality by default.
 * @returns The first of each.
 * @example
 * ```ts
 * deduplicate([1, 2, 1, 3]);   // [1, 2, 3]
 * ```
 */
export function deduplicate<T>(items: Iterable<T>, same?: (a: T, b: T) => boolean): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const seen = same === undefined ? kept.includes(item) : kept.some((other) => same(other, item));
    if (!seen) kept.push(item);
  }
  return kept;
}

/**
 * Whether one list appears inside another, run together and in order.
 *
 * @param part - The shorter list.
 * @param whole - The longer one.
 * @param cyclic - Whether the longer one is a ring, so that a run may pass its end.
 * @param same - When two items count as the same. Value equality by default.
 * @returns Whether it appears.
 * @example
 * ```ts
 * isSublist([3, 1], [1, 2, 3]);         // false
 * isSublist([3, 1], [1, 2, 3], true);   // true
 * ```
 */
export function isSublist<T>(part: readonly T[], whole: readonly T[], cyclic = false, same: (a: T, b: T) => boolean = Object.is): boolean {
  const list = cyclic ? [...whole, ...whole] : whole;
  for (let at = 0; at + part.length <= list.length; at++) {
    let matches = true;
    for (let i = 0; i < part.length; i++) {
      if (!same(list[at + i]!, part[i]!)) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/**
 * Turn a ring so that the item nearest zero comes first.
 *
 * A cycle of fragments has no beginning, so one is chosen, the same way every time.
 *
 * @param items - The ring.
 * @returns It, turned.
 * @throws `ValueError` for an empty ring, as Python's `min` refuses one.
 * @example
 * ```ts
 * circularPermutationMinAbs([3, 1, 2]);   // [1, 2, 3]
 * ```
 */
export function circularPermutationMinAbs(items: readonly number[]): number[] {
  if (items.length === 0) throw new ValueError("min() iterable argument is empty");
  let at = 0;
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i]!) < Math.abs(items[at]!)) at = i;
  }
  return [...items.slice(at), ...items.slice(0, at)];
}
