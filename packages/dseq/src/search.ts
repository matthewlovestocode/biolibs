/**
 * Looking inside a molecule and joining molecules up: pydna's `find`, `__contains__` and `join`.
 *
 * The search runs over the dscode string rather than either strand, which is what pydna searches, so for
 * a fully double-stranded molecule it reads as a search of the upper strand and for one with overhangs
 * it is a search of the code. A circular molecule is searched round its origin.
 */

import { circularFind } from "./circular.js";
import { Dseq } from "./dseq.js";

/**
 * Where a stretch first occurs.
 *
 * @param d - The molecule. @param sub - What to look for. @param start - Where to start looking.
 * @param end - Where to stop; pydna computes this and then does not use it, so neither does this.
 * @returns The position, or -1. A circular molecule is searched round its origin, so a stretch that
 *   straddles it is found.
 */
export function find(d: Dseq, sub: string, start = 0, end?: number): number {
  void end;
  if (d.circular) return circularFind(d.code, sub, start);
  return d.code.indexOf(sub, start);
}

/**
 * @param d - The molecule. @param sub - What to look for.
 * @returns Whether it occurs, which is what `in` asks.
 */
export const contains = (d: Dseq, sub: string): boolean => find(d, sub) !== -1;

/**
 * Join molecules with this one between them, as `str.join` joins strings with a separator.
 *
 * @param separator - The molecule to put between the others. @param fragments - The molecules to join.
 * @returns The joined molecule, or an empty one when there is nothing to join.
 * @throws TypeError when two ends do not pair, which is what the ligation refuses.
 */
export function join(separator: Dseq, fragments: Iterable<Dseq>): Dseq | string {
  const it = [...fragments];
  if (it.length === 0) return new Dseq("");
  let result: Dseq | string = it[0]!;
  for (const fragment of it.slice(1)) {
    result = (result as Dseq).add(separator);
    result = (result as Dseq).add(fragment);
  }
  return result;
}
