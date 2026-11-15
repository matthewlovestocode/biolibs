/** The errors a download can end in that are not the network's own, named and worded as Python names and words them. */
import { BioError, ValueError } from "@biolibs/core";

/**
 * Mirrors Python's `gzip.BadGzipFile`: what the server sent is not a gzip file, or is one whose
 * checksum or length does not match what it holds.
 *
 * @example
 * ```ts
 * new BadGzipFile("Not a gzipped file (b'<!')").name;   // "BadGzipFile"
 * ```
 */
export class BadGzipFile extends BioError {
  /** @param message - Python's own wording. */
  constructor(message: string) {
    super(message);
    this.name = "BadGzipFile";
  }
}

/** Mirrors Python's `EOFError`, which `gzip` raises for a file that stops before its compressed data does. */
export class EOFError extends BioError {
  /** @param message - Python's own wording. */
  constructor(message: string) {
    super(message);
    this.name = "EOFError";
  }
}

/**
 * Mirrors Python's `json.JSONDecodeError`: a reply that should have been JSON and is not.
 *
 * The type is Python's; the message is the JavaScript engine's, since the two parsers do not describe
 * a fault in the same words.
 */
export class JSONDecodeError extends ValueError {
  /** @param message - What the parser said. */
  constructor(message: string) {
    super(message);
    this.name = "JSONDecodeError";
  }
}
