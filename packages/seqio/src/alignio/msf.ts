/** GCG MSF alignment files (`msf`, also called PileUp). */

import { AssertionError, IndexError, NotImplementedError, ValueError, pyFloat, pyInt, pyRepr, pySplit, pyStrip, warn } from "@biolibs/core";
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { unpackTwo } from "../insdc/text.js";
import { AlignmentIterator } from "./interfaces.js";

const KNOWN_HEADERS = ["!!NA_MULTIPLE_ALIGNMENT", "!!AA_MULTIPLE_ALIGNMENT", "PileUp"];

/** Python `list[i]`, including negative indices. */
function at<T>(items: T[], i: number): T {
  const j = i < 0 ? items.length + i : i;
  if (j < 0 || j >= items.length) throw new IndexError("list index out of range");
  return items[j]!;
}

/** Python `int(text)` or -1 when it is not an integer. */
function intOr(text: string, fallback: number): number {
  try {
    return pyInt(text);
  } catch (e) {
    if (e instanceof ValueError) return fallback;
    throw e;
  }
}

/** Reads GCG MSF alignments (protein or nucleotide), keeping each sequence's weight in `annotations["weight"]`. */
export class MsfIterator extends AlignmentIterator {
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
    const first = at(pySplit(pyStrip(line)), 0);
    if (!KNOWN_HEADERS.includes(first)) throw new ValueError(`${first} is not a known GCG MSF header: ${KNOWN_HEADERS.join(", ")}`);
    while (line && !line.includes(" MSF: ")) line = handle.readline();
    if (!line) throw new ValueError("Reached end of file without MSF/Type/Check header line");
    const parts = pySplit(line.replace(/^\n+|\n+$/g, ""));
    const offset = parts.indexOf("MSF:");
    if (at(parts, offset + 2) !== "Type:" || !["Check:", "CompCheck:"].includes(at(parts, -3)) || at(parts, -1) !== "..") {
      throw new ValueError(`GCG MSF header line should be '<optional text> MSF: <int> Type: <letter> <optional date> Check: <int> ..',  not: ${pyRepr(line)}`);
    }
    const alnLength = intOr(parts[offset + 1]!, -1);
    if (alnLength < 0) throw new ValueError(`GCG MSF header line should have MDF: <int> for column count, not ${pyRepr(parts[offset + 1])}`);
    const seqType = at(parts, offset + 3);
    if (seqType !== "P" && seqType !== "N") throw new ValueError(`GCG MSF header line should have 'Type: P' (protein) or 'Type: N' (nucleotide), not 'Type: ${seqType}'`);
    const ids: string[] = [];
    const lengths: number[] = [];
    const weights: number[] = [];
    line = handle.readline();
    while (line && pyStrip(line) !== "//") {
      line = handle.readline();
      if (pyStrip(line).startsWith("Name: ")) {
        if (line.includes(" Len: ") && line.includes(" Check: ") && line.includes(" Weight: ")) {
          let rest = pyStrip(line.slice(line.indexOf("Name: ") + 6));
          let name: string;
          let length: string;
          let check: string;
          let weight: string;
          [name, rest] = unpackTwo(rest.split(" Len: "));
          [length, rest] = unpackTwo(rest.split(" Check: "));
          [check, weight] = unpackTwo(rest.split(" Weight: "));
          name = pyStrip(name);
          if (name.endsWith(" oo")) name = name.slice(0, -3);
          if (ids.includes(name)) throw new ValueError(`Duplicated ID of ${pyRepr(name)}`);
          if (name.includes(" ")) throw new NotImplementedError(`Space in ID ${pyRepr(name)}`);
          ids.push(name);
          lengths.push(pyInt(pyStrip(length)));
          pyInt(pyStrip(check));
          weights.push(pyFloat(pyStrip(weight)));
        } else {
          throw new ValueError(`Malformed GCG MSF name line: ${pyRepr(line)}`);
        }
      }
    }
    if (!line) throw new ValueError("End of file while looking for end of header // line.");
    if (lengths.length === 0) throw new ValueError("max() iterable argument is empty");
    const maxLength = Math.max(...lengths);
    if (alnLength !== maxLength) {
      const maxCount = lengths.filter((n) => n === maxLength).length;
      throw new ValueError(`GCG MSF header said alignment length ${alnLength}, but ${maxCount} of ${ids.length} sequences said Len: ${maxLength}`);
    }
    line = handle.readline();
    if (!line) throw new ValueError("End of file after // line, expected sequences.");
    if (pyStrip(line)) throw new ValueError("After // line, expected blank line before sequences.");
    const seqs: string[][] = ids.map(() => []);
    let completedLength = 0;
    while (completedLength < alnLength) {
      for (let idx = 0; idx < ids.length; idx++) {
        const name = ids[idx]!;
        line = handle.readline();
        if (idx === 0 && !pyStrip(line)) {
          while (line && !pyStrip(line)) line = handle.readline();
        }
        if (!line) throw new ValueError("End of file where expecting sequence data.");
        let words = pySplit(pyStrip(line));
        if (idx === 0 && words.length > 0 && words[0] !== name) {
          let i = intOr(words[0]!, -1);
          if (i !== completedLength + 1) throw new ValueError(`Expected GCG MSF coordinate line starting ${completedLength + 1}, got: ${pyRepr(line)}`);
          if (words.length > 1) {
            i = words.length !== 2 ? -1 : intOr(words[1]!, -1);
            const expected = completedLength + 50 < alnLength ? completedLength + 50 : alnLength;
            if (i !== expected) throw new ValueError(`Expected GCG MSF coordinate line ${completedLength + 1} to ${expected}, got: ${pyRepr(line)}`);
          }
          line = handle.readline();
          words = pySplit(pyStrip(line));
        }
        if (words.length === 0) {
          if (!(lengths[idx]! < alnLength && seqs[idx]!.join("").length === lengths[idx])) throw new ValueError(`Expected sequence for ${name}, got: ${pyRepr(line)}`);
        } else if (words[0] === name) {
          if (!(words.length > 1)) throw new AssertionError(line);
          seqs[idx]!.push(...words.slice(1));
        } else {
          throw new ValueError(`Expected sequence for ${pyRepr(name)}, got: ${pyRepr(line)}`);
        }
      }
      completedLength += 50;
      line = handle.readline();
      if (pyStrip(line)) throw new ValueError(`Expected blank line, got: ${pyRepr(line)}`);
    }
    for (;;) {
      line = handle.readline();
      if (!line) break;
      else if (!pyStrip(line)) continue;
      else if (KNOWN_HEADERS.includes(pySplit(pyStrip(line))[0]!)) {
        this.pendingHeader = line;
        break;
      } else {
        throw new ValueError(`Unexpected line after GCG MSF alignment: ${pyRepr(line)}`);
      }
    }
    const joined = seqs.map((s) => s.join("").replaceAll("~", "-").replaceAll(".", "-"));
    let padded = false;
    joined.forEach((s, idx) => {
      if (s.length < alnLength && s.length === lengths[idx]) {
        padded = true;
        joined[idx] = s + "-".repeat(alnLength - s.length);
      }
    });
    if (padded) warn("One of more alignment sequences were truncated and have been gap padded", "BiopythonParserWarning");
    const records = ids.map((id, k) => new SeqRecord(new Seq(joined[k]!), id, id, id, null, null, new Map([["weight", weights[k]]])));
    const align = new MultipleSeqAlignment(records);
    if (align.getAlignmentLength() !== alnLength) throw new ValueError(`GCG MSF headers said alignment length ${alnLength}, but have ${align.getAlignmentLength()}`);
    return align;
  }
}
