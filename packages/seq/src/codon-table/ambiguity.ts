/** IUPAC ambiguity handling for codon tables. */

import { BioError, KeyError, ValueError } from "@biolibs/core";
import { CodonTable, type NCBICodonTable } from "./codon-table.js";
import { TranslationError } from "./errors.js";
import type { ForwardTable, ForwardTableLike } from "./forward-table.js";

/**
 * Possible amino acids for an ambiguous codon.
 *
 * @param codon - Three-letter codon, possibly with IUPAC ambiguity codes.
 * @param forwardTable - Unambiguous codon dictionary.
 * @param ambiguousNucleotideValues - Letter to the nucleotides it stands for.
 * @returns The distinct amino acids the codon can encode.
 * @throws {@link KeyError} if every possibility is a stop codon.
 * @throws {@link TranslationError} if it can be both a stop and an amino acid.
 */
export function listPossibleProteins(
  codon: string,
  forwardTable: Map<string, string>,
  ambiguousNucleotideValues: Record<string, string>,
): string[] {
  const chars = [...codon];
  if (chars.length < 3) throw new ValueError(`not enough values to unpack (expected 3, got ${chars.length})`);
  if (chars.length > 3) throw new ValueError("too many values to unpack (expected 3)");
  const look = (c: string): string => {
    const v = ambiguousNucleotideValues[c];
    if (v === undefined) throw new KeyError(c);
    return v;
  };
  const [x1, x2, x3] = [look(chars[0]!), look(chars[1]!), look(chars[2]!)];
  const possible = new Map<string, number>();
  const stops: string[] = [];
  for (const y1 of x1) for (const y2 of x2) for (const y3 of x3) {
    const aa = forwardTable.get(y1 + y2 + y3);
    if (aa !== undefined) possible.set(aa, 1);
    else stops.push(y1 + y2 + y3);
  }
  if (stops.length) {
    if (possible.size) throw new TranslationError(`ambiguous codon '${codon}' codes for both proteins and stop codons`);
    throw new KeyError(codon);
  }
  return [...possible.keys()];
}

/**
 * Extend a codon list with ambiguous codons that stand only for members of it
 * (for example `TAR` for `TAA`/`TAG`).
 *
 * @param codons - Unambiguous codons.
 * @param ambiguousNucleotideValues - Letter to the nucleotides it stands for.
 * @returns A new list: the originals followed by the ambiguous equivalents.
 */
export function listAmbiguousCodons(codons: string[], ambiguousNucleotideValues: Record<string, string>): string[] {
  const entries = Object.entries(ambiguousNucleotideValues);
  // Letters whose every meaning occurs at position `i` of some codon.
  const lettersAt = (i: number) => {
    const seen = new Set(codons.map((c) => c[i]!));
    return entries.filter(([, meanings]) => [...meanings].every((m) => seen.has(m))).map(([l]) => l).sort();
  };
  const [c1s, c2s, c3s] = [lettersAt(0), lettersAt(1), lettersAt(2)];
  const candidates: string[] = [];
  for (const c1 of c1s) for (const c2 of c2s) for (const c3 of c3s) {
    const codon = c1 + c2 + c3;
    if (!candidates.includes(codon) && !codons.includes(codon)) candidates.push(codon);
  }
  const answer = codons.slice();
  for (const amb of candidates) {
    let wanted = true;
    // Every unambiguous expansion must already be in the list.
    for (const a of ambiguousNucleotideValues[amb[0]!]!) for (const b of ambiguousNucleotideValues[amb[1]!]!) for (const c of ambiguousNucleotideValues[amb[2]!]!) {
      if (!codons.includes(a + b + c)) wanted = false;
    }
    if (wanted) answer.push(amb);
  }
  return answer;
}

/** Cache markers: a codon known to raise `KeyError` / `TranslationError` (so repeat lookups are cheap). */
const CACHE_KEY_ERROR = Symbol("KeyError");

/** See {@link CACHE_KEY_ERROR}. */
const CACHE_TRANSLATION_ERROR = Symbol("TranslationError");

/**
 * Codon lookup that also resolves ambiguity codes: `TTN` maps to `L` or `F`
 * only if all possibilities agree, otherwise to the most specific ambiguous
 * amino acid (for example `B` for Asx), else it raises.
 */
export class AmbiguousForwardTable implements ForwardTableLike {
  /** Unambiguous amino acid to every ambiguous letter that includes it (built once). */
  private readonly inverted: Map<string, string[]>;
  /** Memo of earlier lookups: codon to amino acid or an error marker. */
  private readonly cache = new Map<string, string | symbol>();

  /**
   * @param forwardTable - Unambiguous codon dictionary.
   * @param ambiguousNucleotide - Nucleotide letter to its possible bases.
   * @param ambiguousProtein - Amino acid letter to the amino acids it stands for.
   */
  constructor(
    readonly forwardTable: Map<string, string>,
    readonly ambiguousNucleotide: Record<string, string>,
    readonly ambiguousProtein: Record<string, string>,
  ) {
    // inverted: unambiguous amino acid -> every (ambiguous) letter that includes it.
    const inv = new Map<string, string[]>();
    for (const [name, val] of Object.entries(ambiguousProtein)) {
      for (const c of val) {
        const list = inv.get(c) ?? [];
        if (!list.includes(name)) list.push(name);
        inv.set(c, list);
      }
    }
    this.inverted = inv;
  }

  /** Whether the codon translates (Python `codon in table`); false for `KeyError`/`TranslationError`. */
  has(codon: string): boolean {
    try {
      this.getItem(codon);
      return true;
    } catch (e) {
      if (e instanceof KeyError || e instanceof TranslationError) return false;
      throw e;
    }
  }

  /** `table.get(codon, failobj)`: like `getItem` but returns `failobj` on `KeyError` (a `TranslationError` still propagates, as in Biopython). */
  get(codon: string, failobj?: string): string | undefined {
    try {
      return this.getItem(codon);
    } catch (e) {
      if (e instanceof KeyError) return failobj;
      throw e;
    }
  }

  /**
   * Translate a codon, resolving IUPAC ambiguity codes.
   *
   * Results (including failures) are cached per codon.
   * @throws {@link KeyError} if every possibility is a stop codon or the codon is invalid.
   * @throws {@link TranslationError} if the possibilities disagree and no ambiguous amino acid covers them, or are mixed stop/amino acid.
   */
  getItem(codon: string): string {
    const cached = this.cache.get(codon);
    if (cached !== undefined) {
      if (cached === CACHE_TRANSLATION_ERROR) throw new TranslationError(codon);
      if (cached === CACHE_KEY_ERROR) throw new KeyError(codon);
      return cached as string;
    }
    const direct = this.forwardTable.get(codon);
    if (direct !== undefined) {
      this.cache.set(codon, direct);
      return direct;
    }
    let possible: string[];
    try {
      possible = listPossibleProteins(codon, this.forwardTable, this.ambiguousNucleotide);
    } catch (e) {
      if (e instanceof KeyError) {
        this.cache.set(codon, CACHE_KEY_ERROR);
        throw new KeyError(codon);
      }
      if (e instanceof TranslationError) {
        this.cache.set(codon, CACHE_TRANSLATION_ERROR);
        throw new TranslationError(codon);
      }
      throw e;
    }
    if (possible.length === 0) throw new BioError("unambiguous codons must code");
    if (possible.length === 1) {
      this.cache.set(codon, possible[0]!);
      return possible[0]!;
    }
    // Count, for each ambiguous letter, how many of the possibilities it covers.
    const counts = new Map<string, number>();
    for (const amino of possible) {
      for (const term of this.inverted.get(amino) ?? []) counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    const n = possible.length;
    const covering = [...counts].filter(([, v]) => v === n).map(([k]) => k);
    if (covering.length === 0) {
      this.cache.set(codon, CACHE_TRANSLATION_ERROR);
      throw new TranslationError(codon);
    }
    // The most specific letter wins: fewest meanings, then alphabetical.
    covering.sort((a, b) => this.ambiguousProtein[a]!.length - this.ambiguousProtein[b]!.length || (a < b ? -1 : a > b ? 1 : 0));
    this.cache.set(codon, covering[0]!);
    return covering[0]!;
  }
}

/** An NCBI table wrapped with ambiguity-aware codon lookup and ambiguous start/stop lists. */
export class AmbiguousCodonTable extends CodonTable {
  /** The wrapped unambiguous table (Biopython delegates `id`/`names` to it). */
  readonly codonTable: NCBICodonTable;

  /**
   * @param codonTable - Unambiguous table to wrap.
   * @param ambiguousNucleotideAlphabet - Nucleotide letters, or null for the generic table.
   * @param ambiguousNucleotideValues - Letter to the nucleotides it stands for.
   * @param ambiguousProteinAlphabet - Amino acid letters including ambiguous ones.
   * @param ambiguousProteinValues - Ambiguous amino acid letter to the amino acids it stands for.
   */
  constructor(
    codonTable: NCBICodonTable,
    ambiguousNucleotideAlphabet: string | null,
    ambiguousNucleotideValues: Record<string, string>,
    ambiguousProteinAlphabet: string,
    ambiguousProteinValues: Record<string, string>,
  ) {
    super(
      ambiguousNucleotideAlphabet,
      ambiguousProteinAlphabet,
      new AmbiguousForwardTable(codonTable.forwardTable as ForwardTable, ambiguousNucleotideValues, ambiguousProteinValues),
      codonTable.backTable,
      listAmbiguousCodons(codonTable.startCodons, ambiguousNucleotideValues),
      listAmbiguousCodons(codonTable.stopCodons, ambiguousNucleotideValues),
    );
    this.codonTable = codonTable;
    // Python delegates unknown attributes (id, names) to the wrapped table.
    this.id = codonTable.id;
    this.names = codonTable.names;
  }
}

// --- registries (Python module-level dictionaries) ---------------------------
