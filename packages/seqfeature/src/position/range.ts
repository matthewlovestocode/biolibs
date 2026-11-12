/** `WithinPosition` and `BetweenPosition`: positions given as a pair of bounds. */

import { AssertionError, RuntimeError } from "@biolibs/core";
import { IntPosition } from "./base.js";

/** Shared behaviour of positions defined by a `left` and `right` bound. */
abstract class BoundedPosition extends IntPosition {
  /** Lower bound. */
  readonly left: number;
  /** Upper bound. */
  readonly right: number;

  protected constructor(position: number, left: number, right: number) {
    super(position);
    this.left = left;
    this.right = right;
  }

  repr(): string {
    return `${this.constructor.name}(${this.position}, left=${this.left}, right=${this.right})`;
  }

  add(offset: number): this {
    return new (this.constructor as new (p: number, l: number, r: number) => this)(this.position + offset, this.left + offset, this.right + offset);
  }

  flip(length: number): this {
    // The bounds swap roles when viewed from the other end.
    return new (this.constructor as new (p: number, l: number, r: number) => this)(length - this.position, length - this.right, length - this.left);
  }
}

/** A position somewhere within `left..right`, written `(left.right)`; its integer value is one of the bounds. */
export class WithinPosition extends BoundedPosition {
  /**
   * @param position - Representative position; must equal `left` or `right`.
   * @param left - Lower bound.
   * @param right - Upper bound.
   * @throws {@link RuntimeError} if `position` is neither bound.
   */
  constructor(position: number, left: number, right: number) {
    if (!(position === left || position === right)) {
      throw new RuntimeError(`WithinPosition: ${position} should match left ${left} or right ${right}`);
    }
    super(position, left, right);
  }

  toString(): string {
    return `(${this.left}.${this.right})`;
  }
}

/** A position between two adjacent bases, written `(left^right)`; its integer value is one of the bounds. */
export class BetweenPosition extends BoundedPosition {
  /**
   * @param position - Representative position; must equal `left` or `right`.
   * @param left - Lower bound.
   * @param right - Upper bound.
   * @throws {@link AssertionError} if `position` is neither bound (Biopython uses `assert`).
   */
  constructor(position: number, left: number, right: number) {
    if (!(position === left || position === right)) throw new AssertionError();
    super(position, left, right);
  }

  toString(): string {
    return `(${this.left}^${this.right})`;
  }
}
