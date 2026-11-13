/** Python numbers in the distance matrices: a JavaScript number counts as an `int` when whole, a `PyFloat` is a whole-valued `float`. */

import { PyFloat, pyFloatRepr } from "@biolibs/core";

/** An `int` or a `float`. */
export type PyNum = number | PyFloat;

/** The plain number. */
export const val = (x: PyNum): number => (x instanceof PyFloat ? x.value : x);

/** A float result: whole values are wrapped so that they print as floats. */
export const fl = (x: number): PyNum => (Number.isInteger(x) ? new PyFloat(x) : x);

/** Whether a value is a Python number. */
export const isNumber = (x: unknown): x is PyNum => typeof x === "number" || x instanceof PyFloat;

/** `repr(x)` of a number. */
export const numRepr = (x: PyNum): string => (x instanceof PyFloat ? pyFloatRepr(x.value) : Number.isInteger(x) ? String(x) : pyFloatRepr(x));

/** Python list indexing: negative indices count from the end. @throws Error named IndexError when out of range. */
export function pyAt<T>(list: T[], i: number): T {
  const k = i < 0 ? i + list.length : i;
  if (k < 0 || k >= list.length) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
  return list[k]!;
}
