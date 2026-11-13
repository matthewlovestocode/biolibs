/** `Motif`: a sequence motif defined by aligned instances or by counts, with its mask, pseudocounts and background. */

import { IndexError, ValueError, pySum } from "@biolibs/core";
import { Alignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { PythonException } from "./errors.js";
import { FrequencyPositionMatrix, PositionSpecificScoringMatrix, PositionWeightMatrix, sortedLetters, type LetterValues } from "./matrix.js";
import { rangeOf, sliceArray, type PySlice } from "./slices.js";

/** Letter to number, as pseudocounts and background are given. */
export type LetterNumbers = Record<string, number> | Map<string, number>;

const entriesOf = (m: LetterNumbers): [string, number][] => (m instanceof Map ? [...m] : Object.entries(m));

/** Python `str(Exception(ValueError, "..."))`, the message Biopython's `Exception(ValueError, ...)` produces. */
const BOTH_MESSAGE = "(<class 'ValueError'>, \"Specify either counts or an alignment, don't specify both\")";

/**
 * A motif of a fixed length over an alphabet (default `ACGT`), described by an alignment of instances or by counts.
 * `pwm` and `pssm` derive the weight and scoring matrices from the counts, the pseudocounts and the background.
 */
export class Motif {
  /** Name of the motif. */
  name: string | null = "";
  /** The alignment of instances, if the motif was made from one. */
  alignment: Alignment | null = null;
  /** Counts of each letter at each position. */
  counts: FrequencyPositionMatrix | null = null;
  /** The number of positions (null for an empty motif). */
  length: number | null = null;
  /** The letters. */
  alphabet: string;
  private pseudo: Map<string, number> = new Map();
  private bg: Map<string, number> = new Map();
  private maskValue: number[] = [];

  /**
   * @param alphabet - The letters (default `ACGT`).
   * @param alignment - An alignment of instances (give this or `counts`).
   * @param counts - Counts by letter.
   * @throws PythonException (`Exception`, with Biopython's odd message) when both are given.
   */
  constructor(alphabet = "ACGT", alignment: Alignment | null = null, counts: LetterValues | null = null) {
    this.alphabet = alphabet;
    if (counts !== null && alignment !== null) throw new PythonException(BOTH_MESSAGE);
    if (counts !== null) {
      this.counts = new FrequencyPositionMatrix(alphabet, counts);
      this.length = this.counts.length;
    } else if (alignment !== null) {
      const length = alignment.length;
      const frequencies = new Map(alignment.frequencies);
      for (const letter of alphabet) if (!frequencies.has(letter)) frequencies.set(letter, new Float64Array(length));
      this.counts = new FrequencyPositionMatrix(alphabet, frequencies);
      this.alignment = alignment;
      this.length = length;
    }
    this.pseudocounts = null;
    this.background = null;
    this.mask = null;
  }

  /** The mask: one 0 or 1 per position (1 means the position counts). */
  get mask(): readonly number[] { return this.maskValue; }
  /**
   * Set the mask from `null` (all positions), a string of `*` and spaces, or a list of flags.
   *
   * @throws ValueError for a length that does not match or a bad character.
   */
  set mask(mask: string | readonly unknown[] | null) {
    if (this.length === null) { this.maskValue = []; return; }
    if (mask === null) { this.maskValue = new Array<number>(this.length).fill(1); return; }
    if (mask.length !== this.length) throw new ValueError(`The length (${mask.length}) of the mask is inconsistent with the length (${this.length}) of the motif`);
    if (typeof mask === "string") {
      // Biopython fills a list as it goes, so a bad character leaves the characters before it in place.
      this.maskValue = [];
      for (const c of mask) {
        if (c === "*") this.maskValue.push(1);
        else if (c === " ") this.maskValue.push(0);
        else throw new ValueError(`Mask should contain only '*' or ' ' and not a '${c}'`);
      }
    } else this.maskValue = mask.map((c) => (c ? 1 : 0));
  }

  /** Pseudocounts by letter. */
  get pseudocounts(): Map<string, number> { return this.pseudo; }
  /** Set the pseudocounts: a map (one value per letter), a single number, or null (zero). */
  set pseudocounts(value: LetterNumbers | number | null) {
    // Biopython empties the pseudocounts first, so a failed assignment leaves them empty.
    this.pseudo = new Map();
    const next = new Map<string, number>();
    if (value !== null && typeof value === "object") {
      const m = new Map(entriesOf(value));
      for (const l of this.alphabet) { if (!m.has(l)) throw Object.assign(new Error(l), { name: "KeyError" }); next.set(l, m.get(l)!); }
    } else for (const l of this.alphabet) next.set(l, value ?? 0.0);
    this.pseudo = next;
  }

  /** Background probabilities by letter (always normalised). */
  get background(): Map<string, number> { return this.bg; }
  /**
   * Set the background: a map, null (uniform), or a single number (the GC content, for DNA and RNA).
   *
   * @throws ValueError for a single number with another alphabet.
   */
  set background(value: LetterNumbers | number | null) {
    if (value !== null && typeof value === "object") {
      const m = new Map(entriesOf(value));
      const next = new Map<string, number>();
      for (const l of this.alphabet) { if (!m.has(l)) throw Object.assign(new Error(l), { name: "KeyError" }); next.set(l, m.get(l)!); }
      this.bg = next;
    } else if (value === null) this.bg = new Map([...this.alphabet].map((l) => [l, 1.0]));
    else {
      if (!this.hasDnaAlphabet() && !this.hasRnaAlphabet()) throw new ValueError("Setting the background to a single value only works for DNA and RNAmotifs (in which case the value is interpreted as the GC content)");
      const tu = this.hasDnaAlphabet() ? "T" : "U";
      this.bg.set("A", (1.0 - value) / 2.0);
      this.bg.set("C", value / 2.0);
      this.bg.set("G", value / 2.0);
      this.bg.set(tu, (1.0 - value) / 2.0);
    }
    const total = pySum(this.bg.values());
    for (const l of this.alphabet) {
      if (total === 0) throw Object.assign(new Error("division by zero"), { name: "ZeroDivisionError" });
      this.bg.set(l, this.bg.get(l)! / total);
    }
  }

  /**
   * A part of the motif (Python `motif[a:b]`).
   *
   * @param key - A slice of positions.
   * @throws TypeError (`motif indices must be slices`) for anything else.
   */
  slice(key: PySlice): Motif {
    if (key === null || typeof key !== "object" || Array.isArray(key)) throw new TypeError("motif indices must be slices");
    let alignment: Alignment | null = null;
    let counts: Map<string, number[]> | null = null;
    if (this.alignment === null) {
      if (this.counts !== null) counts = new Map([...this.alphabet].map((l) => [l, sliceArray(this.counts!.row(l), key)]));
    } else alignment = this.alignment.get([{}, key]) as Alignment;
    const motif = new Motif(this.alphabet, alignment, counts);
    motif.mask = sliceArray(this.maskValue, key);
    if (alignment === null && counts === null) {
      if (this.length === null) throw new TypeError("'NoneType' object cannot be interpreted as an integer");
      motif.length = rangeOf(key, this.length).length;
    }
    motif.pseudocounts = new Map(this.pseudo);
    motif.background = new Map(this.bg);
    return motif;
  }

  /** The weight matrix: counts plus pseudocounts, normalised. @throws TypeError for a motif without counts. */
  get pwm(): PositionWeightMatrix {
    if (this.counts === null) throw new TypeError("'NoneType' object has no attribute 'normalize'");
    return this.counts.normalize(this.pseudo);
  }

  /** The scoring matrix: log-odds of the weight matrix against the background. */
  get pssm(): PositionSpecificScoringMatrix { return this.pwm.logOdds(this.bg); }

  /** @param masked - Also print a line marking masked positions. @returns The instances, one per line. */
  toString(masked = false): string {
    let text = "";
    if (this.alignment !== null) text += Array.from({ length: this.alignment.size }, (_, i) => this.alignment!.get(i) as string).join("\n");
    if (masked) {
      if (this.length === null) throw new TypeError("'NoneType' object cannot be interpreted as an integer");
      // Biopython indexes the mask position by position. A mask assignment that failed part-way through leaves a
      // mask shorter than the motif (see the setter), and printing it then raises rather than padding.
      for (let i = 0; i < this.length; i++) {
        if (i >= this.maskValue.length) throw new IndexError("list index out of range");
        text += this.maskValue[i] ? "*" : " ";
      }
      text += "\n";
    }
    return text;
  }

  /** @returns The number of positions (0 for an empty motif). */
  get size(): number { return this.length ?? 0; }

  /** Whether the alphabet is exactly A, C, G, T. */
  hasDnaAlphabet(): boolean { return sortedLetters(this.alphabet).join("") === "ACGT"; }
  /** Whether the alphabet is exactly A, C, G, U. */
  hasRnaAlphabet(): boolean { return sortedLetters(this.alphabet).join("") === "ACGU"; }

  /**
   * The motif of the opposite strand.
   *
   * @throws ValueError for alphabets other than DNA or RNA.
   */
  reverseComplement(): Motif {
    if (!this.hasDnaAlphabet() && !this.hasRnaAlphabet()) throw new ValueError("Calculating reverse complement only works for DNA and RNA motifs");
    const tu = this.hasDnaAlphabet() ? "T" : "U";
    let res: Motif;
    const rev = (l: string): number[] => {
      if (this.counts === null) throw new TypeError("'NoneType' object is not subscriptable");
      return [...this.counts.row(l)].reverse();
    };
    if (this.alignment !== null) {
      const alignment = this.alignment.reverseComplement();
      if (tu === "U") alignment.sequences = alignment.sequences.map((s) => new Seq(String(s).replaceAll("T", "U")));
      res = new Motif(this.alphabet, alignment);
    } else {
      res = new Motif(this.alphabet, null, new Map([["A", rev(tu)], ["C", rev("G")], ["G", rev("C")], [tu, rev("A")]]));
    }
    res.maskValue = [...this.maskValue].reverse();
    const need = (m: Map<string, number>, k: string): number => { const v = m.get(k); if (v === undefined) throw Object.assign(new Error(k), { name: "KeyError" }); return v; };
    const b = this.bg, p = this.pseudo;
    res.background = new Map([["A", need(b, tu)], ["C", need(b, "G")], ["G", need(b, "C")], [tu, need(b, "A")]]);
    res.pseudocounts = new Map([["A", need(p, tu)], ["C", need(p, "G")], ["G", need(p, "C")], [tu, need(p, "A")]]);
    return res;
  }

  /** The consensus sequence (most frequent letter per position). */
  get consensus(): Seq { return this.requireCounts().consensus; }
  /** The anticonsensus sequence. */
  get anticonsensus(): Seq { return this.requireCounts().anticonsensus; }
  /** The consensus with IUPAC ambiguity codes. */
  get degenerateConsensus(): Seq { return this.requireCounts().degenerateConsensus; }

  private requireCounts(): FrequencyPositionMatrix {
    if (this.counts === null) throw new TypeError("'NoneType' object has no attribute 'consensus'");
    return this.counts;
  }

  /** Relative entropy (in bits) of each position against the background. */
  get relativeEntropy(): Float64Array {
    if (this.length === null) throw new TypeError("Use () not None as shape arguments");
    const length = this.length;
    const counts = this.requireCounts();
    const values = new Float64Array(length);
    const need = (m: Map<string, number>, k: string): number => { const v = m.get(k); if (v === undefined) throw Object.assign(new Error(k), { name: "KeyError" }); return v; };
    const total = Array.from({ length }, (_, i) => pySum([...this.alphabet].map((c) => counts.row(c)[i]! + need(this.pseudo, c))));
    for (const letter of this.alphabet) {
      const row = counts.row(letter);
      for (let i = 0; i < length; i++) {
        const f = row[i]! + need(this.pseudo, letter);
        if (f > 0) { const q = f / total[i]!; values[i]! += q * Math.log2(q / need(this.bg, letter)); }
      }
    }
    return values;
  }

  /**
   * The motif written in a format.
   *
   * @param formatSpec - `""`, `pfm`, `jaspar` or `transfac`.
   * @throws ValueError (`Unknown format type ...`) for anything else.
   */
  format(formatSpec: string): string {
    return formatMotifs([this], formatSpec, true);
  }
}

/** Writers by format, filled in by `index.ts` (kept apart so this file need not import the format modules). */
export const writers: Record<string, (motifs: Motif[]) => string> = {};

/** Python's `Motif.__format__` / `motifs.write` dispatch. */
export function formatMotifs(motifs: Motif[], fmt: string, single = false): string {
  if (single && fmt === "") return motifs[0]!.toString();
  const w = writers[fmt];
  if (w) return w(motifs);
  throw new ValueError(`Unknown format type ${fmt}`);
}
