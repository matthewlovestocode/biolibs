/** NEXUS alignment files (Biopython's `Bio.AlignIO.NexusIO`), built on `@biolibs/nexus`. */

import { MultipleSeqAlignment } from "@biolibs/align";
import { RuntimeError, ValueError } from "@biolibs/core";
import { Nexus, StopIteration } from "@biolibs/nexus";
import { SeqRecord } from "@biolibs/seqrecord";
import type { Seq } from "@biolibs/seq";
import { AlignmentIterator, AlignmentWriter } from "./interfaces.js";

/**
 * Reads the single alignment of a NEXUS file. Only one {@link MultipleSeqAlignment} is ever yielded, and none when
 * the file has no matrix.
 *
 * @throws {@link ValueError} if `seqCount` is given and differs from the number of taxa.
 */
export class NexusIterator extends AlignmentIterator {
  private done = false;

  nextAlignment(): MultipleSeqAlignment | null {
    if (this.done) return null;
    this.done = true;
    let n: Nexus;
    try {
      n = new Nexus(this.handle);
    } catch (e) {
      // A generator may not raise StopIteration, Python turns it into a RuntimeError.
      if (e instanceof StopIteration) throw new RuntimeError("generator raised StopIteration");
      throw e;
    }
    if (!n.matrix || n.matrix.size === 0) return null;
    if (n.unalteredTaxlabels.length !== n.taxlabels.length) throw Object.assign(new Error(""), { name: "AssertionError" });
    const seqCount = this.recordsPerAlignment;
    if (seqCount && seqCount !== n.unalteredTaxlabels.length) {
      throw new ValueError(`Found ${n.unalteredTaxlabels.length} sequences, but seq_count=${seqCount}`);
    }
    const molecule = n.datatype === "dna" || n.datatype === "nucleotide" ? "DNA" : n.datatype === "rna" ? "RNA" : n.datatype === "protein" ? "protein" : null;
    const records = n.unalteredTaxlabels.map((oldName, i) => {
      const newName = n.taxlabels[i]!;
      return new SeqRecord(n.matrix!.get(newName) as Seq, newName, oldName, "", null, null, molecule === null ? null : { molecule_type: molecule });
    });
    return new MultipleSeqAlignment(records);
  }
}

/** Writes one alignment as a NEXUS `data` block. */
export class NexusWriter extends AlignmentWriter {
  /** Write the one alignment of `alignments`; zero alignments writes nothing, more than one is an error. */
  writeFile(alignments: Iterable<MultipleSeqAlignment>): number {
    const it = alignments[Symbol.iterator]();
    const first = it.next();
    if (first.done) return 0;
    if (!it.next().done) throw new ValueError("We can only write one Alignment to a Nexus file.");
    this.writeAlignment(first.value);
    return 1;
  }

  /**
   * Write an alignment.
   *
   * @param interleave - Interleave the output; by default only when there are more than 1000 columns.
   * @throws {@link ValueError} for empty alignments, unknown molecule types or U in DNA / T in RNA.
   */
  writeAlignment(alignment: MultipleSeqAlignment, interleave: boolean | null = null): void {
    if (alignment.length === 0) throw new ValueError("Must have at least one sequence");
    const columns = alignment.getAlignmentLength();
    if (columns === 0) throw new ValueError("Non-empty sequences are required");
    const datatype = this.classifyMolType(alignment);
    const n = new Nexus(`#NEXUS\nbegin data; dimensions ntax=0 nchar=0; format datatype=${datatype}; end;`);
    for (const record of alignment) {
      const text = record.seq!.toString();
      if (datatype === "dna" && text.includes("U")) throw new ValueError(`${record.id} contains U, but DNA alignment`);
      if (datatype === "rna" && text.includes("T")) throw new ValueError(`${record.id} contains T, but RNA alignment`);
      n.addSequence(record.id as string, text);
    }
    if (interleave === null) interleave = columns > 1000;
    n.writeNexusData({ filename: this.handle, interleave });
  }

  /** "dna", "rna" or "protein" from the records' agreeing `molecule_type` annotations. */
  private classifyMolType(alignment: MultipleSeqAlignment): string {
    const values = [...new Set([...alignment].map((r) => r.annotations.get("molecule_type") ?? null))] as (string | null)[];
    if (values.every((v) => v && v.includes("DNA"))) return "dna";
    if (values.every((v) => v && v.includes("RNA"))) return "rna";
    if (values.every((v) => v && v.includes("protein"))) return "protein";
    throw new ValueError("Need the molecule type to be defined");
  }
}

