/**
 * Where a primer binds a template, and the products a set of primers would amplify.
 *
 * A primer binds wherever the template matches it closely enough. Matching is base for base over the primer's whole
 * length, allowing a few mismatches, since insertions and deletions in a primer-template duplex are not what limits
 * PCR specificity. Mismatches near the 3' end matter far more than ones near the 5' end — the polymerase extends
 * from the 3' end — so {@link findBindingSites} counts them separately and a caller can refuse sites with any.
 *
 * Positions are 0-based half-open spans of the template, as elsewhere in biolibs. A forward site's span is where the
 * primer sits reading along the top strand; a reverse site's span is likewise the stretch of the top strand it
 * covers, with the primer itself matching the bottom strand there.
 */

import { ValueError } from "@biolibs/core";
import { reverseComplement } from "./primer.js";

/** Whether a sequence is a line with two ends or a closed circle. */
export type Topology = "linear" | "circular";

/** Which strand a primer anneals to. */
export type Strand = "forward" | "reverse";

/** One place a primer binds the template. */
export interface BindingSite {
  /** First base of the template covered, 0-based. */
  start: number;
  /** One past the last base covered. On a circular template this may exceed the length, meaning the site wraps. */
  end: number;
  /** `"forward"` when the primer matches the top strand, `"reverse"` when it matches the bottom. */
  strand: Strand;
  /** Total mismatched bases. */
  mismatches: number;
  /** Mismatches within {@link BindingOptions.endWindow} bases of the primer's 3' end. */
  endMismatches: number;
  /** The 0-based position of the base the polymerase would add first, i.e. just past the primer's 3' end. */
  extendsFrom: number;
}

/** How tolerant a search for binding sites should be. */
export interface BindingOptions {
  /** Most mismatches allowed anywhere in the primer. Defaults to 0, i.e. an exact match. */
  maxMismatches?: number;
  /** Most mismatches allowed inside the 3' window. Defaults to 0: the 3' end must match exactly. */
  maxEndMismatches?: number;
  /** How many bases at the 3' end count as the window. Defaults to 5. */
  endWindow?: number;
}

/** An exact match with an untouched 3' end, over a five-base window. */
export const DEFAULT_BINDING: Required<BindingOptions> = { maxMismatches: 0, maxEndMismatches: 0, endWindow: 5 };

/**
 * Every place a primer would bind a template, on either strand.
 *
 * @param template - The template sequence, upper case. Characters outside A, C, G and T never match.
 * @param topology - `"linear"` or `"circular"`. A circular template is searched across its origin too.
 * @param primer - A cleaned primer sequence.
 * @param options - How many mismatches to tolerate; see {@link DEFAULT_BINDING}.
 * @returns The sites, ordered by `start` then by strand (forward before reverse).
 * @throws {@link ValueError} for an empty primer, a primer longer than a circular template, or negative options.
 * @example
 * ```ts
 * findBindingSites("AAAGGTACCTTT", "linear", "GGTACC");
 * // [{ start: 3, end: 9, strand: "forward", ... }, { start: 3, end: 9, strand: "reverse", ... }]
 * ```
 */
export function findBindingSites(
  template: string, topology: Topology, primer: string, options: BindingOptions = {},
): BindingSite[] {
  const o = { ...DEFAULT_BINDING, ...options };
  if (primer.length === 0) throw new ValueError("a primer may not be empty");
  if (o.maxMismatches < 0 || o.maxEndMismatches < 0 || o.endWindow < 0) throw new ValueError("binding options may not be negative");
  if (topology === "circular" && primer.length > template.length) {
    throw new ValueError(`a ${primer.length}-base primer cannot bind a circular template of ${template.length} bases`);
  }
  if (primer.length > template.length && topology === "linear") return [];

  const rc = reverseComplement(primer);
  // A circular template is searched as itself with the first primer.length-1 bases repeated, so a site spanning the
  // origin is found once, at a start inside the original sequence.
  const searchable = topology === "circular" ? template + template.slice(0, primer.length - 1) : template;
  const lastStart = searchable.length - primer.length;

  const sites: BindingSite[] = [];
  for (let start = 0; start <= lastStart; start++) {
    const window = searchable.slice(start, start + primer.length);
    for (const strand of ["forward", "reverse"] as const) {
      // A forward primer's 3' end is at the right of the window; a reverse primer's is at the left.
      const probe = strand === "forward" ? primer : rc;
      const counted = countMismatches(window, probe, strand === "forward" ? "right" : "left", o.endWindow);
      if (counted === null) continue;
      if (counted.total > o.maxMismatches || counted.end > o.maxEndMismatches) continue;
      sites.push({
        start,
        end: start + primer.length,
        strand,
        mismatches: counted.total,
        endMismatches: counted.end,
        extendsFrom: strand === "forward" ? start + primer.length : start - 1,
      });
    }
  }
  return sites;
}

/**
 * Count the mismatches between a template window and a probe, and how many fall in the 3' window.
 *
 * @param window - The stretch of template, same length as `probe`.
 * @param probe - The primer as it would lie on the top strand.
 * @param threePrime - Which end of `window` the primer's 3' end sits at.
 * @param endWindow - How many bases at that end count as the 3' window.
 * @returns The counts, or `null` if the window holds a character that cannot pair at all.
 */
function countMismatches(
  window: string, probe: string, threePrime: "left" | "right", endWindow: number,
): { total: number; end: number } | null {
  let total = 0;
  let end = 0;
  for (let i = 0; i < probe.length; i++) {
    const base = window[i]!;
    // Anything that is not an unambiguous base is treated as unpairable, so a run of Ns is not a binding site.
    if (!"ACGT".includes(base)) return null;
    if (base === probe[i]) continue;
    total++;
    const distanceFromEnd = threePrime === "right" ? probe.length - 1 - i : i;
    if (distanceFromEnd < endWindow) end++;
  }
  return { total, end };
}
