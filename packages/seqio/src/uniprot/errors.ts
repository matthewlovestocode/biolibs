/** Error classes the UniProt reader raises beyond those in `@biolibs/core`. */

import { BioError, KeyError } from "@biolibs/core";

export { KeyError };

/** A Python `TypeError` (the JavaScript `TypeError` is used by the rest of the library; this keeps `name === "TypeError"` too). */
export class TypeErrorPy extends TypeError {
  /** @param message - Python's message. */
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
}

/** Mirrors Python's `StopIteration` escaping from a helper; the reader treats it as "no more records". */
export class StopIterationSignal extends BioError {
  constructor() {
    super("StopIteration");
    this.name = "StopIteration";
  }
}
