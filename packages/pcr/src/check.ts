/**
 * Primer quality: the measurements a report shows and the warnings that go with them.
 *
 * The thresholds below are the ones every primer-design guide repeats, and they are advisory: a primer that trips a
 * warning often still works, and one that trips none can still fail. They are gathered in {@link PRIMER_LIMITS} so a
 * caller can tighten or relax them rather than reimplement the checks.
 */

import { ValueError } from "@biolibs/core";
import { type Conditions, gcFractionOf, primerTm, requirePrimer, reverseComplement } from "./primer.js";

/** The thresholds the warnings in {@link checkPrimer} are measured against. */
export interface PrimerLimits {
  /** Shortest primer that does not draw a warning. */
  minLength: number;
  /** Longest primer that does not draw a warning. */
  maxLength: number;
  /** Lowest GC fraction that does not draw a warning. */
  minGc: number;
  /** Highest GC fraction that does not draw a warning. */
  maxGc: number;
  /** Lowest melting temperature in °C that does not draw a warning. */
  minTm: number;
  /** Highest melting temperature in °C that does not draw a warning. */
  maxTm: number;
  /** Longest run of one base that does not draw a warning. */
  maxRun: number;
  /** Longest self-complementary stretch, anywhere in the primer, that does not draw a warning. */
  maxSelfComplement: number;
  /** Longest self-complementary stretch at the 3' end that does not draw a warning. */
  maxEndSelfComplement: number;
}

/** The usual advisory limits: 18–30 bases, 40–60% GC, 55–65 °C, no run over 4, little self-complementarity. */
export const PRIMER_LIMITS: PrimerLimits = {
  minLength: 18, maxLength: 30, minGc: 0.4, maxGc: 0.6, minTm: 55, maxTm: 65,
  maxRun: 4, maxSelfComplement: 8, maxEndSelfComplement: 4,
};

/** What is known about one primer. */
export interface PrimerReport {
  /** The primer as checked. */
  sequence: string;
  /** Length in bases. */
  length: number;
  /** Fraction that is G or C, 0 to 1. */
  gc: number;
  /** Melting temperature in °C. */
  tm: number;
  /** Longest run of a single base. */
  longestRun: number;
  /** Longest self-complementary stretch anywhere in the primer — how readily it forms a self-dimer or hairpin. */
  selfComplement: number;
  /** Longest self-complementary stretch involving the 3' end, where it blocks extension. */
  endSelfComplement: number;
  /** Whether the last base is G or C, which helps the polymerase grip. */
  gcClamp: boolean;
  /** Advisory warnings, in the order the measurements are listed above. Empty when the primer looks fine. */
  warnings: string[];
}

/**
 * The longest run of a single repeated base.
 *
 * @param sequence - A cleaned primer sequence.
 * @returns The run length; 0 for an empty sequence.
 */
export function longestRun(sequence: string): number {
  let longest = 0;
  let run = 0;
  let previous = "";
  for (const ch of sequence) {
    run = ch === previous ? run + 1 : 1;
    previous = ch;
    if (run > longest) longest = run;
  }
  return longest;
}

/**
 * The longest stretch of the primer that is complementary to another stretch of itself — the stretch that would pair
 * if two copies of the primer annealed, or if it folded back on itself.
 *
 * Found by sliding the primer against its own reverse complement at every offset and taking the longest run of
 * paired bases. That measures self-complementarity, not the free energy of the structure it would form, so it is a
 * rough guide: a real hairpin prediction needs a folding algorithm.
 *
 * @param sequence - A cleaned primer sequence.
 * @param mustIncludeEnd - When true, count only stretches that include the primer's 3' end, where self-pairing stops
 *   the polymerase extending.
 * @returns The length of the longest such stretch.
 * @example
 * ```ts
 * selfComplementarity("AAAAGGGGCCCCTTTT"); // 16 — the whole thing pairs with itself
 * ```
 */
export function selfComplementarity(sequence: string, mustIncludeEnd = false): number {
  const rc = reverseComplement(sequence);
  const n = sequence.length;
  let best = 0;
  // Slide the reverse complement across the primer; at each offset find the longest run of matching bases.
  for (let offset = -(n - 1); offset < n; offset++) {
    let run = 0;
    let runEndsAt3Prime = false;
    for (let i = 0; i < n; i++) {
      const j = i + offset;
      if (j < 0 || j >= n) { run = 0; continue; }
      if (sequence[i] === rc[j]) {
        run++;
        // Position n-1 of the primer is its 3' end; a run covering it blocks extension.
        if (i === n - 1) runEndsAt3Prime = true;
        if ((!mustIncludeEnd || runEndsAt3Prime) && run > best) best = run;
      } else {
        run = 0;
        runEndsAt3Prime = false;
      }
    }
  }
  return best;
}

/**
 * Measure a primer and list what is worth warning about.
 *
 * @param primer - A cleaned primer sequence.
 * @param conditions - Reaction conditions for the melting temperature.
 * @param limits - Thresholds to judge against; defaults to {@link PRIMER_LIMITS}.
 * @returns The report. `warnings` is empty for a primer that trips none of the limits.
 * @throws {@link ValueError} if the primer is not usable.
 * @example
 * ```ts
 * const report = checkPrimer("GTAAAACGACGGCCAGT");  // the M13 forward primer
 * report.gcClamp;   // false — it ends in T
 * report.warnings;  // ["the primer is 17 bases, shorter than 18",
 *                   //  "the melting temperature is 52.8 °C, below 55 °C", ...]
 * ```
 */
export function checkPrimer(primer: string, conditions: Conditions = {}, limits: PrimerLimits = PRIMER_LIMITS): PrimerReport {
  requirePrimer(primer);
  if (limits.minLength > limits.maxLength || limits.minGc > limits.maxGc || limits.minTm > limits.maxTm) {
    throw new ValueError("primer limits are the wrong way round");
  }

  const length = primer.length;
  const gc = gcFractionOf(primer);
  const tm = primerTm(primer, conditions);
  const run = longestRun(primer);
  const self = selfComplementarity(primer);
  const endSelf = selfComplementarity(primer, true);
  const last = primer[length - 1]!;
  const gcClamp = last === "G" || last === "C";

  const warnings: string[] = [];
  if (length < limits.minLength) warnings.push(`the primer is ${length} bases, shorter than ${limits.minLength}`);
  if (length > limits.maxLength) warnings.push(`the primer is ${length} bases, longer than ${limits.maxLength}`);
  const percent = (gc * 100).toFixed(0);
  if (gc < limits.minGc) warnings.push(`the GC content is ${percent}%, below ${(limits.minGc * 100).toFixed(0)}%`);
  if (gc > limits.maxGc) warnings.push(`the GC content is ${percent}%, above ${(limits.maxGc * 100).toFixed(0)}%`);
  if (tm < limits.minTm) warnings.push(`the melting temperature is ${tm.toFixed(1)} °C, below ${limits.minTm} °C`);
  if (tm > limits.maxTm) warnings.push(`the melting temperature is ${tm.toFixed(1)} °C, above ${limits.maxTm} °C`);
  if (run > limits.maxRun) warnings.push(`it has a run of ${run} identical bases, more than ${limits.maxRun}`);
  if (self > limits.maxSelfComplement) warnings.push(`${self} bases are self-complementary, so it may form a dimer or hairpin`);
  if (endSelf > limits.maxEndSelfComplement) warnings.push(`${endSelf} bases at the 3' end are self-complementary, which would block extension`);
  if (!gcClamp) warnings.push("the 3' end is not G or C, so the polymerase has less to grip");

  return { sequence: primer, length, gc, tm, longestRun: run, selfComplement: self, endSelfComplement: endSelf, gcClamp, warnings };
}

/**
 * How far apart two primers' melting temperatures are, which decides whether one annealing temperature suits both.
 *
 * @param a - A report or a melting temperature in °C.
 * @param b - The other.
 * @returns The absolute difference in °C. A pair within about 5 °C anneals together well.
 */
export function tmDifference(a: PrimerReport | number, b: PrimerReport | number): number {
  const tm = (x: PrimerReport | number): number => (typeof x === "number" ? x : x.tm);
  return Math.abs(tm(a) - tm(b));
}
