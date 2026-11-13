/** GCG MSF files (Biopython's `Bio.Align.msf`); read only. */

import { ValueError, pyInt, pyFloat, warn } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator } from "./interfaces.js";
import { AssertionError, decode, encode, rstrip, strip, words } from "./rows.js";
import { registerFormat } from "./registry.js";
import type { TextStream } from "./stream.js";

const KNOWN_HEADERS = ["!!NA_MULTIPLE_ALIGNMENT", "!!AA_MULTIPLE_ALIGNMENT", "PileUp"];

/** Python `repr()` of a string, as `%r` prints it. */
function pyRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q;
}

/** Python `str.isdigit()` for ASCII digits (the only ones MSF files hold). */
const isDigits = (w: string): boolean => /^[0-9]+$/.test(w);

/** Reads GCG MSF files (one alignment per file). */
export class MsfIterator extends AlignmentIterator {
  static override fmt: string | null = "MSF";

  protected readNextAlignment(stream: TextStream): Alignment | null {
    let line = stream.readline();
    if (!line) {
      if (stream.tell() === 0) throw new ValueError("Empty file.");
      return null;
    }
    const first = words(line)[0];
    if (first === undefined) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
    if (!KNOWN_HEADERS.includes(first)) throw new ValueError(`${first} is not a known GCG MSF header: ${KNOWN_HEADERS.join(", ")}`);

    let found = false;
    for (const raw of stream) {
      line = raw.replace(/\n$/, "");
      if (line.includes("MSF: ") && line.endsWith("..")) { found = true; break; }
    }
    if (!found) throw new ValueError("Reached end of file without MSF/Type/Check header line");

    const parts = words(line);
    const offset = parts.indexOf("MSF:");
    if (parts[offset + 2] !== "Type:" || !["Check:", "CompCheck:"].includes(parts[parts.length - 3]!))
      throw new ValueError(`GCG MSF header line should be '<optional text> MSF: <int> Type: <letter> <optional date> Check: <int> ..',  not: ${pyRepr(line)}`);
    let alnLength: number;
    try { alnLength = pyInt(parts[offset + 1]!); } catch { throw new ValueError(`GCG MSF header line should have MSF: <int> for column count, not ${pyRepr(parts[offset + 1]!)}`); }
    const seqType = parts[offset + 3]!;
    if (seqType !== "P" && seqType !== "N") throw new ValueError(`GCG MSF header line should have 'Type: P' (protein) or 'Type: N' (nucleotide), not 'Type: ${seqType}'`);

    const names: string[] = [], remaining: number[] = [], weights: number[] = [];
    let closed = false;
    for (const raw of stream) {
      line = strip(raw);
      if (line === "//") { closed = true; break; }
      if (line.startsWith("Name: ")) {
        const w = words(line);
        const ix = ["Name:", "Len:", "Weight:", "Check:"].map((k) => w.indexOf(k));
        if (ix.some((i) => i < 0)) throw new ValueError(`Malformed GCG MSF name line: ${pyRepr(line)}`);
        const name = w[ix[0]! + 1]!;
        const length = pyInt(w[ix[1]! + 1]!);
        const weight = pyFloat(w[ix[2]! + 1]!);
        if (names.includes(name)) throw new ValueError(`Duplicated ID of ${pyRepr(name)}`);
        names.push(name); remaining.push(length); weights.push(weight);
      }
    }
    if (!closed) throw new ValueError("End of file while looking for end of header // line.");

    line = stream.readline();
    if (!line) throw new ValueError("End of file after // line, expected sequences.");
    if (strip(line)) throw new ValueError("After // line, expected blank line before sequences.");

    const seqs: string[] = names.map(() => "");
    let complete = false;
    for (const raw of stream) {
      const w = words(raw);
      if (w.length === 0) continue;
      const name = w[0]!;
      const index = names.indexOf(name);
      if (index < 0) {
        if (w.every(isDigits)) continue; // a coordinate line
        throw new ValueError(`Unexpected line '${raw}' in input`);
      }
      const seq = w.slice(1).join("");
      const length = remaining[index]! - (Array.from(seq).length - (seq.split("-").length - 1));
      if (length < 0) throw new ValueError(`Received longer sequence than expected for ${name}`);
      seqs[index] += seq;
      remaining[index] = length;
      if (remaining.every((l) => l === 0)) { complete = true; break; }
    }
    if (!complete) throw new ValueError("End of file where expecting sequence data.");

    for (const raw of stream) if (rstrip(raw) !== "" && strip(raw) !== "") throw new AssertionError("");

    const longest = Math.max(...seqs.map((s) => Array.from(s).length));
    if (longest !== alnLength) {
      warn(`GCG MSF headers said alignment length ${alnLength}, but found ${longest}`, "BiopythonParserWarning");
      alnLength = longest;
    }
    const padded = seqs.map((s) => {
      let t = s.replaceAll("~", "-").replaceAll(".", "-");
      if (Array.from(t).length < alnLength) t += "-".repeat(alnLength - Array.from(t).length);
      return t;
    });
    const parsed = Alignment.parsePrintedAlignment(padded.map(encode));
    const records = names.map((name, i) => new SeqRecord(new Seq(decode(parsed.sequences[i]!)), name, name, name, null, null, new Map([["weight", weights[i]!]])));
    const alignment = new Alignment(records, parsed.coordinates);
    const columns = alignment.length;
    if (columns !== alnLength) throw new ValueError(`GCG MSF headers said alignment length ${alnLength}, but found ${columns}`);
    return alignment;
  }
}

registerFormat("msf", { AlignmentIterator: MsfIterator });
