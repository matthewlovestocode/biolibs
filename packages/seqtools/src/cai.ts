/** Codon adaptation index (Biopython's `CodonAdaptationIndex`). */

import { KeyError, ValueError, ZeroDivisionError, pyFormatFixed } from "@biolibs/core";
import { CodonTable, Seq, translate } from "@biolibs/seq";
import { asText, type SeqLike } from "./args.js";

/** A record-like object: has `id` and `seq`. */
interface RecordLike { id: string | null; seq: SeqLike | null }

const isRecord = (x: unknown): x is RecordLike => typeof x === "object" && x !== null && "id" in x && "seq" in x;

/** The upper-case text of a sequence, or of the `seq` of a record-like object. */
function upperText(x: unknown): string {
  const inner = isRecord(x) ? x.seq : x;
  if (inner === null || inner === undefined) throw new TypeError("'NoneType' object has no attribute 'upper'");
  return asText(inner, "lower").toUpperCase();
}

/**
 * Relative adaptiveness of each codon, learned from reference genes: for every amino acid, each codon's
 * count divided by the count of its most used synonym (unseen codons count as 0.5).
 * It is a `Map` from codon (`"ACG"`, DNA letters) to weight.
 *
 * @example
 * ```ts
 * const cai = new CodonAdaptationIndex(["ATGGCCAAA", "ATGGCCAAG"]);
 * cai.calculate("ATGGCCAAA");
 * ```
 */
export class CodonAdaptationIndex extends Map<string, number> {
  private readonly table: CodonTable.CodonTable;

  /**
   * @param sequences - Reference genes: text, `Seq`, or records.
   * @param table - Genetic code (default standard).
   * @throws {@link ValueError} for a codon that is not made of A, C, G, T.
   */
  constructor(sequences: Iterable<unknown>, table: CodonTable.CodonTable = CodonTable.standardDnaTable!) {
    super();
    this.table = table;
    const codons = new Map<string, string[]>([...(table.proteinAlphabet ?? "")].map((aa) => [aa, []]));
    for (const [codon, aa] of table.forwardTable as unknown as Map<string, string>) {
      const list = codons.get(aa);
      if (list === undefined) throw new KeyError(aa);
      list.push(codon);
    }
    const synonymous: string[][] = [...codons.values(), table.stopCodons];
    const counts = new Map<string, number>();
    for (const c1 of "ACGT") for (const c2 of "ACGT") for (const c3 of "ACGT") counts.set(c1 + c2 + c3, 0);
    for (const [codon, n] of counts) this.set(codon, n);
    for (const sequence of sequences) {
      const name = isRecord(sequence) ? sequence.id : null;
      const text = upperText(sequence);
      for (let i = 0; i < text.length; i += 3) {
        const codon = text.slice(i, i + 3);
        const n = counts.get(codon);
        if (n === undefined) throw new ValueError(name === null ? `illegal codon '${codon}'` : `illegal codon '${codon}' in gene ${name}`);
        counts.set(codon, n + 1);
      }
    }
    for (const [codon, n] of counts) if (n === 0) counts.set(codon, 0.5);
    for (const group of synonymous) {
      const denominator = Math.max(...group.map((c) => counts.get(c)!));
      for (const codon of group) this.set(codon, counts.get(codon)! / denominator);
    }
  }

  /**
   * The index of a gene: the geometric mean of its codons' weights, skipping ATG, TGG and stop codons.
   *
   * @throws TypeError for an illegal codon.
   * @throws {@link ZeroDivisionError} if no codon contributes.
   */
  calculate(sequence: unknown): number {
    const text = upperText(sequence);
    let value = 0;
    let length = 0;
    for (let i = 0; i < text.length; i += 3) {
      const codon = text.slice(i, i + 3);
      if (codon === "ATG" || codon === "TGG") continue;
      const w = this.get(codon);
      if (w === undefined) {
        if (codon === "TGA" || codon === "TAA" || codon === "TAG") continue;
        throw new TypeError(`illegal codon in sequence: ${codon}`);
      }
      value += Math.log(w);
      length += 1;
    }
    if (length === 0) throw new ZeroDivisionError();
    return Math.exp(value / length);
  }

  /**
   * Back-translate a gene using the preferred codon of each amino acid.
   *
   * @param sequence - DNA/RNA (translated first) or protein.
   * @param seqType - `"DNA"` (default), `"RNA"` or `"protein"`.
   * @param strict - Raise if two codons are equally preferred (default true); otherwise the later one wins.
   * @throws {@link ValueError} for ties in strict mode or a bad `seqType`; {@link KeyError} for an unknown amino acid.
   */
  optimize(sequence: unknown, seqType = "DNA", strict = true): Seq {
    const seq = upperText(sequence);
    const preferred = new Map<string, string>();
    for (const [codon, aa] of this.table.forwardTable as unknown as Map<string, string>) {
      if (this.get(codon) === 1.0) {
        if (preferred.has(aa)) {
          if (strict) throw new ValueError(`${preferred.get(aa)} and ${codon} are equally preferred.`);
        }
        preferred.set(aa, codon);
      }
    }
    for (const codon of this.table.stopCodons) if (this.get(codon) === 1.0) preferred.set("*", codon);
    let aaSeq: string;
    if (seqType === "DNA" || seqType === "RNA") aaSeq = translate(seq);
    else if (seqType === "protein") aaSeq = seq;
    else throw new ValueError(`Allowed seq_types are DNA, RNA or protein, not '${seqType}'`);
    let optimized = "";
    for (const aa of aaSeq) {
      const codon = preferred.get(aa);
      if (codon === undefined) throw new KeyError(`Unrecognized amino acid: '${aa}'`);
      optimized += codon;
    }
    return new Seq(optimized);
  }

  /** One `codon<TAB>weight` line per codon, weights to three decimals. */
  toString(): string {
    return [...this].map(([codon, value]) => `${codon}\t${pyFormatFixed(value, 3)}`).join("\n") + "\n";
  }
}
