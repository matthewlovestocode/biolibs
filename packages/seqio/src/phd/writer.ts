/** Writer for the `phd` format. */

import { AssertionError, ValueError, pyFormatFixed, pyRound, pyStr, pyTruthy, pyTypeName } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { SequenceWriter } from "../interfaces.js";
import { getPhredQuality } from "../fastq/scores.js";
import { CKEYWORDS } from "./parser.js";

/** Python's `%i`: the integer part of a number. */
const toInt = (x: number): number => Math.trunc(x);

/**
 * Writes PHD files with the comment fields found in `annotations` and one `base quality [peak]` line per site.
 *
 * @throws {@link AssertionError} if a record has no sequence.
 * @throws {@link ValueError} if qualities or peak locations do not match the sequence length, or a quality is null.
 */
export class PhdWriter extends SequenceWriter {
  get modes(): string { return "t"; }

  writeRecord(record: SeqRecord): void {
    if (!record.seq || record.seq.length === 0) throw new AssertionError("No sequence present in SeqRecord");
    const phred = getPhredQuality(record) as unknown as (number | null)[];
    const peaks = record.letterAnnotations.get("peak_location") as unknown as number[] | undefined;
    if (record.seq.length !== phred.length) throw new ValueError("Number of phd quality scores does not match length of sequence");
    if (peaks && peaks.length > 0 && record.seq.length !== peaks.length) {
      throw new ValueError("Number of peak location scores does not match length of sequence");
    }
    if (phred.includes(null)) throw new ValueError("A quality value of None was found");
    const title = record.description.startsWith(`${record.id} `) ? record.description : `${record.id} ${record.description}`;
    this.handle.write(`BEGIN_SEQUENCE ${this.clean(title)}\nBEGIN_COMMENT\n`);
    for (const annot of CKEYWORDS.map((k) => k.toLowerCase())) {
      let value: unknown = undefined;
      if (annot === "trim") {
        const trim = record.annotations.get("trim");
        if (pyTruthy(trim)) {
          const t = trim as [unknown, unknown, number];
          value = `${pyStr(t[0])} ${pyStr(t[1])} ${pyFormatFixed(t[2], 4)}`;
        }
      } else if (annot === "trace_peak_area_ratio") {
        const ratio = record.annotations.get("trace_peak_area_ratio");
        if (pyTruthy(ratio)) {
          if (typeof ratio !== "number") throw new ValueError(`Unknown format code 'f' for object of type '${pyTypeName(ratio)}'`);
          value = pyFormatFixed(ratio, 4);
        }
      } else {
        value = record.annotations.get(annot);
      }
      if (pyTruthy(value) || value === 0) this.handle.write(`${annot.toUpperCase()}: ${pyStr(value)}\n`);
    }
    this.handle.write("END_COMMENT\nBEGIN_DNA\n");
    const letters = record.seq.toString();
    for (let i = 0; i < letters.length; i++) {
      const quality = toInt(pyRound(phred[i] as number));
      if (peaks && peaks.length > 0) this.handle.write(`${letters[i]} ${quality} ${toInt(peaks[i]!)}\n`);
      else this.handle.write(`${letters[i]} ${quality}\n`);
    }
    this.handle.write("END_DNA\nEND_SEQUENCE\n");
  }
}
