/** NEXUS files (Biopython's `Bio.Align.nexus`), built on `@biolibs/nexus`. */

import { ValueError } from "@biolibs/core";
import { Nexus, StopIteration } from "@biolibs/nexus";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter, type WriteTarget } from "./interfaces.js";
import { AssertionError, decode, encode, rowsOf, strip } from "./rows.js";
import { registerFormat } from "./registry.js";
import type { TextStream } from "./stream.js";

/** Writes one alignment as a NEXUS `data` block. */
export class NexusWriter extends AlignmentWriter {
  static override fmt: string | null = "Nexus";

  /**
   * @param target - Where to write.
   * @param interleave - `null`: interleave when there are more than 1000 columns; true or false to force it.
   */
  constructor(target: WriteTarget | null = null, private readonly interleave: boolean | null = null) { super(target); }

  override writeFile(stream: WriteTarget, alignments: Iterable<Alignment>): number {
    const count = super.writeFile(stream, alignments);
    if (count !== 1) throw new ValueError(`Expected to write 1 alignment; wrote ${count}`);
    return count;
  }

  /** @returns One alignment as NEXUS text. @param alignment - The alignment. @param interleave - See the constructor. */
  formatAlignment(alignment: Alignment, interleave: boolean | null = null): string {
    let text = "";
    this.writeAlignment(alignment, { write: (t: string) => { text += t; } }, interleave);
    return text;
  }

  /** Write one alignment. @param alignment - The alignment. @param stream - The output. @param interleave - See the constructor. */
  writeAlignment(alignment: Alignment, stream: WriteTarget, interleave: boolean | null = null): void {
    const [nseqs, length] = alignment.shape;
    if (nseqs === 0) throw new ValueError("Must have at least one sequence");
    if (length === 0) throw new ValueError("Non-empty sequences are required");
    const datatype = this.classifyMolType(alignment);
    const n = new Nexus(`begin data; dimensions ntax=0 nchar=0; format datatype=${datatype}; end;`);
    const rows = rowsOf(alignment);
    alignment.sequences.forEach((record, i) => {
      const text = String((record as SeqRecord).seq);
      if (datatype === "dna" && text.includes("U")) throw new ValueError(`${(record as SeqRecord).id} contains U, but DNA alignment`);
      if (datatype === "rna" && text.includes("T")) throw new ValueError(`${(record as SeqRecord).id} contains T, but RNA alignment`);
      n.addSequence((record as SeqRecord).id as string, rows[i]!);
    });
    n.writeNexusData({ filename: stream, interleave: interleave === null ? length > 1000 : interleave });
  }

  override writeAlignments(stream: WriteTarget, alignments: Iterable<Alignment>): number {
    let count = 0;
    for (const alignment of alignments) { this.writeAlignment(alignment, stream, this.interleave); count++; }
    return count;
  }

  /** "dna", "rna" or "protein" from the records' agreeing `molecule_type` annotations. @throws ValueError otherwise. */
  private classifyMolType(alignment: Alignment): string {
    const values = new Set<unknown>(alignment.sequences.map((s) => {
      if (!(s instanceof SeqRecord)) throw new TypeError("attribute error");
      return s.annotations.get("molecule_type") ?? null;
    }));
    const all = (word: string): boolean => [...values].every((v) => typeof v === "string" && v !== "" && v.includes(word));
    if (all("DNA")) return "dna";
    if (all("RNA")) return "rna";
    if (all("protein")) return "protein";
    throw new ValueError("Need the molecule type to be defined");
  }
}

/** Reads the one alignment of a NEXUS file (none if it has no matrix). */
export class NexusIterator extends AlignmentIterator {
  static override fmt: string | null = "Nexus";

  protected override readHeader(stream: TextStream): void {
    const line = stream.readline();
    if (!line) throw new ValueError("Empty file.");
    if (strip(line) !== "#NEXUS") throw new ValueError("File does not start with NEXUS header.");
  }

  protected readNextAlignment(stream: TextStream): Alignment | null {
    let n: Nexus;
    try {
      n = new Nexus(stream.read());
    } catch (e) {
      // A StopIteration escaping Biopython's parser is read by the iterator protocol as "no more alignments".
      if (e instanceof StopIteration) return null;
      throw e;
    }
    if (!n.matrix || n.matrix.size === 0) return null;
    if (n.unalteredTaxlabels.length !== n.taxlabels.length) throw new AssertionError("");
    const dt = n.datatype;
    const annotations = dt === "dna" || dt === "nucleotide" ? { molecule_type: "DNA" } : dt === "rna" ? { molecule_type: "RNA" } : dt === "protein" ? { molecule_type: "protein" } : null;
    const aligned = n.taxlabels.map((name) => encode(String(n.matrix!.get(name))));
    const parsed = Alignment.parsePrintedAlignment(aligned);
    const records = parsed.sequences.map((seq, i) => new SeqRecord(new Seq(decode(seq)), n.unalteredTaxlabels[i]!, undefined, undefined, null, null, annotations));
    // Remove the columns consisting of gaps only.
    const ncol = parsed.coordinates[0]!.length - 1;
    const drop = new Set<number>();
    for (let c = 0; c < ncol; c++) if (Math.max(...parsed.coordinates.map((row) => row[c + 1]! - row[c]!)) === 0) drop.add(c + 1);
    const coordinates = parsed.coordinates.map((row) => row.filter((_, c) => !drop.has(c)));
    return new Alignment(records, coordinates);
  }
}

registerFormat("nexus", { AlignmentIterator: NexusIterator, AlignmentWriter: NexusWriter as never });
