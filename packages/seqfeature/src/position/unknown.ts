/** `UnknownPosition`. */

import { Position } from "./base.js";

/** A position that is not known at all (written `?`). Has no integer value. */
export class UnknownPosition extends Position {
  repr(): string {
    return `${this.constructor.name}()`;
  }

  toString(): string {
    return this.repr(); // Python falls back to repr()
  }

  add(): UnknownPosition {
    return this;
  }

  flip(): UnknownPosition {
    return this;
  }
}
