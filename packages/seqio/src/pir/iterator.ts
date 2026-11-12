/** Reader for the NBRF/PIR format. */

import { IndexError, ValueError, pyRstrip, pyStrip } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";

/** PIR sequence-type codes and the `molecule_type` each implies (null when unspecified). */
export const PIR_MOL_TYPE: ReadonlyMap<string, string | null> = new Map([
  ["P1", "protein"], ["F1", "protein"], ["D1", "DNA"], ["DL", "DNA"], ["DC", "DNA"],
  ["RL", "RNA"], ["RC", "RNA"], ["N3", "RNA"], ["XX", null],
]);

/**
 * Reads PIR (NBRF) files: `>XX;identifier`, a description line, then the sequence ending in `*`.
 * The type code goes to `annotations["PIR-type"]`; `molecule_type` is set when the code implies one.
 *
 * @throws {@link ValueError} for a bad type code or a missing `*` terminator.
 * @throws {@link IndexError} for a header cut short or an empty sequence (as Python's string indexing does).
 */
export class PirIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private line: string | null;

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    super(source, alphabet, "Pir");
    this.line = null;
    // Skip anything before the first header.
    for (const line of this.stream!) {
      if (line[0] === ">") { this.line = line; break; }
    }
  }

  protected nextRecord(): SeqRecord | null {
    const first = this.line;
    if (first === null) return null;
    const pirType = first.slice(1, 3);
    // `line[3]` raises IndexError for a header shorter than four characters, but only if the code is valid.
    if (!PIR_MOL_TYPE.has(pirType)) throw new ValueError("Records should start with '>XX;' where XX is a valid sequence type");
    if (first.length < 4) throw new IndexError("string index out of range");
    if (first[3] !== ";") throw new ValueError("Records should start with '>XX;' where XX is a valid sequence type");
    const identifier = pyStrip(first.slice(4));
    let description = this.stream!.readline();
    if (description === "") return null;
    description = pyStrip(description);
    const lines: string[] = [];
    this.line = null;
    for (const line of this.stream!) {
      if (line[0] === ">") { this.line = line; break; }
      lines.push(pyRstrip(line).replaceAll(" ", ""));
    }
    const seq = lines.join("");
    if (seq.length === 0) throw new IndexError("string index out of range");
    if (seq[seq.length - 1] !== "*") throw new ValueError("Sequences in PIR files should include a * terminator!");
    const record = new SeqRecord(new Seq(seq.slice(0, -1)), identifier, identifier, description);
    record.annotations.set("PIR-type", pirType);
    const mol = PIR_MOL_TYPE.get(pirType);
    if (mol) record.annotations.set("molecule_type", mol);
    return record;
  }
}
