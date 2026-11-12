/** Six-frame translation display (Biopython's `six_frame_translations`). */

import { pyFormatFixed } from "@biolibs/core";
import { MutableSeq, Seq, reverseComplement, reverseComplementRna, translate } from "@biolibs/seq";
import { asText, type SeqLike } from "./args.js";
import { gcFraction } from "./gc.js";

const reverse = (s: string): string => [...s].reverse().join("");
const count = (s: string, ch: string): number => [...s].filter((c) => c === ch).length;
/** Python `'%5d' % n`: right-aligned in five columns. */
const pad5 = (n: number): string => String(n).padStart(5, " ");

/**
 * Render the six reading frames of a nucleotide sequence as text, 60 bases per block with the
 * translations above and below, plus a GC header.
 *
 * @param seq - DNA or RNA text or sequence.
 * @param geneticCode - NCBI table id or name. Default 1.
 * @returns The formatted report (a `Seq`/`MutableSeq` holding it if one was passed in and is not empty, as in Biopython).
 * @example
 * ```ts
 * sixFrameTranslations("AUGGCCAUUGUAAUGGGCCGC").split("\n")[0];   // "GC_Frame: a:4 t:0 g:7 c:4"
 * ```
 */
export function sixFrameTranslations(seq: SeqLike, geneticCode: number | string = 1): SeqLike {
  const text = asText(seq, "lower");
  const anti = text.toLowerCase().includes("u") ? reverseComplementRna(text) : reverseComplement(text);
  const comp = reverse(anti);
  const length = text.length;
  const frames: Record<number, string> = {};
  for (let i = 0; i < 3; i++) {
    const fragmentLength = 3 * Math.floor((length - i) / 3);
    frames[i + 1] = translate(text.slice(i, i + fragmentLength), geneticCode);
    frames[-(i + 1)] = reverse(translate(anti.slice(i, i + fragmentLength), geneticCode));
  }
  const short = length > 20 ? `${text.slice(0, 10)} ... ${text.slice(-10)}` : text;
  let header = "GC_Frame:";
  for (const nt of "atgc") header += ` ${nt}:${count(text, nt.toUpperCase())}`;
  const gc = 100 * gcFraction(text, "ignore");
  header += `\nSequence: ${short.toLowerCase()}, ${length} nt, ${pyFormatFixed(gc, 2)} %GC\n\n\n`;
  let res = header;
  const row = (frame: number, p: number): string => [...frames[frame]!.slice(p, p + 20)].join("  ");
  for (let i = 0; i < length; i += 60) {
    const subseq = text.slice(i, i + 60);
    const csubseq = comp.slice(i, i + 60);
    const p = Math.floor(i / 3);
    res += `${i + 1}/${Math.trunc(i / 3 + 1)}\n`;
    res += "  " + row(3, p) + "\n";
    res += " " + row(2, p) + "\n";
    res += row(1, p) + "\n";
    res += subseq.toLowerCase() + pad5(Math.trunc(gc)) + " %\n";
    res += csubseq.toLowerCase() + "\n";
    res += row(-2, p) + "\n";
    res += " " + row(-1, p) + "\n";
    res += "  " + row(-3, p) + "\n\n";
  }
  // Appending a block to the header makes Python's `str + Seq` return a Seq (or MutableSeq), so a sequence input gets one back.
  if (length > 0 && seq instanceof Seq) return new Seq(res);
  if (length > 0 && seq instanceof MutableSeq) return new MutableSeq(res);
  return res;
}
