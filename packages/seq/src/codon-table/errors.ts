import { BioError } from "@biolibs/core";

/** Raised when a codon cannot be translated unambiguously (Python `TranslationError`). */
export class TranslationError extends BioError {
  /** @param message - What could not be translated. */
  constructor(message: string) {
    super(message);
    this.name = "TranslationError";
  }
}
