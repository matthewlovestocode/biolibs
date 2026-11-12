/** Python-flavoured helpers: dictionary keys for tuple ids, and ordering of ids. */

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
  throw new TypeError(`'<' not supported between instances of '${typeof a}' and '${typeof b}'`);
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
export function pyStr(id: EntityId): string {
  if (!Array.isArray(id)) return String(id);
  const parts = (id as readonly (string | number)[]).map((x) => (typeof x === "string" ? `'${x}'` : String(x)));
  return `(${parts.join(", ")}${parts.length === 1 ? "," : ""})`;
}
