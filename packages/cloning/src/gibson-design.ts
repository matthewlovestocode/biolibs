/**
 * Designing a Gibson assembly: the PCR primers that give fragments the overlaps they need.
 *
 * A fragment amplified by PCR gets its overlaps from its primers' 5' tails. The forward primer carries the end of
 * the fragment before it, and the reverse primer carries the start of the fragment after it (reverse-complemented,
 * since a reverse primer reads along the bottom strand). Between two amplified fragments the overlap is shared out
 * half on each primer, which keeps both primers short. A fragment used as it is — a vector opened with an enzyme,
 * say — cannot be given a tail, so its neighbour's primer has to carry the whole overlap.
 */

import { ValueError } from "@biolibs/core";
import { type PrimerReport, checkPrimer, designPrimers, primerTm, withTail } from "@biolibs/pcr";
import { reverseComplement } from "./ends.js";
import { MAX_OVERLAP, MIN_OVERLAP } from "./gibson-types.js";

/** One fragment in a planned assembly, in the order it is to go round the ring. */
export interface DesignFragment {
  /** What to call it. */
  name: string;
  /** Its sequence, 5' to 3', unambiguous DNA, as it will appear in the ring. */
  residues: string;
  /** Whether it is to be amplified by PCR, and so can be given primer tails. Defaults to true. */
  amplify?: boolean;
}

/** How the design is done. */
export interface DesignOptions {
  /** The overlap to design at each junction, in bases. Defaults to 25. */
  overlap?: number;
  /** Melting temperature aimed for by the binding part of each primer. Defaults to 60. */
  targetTm?: number;
  /** Shortest binding part to consider. Defaults to 18. */
  minLength?: number;
  /** Longest binding part to consider. Defaults to 30. */
  maxLength?: number;
}

/** The defaults: 25-base overlaps and binding parts of 18 to 30 bases aiming at 60 °C. */
export const DEFAULT_DESIGN: Required<DesignOptions> = { overlap: 25, targetTm: 60, minLength: 18, maxLength: 30 };

/** One primer to order. */
export interface DesignedPrimer {
  /** What to call it, e.g. `"insert-F"`. */
  name: string;
  /** The 5' tail that supplies the overlap; empty when this primer carries none. */
  tail: string;
  /** The part that binds the template. */
  binding: string;
  /** The whole primer, tail then binding part — what is ordered. */
  sequence: string;
  /** Which fragment it amplifies. */
  fragment: string;
  /** `"forward"` or `"reverse"`. */
  direction: "forward" | "reverse";
  /** The report on the binding part alone, which is what decides the annealing temperature. */
  binding_report: PrimerReport;
}

/** One junction of a planned assembly. */
export interface DesignedJunction {
  /** The fragment before the junction. */
  from: string;
  /** The fragment after it. */
  to: string;
  /** The overlapping sequence that will be shared. */
  overlap: string;
  /** Its length. */
  length: number;
  /** Its melting temperature in °C. */
  tm: number;
  /** How much of the overlap each primer carries: the reverse primer of `from`, then the forward primer of `to`. */
  carried: { fromReverse: number; toForward: number };
}

/** A finished design. */
export interface GibsonDesign {
  /** The primers to order. */
  primers: DesignedPrimer[];
  /** The junctions, in the order they go round. */
  junctions: DesignedJunction[];
  /** The ring's length in base pairs. */
  length: number;
  /** Anything worth saying about the design, such as a fragment too short for the overlap wanted. */
  warnings: string[];
}

/** What came of a design. */
export type DesignResult =
  | { ok: true; design: GibsonDesign }
  | { ok: false; error: string };

/**
 * Design the primers for an assembly of fragments in the order given.
 *
 * The fragments are taken to go round the ring in the order listed, the last closing on the first. Unlike
 * `assembleGibson`, which searches for an arrangement that already works, this creates the overlaps.
 *
 * @param fragments - The fragments, in the order they are to go round. At least two.
 * @param options - The overlap to design and the primer settings.
 * @returns The design, or the reason it cannot be done.
 * @example
 * ```ts
 * const result = designGibson([
 *   { name: "backbone", residues: backbone, amplify: false },
 *   { name: "insert", residues: insert },
 * ]);
 * if (result.ok) for (const p of result.design.primers) console.log(p.name, p.sequence);
 * ```
 */
export function designGibson(fragments: readonly DesignFragment[], options: DesignOptions = {}): DesignResult {
  const o = { ...DEFAULT_DESIGN, ...options };
  if (fragments.length < 2) return { ok: false, error: "at least two fragments are needed to design an assembly" };
  if (o.overlap < MIN_OVERLAP || o.overlap > MAX_OVERLAP) {
    return { ok: false, error: `the overlap must be between ${MIN_OVERLAP} and ${MAX_OVERLAP} bases, not ${o.overlap}` };
  }
  if (o.minLength > o.maxLength) return { ok: false, error: `minLength ${o.minLength} is above maxLength ${o.maxLength}` };

  const names = new Set<string>();
  for (const fragment of fragments) {
    if (fragment.name === "") return { ok: false, error: "a fragment has no name" };
    if (names.has(fragment.name)) return { ok: false, error: `two fragments are both called '${fragment.name}'` };
    names.add(fragment.name);
    if (!/^[ACGT]+$/.test(fragment.residues)) return { ok: false, error: `fragment '${fragment.name}' must be unambiguous DNA (A, C, G and T)` };
    if (fragment.residues.length < o.overlap + o.minLength) {
      return {
        ok: false,
        error: `fragment '${fragment.name}' is ${fragment.residues.length} bases, too short for a ${o.overlap}-base overlap and a ${o.minLength}-base primer`,
      };
    }
  }
  if (fragments.every((f) => f.amplify === false)) {
    return { ok: false, error: "at least one fragment must be amplified, or there is nowhere to put an overlap" };
  }

  const amplified = (i: number): boolean => fragments[i]!.amplify !== false;
  const warnings: string[] = [];

  // Work out each junction first: how long the overlap is and who carries which part of it.
  const junctions: DesignedJunction[] = [];
  for (let i = 0; i < fragments.length; i++) {
    const from = fragments[i]!;
    const next = (i + 1) % fragments.length;
    const to = fragments[next]!;
    const fromAmp = amplified(i);
    const toAmp = amplified(next);

    if (!fromAmp && !toAmp) {
      return { ok: false, error: `neither '${from.name}' nor '${to.name}' is amplified, so the overlap between them cannot be made` };
    }

    // The overlap spans the junction: part from the end of `from`, part from the start of `to`. Sharing it between
    // two amplified fragments halves each primer's tail; with one fragment fixed, its neighbour carries it all.
    const fromShare = fromAmp && toAmp ? Math.floor(o.overlap / 2) : fromAmp ? 0 : o.overlap;
    const toShare = o.overlap - fromShare;
    const overlap = from.residues.slice(from.residues.length - fromShare) + to.residues.slice(0, toShare);

    junctions.push({
      from: from.name, to: to.name, overlap, length: overlap.length, tm: primerTm(overlap),
      // `fromReverse` is the tail on the reverse primer of `from`; `toForward` the tail on the forward primer of `to`.
      carried: { fromReverse: fromAmp ? toShare : 0, toForward: toAmp ? fromShare : 0 },
    });
    if (overlap.length !== o.overlap) {
      warnings.push(`the overlap between '${from.name}' and '${to.name}' came out at ${overlap.length} bases rather than ${o.overlap}`);
    }
  }

  // Then the primers: each amplified fragment gets a pair, whose tails come from the junctions either side.
  const primers: DesignedPrimer[] = [];
  for (let i = 0; i < fragments.length; i++) {
    const fragment = fragments[i]!;
    if (!amplified(i)) continue;
    const before = junctions[(i - 1 + junctions.length) % junctions.length]!;
    const after = junctions[i]!;

    const pair = designPrimers(fragment.residues, 0, fragment.residues.length, {
      targetTm: o.targetTm, minLength: o.minLength, maxLength: o.maxLength,
    });
    if (!pair) return { ok: false, error: `no usable primer could be designed for '${fragment.name}'` };

    // The forward primer's tail is the part of the preceding overlap that comes from the fragment before.
    const forwardTail = before.overlap.slice(0, before.carried.toForward);
    // The reverse primer reads the bottom strand, so its tail is the reverse complement of the part of the next
    // overlap that comes from the fragment after.
    const reverseTail = reverseComplement(after.overlap.slice(after.overlap.length - after.carried.fromReverse));

    primers.push({
      name: `${fragment.name}-F`, tail: forwardTail, binding: pair.forward.sequence,
      sequence: withTail(forwardTail, pair.forward.sequence),
      fragment: fragment.name, direction: "forward", binding_report: pair.forward,
    });
    primers.push({
      name: `${fragment.name}-R`, tail: reverseTail, binding: pair.reverse.sequence,
      sequence: withTail(reverseTail, pair.reverse.sequence),
      fragment: fragment.name, direction: "reverse", binding_report: pair.reverse,
    });
  }

  // The ring is every fragment's length, less one copy of each overlap, since each is shared.
  const length = fragments.reduce((n, f) => n + f.residues.length, 0) - junctions.reduce((n, j) => n + j.length, 0);

  for (const junction of junctions) {
    if (junction.tm < 48) warnings.push(`the overlap between '${junction.from}' and '${junction.to}' melts at ${junction.tm.toFixed(1)} °C, which may not anneal dependably`);
  }
  for (const primer of primers) {
    for (const warning of primer.binding_report.warnings) warnings.push(`${primer.name}: ${warning}`);
  }

  return { ok: true, design: { primers, junctions, length, warnings } };
}

/**
 * Check a primer that already carries a tail, reporting on the whole thing and on its binding part separately.
 *
 * An assembly primer is long by design, so judging it as a whole is misleading: the binding part is what sets the
 * annealing temperature, while the whole primer is what is ordered and what might form a hairpin.
 *
 * @param tail - The 5' tail.
 * @param binding - The part that binds.
 * @returns A report on each.
 * @throws {@link ValueError} if either part holds anything but A, C, G or T, or the binding part is unusable.
 * @example
 * ```ts
 * const { whole, bindingPart } = checkTailedPrimer(tail, binding);
 * bindingPart.tm; // the annealing temperature to use
 * ```
 */
export function checkTailedPrimer(tail: string, binding: string): { whole: PrimerReport; bindingPart: PrimerReport } {
  return { whole: checkPrimer(withTail(tail, binding)), bindingPart: checkPrimer(binding) };
}
