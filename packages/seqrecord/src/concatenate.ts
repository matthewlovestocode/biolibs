/** Adding records and sequences together (`a + b`). */

import { RuntimeError, ValueError, pyEquals, pyTypeName } from "@biolibs/core";
import { MutableSeq, Seq } from "@biolibs/seq";
import { concatLetters } from "./letter-values.js";
import { SeqRecord } from "./seq-record.js";

/** Something that can be added to a record: a sequence or plain text. */
export type Addable = SeqRecord | Seq | MutableSeq | string;

/**
 * `record + other`.
 *
 * - With a sequence or string: appends it. The new record keeps the id, name,
 *   description, features, annotations and cross-references of the left record.
 * - With another record: concatenates the sequences, appends the other record's
 *   features shifted to the right, merges cross-references, and keeps id, name,
 *   description and any annotation only where both records agree. Per-letter
 *   annotations present in both are concatenated.
 *
 * @throws {@link ValueError} if the left record (or the right, when a record) has no sequence.
 * @throws TypeError for unsupported operands or per-letter annotations that cannot be concatenated.
 */
export function addToRecord(left: SeqRecord, other: Addable): SeqRecord {
  if (left.seq === null) throw new ValueError("Left operand seq=None, can't add");
  const Cls = left.constructor as typeof SeqRecord;
  if (!(other instanceof SeqRecord)) {
    return new Cls(left.seq.add(other as string | Seq), left.id, left.name, left.description, [...left.dbxrefs], [...left.features], new Map(left.annotations));
  }
  if (other.seq === null) throw new ValueError("Right SeqRecord has seq=None, can't add");
  const answer = left.derive(left.seq.add(other.seq), undefined, undefined, undefined, [...left.dbxrefs], [...left.features]);
  const length = left.length;
  for (const f of other.features) answer.features.push(f.shift(length));
  for (const ref of other.dbxrefs) if (!answer.dbxrefs.includes(ref)) answer.dbxrefs.push(ref);
  if (left.id === other.id) answer.id = left.id;
  if (left.name === other.name) answer.name = left.name;
  if (left.description === other.description) answer.description = left.description;
  for (const [k, v] of left.annotations) if (other.annotations.has(k) && pyEquals(other.annotations.get(k), v)) answer.annotations.set(k, v);
  // Biopython prints a message before re-raising TypeError here; we simply re-raise.
  for (const [k, v] of left.letterAnnotations) {
    if (other.letterAnnotations.has(k)) answer.letterAnnotations.setUnchecked(k, concatLetters(v, other.letterAnnotations.get(k)));
  }
  return answer;
}

/**
 * `other + record` for a sequence or string on the left: the new record keeps the
 * right record's metadata and its features shifted right by the length of `other`.
 *
 * @throws {@link RuntimeError} if `other` is itself a record (that goes through `addToRecord`).
 * @throws TypeError if the record has no sequence or `other` has no length.
 */
export function addRecordToRight(record: SeqRecord, other: Seq | MutableSeq | string): SeqRecord {
  if ((other as unknown) instanceof SeqRecord) throw new RuntimeError("This should have happened via the __add__ of the other SeqRecord being added!");
  if (record.seq === null) throw new TypeError("Can't add (right hand side) SeqRecord with seq = None");
  if (Array.isArray(other)) {
    // A list has a length, so Python gets as far as `list + Seq`, which is list's own error.
    throw new TypeError(`can only concatenate list (not "${pyTypeName(record.seq)}") to list`);
  }
  if (typeof other !== "string" && !(other instanceof Seq) && !(other instanceof MutableSeq)) {
    throw new TypeError(`object of type '${pyTypeName(other)}' has no len()`);
  }
  const offset = typeof other === "string" ? other.length : other.length;
  const combined = typeof other === "string" ? record.seq.radd(other) : other.add(record.seq);
  const Cls = record.constructor as typeof SeqRecord;
  return new Cls(combined, record.id, record.name, record.description, [...record.dbxrefs], record.features.map((f) => f.shift(offset)), new Map(record.annotations));
}

