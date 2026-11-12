/** `record[start:stop:step]`: slicing a record, keeping the features that fit. */

import { ValueError, warn } from "@biolibs/core";
import { sliceIndices, type PySlice } from "@biolibs/seq";
import { sliceLetters } from "./letter-values.js";
import type { SeqRecord } from "./seq-record.js";

/**
 * Slice a record. The new record gets the sub-sequence, the same id, name and
 * description, `molecule_type`, per-letter annotations sliced alike, and (only
 * for plain forward slices, step 1) every feature lying entirely inside the
 * slice, shifted to the new coordinates. Features that point at other
 * sequences are dropped with a warning.
 *
 * @param record - The record to slice.
 * @param s - Python-style slice.
 * @throws {@link ValueError} if the record has no sequence.
 */
export function sliceRecord(record: SeqRecord, s: PySlice): SeqRecord {
  const seq = record.seq;
  if (seq === null) throw new ValueError("Seq in SeqRecord is None, we cannot slice it");
  const parentLength = record.length;
  const answer = record.derive(seq.slice(s.start, s.stop, s.step), record.id, record.name, record.description);
  if (record.annotations.has("molecule_type")) answer.annotations.set("molecule_type", record.annotations.get("molecule_type"));
  const [start, stop, step] = sliceIndices(s, parentLength);
  if (step === 1) {
    for (const f of record.features) {
      const loc = f.location;
      if (loc!.ref || loc!.refDb) {
        warn("When slicing SeqRecord objects, any SeqFeature referencing other sequences (e.g. from segmented GenBank records) are ignored.", "UserWarning");
        continue;
      }
      // An unknown position makes the comparison false, so such features are skipped (Biopython catches the TypeError).
      if (start <= loc!.start.valueOf() && loc!.end.valueOf() <= stop) answer.features.push(f.shift(-start));
    }
  }
  for (const [key, value] of record.letterAnnotations) answer.letterAnnotations.set(key, sliceLetters(value, s));
  return answer;
}
