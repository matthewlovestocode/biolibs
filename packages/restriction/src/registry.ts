/** Late-bound access to the enzyme collection, so the enzyme class need not import the batch class that imports it. */

import type { RestrictionBatch } from "./batch.js";
import type { RestrictionType } from "./restriction-type.js";

/** Hooks set once by `enzymes.ts` when the enzymes are built. */
export const registry: {
  /** Every enzyme. */
  allEnzymes: RestrictionBatch | null;
  /** Enzymes by name. */
  byName: Map<string, RestrictionType>;
  /** Make a batch from enzymes. */
  makeBatch: (items: Iterable<RestrictionType>) => RestrictionBatch;
} = { allEnzymes: null, byName: new Map(), makeBatch: () => { throw new Error("enzymes are not loaded"); } };

/** @returns Every enzyme in Biopython's `AllEnzymes` batch. */
export function allEnzymes(): RestrictionBatch {
  if (registry.allEnzymes === null) throw new Error("enzymes are not loaded");
  return registry.allEnzymes;
}
