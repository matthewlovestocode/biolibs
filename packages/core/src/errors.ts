/**
 * Error classes. `BioError` is the base; the others mirror the Python built-in
 * exceptions that Biopython raises, so ported code can reproduce its behaviour.
 */

/**
 * Error thrown for malformed biological input: invalid residues, unparseable
 * file contents, unknown enzyme names, and similar problems with caller data.
 *
 * Catching `BioError` specifically lets callers separate bad input from
 * programming errors (which surface as ordinary `Error`/`TypeError`).
 *
 * @example
 * ```ts
 * try {
 *   complement("AXG");
 * } catch (e) {
 *   if (e instanceof BioError) console.error("bad input:", e.message);
 *   else throw e;
 * }
 * ```
 */
export class BioError extends Error {
  /**
   * @param message - Human-readable description of what was wrong with the input.
   */
  constructor(message: string) {
    super(message);
    // Set explicitly so the name survives minification and shows in stack traces.
    this.name = "BioError";
  }
}

/**
 * Mirrors Python's `ValueError`: the argument has the right type but an
 * unacceptable value (empty separator, negative length, non-ASCII text, ...).
 * Biopython's `UndefinedSequenceError` derives from this.
 */
export class ValueError extends BioError {
  /** @param message - Description of the problem (e.g. which value was invalid). */
  constructor(message: string) {
    super(message);
    this.name = "ValueError";
  }
}

/** Mirrors Python's `IndexError`: a sequence index is out of range. */
export class IndexError extends BioError {
  /** @param message - Description of the problem. */
  constructor(message: string) {
    super(message);
    this.name = "IndexError";
  }
}

/** Mirrors Python's `KeyError`: a lookup key (codon, table id/name, ...) is absent. */
export class KeyError extends BioError {
  /** @param message - The missing key, as Python's `KeyError` reports it. */
  constructor(message: string) {
    super(message);
    this.name = "KeyError";
  }
}

/** Mirrors Python's `OverflowError`: a numeric result is too large to represent (for example `10 ** 400.0`). */
export class OverflowError extends BioError {
  /** @param message - Python's text, e.g. `(34, 'Result too large')`. */
  constructor(message: string) {
    super(message);
    this.name = "OverflowError";
  }
}
