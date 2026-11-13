/** Value types the SAM reader and writer use for tags, so that Python's `int`, `float`, `bytes` and NumPy arrays stay distinct. */

/** A Python `float` (an alias of the shared `PyFloat`); JavaScript numbers are taken as `int` when they are whole. */
export { PyFloat as PyFloatValue } from "@biolibs/core";

/** A NumPy array of numbers, as the `B` tags are read: it is neither an `int` nor a `str`, so writing it fails in Biopython. */
export class NumpyArray extends Array<number> {}
