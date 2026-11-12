/** Re-exports of the Python-flavoured helpers and errors the substitution-matrix code uses. */

export { AssertionError, IndexError, KeyError, OverflowError, UnboundLocalError, ValueError, pyFloatRepr, pyFormatFixed } from "@biolibs/core";

/** A Python `TypeError`; the JavaScript `TypeError` carries the same name. */
export class TypeErrorPy extends TypeError {
  /** @param message - Python's message. */
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
}

/** Python's `FileNotFoundError`, raised by `load()` for a name that is not a bundled matrix. */
export class FileNotFoundError extends Error {
  /** @param name - The matrix name that was requested. */
  constructor(name: string) {
    super(`[Errno 2] No such file or directory: '${name}'`);
    this.name = "FileNotFoundError";
  }
}
