/** `reverse_complement()` and `translate()` on records, with Biopython's flexible keyword arguments. */

import { ValueError, pyContains, pyRepr, pyTruthy } from "@biolibs/core";
import { MutableSeq, Seq } from "@biolibs/seq";
import type { SeqFeature } from "@biolibs/seqfeature";
import { SeqRecord } from "./seq-record.js";
import { isDict, toMap, type AnnotationsInput, type LetterAnnotationsInput } from "./types.js";

/**
 * Each metadata option of `reverseComplement`/`translate` is polymorphic, as in
 * Biopython: `true` copies the field, `false` leaves the default, and an explicit
 * value (string, list or dict) is used as is.
 */
export interface TransformOptions {
  id?: boolean | string;
  name?: boolean | string;
  description?: boolean | string;
  dbxrefs?: boolean | string[];
  features?: boolean | SeqFeature[];
  annotations?: boolean | AnnotationsInput;
  letterAnnotations?: boolean | LetterAnnotationsInput;
}

/** Options for `reverseComplement`. Defaults: features and letterAnnotations true, the rest false. */
export type ReverseComplementOptions = TransformOptions;

/** Options for `translate`, including the translation settings. Defaults: all metadata options false. */
export interface TranslateRecordOptions extends TransformOptions {
  table?: string | number;
  stopSymbol?: string;
  toStop?: boolean;
  cds?: boolean;
  gap?: string | null;
}

/** Copy `id`, `name`, `description` and `dbxrefs` according to the polymorphic options. */
function applyText(answer: SeqRecord, source: SeqRecord, o: TransformOptions): void {
  if (typeof o.id === "string") answer.id = o.id;
  else if (pyTruthy(o.id)) answer.id = source.id;
  if (typeof o.name === "string") answer.name = o.name;
  else if (pyTruthy(o.name)) answer.name = source.name;
  if (typeof o.description === "string") answer.description = o.description;
  else if (pyTruthy(o.description)) answer.description = source.description;
  if (Array.isArray(o.dbxrefs)) answer.dbxrefs = o.dbxrefs;
  else if (pyTruthy(o.dbxrefs)) answer.dbxrefs = [...source.dbxrefs];
}

/** Sort key of a feature: its integer start, or null if the start has no integer value. */
function startKey(f: SeqFeature): number | null {
  const v = f.location!.start.valueOf();
  return Number.isNaN(v) ? null : v;
}

/** Stable sort by start, raising Python's TypeError when a start is unknown (None cannot be ordered). */
function sortByStart(features: SeqFeature[]): SeqFeature[] {
  const keyed = features.map((f) => ({ f, k: startKey(f) }));
  for (let i = 1; i < keyed.length; i++) {
    const a = keyed[i]!.k, b = keyed[i - 1]!.k;
    if (a === null || b === null) {
      throw new TypeError(`'<' not supported between instances of '${a === null ? "NoneType" : "int"}' and '${b === null ? "NoneType" : "int"}'`);
    }
  }
  return keyed.sort((x, y) => x.k! - y.k!).map((x) => x.f);
}

/**
 * The reverse complement of a record. See {@link SeqRecord.reverseComplement}.
 *
 * @throws {@link ValueError} if the record has no sequence or is a protein.
 */
export function reverseComplementRecord(record: SeqRecord, o: ReverseComplementOptions): SeqRecord {
  const features = o.features === undefined ? true : o.features; // an explicit null (Python None) is falsy, not the default
  const letterAnnotations = o.letterAnnotations === undefined ? true : o.letterAnnotations;
  if (record.seq === null) {
    throw new ValueError("Seq in SeqRecord is None, so can't construct the reverse_complement. Please assign it a sequence first");
  }
  const moleculeType = record.annotations.has("molecule_type") ? record.annotations.get("molecule_type") : "";
  if (pyContains("protein", moleculeType)) throw new ValueError("Proteins do not have complements!");
  let seq: Seq | MutableSeq = pyContains("RNA", moleculeType) ? record.seq.reverseComplementRna() : record.seq.reverseComplement();
  if (record.seq instanceof MutableSeq) seq = new Seq(seq);
  const answer = record.derive(seq);
  applyText(answer, record, o);
  if (Array.isArray(features)) {
    answer.features = features;
  } else if (pyTruthy(features)) {
    const length = answer.length;
    answer.features = sortByStart(record.features.map((f) => f.flip(length)));
  }
  if (isDict(o.annotations)) answer.annotations = toMap(o.annotations);
  else if (pyTruthy(o.annotations)) answer.annotations = new Map(record.annotations);
  if (record.perLetterAnnotations !== null) {
    if (isDict(letterAnnotations)) {
      answer.letterAnnotations = letterAnnotations;
    } else if (pyTruthy(letterAnnotations)) {
      for (const [key, value] of record.letterAnnotations) {
        answer.letterAnnotations.set(key, typeof value === "string" ? [...value].reverse().join("") : [...value].reverse());
      }
    }
  }
  return answer;
}

/**
 * Translate the record's sequence into a protein record. See {@link SeqRecord.translate}.
 *
 * @throws {@link ValueError} if the record is a protein or has no sequence.
 * @throws TypeError if `features` or `letterAnnotations` is `true` (they cannot be carried across translation).
 */
export function translateRecord(record: SeqRecord, o: TranslateRecordOptions): SeqRecord {
  if (record.annotations.get("molecule_type") === "protein") throw new ValueError("Proteins cannot be translated!");
  if (record.seq === null) throw new ValueError("Seq in SeqRecord is None, can't be translated");
  const answer = new SeqRecord(record.seq.translate(
    o.table === undefined ? "Standard" : o.table,
    o.stopSymbol === undefined ? "*" : o.stopSymbol,
    o.toStop === undefined ? false : o.toStop,
    o.cds === undefined ? false : o.cds,
    o.gap === undefined ? null : o.gap,
  ));
  applyText(answer, record, o);
  const features = o.features === undefined ? false : o.features;
  if (Array.isArray(features)) answer.features = features;
  else if (pyTruthy(features)) throw new TypeError(`Unexpected features argument ${pyRepr(features)}`);
  if (isDict(o.annotations)) answer.annotations = toMap(o.annotations);
  else if (pyTruthy(o.annotations)) answer.annotations = new Map(record.annotations);
  answer.annotations.set("molecule_type", "protein");
  if (record.perLetterAnnotations !== null) {
    const la = o.letterAnnotations === undefined ? false : o.letterAnnotations;
    if (isDict(la)) answer.letterAnnotations = la;
    else if (pyTruthy(la)) throw new TypeError(`Unexpected letter_annotations argument ${pyRepr(la)}`);
  }
  return answer;
}
