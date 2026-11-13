/** Shared pieces of the phyloXML element classes: the base class, number types and string checks. */

import { PyFloat, pyFloatRepr, warn } from "@biolibs/core";
import { TreeElement } from "../base-tree/tree-element.js";

/** A Python number: an `int` (a whole `number`) or a `float` (a {@link PyFloat}, or a fractional `number`). */
export type Num = number | PyFloat;

/** `str(x)` of a {@link Num}. */
export function numStr(x: Num): string {
  if (x instanceof PyFloat) return pyFloatRepr(x.value);
  return Number.isInteger(x) ? String(x) : pyFloatRepr(x);
}

/** Check a string and warn (`PhyloXMLWarning`) when it does not match; `test` is a regular expression (matched at the start) or a predicate. */
export function checkStr(text: string | null | undefined, test: RegExp | ((s: string) => boolean)): void {
  if (text === null || text === undefined) return;
  const ok = test instanceof RegExp ? new RegExp(`^(?:${test.source})`).test(text) : test(text);
  if (!ok) warn(`String ${text} doesn't match the given regexp`, "PhyloXMLWarning");
}

/** Base class of all phyloXML objects. */
export abstract class PhyloElement extends TreeElement {}

/** Arbitrary XML attributes, in order. */
export type Attributes = Record<string, string>;
