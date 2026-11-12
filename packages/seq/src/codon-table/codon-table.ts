/** `CodonTable` and the NCBI table classes (no ambiguity handling). */

import { KeyError } from "@biolibs/core";
import * as IUPAC from "../data/iupac-data.js";
import { TranslationError } from "./errors.js";
import { ForwardTable, type ForwardTableLike } from "./forward-table.js";

/** Python `repr()` of a list of strings / None, e.g. `['Standard', 'SGC0']`. */
const reprList = (xs: (string | null)[]) => "[" + xs.map((x) => (x === null ? "None" : `'${x}'`)).join(", ") + "]";

/**
 * A genetic code: codon dictionaries plus start and stop codon lists.
 */
export class CodonTable {
  /** Allowed nucleotide letters, or null for the generic tables (T and U both allowed). */
  nucleotideAlphabet: string | null;
  /** Amino acid letters this table can produce. */
  proteinAlphabet: string | null;
  /** Codon to amino acid (sense codons only for NCBI tables). */
  forwardTable: ForwardTableLike;
  /** Amino acid to codon; the `null` key is the default stop codon. */
  backTable: Map<string | null, string>;
  /** Codons that can start translation. */
  startCodons: string[];
  /** Codons that terminate translation. */
  stopCodons: string[];
  /** NCBI id (set on NCBI tables). */
  id?: number;
  /** Table names (set on NCBI tables); the last entry may be null. */
  names?: (string | null)[];

  /**
   * @param nucleotideAlphabet - Allowed nucleotide letters, or null.
   * @param proteinAlphabet - Amino acid letters, or null.
   * @param forwardTable - Codon to amino acid lookup.
   * @param backTable - Amino acid to codon lookup.
   * @param startCodons - Start codons.
   * @param stopCodons - Stop codons.
   */
  constructor(
    nucleotideAlphabet: string | null = null,
    proteinAlphabet: string | null = null,
    forwardTable: ForwardTableLike = new ForwardTable(),
    backTable: Map<string | null, string> = new Map(),
    startCodons: string[] = [],
    stopCodons: string[] = [],
  ) {
    this.nucleotideAlphabet = nucleotideAlphabet;
    this.proteinAlphabet = proteinAlphabet;
    this.forwardTable = forwardTable;
    this.backTable = backTable;
    this.startCodons = startCodons;
    this.stopCodons = stopCodons;
  }

  /** The familiar 4x4x4 text rendering of the table (Python `str(table)`). */
  toString(): string {
    let answer = this.id ? `Table ${this.id}` : "Table ID unknown";
    if (this.names?.length) answer += " " + this.names.filter((x) => x).join(", ");
    const letters = this.nucleotideAlphabet !== null && this.nucleotideAlphabet.includes("T") ? "TCAG" : "UCAG";
    answer += "\n\n";
    answer += "  |" + [...letters].map((c2) => `  ${c2}      `).join("|") + "|";
    answer += "\n--+" + [...letters].map(() => "---------").join("+") + "+--";
    for (const c1 of letters) {
      for (const c3 of letters) {
        let line = c1 + " |";
        for (const c2 of letters) {
          const codon = c1 + c2 + c3;
          line += ` ${codon}`;
          if (this.stopCodons.includes(codon)) {
            line += " Stop|";
          } else {
            let amino: string;
            try {
              amino = this.forwardTable.getItem(codon);
            } catch (e) {
              if (e instanceof KeyError || e instanceof TranslationError) amino = "?";
              else throw e;
            }
            line += this.startCodons.includes(codon) ? ` ${amino}(s)|` : ` ${amino}   |`;
          }
        }
        line += " " + c3;
        answer += "\n" + line;
      }
      answer += "\n--+" + [...letters].map(() => "---------").join("+") + "+--";
    }
    return answer;
  }
}

/**
 * Build the amino acid to codon map. Where several codons encode an amino
 * acid the alphabetically last wins; the `null` key holds the default stop codon.
 *
 * @param table - Codon to amino acid.
 * @param defaultStopCodon - Codon used when back-translating a stop.
 */
export function makeBackTable(table: Map<string, string> | Record<string, string>, defaultStopCodon: string): Map<string | null, string> {
  const m = table instanceof Map ? table : new Map(Object.entries(table));
  const back = new Map<string | null, string>();
  for (const key of [...m.keys()].sort()) back.set(m.get(key)!, key);
  back.set(null, defaultStopCodon);
  return back;
}

/** An NCBI genetic code table (no ambiguity handling). */
export class NCBICodonTable extends CodonTable {
  /**
   * @param id - NCBI table id.
   * @param names - All names; the last may be an alternative name or null.
   * @param table - Sense codons to amino acids.
   * @param startCodons - Start codons.
   * @param stopCodons - Stop codons (the first is the default).
   * @param nucleotideAlphabet - Allowed nucleotide letters, or null for generic tables.
   */
  constructor(
    id: number,
    names: (string | null)[],
    table: Map<string, string> | Record<string, string>,
    startCodons: string[],
    stopCodons: string[],
    nucleotideAlphabet: string | null = null,
  ) {
    const fwd = new ForwardTable(table instanceof Map ? table : Object.entries(table));
    super(nucleotideAlphabet, IUPAC.proteinLetters, fwd, makeBackTable(fwd, stopCodons[0]!), startCodons, stopCodons);
    this.id = id;
    this.names = names;
  }

  /** Python-style representation, e.g. `NCBICodonTableDNA(id=1, names=['Standard', 'SGC0'], ...)`. */
  repr(): string {
    return `${this.constructor.name}(id=${this.id}, names=${reprList(this.names!)}, ...)`;
  }
}

/** NCBI table over DNA (ACGT). */
export class NCBICodonTableDNA extends NCBICodonTable {
  /** @param id NCBI id. @param names Table names. @param table Sense codons (DNA). @param start Start codons. @param stop Stop codons. */
  constructor(id: number, names: (string | null)[], table: Map<string, string> | Record<string, string>, start: string[], stop: string[]) {
    super(id, names, table, start, stop, IUPAC.unambiguousDnaLetters);
  }
}

/** NCBI table over RNA (ACGU). */
export class NCBICodonTableRNA extends NCBICodonTable {
  /** @param id NCBI id. @param names Table names. @param table Sense codons (RNA). @param start Start codons. @param stop Stop codons. */
  constructor(id: number, names: (string | null)[], table: Map<string, string> | Record<string, string>, start: string[], stop: string[]) {
    super(id, names, table, start, stop, IUPAC.unambiguousRnaLetters);
  }
}
