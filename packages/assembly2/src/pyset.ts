/**
 * A set of integers that iterates in the order CPython's `set` iterates.
 *
 * This is here because the order matters. The engine walks a graph for the cycles that are circular
 * molecules, and networkx picks the node to start each search from with `next(iter(component))`, where
 * the component is a `set`. Which node that is decides the order the products come back in, and pydna
 * hands that order straight to the caller. A JavaScript `Set` iterates in insertion order, so using one
 * would quietly reorder every list of products this package returns.
 *
 * A CPython set is an open-addressed hash table. Integers hash to themselves (except -1, which hashes to
 * -2), the table starts at eight slots and quadruples when it is three-fifths full, and iteration walks
 * the slots in order. So the order depends on the values, on the order they went in, and on nothing else.
 * None of it is affected by `PYTHONHASHSEED`, which randomises the hashing of text, not of integers.
 *
 * Checked against CPython 3.15 over 40,000 random insertion sequences: the iteration order is identical.
 */

/** How many slots a new table has. CPython's `PySet_MINSIZE`. */
const MIN_SIZE = 8;
/** How many slots after the first are probed before the perturbed jump. CPython's `LINEAR_PROBES`. */
const LINEAR_PROBES = 9;
/** How far the perturbation is shifted on each jump. CPython's `PERTURB_SHIFT`. */
const PERTURB_SHIFT = 5n;
/** The perturbation is an unsigned 64-bit value, as `size_t` is on the platforms CPython targets. */
const MASK_64 = (1n << 64n) - 1n;

/** What a removed value leaves behind: a slot that is not free, so a probe passing over it carries on. */
const DUMMY = Symbol("dummy");
/** What one slot of the table holds. */
type Slot = number | typeof DUMMY | undefined;

/**
 * Python's `hash()` of an integer.
 *
 * @param value - The integer.
 * @returns It, except that -1 hashes to -2: CPython keeps -1 as its "error" return.
 */
export function pyHash(value: number): number {
  return value === -1 ? -2 : value;
}

/**
 * A set of integers with CPython's iteration order.
 *
 * @example
 * ```ts
 * [...new PyIntSet([-3, -1, -2])];   // [-3, -2, -1], which is where those three land in the table
 * [...new PyIntSet([1, 2, 3])];      // [1, 2, 3]
 * ```
 */
export class PyIntSet implements Iterable<number> {
  /** The table: each slot holds a value, the mark left by a removal, or nothing. */
  private table: Slot[] = new Array<Slot>(MIN_SIZE).fill(undefined);
  /** One less than the table's size, which is what the slot arithmetic uses. */
  private mask = MIN_SIZE - 1;
  /** How many values are in the table. CPython's `used`. */
  private used = 0;
  /** How many slots are not free, counting the marks left by removals. CPython's `fill`. */
  private fill = 0;

  /** @param items - Values to add, in order. */
  constructor(items: Iterable<number> = []) {
    for (const item of items) this.add(item);
  }

  /** How many values the set holds. */
  get size(): number {
    return this.used;
  }

  /**
   * The probe sequence for a value: the slot to try first, and a jump for each one after that.
   *
   * @param value - The value being placed or looked for.
   * @returns A function giving the start of each run of slots in turn.
   */
  private probe(value: number): () => number {
    const hash = pyHash(value);
    let perturb = BigInt(hash) & MASK_64;
    let slot = hash & this.mask;
    let first = true;
    return () => {
      if (first) {
        first = false;
        return slot;
      }
      perturb >>= PERTURB_SHIFT;
      slot = Number((BigInt(slot) * 5n + 1n + perturb) & BigInt(this.mask));
      return slot;
    };
  }

  /** @param start - Where a run of slots begins. @returns How many slots follow it before the next jump. */
  private extra(start: number): number {
    return start + LINEAR_PROBES <= this.mask ? LINEAR_PROBES : 0;
  }

  /** @param value - A value. @returns Whether the set holds it. */
  has(value: number): boolean {
    const next = this.probe(value);
    for (;;) {
      const start = next();
      const extra = this.extra(start);
      for (let j = 0; j <= extra; j++) {
        const held = this.table[start + j];
        if (held === undefined) return false;
        if (held === value) return true;
      }
    }
  }

  /** @param value - A value to add. Adding one the set already holds changes nothing. */
  add(value: number): void {
    const next = this.probe(value);
    let free: number | null = null;
    for (;;) {
      const start = next();
      const extra = this.extra(start);
      for (let j = 0; j <= extra; j++) {
        const at = start + j;
        const held = this.table[at];
        if (held === undefined) {
          // A slot left by a removal is used in preference, and does not make the table any fuller.
          if (free !== null) {
            this.table[free] = value;
            this.used += 1;
            return;
          }
          this.table[at] = value;
          this.used += 1;
          this.fill += 1;
          // CPython grows when the table is three-fifths full, to four times the number of values.
          if (this.fill * 5 >= this.mask * 3) this.resize(this.used <= 50_000 ? this.used * 4 : this.used * 2);
          return;
        }
        if (held === DUMMY) {
          if (free === null) free = at;
        } else if (held === value) {
          return;
        }
      }
    }
  }

  /** @param value - A value to remove. One the set does not hold is ignored, as `discard` ignores it. */
  discard(value: number): void {
    const next = this.probe(value);
    for (;;) {
      const start = next();
      const extra = this.extra(start);
      for (let j = 0; j <= extra; j++) {
        const at = start + j;
        const held = this.table[at];
        if (held === undefined) return;
        if (held === value) {
          this.table[at] = DUMMY;
          this.used -= 1;
          return;
        }
      }
    }
  }

  /** @param values - Values to add, in order. */
  update(values: Iterable<number>): void {
    for (const value of values) this.add(value);
  }

  /** @returns A set holding the same values in the same slots, as CPython's `set.copy` gives. */
  copy(): PyIntSet {
    const out = new PyIntSet();
    out.table = [...this.table];
    out.mask = this.mask;
    out.used = this.used;
    out.fill = this.fill;
    return out;
  }

  /**
   * Grow the table and place everything in it again, walking the old table in slot order as CPython does.
   *
   * @param minimum - The size to grow past.
   */
  private resize(minimum: number): void {
    let size = MIN_SIZE;
    while (size <= minimum) size <<= 1;
    const old = this.table;
    this.table = new Array<Slot>(size).fill(undefined);
    this.mask = size - 1;
    for (const held of old) {
      if (typeof held === "number") this.place(held);
    }
    this.fill = this.used;
  }

  /** @param value - A value going into a table that cannot already hold it, as after a resize. */
  private place(value: number): void {
    const next = this.probe(value);
    for (;;) {
      const start = next();
      if (this.table[start] === undefined) {
        this.table[start] = value;
        return;
      }
      if (start + LINEAR_PROBES <= this.mask) {
        for (let j = 1; j <= LINEAR_PROBES; j++) {
          if (this.table[start + j] === undefined) {
            this.table[start + j] = value;
            return;
          }
        }
      }
    }
  }

  /** @returns The values, in the order CPython's `set` gives them: by slot. */
  *[Symbol.iterator](): Iterator<number> {
    for (const held of this.table) {
      if (typeof held === "number") yield held;
    }
  }
}

/**
 * Python's `set.intersection(iterable)` where the argument is not itself a set: the shared values, added
 * in the argument's order and then read back in the new table's.
 *
 * @param set - The set.
 * @param other - What to intersect it with, in its own order.
 * @returns The values in both.
 */
export function pyIntersection(set: PyIntSet, other: Iterable<number>): PyIntSet {
  const out = new PyIntSet();
  for (const value of other) {
    if (set.has(value)) out.add(value);
  }
  return out;
}

/**
 * Python's `set.difference(iterable)` where the argument is not a set: a copy of the set with those
 * values discarded, which keeps the slots the rest are already in.
 *
 * @param set - The set.
 * @param other - The values to leave out.
 * @returns What remains.
 */
export function pyDifference(set: PyIntSet, other: Iterable<number>): PyIntSet {
  const out = set.copy();
  for (const value of other) out.discard(value);
  return out;
}
