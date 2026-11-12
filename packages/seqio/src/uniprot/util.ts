/** Helpers shared by the UniProt XML parsers: Python-faithful dict, string and attribute behaviour. */

import { KeyError, TypeErrorPy } from "./errors.js";
import { Reference } from "@biolibs/seqfeature";
import type { SeqRecord } from "@biolibs/seqrecord";
import type { Element } from "./etree.js";

/** The namespace prefix of every UniProt tag, as ElementTree spells it. */
export const NS = "{http://uniprot.org/uniprot}";

/** Python `element.attrib[key]`. @throws {@link KeyError} when the attribute is missing. */
export function attr(el: Element, key: string): string {
  const v = el.attrib.get(key);
  if (v === undefined) throw new KeyError(key);
  return v;
}

/** The tag without the UniProt namespace (`tag.replace(NS, "")`). */
export const localTag = (tag: string): string => tag.replaceAll(NS, "");

/** Python `a + b` for strings where either side may be `None`. @throws TypeError as Python does. */
export function concat(a: string, b: string | null): string {
  if (b === null) throw new TypeErrorPy('can only concatenate str (not "NoneType") to str');
  return a + b;
}

/** Python `sep.join(items)`, including its TypeError for a non-string item. */
export function join(sep: string, items: (string | null)[]): string {
  const i = items.findIndex((x) => x === null);
  if (i >= 0) throw new TypeErrorPy(`sequence item ${i}: expected str instance, NoneType found`);
  return items.join(sep);
}

/** Equality as Python `in` would see it for the values stored in annotations. */
function same(a: unknown, b: unknown): boolean {
  if (a instanceof Reference && b instanceof Reference) return a.equals(b);
  // Python bytes compare by content.
  if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

/**
 * Add `value` to the list stored under `key`, creating it first and skipping duplicates
 * (Biopython's `_append_to_annotations`). A key that already holds a non-list behaves like Python:
 * a string is searched as a substring and then fails on `.append`, other types are not iterable.
 */
export function appendToAnnotations(record: SeqRecord, key: string, value: unknown): void {
  const ann = record.annotations;
  if (!ann.has(key)) ann.set(key, []);
  const current = ann.get(key);
  if (Array.isArray(current)) {
    if (!current.some((x) => same(x, value))) current.push(value);
  } else if (typeof current === "string") {
    if (typeof value !== "string") throw new TypeErrorPy(`'in <string>' requires string as left operand, not ${value === null ? "NoneType" : typeof value}`);
    if (!current.includes(value)) throw new TypeErrorPy("'str' object has no attribute 'append'");
  } else throw new TypeErrorPy(`argument of type '${typeof current === "number" ? "int" : "object"}' is not a container or iterable`);
}
