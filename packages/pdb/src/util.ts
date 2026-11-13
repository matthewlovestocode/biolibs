/** Python-flavoured helpers: dictionary keys for tuple ids, ordering of ids, and the repr of an id tuple. */

import { pyRepr } from "@biolibs/core";

/** A residue, chain or atom id: a string, an integer, or a tuple (array) of those. */
export type EntityId = string | number | readonly (string | number)[];

/**
 * A string key for an id, so ids work as `Map` keys the way Python tuples work as dict keys.
 * Strings and numbers get different prefixes, so `"1"` and `1` stay distinct.
 */
export function idKey(id: EntityId): string {
  if (Array.isArray(id)) return `t${JSON.stringify(id)}`;
  return typeof id === "number" ? `n${id}` : `s${id as string}`;
}

/** Python `a < b` ordering of ids: numbers numerically, strings by code point, tuples element by element. */
export function compareIds(a: unknown, b: unknown): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      const c = compareIds(a[k], b[k]);
      if (c !== 0) return c;
    }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  }
  if (typeof a === "string" && typeof b === "string") {
    const x = Array.from(a, (c) => c.codePointAt(0)!);
    const y = Array.from(b, (c) => c.codePointAt(0)!);
    return compareIds(x, y);
  }
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  if (a === null || b === null || a === undefined || b === undefined) {
    if (a === b) return 0;
    throw new TypeError("'<' not supported between instances of 'NoneType' and other types");
  }
  throw new TypeError(`'<' not supported between instances of '${idTypeName(a)}' and '${idTypeName(b)}'`);
}

/** Python's type name for an id: `str`, `int`, `tuple` or `NoneType`. */
function idTypeName(x: unknown): string {
  if (x === null || x === undefined) return "NoneType";
  if (Array.isArray(x)) return "tuple";
  return typeof x === "string" ? "str" : typeof x === "number" ? "int" : typeof x;
}

/** The id an {@link idKey} string stands for. */
export function keyToId(key: string): EntityId {
  if (key[0] === "n") return Number(key.slice(1));
  if (key[0] === "t") return JSON.parse(key.slice(1)) as EntityId;
  return key.slice(1);
}

/**
 * Python's `sorted(ids)`: CPython's run detection and binary insertion sort, so that comparing ids of different
 * kinds raises the same `TypeError` (naming the same two types) as Python does.
 *
 * @param ids - The ids to sort.
 * @returns A new sorted array.
 * @throws TypeError when two ids cannot be compared.
 */
export function pySortedIds(ids: readonly EntityId[]): EntityId[] {
  const a = [...ids];
  const n = a.length;
  if (n < 2) return a;
  const lt = (x: EntityId, y: EntityId): boolean => compareIds(x, y) < 0;
  // count_run: the leading ascending (or strictly descending, then reversed) run
  let run = 2;
  if (lt(a[1]!, a[0]!)) {
    while (run < n && lt(a[run]!, a[run - 1]!)) run++;
    a.splice(0, run, ...a.slice(0, run).reverse());
  } else {
    while (run < n && !lt(a[run]!, a[run - 1]!)) run++;
  }
  // binarysort: insert each remaining element at its position among the sorted prefix
  for (let start = run; start < n; start++) {
    const pivot = a[start]!;
    let l = 0, r = start;
    while (l < r) {
      const p = l + ((r - l) >> 1);
      if (lt(pivot, a[p]!)) r = p; else l = p + 1;
    }
    a.splice(start, 1);
    a.splice(l, 0, pivot);
  }
  return a;
}

/** Structural equality of ids (`a == b`). */
export function idsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Python `str(id)`: a string stays bare, a tuple id prints as `(' ', 5, ' ')`.
 *
 * @param id - An entity id.
 * @returns The text Python's f-string formatting would give.
 */
export function pyStr(id: EntityId | null | undefined): string {
  if (id === null || id === undefined) return "None";
  if (!Array.isArray(id)) return String(id);
  const parts = (id as readonly (string | number)[]).map((x) => (typeof x === "string" ? `'${x}'` : String(x)));
  return `(${parts.join(", ")}${parts.length === 1 ? "," : ""})`;
}

/**
 * Python `repr` of an id tuple such as a full id: an array prints as a tuple, and a one-element tuple keeps its
 * trailing comma.
 *
 * @param x - The value, usually an array of ids.
 * @returns Its Python repr.
 */
export function tupleRepr(x: unknown): string {
  if (!Array.isArray(x)) return pyRepr(x);
  return `(${x.map(tupleRepr).join(", ")}${x.length === 1 ? "," : ""})`;
}
