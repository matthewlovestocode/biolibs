/** `ExactPosition` and `UncertainPosition`. */

import { IntPosition } from "./base.js";

/** An exactly known position (`int` subclass in Biopython). */
export class ExactPosition extends IntPosition {
  /**
   * @param position - Zero-based position.
   * @param extension - Must be 0; kept for compatibility with older Biopython signatures.
   * @throws TypeError if `extension` is not 0 (Python raises `AttributeError`).
   */
  constructor(position: number, extension = 0) {
    super(position);
    if (extension !== 0) throw new TypeError(`Non-zero extension ${extension} for exact position.`);
  }

  repr(): string {
    return `${this.constructor.name}(${this.position})`;
  }

  toString(): string {
    return String(this.position);
  }

  add(offset: number): ExactPosition {
    return new (this.constructor as new (p: number) => ExactPosition)(this.position + offset);
  }

  flip(length: number): ExactPosition {
    return new (this.constructor as new (p: number) => ExactPosition)(length - this.position);
  }
}

/** A position known only to be approximately here (written `?5`); behaves like {@link ExactPosition}. */
export class UncertainPosition extends ExactPosition {}
