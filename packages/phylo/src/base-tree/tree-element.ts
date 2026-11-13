/** `TreeElement`: the base class of every `Bio.Phylo` object, with Biopython's `repr` and `str`. */

import { PyFloat, pyFloatRepr } from "@biolibs/core";

/** The text Biopython's `__repr__` gives a value, for the primitive types it shows. */
function primitiveText(value: unknown): string | null {
  if (typeof value === "string") return `'${Array.from(value).length > 60 ? Array.from(value).slice(0, 57).join("") + "..." : value}'`;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value instanceof PyFloat) return pyFloatRepr(value.value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : pyFloatRepr(value);
  return null;
}

/** Base class for all `Bio.Phylo` classes. */
export abstract class TreeElement {
  /**
   * The instance attributes under their Python names, in the order Python's `__dict__` holds them.
   *
   * Whole-number floats are given as {@link PyFloat} so that they print as floats.
   */
  abstract pyDict(): [string, unknown][];

  /** Show this object's constructor with its primitive arguments (Python's `repr`). */
  repr(): string {
    const parts = this.pyDict()
      .filter(([, value]) => value !== null && value !== undefined && primitiveText(value) !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${primitiveText(value)}`);
    return `${this.constructor.name}(${parts.join(", ")})`;
  }

  /** The same as {@link repr}. */
  toString(): string { return this.repr(); }
}
