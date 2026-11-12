/** EMBOSS pairwise alignment files (`emboss`, from needle, water and similar programs). */

import { AssertionError, IndexError, ValueError, pyFloat, pyInt, pyRepr, pyRstrip, pyStrip } from "@biolibs/core";
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { charAt, splitMax } from "../insdc/text.js";
import { AlignmentIterator } from "./interfaces.js";

const RULE = "#=======================================";
const SUB_RULE = "#---------------------------------------";

/** Python `list[i]`. */
function at<T>(items: T[], i: number): T {
  if (i < 0 || i >= items.length) throw new IndexError("list index out of range");
  return items[i]!;
}

/** Python `s.split(":", 1)`. */
function splitColon(s: string): string[] {
  const i = s.indexOf(":");
  return i < 0 ? [s] : [s.slice(0, i), s.slice(i + 1)];
}

/** Reads EMBOSS pairwise alignments; header statistics go to the alignment's `annotations`. */
export class EmbossIterator extends AlignmentIterator {
  private pendingHeader: string | null = null;

  nextAlignment(): MultipleSeqAlignment | null {
    const handle = this.handle;
    let line: string;
    if (this.pendingHeader === null) line = handle.readline();
    else {
      line = this.pendingHeader;
      this.pendingHeader = null;
    }
    if (!line) return null;
    while (pyRstrip(line) !== RULE) {
      line = handle.readline();
      if (!line) return null;
    }
    let lengthOfSeqs: number | null = null;
    let numberOfSeqs: number | null = null;
    const ids: string[] = [];
    const headerDict = new Map<string, unknown>();
    while (charAt(line, 0) === "#") {
      let parts = splitColon(line.slice(1));
      const key = pyStrip(parts[0]!.toLowerCase());
      if (key === "aligned_sequences") {
        numberOfSeqs = pyInt(pyStrip(at(parts, 1)));
        if (ids.length !== 0) throw new AssertionError();
        for (let i = 0; i < numberOfSeqs; i++) {
          line = handle.readline();
          parts = splitColon(pyStrip(line.slice(1)));
          if (i + 1 !== pyInt(pyStrip(parts[0]!))) throw new AssertionError();
          ids.push(pyStrip(at(parts, 1)));
        }
        if (ids.length !== numberOfSeqs) throw new AssertionError();
      }
      if (key === "length") lengthOfSeqs = pyInt(pyStrip(at(parts, 1)));
      if (key === "identity") headerDict.set("identity", pyInt(pyStrip(at(parts, 1)).split("/")[0]!));
      if (key === "similarity") headerDict.set("similarity", pyInt(pyStrip(at(parts, 1)).split("/")[0]!));
      if (key === "gaps") headerDict.set("gaps", pyInt(pyStrip(at(parts, 1)).split("/")[0]!));
      if (key === "score") headerDict.set("score", pyFloat(pyStrip(at(parts, 1))));
      line = handle.readline();
    }
    if (numberOfSeqs === null) throw new ValueError("Number of sequences missing!");
    if (lengthOfSeqs === null) throw new ValueError("Length of sequences missing!");
    if (this.recordsPerAlignment !== null && this.recordsPerAlignment !== numberOfSeqs) {
      throw new ValueError(`Found ${numberOfSeqs} records in this alignment, told to expect ${this.recordsPerAlignment}`);
    }
    const seqs: string[] = ids.map(() => "");
    const seqStarts: number[] = [];
    let index = 0;
    while (line) {
      if (line.length > 21) {
        const idStart = splitMax(pyStrip(line.slice(0, 21)), 1);
        const seqEnd = splitMax(pyStrip(line.slice(21)), 1);
        if (idStart.length === 2 && seqEnd.length === 2) {
          const id = idStart[0]!;
          const startText = idStart[1]!;
          const seq = seqEnd[0]!;
          const endText = seqEnd[1]!;
          let start: number;
          let end: number;
          // Python compares the two numbers as text here, which decides whether the start is 0- or 1-based.
          if (startText >= endText) {
            if (seq.replaceAll("-", "") === "") {
              start = pyInt(startText);
              end = pyInt(endText);
            } else {
              start = pyInt(startText) - 1;
              end = pyInt(endText);
            }
          } else {
            if (seq.replaceAll("-", "") === "") throw new AssertionError(pyRepr(line));
            start = pyInt(startText) - 1;
            end = pyInt(endText);
          }
          if (index < 0 || index >= numberOfSeqs) throw new ValueError(`Expected index ${index} in range [0,${numberOfSeqs})`);
          const expectedId = ids[index]!;
          if (!(id === expectedId || id === expectedId.slice(0, id.length))) throw new AssertionError();
          if (seqStarts.length === index) seqStarts.push(start);
          const have = (): number => seqs[index]!.replaceAll("-", "").length;
          if (start >= end) {
            if (seq.replaceAll("-", "") !== "") throw new AssertionError(line);
          } else if (start - seqStarts[index]! !== have()) {
            throw new ValueError(`Found ${have()} chars so far for sequence ${index} (${id}, ${pyRepr(seqs[index])}), line says start ${start}:\n${line}`);
          }
          seqs[index] += seq;
          if (end !== seqStarts[index]! + have()) {
            throw new ValueError(`Found ${have()} chars so far for sequence ${index} (${id}, ${pyRepr(seqs[index])}, start=${seqStarts[index]}), file says end ${end}:\n${line}`);
          }
          index += 1;
          if (index >= numberOfSeqs) index = 0;
        }
      } else if (pyStrip(line) === "") {
        // blank line
      } else {
        throw new ValueError(`Unrecognised EMBOSS pairwise line: ${pyRepr(line)}\n`);
      }
      line = handle.readline();
      if (pyRstrip(line) === SUB_RULE || pyRstrip(line) === RULE) {
        this.pendingHeader = line;
        break;
      }
    }
    if (index !== 0) throw new AssertionError();
    if (this.recordsPerAlignment !== null && this.recordsPerAlignment !== ids.length) {
      throw new ValueError(`Found ${ids.length} records in this alignment, told to expect ${this.recordsPerAlignment}`);
    }
    const records: SeqRecord[] = [];
    ids.forEach((id, k) => {
      if (seqs[k]!.length !== lengthOfSeqs) throw new ValueError("Error parsing alignment - sequences of different length? You could be using an old version of EMBOSS.");
      records.push(new SeqRecord(new Seq(seqs[k]!), id, undefined, id));
    });
    return new MultipleSeqAlignment(records, null, headerDict);
  }
}
