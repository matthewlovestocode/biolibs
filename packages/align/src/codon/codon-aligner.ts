/** `CodonAligner`: aligns a nucleotide sequence to a protein sequence, allowing frame shifts (Biopython's `Bio.Align.CodonAligner`). */

import { OverflowError, RuntimeError, ValueError, pyFloatRepr, pyTypeName } from "@biolibs/core";
import { CodonTable, MutableSeq, Seq, sliceIndices, translate } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { PairwiseAlignments } from "../alignment/pairwise-alignments.js";
import { CodonPaths } from "./codon-paths.js";

const MINUS_TWO = 0x1, MINUS_ONE = 0x2, NONE = 0x4, PLUS_ONE = 0x8, PLUS_TWO = 0x10;
const NEG_MAX = -Number.MAX_VALUE;

/** A number as `PyFloat_AsDouble` takes it. @throws TypeError for anything else. */
function asDouble(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new TypeError(`must be real number, not ${pyTypeName(value)}`);
}

/** The three reading frames of a nucleotide sequence, translated to protein letters (as bytes), and the query length they imply. */
interface Frames { sA: Uint8Array; sB: [Uint8Array, Uint8Array, Uint8Array]; nB: number }

/** Biopython's `Alignment`-producing nucleotide-to-protein aligner. */
export class CodonAligner {
  private match_ = 1.0;
  private mismatch_ = 0.0;
  private epsilon_ = 1e-6;
  private wild = 88; // "X"
  private minusTwo = -3.0;
  private minusOne = -3.0;
  private plusOne = -3.0;
  private plusTwo = -3.0;
  /** The genetic code used to translate the nucleotide sequence. */
  codonTable: InstanceType<typeof CodonTable.CodonTable>;

  /**
   * @param codonTable - The genetic code (default: the standard code, table 1).
   * @param _anchorLen - Accepted for compatibility; not used.
   * @throws TypeError if `codonTable` is not a `CodonTable`.
   */
  constructor(codonTable: unknown = null, _anchorLen = 10) {
    if (codonTable === null) this.codonTable = CodonTable.genericById.get(1)! as InstanceType<typeof CodonTable.CodonTable>;
    else if (!(codonTable instanceof CodonTable.CodonTable)) throw new TypeError("Input table is not a CodonTable object");
    else this.codonTable = codonTable;
  }

  /** Score of a match (default 1.0). @throws ValueError if not a number. */
  get matchScore(): number { return this.match_; }
  set matchScore(v: number) { try { this.match_ = asDouble(v); } catch { throw new ValueError("invalid match score"); } }
  /** Score of a mismatch (default 0.0). @throws ValueError if not a number. */
  get mismatchScore(): number { return this.mismatch_; }
  set mismatchScore(v: number) { try { this.mismatch_ = asDouble(v); } catch { throw new ValueError("invalid mismatch score"); } }
  /** Synonym of {@link matchScore}. */
  get match(): number { return this.matchScore; }
  set match(v: number) { this.matchScore = v; }
  /** Synonym of {@link mismatchScore}. */
  get mismatch(): number { return this.mismatchScore; }
  set mismatch(v: number) { this.mismatchScore = v; }
  /** Tolerance used when comparing scores (default 1e-6). */
  get epsilon(): number { return this.epsilon_; }
  set epsilon(v: number) { this.epsilon_ = asDouble(v); }
  /** Score of a -2 frame shift (default -3.0). */
  get frameshiftMinusTwoScore(): number { return this.minusTwo; }
  set frameshiftMinusTwoScore(v: number) { this.minusTwo = asDouble(v); }
  /** Score of a -1 frame shift (default -3.0). */
  get frameshiftMinusOneScore(): number { return this.minusOne; }
  set frameshiftMinusOneScore(v: number) { this.minusOne = asDouble(v); }
  /** Score of a +1 frame shift (default -3.0). */
  get frameshiftPlusOneScore(): number { return this.plusOne; }
  set frameshiftPlusOneScore(v: number) { this.plusOne = asDouble(v); }
  /** Score of a +2 frame shift (default -3.0). */
  get frameshiftPlusTwoScore(): number { return this.plusTwo; }
  set frameshiftPlusTwoScore(v: number) { this.plusTwo = asDouble(v); }

  /**
   * The wildcard letter (default `"X"`); a single character below code point 256.
   *
   * @throws OverflowError when reading a code of 128 or more (Biopython formats the signed C `char`).
   */
  get wildcard(): string {
    if (this.wild >= 128) throw new OverflowError("character argument not in range(0x110000)");
    return String.fromCharCode(this.wild);
  }
  set wildcard(value: unknown) {
    if (typeof value !== "string") throw new TypeError("wildcard should be a single ASCII character");
    const chars = Array.from(value);
    if (chars.length !== 1) throw new ValueError("wildcard should be a single ASCII character");
    const code = chars[0]!.codePointAt(0)!;
    if (code >= 256) throw new ValueError("wildcard should be a single ASCII character");
    this.wild = code;
  }

  /** The -1 and +1 scores, when equal. @throws ValueError otherwise. */
  get frameshiftOneScore(): number {
    if (this.frameshiftMinusOneScore !== this.frameshiftPlusOneScore) throw new ValueError("-1 and +1 frame shift scores are different");
    return this.frameshiftMinusOneScore;
  }
  set frameshiftOneScore(v: number) { const s = asDouble(v); this.frameshiftMinusOneScore = s; this.frameshiftPlusOneScore = s; }
  /** The -2 and +2 scores, when equal. @throws ValueError otherwise. */
  get frameshiftTwoScore(): number {
    if (this.frameshiftMinusTwoScore !== this.frameshiftPlusTwoScore) throw new ValueError("-2 and +2 frame shift scores are different");
    return this.frameshiftMinusTwoScore;
  }
  set frameshiftTwoScore(v: number) { const s = asDouble(v); this.frameshiftMinusTwoScore = s; this.frameshiftPlusTwoScore = s; }
  /** The -2 and -1 scores, when equal. @throws ValueError otherwise. */
  get frameshiftMinusScore(): number {
    if (this.frameshiftMinusTwoScore !== this.frameshiftMinusOneScore) throw new ValueError("-2 and -1 frame shift scores are different");
    return this.frameshiftMinusTwoScore;
  }
  set frameshiftMinusScore(v: number) { const s = asDouble(v); this.frameshiftMinusOneScore = s; this.frameshiftMinusTwoScore = s; }
  /** The +2 and +1 scores, when equal. @throws ValueError otherwise. */
  get frameshiftPlusScore(): number {
    if (this.frameshiftPlusTwoScore !== this.frameshiftPlusOneScore) throw new ValueError("+2 and +1 frame shift scores are different");
    return this.frameshiftPlusTwoScore;
  }
  set frameshiftPlusScore(v: number) { const s = asDouble(v); this.frameshiftPlusOneScore = s; this.frameshiftPlusTwoScore = s; }
  /** All four frame shift scores, when equal. @throws ValueError otherwise. */
  get frameshiftScore(): number {
    const s = this.frameshiftMinusOneScore;
    if (s !== this.frameshiftMinusTwoScore || s !== this.frameshiftPlusOneScore || s !== this.frameshiftPlusTwoScore) throw new ValueError("frame shift scores are different");
    return s;
  }
  set frameshiftScore(v: number) {
    const s = asDouble(v);
    this.frameshiftMinusTwoScore = s; this.frameshiftMinusOneScore = s; this.frameshiftPlusOneScore = s; this.frameshiftPlusTwoScore = s;
  }

  /** Python's `repr()`. */
  repr(): string { return "Codon aligner, implementing a dynamic programming algorithm to align a nucleotide sequence to an amino acid sequence"; }

  /** Python's `str()`: the parameters, one per line. */
  toString(): string {
    return "Codon aligner with parameters\n"
      + `  wildcard: '${this.wildcard}'\n`
      + `  match_score: ${pyFloatRepr(this.matchScore)}\n`
      + `  mismatch_score: ${pyFloatRepr(this.mismatchScore)}\n`
      + `  frameshift_minus_two_score: ${pyFloatRepr(this.frameshiftMinusTwoScore)}\n`
      + `  frameshift_minus_one_score: ${pyFloatRepr(this.frameshiftMinusOneScore)}\n`
      + `  frameshift_plus_one_score: ${pyFloatRepr(this.frameshiftPlusOneScore)}\n`
      + `  frameshift_plus_two_score: ${pyFloatRepr(this.frameshiftPlusTwoScore)}\n`;
  }

  /**
   * The best score of aligning a protein to a nucleotide sequence.
   *
   * @param seqA - The protein (string, `Seq`, `MutableSeq` or `SeqRecord`).
   * @param seqB - The nucleotide sequence (DNA or RNA).
   * @throws ValueError for other types, or when `seqB` is a string and `seqA` is not (Biopython tests the wrong variable).
   */
  score(seqA: unknown, seqB: unknown): number {
    const { sA, sB, nB } = this.frames(seqA, seqB);
    const row = new Float64Array(nB + 1);
    for (let i = 1; i <= sA.length; i++) {
      const cA = sA[i - 1]!;
      for (let j = nB; j > 0; j--) {
        let score = NEG_MAX;
        if (j >= 3) {
          const cB = sB[(j - 3) % 3]![Math.floor((j - 3) / 3)]!;
          const c = this.compare(cA, cB);
          let temp = row[j - 1]! + c + this.frameshiftMinusTwoScore; if (temp > score) score = temp;
          temp = row[j - 2]! + c + this.frameshiftMinusOneScore; if (temp > score) score = temp;
          temp = row[j - 3]! + c; if (temp > score) score = temp;
          if (j >= 4) { temp = row[j - 4]! + c + this.frameshiftPlusOneScore; if (temp > score) score = temp; }
          if (j >= 5) { temp = row[j - 5]! + c + this.frameshiftPlusTwoScore; if (temp > score) score = temp; }
        }
        row[j] = score;
      }
    }
    let best = NEG_MAX;
    for (let j = 0; j <= nB; j++) if (row[j]! > best) best = row[j]!;
    return best;
  }

  /**
   * All best alignments of a protein to a nucleotide sequence.
   *
   * @param seqA - The protein (the target of the alignments).
   * @param seqB - The nucleotide sequence (the query).
   * @returns The alignments (a `PairwiseAlignments`).
   */
  align(seqA: unknown, seqB: unknown): PairwiseAlignments {
    const { sA, sB, nB } = this.frames(seqA, seqB);
    const nA = sA.length;
    const trace: Uint8Array[] = Array.from({ length: nA + 1 }, () => new Uint8Array(nB + 1));
    const row = new Float64Array(nB + 1);
    const eps = this.epsilon;
    for (let i = 1; i <= nA; i++) {
      const cA = sA[i - 1]!;
      for (let j = nB; j > 0; j--) {
        let score = NEG_MAX, t = 0;
        if (j >= 3) {
          const cB = sB[(j - 3) % 3]![Math.floor((j - 3) / 3)]!;
          const c = this.compare(cA, cB);
          const options: [number, number, number][] = [[row[j - 1]! + c + this.frameshiftMinusTwoScore, MINUS_TWO, 0], [row[j - 2]! + c + this.frameshiftMinusOneScore, MINUS_ONE, 0], [row[j - 3]! + c, NONE, 0]];
          if (j >= 4) options.push([row[j - 4]! + c + this.frameshiftPlusOneScore, PLUS_ONE, 0]);
          if (j >= 5) options.push([row[j - 5]! + c + this.frameshiftPlusTwoScore, PLUS_TWO, 0]);
          for (const [temp, flag] of options) {
            if (temp > score + eps) { score = temp; t = flag; } else if (temp > score - eps) t |= flag;
          }
        }
        trace[i]![j] = t;
        row[j] = score;
      }
    }
    let best = NEG_MAX;
    for (let j = 0; j <= nB; j++) if (row[j]! > best) best = row[j]!;
    for (let j = 0; j <= nB; j++) if (row[j]! < best - eps) trace[nA]![j] = 0;
    return new PairwiseAlignments(seqA, seqB, best, new CodonPaths(trace, nA, nB, row));
  }

  private compare(cA: number, cB: number): number {
    return cA === this.wild || cB === this.wild ? 0 : cA === cB ? this.matchScore : this.mismatchScore;
  }

  /** Translate the three frames of `seqB` and check the lengths, as Biopython's Python wrapper and C entry point do. */
  private frames(seqA: unknown, seqB: unknown): Frames {
    const isSeqLike = (x: unknown): boolean => x instanceof Seq || x instanceof MutableSeq || x instanceof SeqRecord;
    let sA: Uint8Array;
    if (isSeqLike(seqA)) sA = new TextEncoder().encode(String(seqA instanceof SeqRecord ? seqA.seq : seqA));
    else if (typeof seqA === "string") sA = new TextEncoder().encode(seqA);
    else throw new ValueError("seqA must be a string, Seq, MutableSeq, or SeqRecord object");
    const n = typeof seqB === "string" ? Array.from(seqB).length : (seqB as { length?: number } | null)?.length;
    if (typeof n !== "number") throw new TypeError(`object of type '${pyTypeName(seqB)}' has no len()`);
    const cuts: [number, number][] = [[0, 3 * Math.floor(n / 3)], [1, 1 + 3 * Math.floor((n - 1) / 3)], [2, 2 + 3 * Math.floor((n - 2) / 3)]];
    const slice = (a: number, b: number): unknown => {
      const [start, stop] = sliceIndices({ start: a, stop: b }, n);
      const take = start < stop ? { start, stop, step: null } : { start: 0, stop: 0, step: null };
      if (typeof seqB === "string") return Array.from(seqB).slice(take.start, take.stop).join("");
      if (seqB instanceof SeqRecord) return seqB.get(take);
      if (Array.isArray(seqB)) return seqB.slice(take.start, take.stop);
      return (seqB as Seq | MutableSeq).get(take);
    };
    const parts = cuts.map(([a, b]) => slice(a, b));
    const bytes = (part: unknown): Uint8Array => {
      if (isSeqLike(seqB)) {
        const seq = part instanceof SeqRecord ? part.seq! : (part as Seq | MutableSeq);
        return new TextEncoder().encode(String(seq.translate(this.codonTable)));
      }
      if (typeof seqA === "string") {
        if (typeof part !== "string") throw new TypeError("attribute error");
        return new TextEncoder().encode(translate(part, this.codonTable));
      }
      throw new ValueError("seqB must be a string, Seq, MutableSeq, or SeqRecord object");
    };
    const [sB0, sB1, sB2] = parts.map(bytes) as [Uint8Array, Uint8Array, Uint8Array];
    const [n0, n1, n2] = [sB0.length, sB1.length, sB2.length];
    let nB: number;
    if (n1 === n0 && n2 === n0) nB = 3 * n0 + 2;
    else if (n1 === n0 && n2 === n0 - 1) nB = 3 * n0 + 1;
    else if (n1 === n0 - 1 && n2 === n0 - 1) nB = 3 * n0;
    else throw new RuntimeError(`unexpected length of buffers (${n0}, ${n1}, ${n2})`);
    return { sA, sB: [sB0, sB1, sB2], nB };
  }
}
