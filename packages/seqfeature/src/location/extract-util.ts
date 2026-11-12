/** Helpers for taking sub-sequences, shared by simple and compound locations. */

import { MutableSeq, Seq, reverseComplement } from "@biolibs/seq";
import { ValueError } from "@biolibs/core";
import type { ParentSequence, References } from "./base.js";

/** Whether a references dictionary is non-empty (Python truthiness of a dict). */
function hasEntries(references: References | null | undefined): references is References {
  if (!references) return false;
  return references instanceof Map ? references.size > 0 : Object.keys(references).length > 0;
}

/** Look up a reference sequence, with Biopython's errors when it is missing. */
export function lookupReference(ref: string | null, references: References | null | undefined): ParentSequence {
  if (!hasEntries(references)) throw new ValueError(`Feature references another sequence (${ref}), references mandatory`);
  const found = references instanceof Map ? references.get(ref as string) : references[ref as string];
  if (found === undefined) throw new ValueError(`Feature references another sequence (${ref}), not found in references`);
  return found;
}

/** `parent[start:end]`, converted to an immutable `Seq` if the parent was mutable. */
export function sliceParent(parent: ParentSequence, start: number, end: number): ParentSequence {
  if (typeof parent === "string") return parent.slice(start < 0 ? Math.max(0, parent.length + start) : start, end < 0 ? Math.max(0, parent.length + end) : end);
  const part = parent.slice(start, end);
  return part instanceof MutableSeq ? new Seq(part) : part;
}

/** Reverse complement of a string or sequence. */
export function reverseComplementOf(s: ParentSequence): ParentSequence {
  return typeof s === "string" ? reverseComplement(s) : reverseComplement(s as Seq);
}

/** Concatenate two extracted pieces (`x + y`). */
export function concatParts(a: ParentSequence, b: ParentSequence): ParentSequence {
  if (typeof a === "string") return typeof b === "string" ? a + b : b.radd(a); // str + Seq falls back to Seq.__radd__
  return a.add(b as Seq | string);
}
