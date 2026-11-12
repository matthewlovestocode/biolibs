/** Errors raised by sequence file reading and writing. */

import { ValueError } from "@biolibs/core";

/** Raised when a file source or target is the wrong kind (text vs binary) for a format. Subclass of {@link ValueError}, as in Biopython. */
export class StreamModeError extends ValueError {
  /** @param message - What mode the format needs, e.g. "Fasta files must be opened in text mode." */
  constructor(message: string) {
    super(message);
    this.name = "StreamModeError";
  }
}
