/** Protein analysis (Biopython's `Bio.SeqUtils.ProtParam.ProteinAnalysis`). */

import { IndexError, KeyError, ValueError, ZeroDivisionError, pyStr, pySum } from "@biolibs/core";
import { asText, type SeqLike } from "./args.js";
import { countAminoAcids, type AminoCounts } from "./amino-counts.js";
import * as data from "./data/prot-param-data.js";
import { IsoelectricPoint } from "./isoelectric.js";
import { writeStderr } from "./stderr.js";
import { molecularWeight } from "./weight.js";

/** A per-residue scale given as a `Map` or a plain object. */
export type Scale = Map<string, number> | Record<string, number>;

const scaleHas = (s: Scale, k: string): boolean => (s instanceof Map ? s.has(k) : Object.hasOwn(s, k));
const scaleGet = (s: Scale, k: string): number => {
  const v = s instanceof Map ? s.get(k) : Object.hasOwn(s, k) ? s[k] : undefined;
  if (v === undefined) throw new KeyError(k);
  return v;
};

/** Look up `key` in a nested table of `Record`s, raising Python's `KeyError`. */
function lookup<T>(table: Record<string, T>, key: string): T {
  if (!Object.hasOwn(table, key)) throw new KeyError(key);
  return table[key]!;
}

/** Python `s[i]` for a string. */
function charAt(s: string, i: number, isText = true): string {
  if (i >= s.length || i < -s.length) throw new IndexError(isText ? "string index out of range" : "index out of range");
  return s[i < 0 ? s.length + i : i]!;
}

/**
 * Physical and chemical properties of a protein sequence: composition, weight, aromaticity,
 * instability, flexibility, hydropathy, isoelectric point and more.
 *
 * @example
 * ```ts
 * const p = new ProteinAnalysis("MAEGEITTFTALTEKFNLPPGNYKKPKLLYCSNGGHFLRILPDGTVDGTRDRSDQHIQLQLSAESVGEVYIKSTETGQYLAMDTDGLLYGSQTPNEECLFLERLEENHYNTYISKKHAEKNWFVGLKKNGSCKRGPRTHYGQKAILFLPLPVSSD");
 * p.isoelectricPoint();
 * ```
 */
export class ProteinAnalysis {
  /** The upper-cased sequence. */
  readonly sequence: string;
  /** Sequence length. */
  readonly length: number;
  /** Use monoisotopic masses in {@link ProteinAnalysis.molecularWeight}. */
  readonly monoisotopic: boolean;
  /** Cached counts from {@link ProteinAnalysis.countAminoAcids}. */
  aminoAcidsContent: AminoCounts | null = null;
  private percent: Map<string, number> | null = null;
  /** Whether the constructor got text (Python then reports `str` index errors) or a sequence object. */
  private readonly fromText: boolean;

  /** @param protSequence - Protein text or sequence. @param monoisotopic - Use monoisotopic masses. */
  constructor(protSequence: SeqLike, monoisotopic = false) {
    this.sequence = asText(protSequence, "upper").toUpperCase();
    this.fromText = typeof protSequence === "string";
    this.length = this.sequence.length;
    this.monoisotopic = monoisotopic;
  }

  /** Count of each standard amino acid (computed once, then reused). */
  countAminoAcids(): AminoCounts {
    if (this.aminoAcidsContent === null) this.aminoAcidsContent = countAminoAcids(this.sequence);
    return this.aminoAcidsContent;
  }

  /**
   * Percentage of each standard amino acid.
   *
   * @throws {@link ZeroDivisionError} for an empty sequence.
   */
  get aminoAcidsPercent(): Map<string, number> {
    if (this.percent === null) {
      const out = new Map<string, number>();
      for (const [aa, count] of this.countAminoAcids()) {
        if (this.length === 0) throw new ZeroDivisionError();
        out.set(aa, (count * 100) / this.length);
      }
      this.percent = out;
    }
    return this.percent;
  }

  /** Molecular weight of the protein (Da). @throws {@link ValueError} for non-standard letters. */
  molecularWeight(): number {
    return molecularWeight(this.sequence, "protein", false, false, this.monoisotopic);
  }

  /** Relative frequency of aromatic residues (Y, W, F), as in Lobry and Gautier 1994. */
  aromaticity(): number {
    const pct = this.aminoAcidsPercent;
    return pySum([..."YWF"].map((aa) => pct.get(aa)! / 100));
  }

  /**
   * Instability index of Guruprasad et al. 1990: values above 40 suggest an unstable protein.
   *
   * @throws {@link KeyError} for a non-standard amino acid; {@link ZeroDivisionError} for an empty sequence.
   */
  instabilityIndex(): number {
    let score = 0.0;
    for (let i = 0; i < this.length - 1; i++) {
      const row = lookup(data.diwv, this.sequence[i]!);
      score += lookup(row, this.sequence[i + 1]!);
    }
    if (this.length === 0) throw new ZeroDivisionError();
    return (10.0 / this.length) * score;
  }

  /** Flexibility profile (Vihinen et al. 1994) over windows of nine residues. */
  flexibility(): number[] {
    const windowSize = 9;
    const weights = [0.25, 0.4375, 0.625, 0.8125, 1];
    const scores: number[] = [];
    for (let i = 0; i < this.length - windowSize; i++) {
      const sub = this.sequence.slice(i, i + windowSize);
      let score = 0.0;
      for (let j = 0; j < Math.floor(windowSize / 2); j++) {
        score += (lookup(data.flex, sub[j]!) + lookup(data.flex, sub[windowSize - j - 1]!)) * weights[j]!;
      }
      score += lookup(data.flex, sub[Math.floor(windowSize / 2) + 1]!);
      scores.push(score / 5.25);
    }
    return scores;
  }

  /**
   * Grand average of hydropathy.
   *
   * @param scale - Name of a scale in `gravyScales`. Default `"KyteDoolitle"`.
   * @throws {@link ValueError} for an unknown scale.
   */
  gravy(scale = "KyteDoolitle"): number {
    const selected = Object.hasOwn(data.gravyScales, scale) ? data.gravyScales[scale]! : null;
    if (selected === null) throw new ValueError(`scale: ${pyStr(scale)} not known`);
    const total = pySum([...this.sequence].map((aa) => lookup(selected, aa)));
    if (this.length === 0) throw new ZeroDivisionError();
    return total / this.length;
  }

  /** Weights for the window positions before the middle one: linear from `edge` upwards. */
  private weightList(window: number, edge: number): number[] {
    const unit = (2 * (1.0 - edge)) / (window - 1);
    if (!Number.isFinite(unit) && window - 1 === 0) throw new ZeroDivisionError();
    if (!Number.isInteger(window)) throw new TypeError("can't multiply sequence by non-int of type 'float'");
    const weights = new Array<number>(Math.max(0, Math.floor(window / 2))).fill(0.0);
    for (let i = 0; i < weights.length; i++) weights[i] = edge + unit * i;
    return weights;
  }

  /**
   * Average of a residue scale over a sliding window, with weights rising from `edge` at the ends to 1 in the middle.
   *
   * @param paramDict - Value for each amino acid.
   * @param window - Window length.
   * @param edge - Relative weight of the window ends (default 1: all equal).
   * @returns One score per window. Non-standard amino acids are reported on standard error and skipped.
   */
  proteinScale(paramDict: Scale, window: number, edge = 1.0): number[] {
    const weights = this.weightList(window, edge);
    const scores: number[] = [];
    const sumOfWeights = pySum(weights) * 2 + 1;
    for (let i = 0; i < this.length - window + 1; i++) {
      const sub = this.sequence.slice(i, i + window);
      let score = 0.0;
      for (let j = 0; j < Math.floor(window / 2); j++) {
        const a = sub[j]!;
        const b = sub[window - j - 1]!;
        if (scaleHas(paramDict, a) && scaleHas(paramDict, b)) {
          score += weights[j]! * scaleGet(paramDict, a) + weights[j]! * scaleGet(paramDict, b);
        } else {
          writeStderr(`warning: ${a} or ${b} is not a standard amino acid.\n`);
        }
      }
      const middle = charAt(sub, Math.floor(window / 2), this.fromText);
      if (scaleHas(paramDict, middle)) score += scaleGet(paramDict, middle);
      else writeStderr(`warning: ${middle} is not a standard amino acid.\n`);
      scores.push(score / sumOfWeights);
    }
    return scores;
  }

  /** Isoelectric point of the protein. */
  isoelectricPoint(): number {
    return new IsoelectricPoint(this.sequence, this.countAminoAcids()).pi();
  }

  /** Net charge at the given pH. */
  chargeAtPH(pH: number): number {
    return new IsoelectricPoint(this.sequence, this.countAminoAcids()).chargeAtPH(pH);
  }

  /**
   * Fractions of residues that tend to form helices, turns and sheets.
   *
   * @returns `[helix, turn, sheet]`.
   */
  secondaryStructureFraction(): [number, number, number] {
    const pct = this.aminoAcidsPercent;
    const frac = (letters: string): number => pySum([...letters].map((r) => pct.get(r)! / 100));
    return [frac("EMALK"), frac("NPGSD"), frac("VIYFWLT")];
  }

  /**
   * Molar extinction coefficient at 280 nm with all cysteines reduced, and with cystine pairs.
   *
   * @returns `[reduced, cystines]`.
   */
  molarExtinctionCoefficient(): [number, number] {
    const n = this.countAminoAcids();
    const reduced = n.get("W")! * 5500 + n.get("Y")! * 1490;
    return [reduced, reduced + Math.floor(n.get("C")! / 2) * 125];
  }
}
