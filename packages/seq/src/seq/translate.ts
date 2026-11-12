/** Translation of nucleotide strings (Biopython's `_translate_str`) and its argument handling. */

import { KeyError, ValueError, warn } from "@biolibs/core";
import * as CT from "../codon-table/index.js";
import * as IUPAC from "../data/iupac-data.js";

/** Options for `translate`. */
export interface TranslateOptions {
  /** Table id, name or {@link CT.CodonTable}. Default `"Standard"`. */
  table?: string | number | CT.CodonTable;
  /** Character for stop codons. Default `"*"`. */
  stopSymbol?: string;
  /** Stop at the first stop codon (not included). Default false. */
  toStop?: boolean;
  /** Require a full coding sequence: start codon … single terminal stop. Default false. */
  cds?: boolean;
  /** Gap character (e.g. `"-"`) that translates codon `---` to a gap. */
  gap?: string | null;
}

/** Anything accepted as the first `translate` argument: a table id/name/object, or an options object. */
export type TableArg = string | number | CT.CodonTable | TranslateOptions | undefined;

/** Normalise the `(table, stopSymbol, toStop, cds, gap)` positional or options-object forms. */
export function translateArgs(
  table: TableArg,
  stopSymbol: string | undefined,
  toStop: boolean | undefined,
  cds: boolean | undefined,
  gap: string | null | undefined,
  gapDefault: string | null,
) {
  if (typeof table === "object" && table !== null && !(table instanceof CT.CodonTable)) {
    const o = table;
    return { table: o.table === undefined ? "Standard" : o.table, stopSymbol: o.stopSymbol ?? "*", toStop: o.toStop ?? false, cds: o.cds ?? false, gap: o.gap === undefined ? gapDefault : o.gap };
  }
  return { table: table === undefined ? "Standard" : (table as string | number | CT.CodonTable), stopSymbol: stopSymbol ?? "*", toStop: toStop ?? false, cds: cds ?? false, gap: gap === undefined ? gapDefault : gap };
}

/**
 * Translate an uppercase-or-lowercase nucleotide string (Biopython's
 * `_translate_str`).
 *
 * @param sequence - Nucleotide string.
 * @param table - NCBI table id, name, or a {@link CT.CodonTable}.
 * @param stopSymbol - Symbol for stop codons.
 * @param toStop - Stop at the first stop codon.
 * @param cds - Require a valid start codon, in-frame length and terminal stop.
 * @param posStop - Symbol for codons that are ambiguous but valid. Default `"X"`.
 * @param gap - Single gap character, or null.
 * @throws {@link CT.TranslationError} for invalid codons or CDS violations.
 * @throws {@link ValueError} for a bad table or gap argument.
 */
export function translateStr(
  sequence: string,
  table: string | number | CT.CodonTable | null | undefined,
  stopSymbol = "*",
  toStop = false,
  cds = false,
  posStop = "X",
  gap: string | null = null,
): string {
  // --- resolve the codon table -------------------------------------------------
  let codonTable: CT.CodonTable;
  if (table instanceof CT.CodonTable) {
    codonTable = table;
  } else if (typeof table === "number" || (typeof table === "string" && /^\s*[+-]?\d+\s*$/.test(table))) {
    const tableId = typeof table === "number" ? Math.trunc(table) : parseInt(table, 10);
    if (Number.isNaN(tableId)) throw new ValueError("cannot convert float NaN to integer");
    const t = CT.ambiguousGenericById.get(tableId);
    if (!t) throw new KeyError(String(tableId));
    codonTable = t;
  } else if (typeof table === "string") {
    const t = CT.ambiguousGenericByName.get(table);
    if (!t) {
      throw new ValueError(
        "The Bio.Seq translate methods and function DO NOT take a character string mapping table like the python string object's translate method. Use str(my_seq).translate(...) instead.",
      );
    }
    codonTable = t;
  } else {
    throw new ValueError("Bad table argument");
  }

  sequence = sequence.toUpperCase();
  const aminoAcids: string[] = [];
  const forwardTable = codonTable.forwardTable;
  const stopCodons = codonTable.stopCodons;
  const validLetters = new Set(
    codonTable.nucleotideAlphabet !== null
      ? codonTable.nucleotideAlphabet.toUpperCase()
      : (IUPAC.ambiguousDnaLetters + IUPAC.ambiguousRnaLetters).toUpperCase(),
  );
  let n = sequence.length;

  // Codons that are both stop and amino acid make `to_stop` ill-defined.
  const dualCoding = stopCodons.filter((c) => forwardTable.has(c));
  if (dualCoding.length) {
    const c = dualCoding[0]!;
    if (toStop) {
      throw new ValueError(
        `You cannot use 'to_stop=True' with this table as it contains ${dualCoding.length} codon(s) which can be both STOP and an amino acid (e.g. '${c}' -> '${forwardTable.getItem(c)}' or STOP).`,
      );
    }
    warn(
      `This table contains ${dualCoding.length} codon(s) which code(s) for both STOP and an amino acid (e.g. '${c}' -> '${forwardTable.getItem(c)}' or STOP). Such codons will be translated as amino acid.`,
    );
  }

  if (cds) {
    if (!codonTable.startCodons.includes(sequence.slice(0, 3).toUpperCase())) {
      throw new CT.TranslationError(`First codon '${sequence.slice(0, 3)}' is not a start codon`);
    }
    if (n % 3 !== 0) throw new CT.TranslationError(`Sequence length ${n} is not a multiple of three`);
    if (!stopCodons.includes(sequence.slice(-3).toUpperCase())) {
      throw new CT.TranslationError(`Final codon '${sequence.slice(-3)}' is not a stop codon`);
    }
    // Drop the start and stop codons; the start always translates to M.
    sequence = sequence.slice(3, sequence.length - 3);
    n -= 6;
    aminoAcids.push("M");
  } else if (n % 3 !== 0) {
    warn(
      "Partial codon, len(sequence) not a multiple of three. Explicitly trim the sequence or add trailing N before translation. This may become an error in future.",
    );
  }

  if (gap !== null) {
    if (typeof gap !== "string") throw new TypeError("Gap character should be a single character string.");
    if (gap.length > 1) throw new ValueError("Gap character should be a single character string.");
  }

  for (let i = 0; i < n - (n % 3); i += 3) {
    const codon = sequence.slice(i, i + 3);
    try {
      aminoAcids.push(forwardTable.getItem(codon));
    } catch (e) {
      if (!(e instanceof KeyError || e instanceof CT.TranslationError)) throw e;
      if (codonTable.stopCodons.includes(codon)) {
        if (cds) throw new CT.TranslationError(`Extra in frame stop codon '${codon}' found.`);
        if (toStop) break;
        aminoAcids.push(stopSymbol);
      } else if ([...codon].every((c) => validLetters.has(c))) {
        aminoAcids.push(posStop);
      } else if (gap !== null && codon === gap.repeat(3)) {
        aminoAcids.push(gap);
      } else {
        throw new CT.TranslationError(`Codon '${codon}' is invalid`);
      }
    }
  }
  return aminoAcids.join("");
}
