/** Python exception types the motif classes raise that `@biolibs/core` does not define. */

/** Python's bare `Exception` (Biopython raises it directly in several places). */
export class PythonException extends Error {
  override name = "Exception";
}

/** Python's `ZeroDivisionError`. */
export class ZeroDivisionError extends Error {
  override name = "ZeroDivisionError";
}

/** Python's `NotImplementedError`. */
export class NotImplementedError extends Error {
  override name = "NotImplementedError";
}

/** Python's `RuntimeError`. */
export class RuntimeError extends Error {
  override name = "RuntimeError";
}

/**
 * Python `a / b` for floats: dividing by zero raises instead of giving infinity or NaN.
 *
 * @param a - Numerator.
 * @param b - Denominator.
 * @throws ZeroDivisionError when `b` is zero.
 */
export function pyDiv(a: number, b: number): number {
  if (b === 0) throw new ZeroDivisionError("division by zero");
  return a / b;
}

/** Python's `UnboundLocalError`. */
export class UnboundLocalError extends Error {
  override name = "UnboundLocalError";
}

/** Python `math.sqrt`: negative input raises. @param x - A number. @throws ValueError (`math domain error`) for x < 0. */
export function pySqrt(x: number): number {
  if (x < 0) throw Object.assign(new Error("math domain error"), { name: "ValueError" });
  return Math.sqrt(x);
}

/** Python `math.pow(2, x)`: a finite exponent whose result overflows raises. @param x - The exponent. @throws OverflowError (`math range error`). */
export function pow2(x: number): number {
  const r = Math.pow(2, x);
  if (r === Infinity && Number.isFinite(x)) throw Object.assign(new Error("math range error"), { name: "OverflowError" });
  return r;
}
