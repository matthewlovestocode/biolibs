/** `RestrictedDict`: the dictionary behind `letterAnnotations`, whose values must match the sequence length. */

/** A per-letter annotation: a string or an array with one item per residue. */
export type LetterValue = string | unknown[];

/** Length of a per-letter value, or null if it has no length (Python `len()` would fail). */
function sizeOf(value: unknown): number | null {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  if (value instanceof Map) return value.size;
  return null;
}

/**
 * A `Map` that only accepts sequences (strings or arrays) as long as the
 * record's sequence (Biopython's `_RestrictedDict`).
 *
 * @example
 * ```ts
 * const d = new RestrictedDict(3);
 * d.set("quality", [40, 40, 38]);   // ok
 * d.set("quality", [40, 40]);       // throws TypeError
 * ```
 */
export class RestrictedDict extends Map<string, LetterValue> {
  /** The required length of every value. */
  readonly sequenceLength: number;

  /** @param length - Length of the biological sequence (truncated to an integer). */
  constructor(length: number) {
    super();
    this.sequenceLength = Math.trunc(length);
  }

  /**
   * Add or replace a value.
   *
   * @throws TypeError unless `value` is a string/array of exactly {@link RestrictedDict.sequenceLength} items.
   */
  set(key: string, value: LetterValue): this {
    if (sizeOf(value) !== this.sequenceLength) {
      throw new TypeError(
        `Any per-letter annotation should be a Python sequence (list, tuple or string) of the same length as the biological sequence, here ${this.sequenceLength}.`,
      );
    }
    return super.set(key, value);
  }

  /** Set a value without checking its length (Python `dict.__setitem__`), used internally when joining records. */
  setUnchecked(key: string, value: LetterValue): this {
    return super.set(key, value);
  }

  /** Add many values, each checked (Python `update`). */
  update(entries: Map<string, LetterValue> | Record<string, LetterValue>): void {
    for (const [k, v] of entries instanceof Map ? entries : Object.entries(entries)) this.set(k, v);
  }

  /** A plain, unrestricted copy (Python `dict.copy()` on a `_RestrictedDict` returns a plain dict). */
  copy(): Map<string, LetterValue> {
    return new Map(this);
  }
}

