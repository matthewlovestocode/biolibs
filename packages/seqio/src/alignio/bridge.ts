/** Adapters that expose alignment formats through `SeqIO` as streams of records (Biopython's `AlignmentSequenceIterator` / `AlignmentSequenceWriter`). */

import { MultipleSeqAlignment } from "@biolibs/align";
import { RuntimeError } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator, SequenceWriter } from "../interfaces.js";
import type { WriteHandle } from "../handles.js";
import type { AlignmentIteratorClass, AlignmentWriterClass } from "./interfaces.js";

/**
 * Make a `SeqIO` reader class from an alignment reader: it yields the records of each alignment in turn.
 *
 * @param fmt - Format name for error messages. @param iteratorClass - The alignment reader.
 */
export function alignmentSequenceIterator(fmt: string, iteratorClass: AlignmentIteratorClass): new (source: unknown) => SequenceIterator {
  return class extends SequenceIterator {
    get modes(): string { return "t"; }
    private readonly records: Iterator<SeqRecord>;

    constructor(source: unknown) {
      super(source, null, fmt);
      const alignments = new iteratorClass(this.stream!, null);
      this.records = (function* () {
        for (const alignment of alignments) yield* alignment;
      })();
    }

    protected nextRecord(): SeqRecord | null {
      const next = this.records.next();
      return next.done ? null : next.value;
    }
  };
}

/** Make a `SeqIO` writer class from an alignment writer: the records are written as one alignment. */
export function alignmentSequenceWriter(writerClass: AlignmentWriterClass): new (target: WriteHandle) => SequenceWriter {
  return class extends SequenceWriter {
    get modes(): string { return "t"; }

    writeRecord(): void {
      throw new RuntimeError("Alignment formats are written through writeRecords");
    }

    writeRecords(records: Iterable<SeqRecord>): number {
      const alignment = new MultipleSeqAlignment(records);
      const count = new writerClass(this.handle).writeFile([alignment]);
      if (count !== 1) throw new RuntimeError(`Internal error - the underlying writer should have returned 1, not ${count}`);
      return alignment.length;
    }
  };
}
