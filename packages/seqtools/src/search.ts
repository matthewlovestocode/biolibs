/** Ambiguity-aware nucleotide search (Biopython's `nt_search`). */

import { KeyError, RuntimeError, pyTypeName } from "@biolibs/core";
import { IUPACData, MutableSeq, Seq } from "@biolibs/seq";
import { asText, type SeqLike } from "./args.js";

/**
 * Find every position where `subseq` (which may contain IUPAC ambiguity codes) matches `seq`, overlaps included.
 *
 * @param seq - The DNA text to search.
 * @param subseq - The pattern; each letter must be an upper-case IUPAC DNA code.
 * @returns The regular expression built from the pattern, then each 0-based start position.
 * @throws {@link KeyError} for a letter that is not an IUPAC DNA code.
 * @throws {@link RuntimeError} for an empty pattern (Biopython would loop forever).
 * @example
 * ```ts
 * ntSearch("ACGTGGAGAGATGAT", "GRG");   // ["G[AG]G", 5, 7]
 * ```
 */
export function ntSearch(seq: SeqLike, subseq: SeqLike): [string, ...number[]] {
  const pattern = [...asText(subseq, "iter")]
    .map((nt) => {
      const value = IUPACData.ambiguousDnaValues[nt];
      if (value === undefined || !Object.hasOwn(IUPACData.ambiguousDnaValues, nt)) throw new KeyError(nt);
      return value.length === 1 ? value : `[${value}]`;
    })
    .join("");
  // Python slices the sequence and hands it to `re.search`, which only takes text.
  if (typeof seq !== "string") {
    if (seq instanceof Seq || seq instanceof MutableSeq) throw new TypeError(`expected string or bytes-like object, got '${pyTypeName(seq)}'`);
    asText(seq, "subscript");
  }
  if (pattern === "") throw new RuntimeError("nt_search with an empty subsequence never terminates in Biopython");
  const text = seq as string;
  const re = new RegExp(pattern);
  const result: [string, ...number[]] = [pattern];
  let pos = -1;
  for (;;) {
    pos += 1;
    const m = re.exec(text.slice(pos));
    if (!m) break;
    pos += m.index;
    result.push(pos);
  }
  return result;
}
