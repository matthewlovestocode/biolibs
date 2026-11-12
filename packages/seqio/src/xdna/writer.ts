/** Writer for xdna files. */

import { IndexError, ValueError, pyContains, pyIter, pyStr, warn } from "@biolibs/core";
import { ExactPosition } from "@biolibs/seqfeature";
import type { SeqRecord } from "@biolibs/seqrecord";
import { encodeAscii } from "../binary/ascii.js";
import { pack } from "../binary/struct.js";
import { SequenceWriter } from "../interfaces.js";

/** Biopython's warning category for recoverable problems. */
const WARNING = "BiopythonWarning";

/**
 * Writes one record as an xdna file. Features with fuzzy locations are dropped (with a warning), at most
 * 255 features are kept, and text longer than 255 characters is truncated.
 *
 * @throws {@link ValueError} unless exactly one record is given.
 */
export class XdnaWriter extends SequenceWriter {
  get modes(): string { return "b"; }
  private hasTruncatedStrings = false;

  writeRecords(records: Iterable<SeqRecord>): number {
    const iterator = records[Symbol.iterator]();
    const first = iterator.next();
    if (first.done) throw new ValueError("Must have one sequence");
    if (!iterator.next().done) throw new ValueError("More than one sequence found");
    const record = first.value;
    this.hasTruncatedStrings = false;
    const moleculeType = record.annotations.get("molecule_type");
    let seqtype: number;
    if (moleculeType === undefined || moleculeType === null) seqtype = 0;
    else if (pyContains("DNA", moleculeType)) seqtype = 1;
    else if (pyContains("RNA", moleculeType)) seqtype = 3;
    else if (pyContains("protein", moleculeType)) seqtype = 4;
    else seqtype = 0;
    const topology = (record.annotations.has("topology") ? record.annotations.get("topology") : "linear") === "circular" ? 1 : 0;
    const comment = record.description.startsWith(record.id as string) ? record.description : `${record.id} ${record.description}`;
    // `len(record)` is 0 without a sequence; the failure comes later, when the sequence bytes are needed.
    this.handle.write(pack(">BBB25xII60xI11xB", 0, seqtype, topology, record.length, 0, comment.length, 255) as never);
    if (record.seq === null) throw new TypeError("cannot convert 'NoneType' object to bytes");
    this.handle.write(record.seq.toBytes() as never);
    this.handle.write(encodeAscii(comment) as never);
    this.handle.write(pack(">B", 0) as never);
    this.writePString("0");
    this.writePString("0");
    let features = record.features.filter((f) => f.location!.start instanceof ExactPosition && f.location!.end instanceof ExactPosition);
    let drop = record.features.length - features.length;
    if (drop > 0) warn(`Dropping ${drop} features with fuzzy locations`, WARNING);
    if (features.length > 255) {
      drop = features.length - 255;
      warn(`Too many features, dropping the last ${drop}`, WARNING);
      features = features.slice(0, 255);
    }
    this.handle.write(pack(">B", features.length) as never);
    for (const feature of features) {
      const label = feature.qualifiers.has("label") ? feature.qualifiers.get("label") : [""];
      this.writePString(pyStr(firstItem(label)));
      let description = "";
      for (const [qname, values] of feature.qualifiers) {
        if (qname === "label" || qname === "translation") continue;
        for (const val of pyIter(values)) {
          if (description.length > 0) description += "\r";
          description += `${qname}="${pyStr(val)}"`;
        }
      }
      this.writePString(description);
      this.writePString(feature.type);
      let start = Number(feature.location!.start) + 1;
      let end = Number(feature.location!.end);
      let strand = 1;
      if (feature.location!.strand === -1) {
        [start, end] = [end, start];
        strand = 0;
      }
      this.writePString(String(start));
      this.writePString(String(end));
      this.handle.write(pack(">BBBB", strand, 1, 0, 1) as never);
      this.writePString("127,127,127");
    }
    if (this.hasTruncatedStrings) warn("Some annotations were truncated to 255 characters", WARNING);
    return 1;
  }

  /** Write a string with a one-byte length, truncating it to 255 characters. */
  private writePString(s: string): void {
    if (s.length > 255) {
      this.hasTruncatedStrings = true;
      s = s.slice(0, 255);
    }
    this.handle.write(pack(">B", s.length) as never);
    this.handle.write(encodeAscii(s) as never);
  }

  writeRecord(): void {
    throw new ValueError("XdnaWriter writes through writeRecords");
  }
}

/** Python's `x[0]` for a list or string. */
function firstItem(x: unknown): unknown {
  const [first] = pyIter(x);
  if (first === undefined) throw new IndexError("list index out of range");
  return first;
}
