/** GC content and GC skew (Biopython's `gc_fraction`, `GC123`, `GC_skew`). */

import { ValueError, ZeroDivisionError, pyStr, pySum } from "@biolibs/core";
import { asText, rangeStarts, type SeqLike } from "./args.js";

/** Fraction of G or C for each IUPAC ambiguity code when `ambiguous="weighted"`. */
const GC_VALUES: Record<string, number> = {
  G: 1.0, C: 1.0, A: 0.0, T: 0.0, U: 0.0, S: 1.0, W: 0.0, M: 0.5, R: 0.5, Y: 0.5, K: 0.5,
  V: 2 / 3, B: 2 / 3, H: 1 / 3, D: 1 / 3, X: 0.5, N: 0.5,
};

/** How many times the single character `ch` occurs in `text`. */
function count(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n++;
  return n;
}

/** Total occurrences of every character of `chars`. */
const countAny = (text: string, chars: string): number => [...chars].reduce((n, ch) => n + count(text, ch), 0);

/**
 * Fraction of a sequence that is G, C or S (strong), case-insensitively.
 *
 * @param seq - DNA/RNA text, `Seq` or `MutableSeq`.
 * @param ambiguous - `"remove"` (default) ignores ambiguity codes in the denominator; `"ignore"` counts them as non-GC;
 *   `"weighted"` counts each as the fraction of its possible bases that are G or C.
 * @returns A value from 0 to 1 (`0` for a sequence with no countable bases).
 * @throws {@link ValueError} for any other `ambiguous`.
 * @example
 * ```ts
 * gcFraction("ACTG");              // 0.5
 * gcFraction("ACTGN", "weighted"); // 0.5
 * ```
 */
export function gcFraction(seq: SeqLike, ambiguous: "weighted" | "remove" | "ignore" = "remove"): number {
  if (ambiguous !== "weighted" && ambiguous !== "remove" && ambiguous !== "ignore") throw new ValueError(`ambiguous value '${pyStr(ambiguous)}' not recognized`);
  const text = asText(seq);
  let gc = countAny(text, "CGScgs");
  const length = ambiguous === "remove" ? gc + countAny(text, "ATWUatwu") : text.length;
  if (ambiguous === "weighted") {
    gc += pySum([..."BDHKMNRVXY"].map((x) => (count(text, x) + count(text, x.toLowerCase())) * GC_VALUES[x]!));
  }
  if (length === 0) return 0;
  return gc / length;
}

/**
 * GC percentage of a coding sequence overall and at each codon position.
 *
 * @param seq - DNA text or sequence.
 * @returns `[overall, position1, position2, position3]`, each in percent.
 * @throws {@link ZeroDivisionError} for a sequence with none of A, C, G, T.
 * @example
 * ```ts
 * gc123("ggggaaacccttt");   // [46.15..., 50, 33.33..., 50]
 * ```
 */
export function gc123(seq: SeqLike): [number, number, number, number] {
  const text = asText(seq, "len");
  const d: Record<string, number[]> = { A: [0, 0, 0], T: [0, 0, 0], G: [0, 0, 0], C: [0, 0, 0] };
  for (let i = 0; i < text.length; i += 3) {
    let codon = text.slice(i, i + 3);
    if (codon.length < 3) codon += "  "; // pad a short final codon so every position can be read
    for (let pos = 0; pos < 3; pos++) {
      for (const nt of "ATGC") if (codon[pos] === nt || codon[pos] === nt.toLowerCase()) d[nt]![pos]!++;
    }
  }
  const gc: number[] = [];
  let gcall = 0;
  let nall = 0;
  for (let i = 0; i < 3; i++) {
    const n = d.G![i]! + d.C![i]! + d.T![i]! + d.A![i]!;
    gc[i] = n === 0 ? 0 : ((d.G![i]! + d.C![i]!) * 100.0) / n;
    gcall += d.G![i]! + d.C![i]!;
    nall += n;
  }
  if (nall === 0) throw new ZeroDivisionError();
  return [(100.0 * gcall) / nall, gc[0]!, gc[1]!, gc[2]!];
}

/**
 * GC skew, `(G - C) / (G + C)`, in consecutive windows.
 *
 * @param seq - DNA text or sequence.
 * @param window - Window size (default 100). A window with no G or C gives 0.
 * @returns One value per window.
 * @throws {@link ValueError} if `window` is 0; TypeError if it is not an integer.
 * @example
 * ```ts
 * gcSkew("GGGCCCAC", 4);   // [0.5, -1]
 * ```
 */
export function gcSkew(seq: SeqLike, window = 100): number[] {
  const text = asText(seq, "len");
  return rangeStarts(text.length, window).map((i) => {
    const s = text.slice(i, i + window);
    const g = count(s, "G") + count(s, "g");
    const c = count(s, "C") + count(s, "c");
    return g + c === 0 ? 0.0 : (g - c) / (g + c);
  });
}
