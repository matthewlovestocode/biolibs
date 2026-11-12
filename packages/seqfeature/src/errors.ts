/** Errors specific to feature locations. `RuntimeError` and `AssertionError` mirror the Python exceptions Biopython raises in a few places. */

import { BioError, ValueError } from "@biolibs/core";

/** Raised when a GenBank/EMBL location string cannot be parsed. Subclass of {@link ValueError}, as in Biopython. */
export class LocationParserError extends ValueError {
  /** @param message - What could not be parsed. */
  constructor(message: string) {
    super(message);
    this.name = "LocationParserError";
  }
}

/** Mirrors Python's `RuntimeError` (raised by `WithinPosition` for inconsistent arguments). */
export class RuntimeError extends BioError {
  /** @param message - Description of the inconsistency. */
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

/** Mirrors Python's `AssertionError` (Biopython asserts in `BetweenPosition` and when a location string only partly matches). */
export class AssertionError extends BioError {
  /** @param message - Optional detail. */
  constructor(message = "") {
    super(message);
    this.name = "AssertionError";
  }
}

/** Mirrors Python's `NotImplementedError` (raised by `CompoundLocation` for unsupported operands). */
export class NotImplementedError extends BioError {
  /** @param message - Optional detail. */
  constructor(message = "") {
    super(message);
    this.name = "NotImplementedError";
  }
}
