/**
 * Where enzymes cut, in this package's coordinates.
 *
 * `@biolibs/restriction` is a faithful port of Biopython's `Bio.Restriction`, and reports a cut as the **1-based**
 * position of the base after the cut on the top strand. Everything else in biolibs counts 0-based boundaries, so
 * this module does the conversion in one place and works out where the bottom strand is cut as well.
 *
 * Biopython's `RestrictionType.ovhg` is the overhang length, negative for a 5' overhang. Since a 5' overhang means
 * the bottom strand is cut further along than the top, `bottomCut = topCut - ovhg`: EcoRI, with `ovhg = -4`, cuts
 * the bottom strand four bases past the top.
 */

import { ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { type RestrictionType, enzymes as allEnzymes } from "@biolibs/restriction";

/** Whether a sequence is a line with two ends or a closed circle. */
export type Topology = "linear" | "circular";

/** One cut in a sequence. */
export interface Cut {
  /** Where the top strand is cut, as a 0-based boundary. */
  topCut: number;
  /** Where the bottom strand is cut, in the same coordinates. */
  bottomCut: number;
  /** The enzyme's name. */
  enzyme: string;
}

/**
 * Look enzymes up by name in the full REBASE set that `@biolibs/restriction` carries.
 *
 * @param names - Enzyme names, e.g. `["EcoRI", "BamHI"]`. Case and surrounding space are significant, as in
 *   Biopython.
 * @returns The enzymes found, and the names that are not enzymes.
 * @example
 * ```ts
 * lookupEnzymes(["EcoRI", "NotAnEnzyme"]); // { enzymes: [EcoRI], unknown: ["NotAnEnzyme"] }
 * ```
 */
export function lookupEnzymes(names: readonly string[]): { enzymes: RestrictionType[]; unknown: string[] } {
  const enzymes: RestrictionType[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const enzyme = Object.prototype.hasOwnProperty.call(allEnzymes, trimmed) ? allEnzymes[trimmed] : undefined;
    if (enzyme) enzymes.push(enzyme);
    else unknown.push(trimmed);
  }
  return { enzymes, unknown };
}

/**
 * Split a list of enzyme names typed as one string.
 *
 * @param text - Names separated by spaces, commas, semicolons or plus signs, e.g. `"EcoRI, BamHI + HindIII"`.
 * @returns The names, in the order given, with blanks dropped.
 */
export const parseEnzymeNames = (text: string): string[] => text.split(/[\s,;+]+/).map((n) => n.trim()).filter(Boolean);

/**
 * Where a set of enzymes cuts a sequence.
 *
 * @param residues - The sequence, upper case.
 * @param topology - `"linear"` or `"circular"`.
 * @param enzymes - The enzymes to cut with.
 * @returns The cuts, ordered by `topCut`. A position cut by two enzymes appears once per enzyme.
 * @throws {@link ValueError} for an enzyme whose cut is not known, which cannot be simulated.
 * @example
 * ```ts
 * const { enzymes } = lookupEnzymes(["EcoRI"]);
 * cutsIn("AAAGAATTCAAA", "linear", enzymes);
 * // [{ topCut: 4, bottomCut: 8, enzyme: "EcoRI" }]
 * ```
 */
export function cutsIn(residues: string, topology: Topology, enzymes: readonly RestrictionType[]): Cut[] {
  const cuts: Cut[] = [];
  const dna = new Seq(residues);
  for (const enzyme of enzymes) {
    if (enzyme.ovhg === null || enzyme.isA("NotDefined") || enzyme.isA("Unknown")) {
      throw new ValueError(`where ${enzyme.name} cuts is not known, so it cannot be simulated`);
    }
    // Bio.Restriction reports the 1-based position of the base after the cut; we count 0-based boundaries.
    for (const position of enzyme.search(dna, topology === "linear")) {
      const topCut = position - 1;
      cuts.push({ topCut, bottomCut: topCut - enzyme.ovhg, enzyme: enzyme.name });
    }
  }
  return cuts.sort((a, b) => a.topCut - b.topCut || a.enzyme.localeCompare(b.enzyme));
}

/**
 * How many times each enzyme cuts.
 *
 * @param cuts - Cuts from {@link cutsIn}.
 * @returns A count per enzyme name.
 */
export function cutCounts(cuts: readonly Cut[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cut of cuts) counts.set(cut.enzyme, (counts.get(cut.enzyme) ?? 0) + 1);
  return counts;
}

/**
 * The enzymes that cut no more than `max` times, the ones worth using to cut a construct open.
 *
 * @param cuts - Cuts from {@link cutsIn}.
 * @param max - Most cuts allowed. Defaults to 1, i.e. the unique cutters.
 * @returns The enzyme names, alphabetically.
 */
export function cuttersUpTo(cuts: readonly Cut[], max = 1): string[] {
  return [...cutCounts(cuts)].filter(([, n]) => n <= max && n > 0).map(([name]) => name).sort();
}
