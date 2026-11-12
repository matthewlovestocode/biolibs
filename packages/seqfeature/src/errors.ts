/** Errors specific to feature locations. */

import { ValueError } from "@biolibs/core";

/** Raised when a GenBank/EMBL location string cannot be parsed. Subclass of {@link ValueError}, as in Biopython. */
export class LocationParserError extends ValueError {
  /** @param message - What could not be parsed. */
  constructor(message: string) {
    super(message);
    this.name = "LocationParserError";
  }
}
