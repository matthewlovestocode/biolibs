/** `ScoreDistribution`: the distribution of PSSM scores for a motif and for background, and the thresholds read from it. */

import { IndexError, ValueError } from "@biolibs/core";
import { pow2 } from "./errors.js";
import { pyFloorDiv } from "./pyfloat.js";
import type { PositionSpecificScoringMatrix } from "./matrix.js";

/** Python's `int(x)` for a float. @throws ValueError for NaN, OverflowError for infinities. */
export function pyIntOfFloat(x: number): number {
  if (Number.isNaN(x)) throw new ValueError("cannot convert float NaN to integer");
  if (!Number.isFinite(x)) throw Object.assign(new Error("cannot convert float infinity to integer"), { name: "OverflowError" });
  return Math.trunc(x) + 0;
}

/** Python list indexing `list[i]`: negative counts from the end. @throws IndexError out of range. */
function at(list: number[], i: number, what = "list index"): number {
  const j = i < 0 ? list.length + i : i;
  if (j < 0 || j >= list.length) throw new IndexError(`${what} out of range`);
  return list[j]!;
}

/** Python `list[i] = value` with negative indexing. */
function put(list: number[], i: number, value: number): void {
  const j = i < 0 ? list.length + i : i;
  if (j < 0 || j >= list.length) throw new IndexError("list assignment index out of range");
  list[j] = value;
}

/**
 * Scores are binned into `precision * length` points between the lowest possible score (or 0) and the highest (or 0);
 * the density of the motif and of the background over the bins is built one position at a time.
 */
export class ScoreDistribution {
  /** The lowest score. */
  minScore: number;
  /** Highest minus lowest score. */
  interval: number;
  /** The number of bins. */
  nPoints: number;
  /** The mean score under the background. */
  ic: number;
  /** The bin width. */
  step: number;
  /** Probability of each score bin for the motif. */
  moDensity: number[];
  /** Probability of each score bin for the background. */
  bgDensity: number[];

  /**
   * @param precision - Bins per motif position.
   * @param pssm - The scoring matrix.
   * @param background - Normalised background probabilities by letter.
   * @throws ValueError / IndexError / OverflowError where Biopython's arithmetic does (for example for matrices with -infinity scores).
   */
  constructor(precision: number, pssm: PositionSpecificScoringMatrix | null, background: Record<string, number> | Map<string, number> | null) {
    if (pssm === null) throw new TypeError("'NoneType' object has no attribute 'min_score'");
    const length = pssm.length ?? 0;
    this.minScore = Math.min(0.0, pssm.min);
    this.interval = Math.max(0.0, pssm.max) - this.minScore;
    this.nPoints = precision * length;
    this.ic = pssm.mean(background);
    this.step = this.interval / (this.nPoints - 1);
    this.moDensity = new Array<number>(this.nPoints).fill(0);
    put(this.moDensity, -this.indexDiff(this.minScore), 1.0);
    this.bgDensity = new Array<number>(this.nPoints).fill(0);
    put(this.bgDensity, -this.indexDiff(this.minScore), 1.0);
    const bg = background instanceof Map ? background : new Map(Object.entries(background ?? {}));
    for (let position = 0; position < length; position++) {
      const moNew = new Array<number>(this.nPoints).fill(0);
      const bgNew = new Array<number>(this.nPoints).fill(0);
      for (const letter of pssm.alphabet) {
        const score = pssm.row(letter)[position]!;
        const b = bg.get(letter)!;
        const mo = pow2(score) * b;
        const d = this.indexDiff(score);
        for (let i = 0; i < this.nPoints; i++) {
          const k = this.add(i, d);
          moNew[k]! += this.moDensity[i]! * mo;
          bgNew[k]! += this.bgDensity[i]! * b;
        }
      }
      this.moDensity = moNew;
      this.bgDensity = bgNew;
    }
  }

  private indexDiff(x: number, y = 0.0): number { return pyIntOfFloat(pyFloorDiv(x - y + 0.5 * this.step, this.step)); }
  private add(i: number, j: number): number { return Math.max(0, Math.min(this.nPoints - 1, i + j)); }

  /** The score above which at most `fpr` of the background lies. @param fpr - False positive rate. */
  thresholdFpr(fpr: number): number {
    let i = this.nPoints, prob = 0.0;
    while (prob < fpr) { i -= 1; prob += at(this.bgDensity, i); }
    return this.minScore + i * this.step;
  }

  /** The score below which at most `fnr` of the motif's instances lie. @param fnr - False negative rate. */
  thresholdFnr(fnr: number): number {
    let i = -1, prob = 0.0;
    while (prob < fnr) { i += 1; prob += at(this.moDensity, i); }
    return this.minScore + i * this.step;
  }

  /**
   * The threshold where false positive rate (times `rateProportion`) meets false negative rate.
   *
   * @param rateProportion - Weight of the false positive rate.
   * @param returnRate - Also return the false positive rate.
   */
  thresholdBalanced(rateProportion = 1.0, returnRate = false): number | [number, number] {
    let i = this.nPoints, fpr = 0.0, fnr = 1.0;
    while (fpr * rateProportion < fnr) { i -= 1; fpr += at(this.bgDensity, i); fnr -= at(this.moDensity, i); }
    return returnRate ? [this.minScore + i * this.step, fpr] : this.minScore + i * this.step;
  }

  /** The threshold of Hertz and Stormo's Patser: the false positive rate `2^-ic`. */
  thresholdPatser(): number { return this.thresholdFpr(2 ** -this.ic); }
}
