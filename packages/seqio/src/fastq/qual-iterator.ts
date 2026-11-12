/** The QUAL reader (`qual`): quality scores without a sequence. */

import { ValueError, pyFirstWord, pyInt, pyRstrip, pySplit, warn } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";

/**
 * Reads QUAL files (as produced by Phred and similar tools). Each record has an undefined sequence of the right
 * length and `letterAnnotations["phred_quality"]`. Negative scores become 0 with a `BiopythonParserWarning`.
 */
export class QualPhredIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private line: string | null = null;

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    super(source, null, "QUAL");
    for (const line of this.stream!) {
      if (line[0] === ">") {
        this.line = line;
        return;
      }
    }
    this.line = null;
  }

  protected nextRecord(): SeqRecord | null {
    let line = this.line;
    if (line === null) return null;
    const descr = pyRstrip(line.slice(1));
    const id = pyFirstWord(descr);
    let qualities: number[] = [];
    let reachedEnd = true;
    for (const next of this.stream!) {
      if (next[0] === ">") {
        line = next;
        reachedEnd = false;
        break;
      }
      qualities.push(...pySplit(next).map(pyInt));
    }
    this.line = reachedEnd ? null : line;
    if (qualities.length && Math.min(...qualities) < 0) {
      warn(`Negative quality score ${Math.min(...qualities)} found, substituting PHRED zero instead.`, "BiopythonParserWarning");
      qualities = qualities.map((q) => Math.max(0, q));
    }
    const sequence = new Seq(null, qualities.length);
    return SeqRecord.fromValidated(sequence, id, id, descr, null, null, null, new Map([["phred_quality", qualities]]));
  }
}
