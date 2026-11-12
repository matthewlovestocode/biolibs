/** Local composition complexity (Biopython's `Bio.SeqUtils.lcc`). */

import { IndexError, pyTypeName } from "@biolibs/core";
import { asText, type SeqLike } from "./args.js";

/** Python `s[i]`: throws instead of returning `undefined`. */
function at(s: string, i: number): string {
  if (i >= s.length || i < -s.length) throw new IndexError("string index out of range");
  return s[i < 0 ? s.length + i : i]!;
}

const count = (s: string, ch: string): number => [...s].filter((c) => c === ch).length;

/**
 * Local composition complexity in a sliding window, one value per window position.
 *
 * @param seq - DNA text or sequence.
 * @param wsize - Window length.
 * @returns The complexity of each window (letters other than A, C, G, T make a window repeat or be skipped, as in Biopython).
 * @throws {@link IndexError} for an empty sequence or window.
 * @example
 * ```ts
 * lccMult("ACGTGGGTAA", 4).length;   // 7
 * ```
 */
export function lccMult(seq: SeqLike, wsize: number): number[] {
  const l4 = Math.log(4);
  const text = asText(seq, "upper").toUpperCase();
  const tamseq = text.length;
  if (typeof wsize !== "number" || !Number.isInteger(wsize)) throw new TypeError(`'${pyTypeName(wsize)}' object cannot be interpreted as an integer`);
  const compone: number[] = [0];
  const lccsal: number[] = [];
  for (let i = 0; i < wsize; i++) compone.push((((i + 1) / wsize) * Math.log((i + 1) / wsize)) / l4);
  let window = text.slice(0, wsize);
  const cant: Record<string, number> = { A: count(window, "A"), C: count(window, "C"), T: count(window, "T"), G: count(window, "G") };
  /** Index into `compone` as Python would (negative counts wrap around, out of range raises). */
  const comp = (n: number): number => {
    const v = compone[n < 0 ? compone.length + n : n];
    if (v === undefined) throw new IndexError("list index out of range");
    return v;
  };
  const term: Record<string, number> = { A: comp(cant.A!), C: comp(cant.C!), T: comp(cant.T!), G: comp(cant.G!) };
  const total = (): number => -(term.A! + term.C! + term.T! + term.G!);
  lccsal.push(total());
  let tail = at(text, 0);
  for (let x = 0; x < tamseq - wsize; x++) {
    window = text.slice(x + 1, wsize + x + 1);
    if (tail === at(window, -1)) {
      lccsal.push(lccsal[lccsal.length - 1]!);
    } else if (tail === "A" || tail === "C" || tail === "T" || tail === "G") {
      cant[tail]! -= 1;
      // The new last letter gains one; only the two counts that changed are re-read, as in Biopython.
      for (const added of "ACTG") {
        if (added !== tail && window.endsWith(added)) {
          cant[added]! += 1;
          term[tail] = comp(cant[tail]!);
          term[added] = comp(cant[added]!);
          lccsal.push(total());
          break;
        }
      }
    }
    tail = at(window, 0);
  }
  return lccsal;
}

/**
 * Local composition complexity of a whole sequence.
 *
 * @param seq - DNA text or sequence.
 * @returns A value from 0 (one letter only) to 1 (equal A, C, G, T).
 * @example
 * ```ts
 * lccSimp("ACGATAGC");   // 0.9575...
 * ```
 */
export function lccSimp(seq: SeqLike): number {
  const text0 = asText(seq, "len");
  const wsize = text0.length;
  const text = text0.toUpperCase();
  const l4 = Math.log(4);
  const termFor = (ch: string): number => {
    if (!text.includes(ch)) return 0;
    const n = count(text, ch);
    return ((n / wsize) * Math.log(n / wsize)) / l4;
  };
  return -(termFor("A") + termFor("C") + termFor("T") + termFor("G"));
}
