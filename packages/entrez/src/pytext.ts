/**
 * What Python's `str()` gives for the values a request parameter can hold.
 *
 * The E-utilities take text, and Biopython turns whatever it is handed into text with `str()`. The
 * results have to match character for character, because they end up in the URL.
 */
import { pyBytesRepr, pyFloatRepr, pyRepr } from "@biolibs/core";

/**
 * Python's `repr()` of one element of a list, which is what `str()` of the list is built from.
 *
 * @param value - The element. @returns Its `repr()`.
 */
function pyElementRepr(value: unknown): string {
  return typeof value === "string" ? pyRepr(value) : pyText(value);
}

/**
 * Python's `str()` of a parameter value.
 *
 * JavaScript has one number type where Python has two, so a whole number is written as Python writes
 * an `int` and anything else as it writes a `float`. A whole number too large for a JavaScript number
 * to hold exactly should be passed as a `bigint`.
 *
 * @param value - A number, bigint, boolean, string, `null`, bytes or an array of those.
 * @returns The text Python would produce.
 * @example
 * ```ts
 * pyText(5);            // "5"
 * pyText(0.5);          // "0.5"
 * pyText(1e-7);         // "1e-07"
 * pyText(true);         // "True"
 * pyText(null);         // "None"
 * pyText([1, "two"]);   // "[1, 'two']"
 * ```
 */
export function pyText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : pyFloatRepr(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === null || value === undefined) return "None";
  if (value instanceof Uint8Array) return pyBytesRepr(value);
  if (Array.isArray(value)) return `[${value.map(pyElementRepr).join(", ")}]`;
  return String(value);
}

/**
 * The name Python gives the type of a parameter value, for error messages.
 *
 * @param value - Any parameter value. @returns `"int"`, `"float"`, `"bool"`, `"str"`, `"NoneType"`, `"bytes"` or `"list"`.
 */
export function pyTypeOf(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "bigint") return "int";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (value instanceof Uint8Array) return "bytes";
  if (Array.isArray(value)) return "list";
  return "dict";
}
