/**
 * Picking primers to amplify a chosen stretch of a sequence.
 *
 * The forward primer starts at the first base of the stretch and the reverse primer ends at its last, so the product
 * is exactly the stretch asked for. Within that, the only freedom is how long each primer is, so the design is a
 * search over lengths: try every length in range and score the result.
 *
 * The score prefers, in order, a melting temperature near the target, a G or C at the 3' end, and a GC content near
 * the middle of the acceptable band. That ordering is what primer-design guides advise and what makes the choice
 * predictable; a caller wanting a different trade-off can score the candidates itself from {@link primerCandidates}.
 */

import { ValueError } from "@biolibs/core";
import { type PrimerLimits, PRIMER_LIMITS, type PrimerReport, checkPrimer } from "./check.js";
import { type Conditions, reverseComplement } from "./primer.js";

/** How a pair is designed. */
export interface DesignOptions {
  /** Melting temperature aimed for, in °C. Defaults to 60. */
  targetTm?: number;
  /** Shortest primer to consider. Defaults to 18. */
  minLength?: number;
  /** Longest primer to consider. Defaults to 30. */
  maxLength?: number;
  /** Reaction conditions for the melting temperature. */
  conditions?: Conditions;
  /** Thresholds for the warnings in each report. Defaults to {@link PRIMER_LIMITS}. */
  limits?: PrimerLimits;
}

/** A designed pair and the product it makes. */
export interface PrimerPair {
  /** The forward primer, reading along the top strand from the start of the stretch. */
  forward: PrimerReport;
  /** The reverse primer, the reverse complement of the end of the stretch. */
  reverse: PrimerReport;
  /** Where the product starts on the template, 0-based. */
  start: number;
  /** One past where it ends. */
  end: number;
  /** The product length in base pairs. */
  length: number;
}

/** The defaults {@link designPrimers} uses: aim for 60 °C with primers of 18 to 30 bases. */
export const DEFAULT_DESIGN: Required<Pick<DesignOptions, "targetTm" | "minLength" | "maxLength">> = {
  targetTm: 60, minLength: 18, maxLength: 30,
};

/**
 * Every primer that could be used at one end of a stretch, one per length in range.
 *
 * @param anchored - The sequence starting at the primer's 5' end and running 5' to 3', i.e. the template from the
 *   start of the stretch for a forward primer, or the reverse complement of its end for a reverse primer.
 * @param options - Length range, target and conditions.
 * @returns A report per length, shortest first. Lengths that run past the end of `anchored` are left out.
 * @throws {@link ValueError} for a length range the wrong way round.
 */
export function primerCandidates(anchored: string, options: DesignOptions = {}): PrimerReport[] {
  const minLength = options.minLength ?? DEFAULT_DESIGN.minLength;
  const maxLength = options.maxLength ?? DEFAULT_DESIGN.maxLength;
  if (minLength > maxLength) throw new ValueError(`minLength ${minLength} is above maxLength ${maxLength}`);
  if (minLength < 1) throw new ValueError(`minLength must be at least 1, got ${minLength}`);

  const reports: PrimerReport[] = [];
  for (let length = minLength; length <= Math.min(maxLength, anchored.length); length++) {
    const candidate = anchored.slice(0, length);
    // A stretch holding an ambiguity code has no usable primer at that length; skip it rather than failing.
    if (!/^[ACGT]+$/.test(candidate)) continue;
    reports.push(checkPrimer(candidate, options.conditions, options.limits ?? PRIMER_LIMITS));
  }
  return reports;
}

/**
 * Score a candidate: lower is better.
 *
 * Distance from the target melting temperature dominates, since a pair that does not anneal together will not work
 * at all. A missing GC clamp costs a fixed amount comparable to a couple of degrees, and GC content away from the
 * middle of the band costs a little.
 *
 * @param report - A candidate's report.
 * @param targetTm - The melting temperature aimed for.
 * @param limits - The acceptable GC band.
 * @returns The score.
 */
function score(report: PrimerReport, targetTm: number, limits: PrimerLimits): number {
  const middleGc = (limits.minGc + limits.maxGc) / 2;
  return Math.abs(report.tm - targetTm) + (report.gcClamp ? 0 : 2) + Math.abs(report.gc - middleGc) * 2;
}

/**
 * Pick the best primer from a set of candidates.
 *
 * @param candidates - Reports from {@link primerCandidates}.
 * @param options - Target and limits, as {@link designPrimers} takes them.
 * @returns The best candidate, or `null` for an empty set. Ties are broken towards the shorter primer.
 */
export function bestCandidate(candidates: readonly PrimerReport[], options: DesignOptions = {}): PrimerReport | null {
  const targetTm = options.targetTm ?? DEFAULT_DESIGN.targetTm;
  const limits = options.limits ?? PRIMER_LIMITS;
  let best: PrimerReport | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const value = score(candidate, targetTm, limits);
    // Strictly less, so the first (shortest) of equally good candidates wins.
    if (value < bestScore) { best = candidate; bestScore = value; }
  }
  return best;
}

/**
 * Design a pair of primers to amplify `template[start, end)`.
 *
 * @param template - The template sequence, upper case.
 * @param start - First base of the stretch to amplify, 0-based.
 * @param end - One past the last base.
 * @param options - Target melting temperature, length range and conditions.
 * @returns The pair, or `null` when no length in range gives a usable primer at one of the ends — a stretch too
 *   short for the length range, or one whose ends hold ambiguity codes.
 * @throws {@link ValueError} for a stretch outside the template or with `end` below `start`.
 * @example
 * ```ts
 * const pair = designPrimers(template, 100, 600);
 * pair?.length;           // 500
 * pair?.forward.sequence; // starts at base 100
 * ```
 */
export function designPrimers(template: string, start: number, end: number, options: DesignOptions = {}): PrimerPair | null {
  if (!Number.isInteger(start) || !Number.isInteger(end)) throw new ValueError(`start and end must be integers, got ${start} and ${end}`);
  if (start < 0 || end > template.length) throw new ValueError(`the stretch ${start}..${end} is outside a template of ${template.length} bases`);
  if (end < start) throw new ValueError(`end ${end} is before start ${start}`);

  const stretch = template.slice(start, end);
  // The reverse primer reads 5' to 3' along the bottom strand, which is the reverse complement of the stretch.
  const forward = bestCandidate(primerCandidates(stretch, options), options);
  const reverse = bestCandidate(primerCandidates(reverseComplement(stretch), options), options);
  if (!forward || !reverse) return null;
  return { forward, reverse, start, end, length: end - start };
}

/**
 * Add a 5' tail to a primer, as an assembly or cloning primer needs.
 *
 * The tail is not checked against the template: it is there precisely because it does not match. The returned
 * sequence is the tail followed by the binding part, which is how a primer is written and ordered.
 *
 * @param tail - The 5' tail, e.g. a restriction site or an assembly overlap.
 * @param binding - The part that binds the template.
 * @returns The full primer.
 * @throws {@link ValueError} if either part holds anything but A, C, G or T.
 * @example
 * ```ts
 * withTail("GGAATTC", "ATGAGTAAAGGAGAAGAA"); // an EcoRI site ahead of the binding part
 * ```
 */
export function withTail(tail: string, binding: string): string {
  for (const [name, part] of [["tail", tail], ["binding part", binding]] as const) {
    if (part !== "" && !/^[ACGT]+$/.test(part)) throw new ValueError(`the ${name} may only contain A, C, G and T, got '${part}'`);
  }
  return tail + binding;
}
