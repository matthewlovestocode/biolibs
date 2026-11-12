/** Conversion between one- and three-letter amino acid codes (Biopython's `seq1` and `seq3`). */

import { IUPACData } from "@biolibs/seq";
import { asText, type SeqLike } from "./args.js";

/** A mapping given as a `Map` or a plain object. */
export type CodeMap = Map<string, string> | Record<string, string>;

const entries = (m: CodeMap): [string, string][] => (m instanceof Map ? [...m] : Object.entries(m));

/**
 * Turn one-letter amino acid codes into three-letter codes.
 *
 * @param seq - Protein text or sequence.
 * @param customMap - Extra or replacement codes (default `{"*": "Ter"}`; passing your own replaces that default).
 * @param undefCode - Code for letters not in the table. Default `"Xaa"`.
 * @example
 * ```ts
 * seq3("MAIVMGRWKGAR*");   // "MetAlaIleValMetGlyArgTrpLysGlyAlaArgTer"
 * ```
 */
export function seq3(seq: SeqLike, customMap: CodeMap | null = null, undefCode = "Xaa"): string {
  const text = asText(seq, "iter");
  const threecode = new Map<string, string>([...Object.entries(IUPACData.proteinLetters1to3Extended), ...entries(customMap ?? { "*": "Ter" })]);
  return [...text].map((aa) => threecode.get(aa) ?? undefCode).join("");
}

/**
 * Turn three-letter amino acid codes into one-letter codes. Matching ignores case; leftover letters
 * (fewer than three) are dropped.
 *
 * @param seq - Text made of three-letter codes.
 * @param customMap - Extra or replacement codes (default `{"Ter": "*"}`).
 * @param undefCode - Letter for unknown codes. Default `"X"`.
 * @example
 * ```ts
 * seq1("MetAlaIleValMetGlyArgTrpLysGlyAlaArgTer");   // "MAIVMGRWKGAR*"
 * ```
 */
export function seq1(seq: SeqLike, customMap: CodeMap | null = null, undefCode = "X"): string {
  const text = asText(seq, "len");
  const onecode = new Map<string, string>(Object.entries(IUPACData.proteinLetters3to1Extended).map(([k, v]) => [k.toUpperCase(), v]));
  for (const [k, v] of entries(customMap ?? { Ter: "*" })) onecode.set(k.toUpperCase(), v);
  const out: string[] = [];
  for (let i = 0; i < Math.floor(text.length / 3); i++) out.push(onecode.get(text.slice(3 * i, 3 * (i + 1)).toUpperCase()) ?? undefCode);
  return out.join("");
}
