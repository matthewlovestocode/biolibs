/** Aligned FASTA files (Biopython's `Bio.Align.fasta`). */


import { SeqRecord } from "@biolibs/seqrecord";
import { ValueError } from "@biolibs/core";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter } from "./interfaces.js";
import { decode, encode, recordOf, rowsOf, splitFirst, rstrip, strip } from "./rows.js";
import { registerFormat } from "./registry.js";
import type { TextStream } from "./stream.js";

/** Writes an alignment as aligned FASTA. */
export class FastaWriter extends AlignmentWriter {
  static override fmt: string | null = "FASTA";

  formatAlignment(alignment: Alignment): string {
    if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
    const lines: string[] = [];
    const rows = rowsOf(alignment);
    alignment.sequences.forEach((sequence, i) => {
      if (sequence instanceof SeqRecord && sequence.id !== null) {
        lines.push(sequence.description ? `>${sequence.id} ${sequence.description}` : `>${sequence.id}`);
      } else lines.push(">");
      lines.push(rows[i]!);
    });
    return lines.join("\n") + "\n";
  }
}

/** Reads an aligned FASTA file as a single alignment. */
export class FastaIterator extends AlignmentIterator {
  static override fmt: string | null = "FASTA";

  protected readNextAlignment(stream: TextStream): Alignment | null {
    const names: string[] = [], descriptions: string[] = [], lines: string[] = [];
    for (const line of stream) {
      if (line.startsWith(">")) {
        const parts = splitFirst(rstrip(line.slice(1)));
        let name = "", description = "";
        if (parts.length === 2) [name, description] = parts as [string, string];
        else if (parts.length === 1) name = parts[0]!;
        names.push(name);
        descriptions.push(description);
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
    const parsed = Alignment.parsePrintedAlignment(lines.map(encode));
    const records = names.map((name, i) => recordOf(decode(parsed.sequences[i]!), name, descriptions[i]!));
    return new Alignment(records, parsed.coordinates);
  }
}

registerFormat("fasta", { AlignmentIterator: FastaIterator, AlignmentWriter: FastaWriter as never });

