/** A2M files (Biopython's `Bio.Align.a2m`): FASTA where upper case and `-` mark match states and lower case and `.` insert states. */

import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { ValueError } from "@biolibs/core";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter } from "./interfaces.js";
import { AssertionError, PythonException, decode, encode, rowsOf, rstrip, splitFirst, strip } from "./rows.js";
import { registerFormat } from "./registry.js";
import type { TextStream } from "./stream.js";

const isUpper = (c: string): boolean => c !== c.toLowerCase();
const isLower = (c: string): boolean => c !== c.toUpperCase();

/** Writes one alignment as A2M, using its `state` column annotation. */
export class A2mWriter extends AlignmentWriter {
  static override fmt: string | null = "A2M";

  override writeAlignments(stream: { write(t: string): unknown }, alignments: Iterable<Alignment>): number { return this.writeSingleAlignment(stream, alignments); }

  formatAlignment(alignment: Alignment): string {
    if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
    if (alignment.columnAnnotations === undefined) throw new TypeError("'Alignment' object has no attribute 'column_annotations'");
    const state = alignment.columnAnnotations.get("state");
    if (state === undefined) throw Object.assign(new Error("state"), { name: "KeyError" });
    const lines: string[] = [];
    const rows = rowsOf(alignment);
    alignment.sequences.forEach((sequence, i) => {
      const name = sequence instanceof SeqRecord && sequence.id !== null ? sequence.id : "";
      const description = sequence instanceof SeqRecord ? sequence.description : "";
      lines.push(description ? `>${name} ${description}` : `>${name}`);
      let s = "";
      const line = Array.from(rows[i]!), st = Array.from(state as string);
      for (let k = 0; k < Math.min(line.length, st.length); k++) {
        const c = line[k]!, m = st[k]!;
        if (m === "D") s += c.toUpperCase();
        else if (m === "I") s += c === "-" ? "." : c.toLowerCase();
      }
      lines.push(s);
    });
    return lines.join("\n") + "\n";
  }
}

/** Reads an A2M file as a single alignment with a `state` column annotation. */
export class A2mIterator extends AlignmentIterator {
  static override fmt: string | null = "A2M";

  protected readNextAlignment(stream: TextStream): Alignment | null {
    const names: string[] = [], descriptions: string[] = [], lines: string[] = [];
    for (const line of stream) {
      if (line.startsWith(">")) {
        const parts = splitFirst(rstrip(line.slice(1)));
        names.push(parts[0] ?? "");
        descriptions.push(parts[1] ?? "");
        lines.push("");
      } else {
        if (lines.length === 0) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
        lines[lines.length - 1] += strip(line);
      }
    }
    if (lines.length === 0) {
      if (this.stream!.tell() === 0) throw new ValueError("Empty file.");
      return null;
    }
    let state = "";
    for (const c of lines[0]!) {
      if (c === "-" || isUpper(c)) state += "D";
      else if (c === "." || isLower(c)) state += "I";
      else throw new PythonException(`Unexpected letter '${c}' in alignment`);
    }
    for (const line of lines.slice(1)) {
      const st = Array.from(state);
      Array.from(line).forEach((c, k) => {
        if (k >= st.length) return;
        if (st[k] === "D") { if (!(c === "-" || isUpper(c))) throw new AssertionError(""); }
        else if (st[k] === "I") { if (!(c === "." || isLower(c))) throw new AssertionError(""); }
        else throw new PythonException(`Unexpected letter '${c}' in alignment`);
      });
    }
    const parsed = Alignment.parsePrintedAlignment(lines.map((l) => encode(l.toUpperCase().replaceAll(".", "-"))));
    const records = names.map((name, i) => new SeqRecord(new Seq(decode(parsed.sequences[i]!)), name, undefined, descriptions[i]!));
    const alignment = new Alignment(records, parsed.coordinates);
    alignment.columnAnnotations = new Map([["state", state]]);
    return alignment;
  }
}

registerFormat("a2m", { AlignmentIterator: A2mIterator, AlignmentWriter: A2mWriter as never });
