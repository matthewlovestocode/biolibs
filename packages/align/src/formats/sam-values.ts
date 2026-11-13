/** Value types the SAM reader and writer use for tags, so that Python's `int`, `float`, `bytes` and NumPy arrays stay distinct. */

import { pyFloatRepr } from "@biolibs/core";

/** A Python `float` (JavaScript numbers are taken as `int` when they are whole). */
export class PyFloatValue {
  /** @param value - The number. */
  constructor(readonly value: number) {}
  /** @returns Python's `str(float)`. */
  toString(): string { return pyFloatRepr(this.value); }
}

/** A NumPy array of numbers, as the `B` tags are read: it is neither an `int` nor a `str`, so writing it fails in Biopython. */
export class NumpyArray extends Array<number> {}
