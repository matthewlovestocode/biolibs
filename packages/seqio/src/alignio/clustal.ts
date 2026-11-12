/** Clustal alignment files (`clustal`). */

import { AssertionError, ValueError, pyInt, pyRepr, pyRstrip, pySplit, pyStrip, RuntimeError, IndexError } from "@biolibs/core";
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { charAt } from "../insdc/text.js";
import { AlignmentIterator, SequentialAlignmentWriter } from "./interfaces.js";

/** Python `assert cond` (no message). */
function check(cond: boolean): void {
  if (!cond) throw new AssertionError();
}

/** Python `s[a:b]`-style helpers for string columns. */
const KNOWN_HEADERS = ["CLUSTAL", "PROBCONS", "MUSCLE", "MSAPROBS", "Kalign", "Biopython"];

/** Writes Clustal, 50 columns per block, with a consensus line when the alignment has one. */
export class ClustalWriter extends SequentialAlignmentWriter {
  writeAlignment(alignment: MultipleSeqAlignment): void {
    if (alignment.length === 0) throw new ValueError("Must have at least one sequence");
    if (alignment.getAlignmentLength() === 0) throw new ValueError("Non-empty sequences are required");
    let version = alignment["_version"] === undefined ? "" : String(alignment["_version"]);
    if (!version) version = "1.81";
    let output = version.startsWith("2.") ? `CLUSTAL ${version} multiple sequence alignment\n\n\n` : `CLUSTAL X (${version}) multiple sequence alignment\n\n\n`;
    let curChar = 0;
    const maxLength = alignment.at(0).length;
    if (maxLength <= 0) throw new ValueError("Non-empty sequences are required");
    let starInfo: string | null;
    if (alignment.columnAnnotations.has("clustal_consensus")) starInfo = alignment.columnAnnotations.get("clustal_consensus") as string;
    else starInfo = alignment["_star_info"] === undefined ? null : (alignment["_star_info"] as string);
    while (curChar !== maxLength) {
      const showNum = curChar + 50 > maxLength ? maxLength - curChar : 50;
      for (const record of alignment) {
        let line = (record.id as string).slice(0, 30).replaceAll(" ", "_").padEnd(36, " ");
        line += record.seq!.toString().slice(curChar, curChar + showNum);
        output += line + "\n";
      }
      if (starInfo) output += " ".repeat(36) + starInfo.slice(curChar, curChar + showNum) + "\n";
      output += "\n";
      curChar += showNum;
    }
    this.handle.write(output + "\n");
  }
}

/** Reads Clustal alignments (also the variants written by ProbCons, MUSCLE, MSAProbs and Kalign). */
export class ClustalIterator extends AlignmentIterator {
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
    const first = pySplit(pyStrip(line))[0];
    if (first === undefined) throw new IndexError("list index out of range");
    if (!KNOWN_HEADERS.includes(first)) throw new ValueError(`${first} is not a known CLUSTAL header: ${KNOWN_HEADERS.join(", ")}`);
    let version: string | null = null;
    for (let word of pySplit(line)) {
      if (word[0] === "(" && word[word.length - 1] === ")") word = word.slice(1, -1);
      if ("0123456789".includes(charAt(word, 0))) {
        version = word;
        break;
      }
    }
    line = handle.readline();
    while (pyStrip(line) === "") {
      line = handle.readline();
      // Biopython would loop forever on a file that ends here.
      if (line === "") throw new RuntimeError("Clustal file ends after the header; Biopython loops forever on this input");
    }
    const ids: string[] = [];
    const seqs: string[] = [];
    let consensus = "";
    let seqCols: [number, number] | null = null;
    for (;;) {
      if (charAt(line, 0) !== " " && pyStrip(line) !== "") {
        const fields = pySplit(pyRstrip(line));
        if (fields.length < 2 || fields.length > 3) throw new ValueError(`Could not parse line:\n${line}`);
        ids.push(fields[0]!);
        seqs.push(fields[1]!);
        if (seqCols === null) {
          const start = fields[0]!.length + line.slice(fields[0]!.length).indexOf(fields[1]!);
          seqCols = [start, start + fields[1]!.length];
        }
        check(fields[1] === line.slice(seqCols[0], seqCols[1]));
        if (fields.length === 3) {
          let letters: number;
          try {
            letters = pyInt(fields[2]!);
          } catch (e) {
            if (e instanceof ValueError) throw new ValueError(`Could not parse line, bad sequence number:\n${line}`);
            throw e;
          }
          if (fields[1]!.replaceAll("-", "").length !== letters) throw new ValueError(`Could not parse line, invalid sequence number:\n${line}`);
        }
      } else if (charAt(line, 0) === " ") {
        check(ids.length === seqs.length);
        check(ids.length > 0);
        check(seqCols !== null);
        consensus = line.slice(seqCols![0], seqCols![1]);
        check(pyStrip(line.slice(0, seqCols![0])) === "");
        check(pyStrip(line.slice(seqCols![1])) === "");
        line = handle.readline();
        check(pyStrip(line) === "");
        break;
      } else {
        break;
      }
      line = handle.readline();
      if (!line) break;
    }
    check(pyStrip(line) === "");
    check(seqCols !== null);
    for (const s of seqs) check(s.length === seqs[0]!.length);
    if (consensus) check(consensus.length === seqs[0]!.length);
    let done = false;
    while (!done) {
      while (!line || pyStrip(line) === "") {
        line = handle.readline();
        if (!line) break;
      }
      if (!line) break;
      if (KNOWN_HEADERS.includes(pySplit(line)[0]!)) {
        this.pendingHeader = line;
        break;
      }
      for (let i = 0; i < ids.length; i++) {
        if (charAt(line, 0) === " ") throw new ValueError(`Unexpected line:\n${pyRepr(line)}`);
        const fields = pySplit(pyRstrip(line));
        if (fields.length < 2 || fields.length > 3) throw new ValueError(`Could not parse line:\n${pyRepr(line)}`);
        if (fields[0] !== ids[i]) throw new ValueError(`Identifiers out of order? Got '${fields[0]}' but expected '${ids[i]}'`);
        if (fields[1] !== line.slice(seqCols![0], seqCols![1])) {
          const start = fields[0]!.length + line.slice(fields[0]!.length).indexOf(fields[1]!);
          if (start !== seqCols![0]) throw new ValueError(`Old location slice(${seqCols![0]}, ${seqCols![1]}, None) -> ${start}:XX`);
          seqCols = [start, start + fields[1]!.length];
        }
        seqs[i] += fields[1]!;
        check(seqs[i]!.length === seqs[0]!.length);
        if (fields.length === 3) {
          let letters: number;
          try {
            letters = pyInt(fields[2]!);
          } catch (e) {
            if (e instanceof ValueError) throw new ValueError(`Could not parse line, bad sequence number:\n${line}`);
            throw e;
          }
          if (seqs[i]!.replaceAll("-", "").length !== letters) throw new ValueError(`Could not parse line, invalid sequence number:\n${line}`);
        }
        line = handle.readline();
      }
      if (consensus) {
        check(charAt(line, 0) === " ");
        consensus += line.slice(seqCols![0], seqCols![1]);
        check(consensus.length === seqs[0]!.length);
        check(pyStrip(line.slice(0, seqCols![0])) === "");
        check(pyStrip(line.slice(seqCols![1])) === "");
        line = handle.readline();
      }
      done = false;
    }
    check(ids.length === seqs.length);
    if (seqs.length === 0 || seqs[0]!.length === 0) return null;
    if (this.recordsPerAlignment !== null && this.recordsPerAlignment !== ids.length) {
      throw new ValueError(`Found ${ids.length} records in this alignment, told to expect ${this.recordsPerAlignment}`);
    }
    const alignment = new MultipleSeqAlignment(ids.map((id, k) => new SeqRecord(new Seq(seqs[k]!), id, undefined, id)));
    if (version) alignment["_version"] = version;
    if (consensus) {
      const alignmentLength = seqs[0]!.length;
      if (consensus.length !== alignmentLength) throw new ValueError(`Alignment length is ${alignmentLength}, consensus length is ${consensus.length}, '${consensus}'`);
      alignment.columnAnnotations.set("clustal_consensus", consensus);
      alignment["_star_info"] = consensus;
    }
    return alignment;
  }
}
