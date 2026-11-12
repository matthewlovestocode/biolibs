/** Codon to amino acid lookups. */

import { KeyError } from "@biolibs/core";

/**
 * Codon to amino acid lookup. `getItem` mirrors Python's `table[codon]` and
 * throws; `get`/`has` mirror `dict.get` and `in`.
 */
export interface ForwardTableLike {
  /** Whether the codon translates (Python `codon in table`). */
  has(codon: string): boolean;
  /** Amino acid, or `failobj` if the codon is missing (Python `table.get`). */
  get(codon: string, failobj?: string): string | undefined;
  /** Amino acid. @throws {@link KeyError} / {@link TranslationError} (Python `table[codon]`). */
  getItem(codon: string): string;
}

/** A plain codon dictionary: `Map` plus Python-style `getItem`. */
export class ForwardTable extends Map<string, string> implements ForwardTableLike {
  /** Translate a codon. @throws {@link KeyError} if the codon is not in the table. */
  getItem(codon: string): string {
    const v = this.get(codon);
    if (v === undefined) throw new KeyError(codon);
    return v;
  }
}
