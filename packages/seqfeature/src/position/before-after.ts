/** `BeforePosition` (`<5`) and `AfterPosition` (`>5`): open-ended positions. */

import { IntPosition } from "./base.js";

/** A position known only to be before this index, written `<5`. */
export class BeforePosition extends IntPosition {
  /**
   * @param position - Zero-based position.
   * @param extension - Must be 0.
   * @throws TypeError if `extension` is not 0.
   */
  constructor(position: number, extension = 0) {
    super(position);
    if (extension !== 0) throw new TypeError(`Non-zero extension ${extension} for exact position.`);
  }

  repr(): string {
    return `${this.constructor.name}(${this.position})`;
  }

  toString(): string {
    return `<${this.position}`;
  }

  add(offset: number): BeforePosition {
    return new BeforePosition(this.position + offset);
  }

  /** "Before" becomes "after" when the sequence is reversed. */
  flip(length: number): AfterPosition {
    return new AfterPosition(length - this.position);
  }
}

/** A position known only to be after this index, written `>5`. */
export class AfterPosition extends IntPosition {
  /**
   * @param position - Zero-based position.
   * @param extension - Must be 0.
   * @throws TypeError if `extension` is not 0.
   */
  constructor(position: number, extension = 0) {
    super(position);
    if (extension !== 0) throw new TypeError(`Non-zero extension ${extension} for exact position.`);
  }

  repr(): string {
    return `${this.constructor.name}(${this.position})`;
  }

  toString(): string {
    return `>${this.position}`;
  }

  add(offset: number): AfterPosition {
    return new AfterPosition(this.position + offset);
  }

  /** "After" becomes "before" when the sequence is reversed. */
  flip(length: number): BeforePosition {
    return new BeforePosition(length - this.position);
  }
}
