/** Python float arithmetic that differs from JavaScript's: floor division. */

/**
 * Python's `x // y` for floats (CPython's `float_floor_div`): floor division computed through `fmod`, so results
 * match Python at the edges (`inf`, `nan`, exact ties).
 *
 * @param x - Dividend.
 * @param y - Divisor.
 * @throws ZeroDivisionError for a zero divisor.
 */
export function pyFloorDiv(x: number, y: number): number {
  if (y === 0) throw Object.assign(new Error("division by zero"), { name: "ZeroDivisionError" });
  let mod = x % y;
  let div = (x - mod) / y;
  if (mod !== 0) {
    if (y < 0 !== mod < 0) { mod += y; div -= 1.0; }
  } else mod = y < 0 ? -0 : 0;
  if (div !== 0) {
    let floordiv = Math.floor(div);
    if (div - floordiv > 0.5) floordiv += 1.0;
    return floordiv;
  }
  return (x / y) < 0 || Object.is(x / y, -0) ? -0 : 0;
}
