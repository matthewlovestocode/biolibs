/**
 * Searching for the rings a set of fragments can be assembled into.
 *
 * The search is a depth-first walk that only extends a chain when the next fragment's start overlaps the chain's
 * end, which keeps it fast in practice even though the number of arrangements grows factorially. Every ring is
 * started at the first fragment, since a ring can be read from any of them, and products are then deduplicated by
 * the molecule they are rather than the order the fragments were put in — two different orders that give the same
 * plasmid are reported once.
 *
 * `gibson-types.ts` holds the types and the overlap search, `gibson-ring.ts` writes a found ring out, and
 * `gibson-design.ts` goes the other way: creating the overlaps with primer tails rather than finding them.
 */

import { residuesOf } from "@biolibs/seqedit";
import {
  DEFAULT_GIBSON, type GibsonFragment, type GibsonOptions, type GibsonProduct, type GibsonResult,
  MAX_FRAGMENTS, MAX_GIBSON_PRODUCTS, overlapLength,
} from "./gibson-types.js";
import { type Oriented, buildRing, canonicalCircular, orientations } from "./gibson-ring.js";

/** How many raw rings to collect before deduplicating; plenty to reduce to {@link MAX_GIBSON_PRODUCTS}. */
const SEARCH_LIMIT = MAX_GIBSON_PRODUCTS * 4;

/**
 * Find every ring the fragments can be assembled into.
 *
 * @param fragments - The fragments, each used exactly once. Up to {@link MAX_FRAGMENTS} of them, or a single
 *   fragment whose own two ends overlap.
 * @param options - Overlap limits and whether fragments may be turned over.
 * @returns The rings, shortest first, or the reason there are none.
 * @example
 * ```ts
 * const result = assembleGibson([backbone, insert], { minOverlap: 20 });
 * if (result.ok) result.products[0]!.junctions.map((j) => j.tm);
 * ```
 */
export function assembleGibson(fragments: readonly GibsonFragment[], options: GibsonOptions = {}): GibsonResult {
  const o = { ...DEFAULT_GIBSON, ...options };
  const refused = checkInput(fragments, o);
  if (refused) return { ok: false, error: refused };

  const pool = fragments.flatMap((fragment, i) => orientations(fragment, i, o.allowFlips));
  const rings = searchRings(fragments.length, pool, o);
  if (rings.length === 0) return { ok: false, error: explainFailure(fragments, pool, o) };

  // Build each ring, then keep one product per distinct molecule.
  const byMolecule = new Map<string, GibsonProduct>();
  for (const ring of rings) {
    const product = buildRing(ring, o);
    const key = canonicalCircular(residuesOf(product.record));
    if (!byMolecule.has(key)) byMolecule.set(key, product);
  }

  const products = [...byMolecule.values()].sort((a, b) => a.length - b.length || a.description.localeCompare(b.description));
  return { ok: true, products: products.slice(0, MAX_GIBSON_PRODUCTS) };
}

/**
 * Check the fragments before searching, so a bad input is explained rather than quietly giving no rings.
 *
 * @param fragments - The fragments as given.
 * @param o - The settings.
 * @returns The reason to refuse, or `null` when the input is usable.
 */
function checkInput(fragments: readonly GibsonFragment[], o: Required<GibsonOptions>): string | null {
  if (o.minOverlap < 1) return `the shortest overlap must be at least 1, not ${o.minOverlap}`;
  if (o.minOverlap > o.maxOverlap) return `the shortest overlap ${o.minOverlap} is longer than the longest ${o.maxOverlap}`;
  if (fragments.length === 0) return "there are no fragments to assemble";
  if (fragments.length > MAX_FRAGMENTS) return `at most ${MAX_FRAGMENTS} fragments can be assembled at once, not ${fragments.length}`;

  const names = new Set<string>();
  for (const fragment of fragments) {
    if (fragment.name === "") return "a fragment has no name";
    if (names.has(fragment.name)) return `two fragments are both called '${fragment.name}'`;
    names.add(fragment.name);
    if (!/^[ACGT]+$/.test(fragment.residues)) return `fragment '${fragment.name}' must be unambiguous DNA (A, C, G and T)`;
    if (fragment.residues.length <= o.minOverlap) {
      return `fragment '${fragment.name}' is ${fragment.residues.length} bases, too short to carry an overlap of ${o.minOverlap}`;
    }
  }
  return null;
}

/**
 * Walk the fragments depth-first, collecting every arrangement that closes into a ring.
 *
 * @param count - How many fragments there are, each of which must be used once.
 * @param pool - The fragments in every orientation allowed.
 * @param o - The overlap limits.
 * @returns The rings found, as ordered lists of oriented fragments.
 */
function searchRings(count: number, pool: readonly Oriented[], o: Required<GibsonOptions>): Oriented[][] {
  const rings: Oriented[][] = [];
  const used = new Array<boolean>(count).fill(false);

  const walk = (chain: Oriented[]): void => {
    if (rings.length >= SEARCH_LIMIT) return;
    if (chain.length === count) {
      // The ring closes only if the last fragment's end overlaps the first fragment's start.
      if (overlapLength(chain[chain.length - 1]!.residues, chain[0]!.residues, o.minOverlap, o.maxOverlap) > 0) rings.push([...chain]);
      return;
    }
    for (const next of pool) {
      if (used[next.index]) continue;
      if (overlapLength(chain[chain.length - 1]!.residues, next.residues, o.minOverlap, o.maxOverlap) === 0) continue;
      used[next.index] = true;
      chain.push(next);
      walk(chain);
      chain.pop();
      used[next.index] = false;
    }
  };

  // Starting every ring at fragment 0 costs nothing, since a ring can be read from any fragment.
  for (const start of pool.filter((p) => p.index === 0)) {
    used[start.index] = true;
    walk([start]);
    used[start.index] = false;
  }
  return rings;
}

/**
 * Say why no ring could be made, in terms a caller can act on.
 *
 * @param fragments - The fragments as given.
 * @param pool - The fragments in every orientation allowed.
 * @param o - The overlap limits.
 * @returns The reason.
 */
function explainFailure(fragments: readonly GibsonFragment[], pool: readonly Oriented[], o: Required<GibsonOptions>): string {
  // With one fragment there are no others to pair with, so the lonely test below would always fire and say so
  // misleadingly: a single fragment assembles by closing on itself, and that is what failed.
  if (fragments.length === 1) {
    return `the ends of '${fragments[0]!.name}' do not overlap by at least ${o.minOverlap} bases, so it cannot close into a circle`;
  }
  // A fragment with no partner at all is the usual cause, and the most useful thing to report.
  const lonely = fragments.filter((fragment) => {
    const mine = pool.filter((p) => p.name === fragment.name);
    return !pool.some((other) => other.name !== fragment.name && mine.some((m) =>
      overlapLength(m.residues, other.residues, o.minOverlap, o.maxOverlap) > 0
      || overlapLength(other.residues, m.residues, o.minOverlap, o.maxOverlap) > 0));
  });
  if (lonely.length > 0) {
    const names = lonely.map((f) => `'${f.name}'`).join(", ");
    return `no overlap of at least ${o.minOverlap} bases joins ${names} to any other fragment`;
  }
  return "the fragments overlap in pairs but cannot be arranged into a ring that uses each of them once";
}
