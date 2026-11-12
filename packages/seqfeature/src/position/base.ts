/** Abstract base classes for sequence positions. */

import { pyInt } from "@biolibs/core";
import { pyTypeName } from "@biolibs/core";

/**
 * A position within a sequence, possibly fuzzy (Biopython's `Position`).
 *
 * In Biopython most positions *are* integers (`int` subclasses): they compare
 * and do arithmetic like numbers. Here, positions that have a numeric value
 * implement `valueOf()`, so `<`, `>`, `<=`, `>=`, `Math.min` and `Number(pos)`
 * work on them; use {@link Position.equals} instead of `===` for equality.
 */
export abstract class Position {
  /**
   * Parse a GenBank-style position such as `"5"`, `"<5"`, `">5"`, `"?5"`, `"(3.9)"` or `"one-of(3,6)"`.
   * Assigned in `position/index.ts` (it needs every subclass, which would otherwise be a circular import).
   *
   * @param text - The position text (one-based).
   * @param offset - `0` for end positions or `-1` for start positions, converting one-based to zero-based.
   */
  static fromstring: (text: string, offset?: number) => Position;

  /** Python-style representation, e.g. `ExactPosition(5)`. */
  abstract repr(): string;

  /** Text as written in a GenBank location, e.g. `<5`. */
  abstract toString(): string;

  /** A copy moved by `offset` (Python `position + offset`). */
  abstract add(offset: number): Position;

  /** The position as seen from the other end of a sequence of the given length (used for reverse complements). */
  abstract flip(length: number): Position;

  /** The integer value, or `NaN` for positions without one (see {@link UnknownPosition}). */
  valueOf(): number {
    return NaN;
  }

  /** Integer equality, as for Python `int` subclasses: `ExactPosition(5)` equals `BeforePosition(5)` and `5`. */
  equals(other: unknown): boolean {
    if (!(other instanceof Position) && typeof other !== "number") return false;
    return this.valueOf() === Number(other);
  }
}

/**
 * Shared storage for the positions that are integers in Biopython
 * (everything except `UnknownPosition`). Not part of Biopython's API.
 */
export abstract class IntPosition extends Position {
  /** The integer position (zero-based). */
  readonly position: number;

  /**
   * @param position - The zero-based position. Numbers are truncated and numeric strings parsed, like Python's `int()`.
   * @throws TypeError for other types.
   */
  protected constructor(position: number) {
    super();
    if (typeof position === "string") this.position = pyInt(position);
    else if (typeof position === "number" && Number.isFinite(position)) this.position = Math.trunc(position);
    else throw new TypeError(`int() argument must be a string, a bytes-like object or a real number, not '${pyTypeName(position)}'`);
  }

  valueOf(): number {
    return this.position;
  }
}
