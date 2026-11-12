/** Entity-level helpers of Biopython's `Bio.PDB.Selection`: `unfoldEntities`, `uniqueify` and `getUniqueParents`. */

import { PDBException } from "./exceptions.js";

/** The entity levels from atoms up to structures: `A`, `R`, `C`, `M`, `S`. */
export const entityLevels: readonly string[] = ["A", "R", "C", "M", "S"];

/** Anything with a level, a full id and a parent: an atom or an entity. */
export interface Levelled {
  /** Level code. */
  getLevel(): string;
  /** Full id. */
  getFullId(): unknown[];
  /** Parent, or null. */
  getParent(): unknown;
}

/**
 * Python's `list(set(items))` without the randomness: the distinct items in first-occurrence order. Two entities
 * count as the same when their full ids match; Python's hash (which decides set membership) is built from the full
 * id, so entities of different structures stay apart even though `==` ignores the structure id.
 * Biopython's own order is a hash order and varies between runs, so callers must not depend on it.
 *
 * @param items - The items.
 * @param key - A string identifying an item (default: the item's full id).
 */
export function uniqueify<T>(items: Iterable<T>, key: (x: T) => string = (x) => JSON.stringify((x as unknown as Levelled).getFullId())): T[] {
  const seen = new Map<string, T>();
  for (const x of items) if (!seen.has(key(x))) seen.set(key(x), x);
  return [...seen.values()];
}

/**
 * The distinct parents of some entities (in first-occurrence order).
 *
 * @param entityList - Atoms or entities.
 */
export function getUniqueParents(entityList: Iterable<Levelled>): unknown[] {
  return uniqueify([...entityList].map((e) => e.getParent() as Levelled));
}

/** The children of an entity or wrapper, as Python's `iter(entity)` yields them. */
function children(e: unknown): Iterable<unknown> {
  const x = e as { childList?: unknown[]; [Symbol.iterator]?: () => Iterator<unknown> };
  if (x.childList) return x.childList;
  if (typeof x[Symbol.iterator] === "function") return x as Iterable<unknown>;
  throw new TypeError("object is not iterable");
}

/**
 * Unfold a list of entities to a list of entities of another level: atoms to residues, a model to its atoms, ...
 * Going down lists every child in order; going up lists each distinct parent in order of first appearance.
 *
 * @param entityList - A list of entities of the same level (or a single entity).
 * @param targetLevel - `A`, `R`, `C`, `M` or `S`.
 * @returns The entities of the target level.
 * @throws PDBException for an unknown level or a list that mixes levels.
 */
export function unfoldEntities(entityList: Levelled[] | Levelled, targetLevel: string): unknown[] {
  if (!entityLevels.includes(targetLevel)) throw new PDBException(`${targetLevel}: Not an entity level.`);
  if (Array.isArray(entityList) && entityList.length === 0) return [];
  const list: Levelled[] = Array.isArray(entityList) ? entityList : [entityList];
  const level = list[0]!.getLevel();
  if (!list.every((e) => e.getLevel() === level)) throw new PDBException("Entity list is not homogeneous.");
  const targetIndex = entityLevels.indexOf(targetLevel), levelIndex = entityLevels.indexOf(level);
  if (levelIndex === targetIndex) return list;
  let entities: unknown[] = list;
  if (levelIndex > targetIndex) {
    // Going down, e.g. S->A: flatten once per level.
    for (let i = targetIndex; i < levelIndex; i++) entities = entities.flatMap((e) => [...children(e)]);
  } else {
    // Going up, e.g. A->S: Python builds a dict keyed by the parent, which keeps first-appearance order.
    for (let i = levelIndex; i < targetIndex; i++) {
      const seen = new Map<string, unknown>();
      for (const e of entities as Levelled[]) {
        const p = e.getParent() as Levelled | null;
        if (p === null) throw new TypeError("'NoneType' object has no attribute 'get_parent'");
        const k = JSON.stringify(p.getFullId());
        if (!seen.has(k)) seen.set(k, p);
      }
      entities = [...seen.values()];
    }
  }
  return entities;
}
