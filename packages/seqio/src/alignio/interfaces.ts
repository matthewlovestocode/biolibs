/** Base classes for alignment readers and writers (Biopython's `AlignIO.Interfaces`). */

import type { MultipleSeqAlignment } from "@biolibs/align";
import type { LineStream, WriteHandle } from "../handles.js";

/**
 * Base class of alignment readers: an iterator of {@link MultipleSeqAlignment}s over a text stream. Subclasses
 * implement {@link AlignmentIterator.nextAlignment}.
 */
export abstract class AlignmentIterator implements Iterable<MultipleSeqAlignment> {
  /** @param handle - The open text input. @param seqCount - Number of records expected in each alignment, if known. */
  constructor(protected handle: LineStream, readonly recordsPerAlignment: number | null = null) {}

  /** The next alignment, or null at the end of the input. */
  abstract nextAlignment(): MultipleSeqAlignment | null;

  [Symbol.iterator](): Iterator<MultipleSeqAlignment> {
    return { next: () => {
      const a = this.nextAlignment();
      return a === null ? { done: true, value: undefined } : { done: false, value: a };
    } };
  }
}

/** Constructor of an alignment reader class. */
export type AlignmentIteratorClass = new (handle: LineStream, seqCount?: number | null) => AlignmentIterator;

/** Base class of alignment writers. */
export abstract class AlignmentWriter {
  /** @param handle - Where to write. */
  constructor(protected handle: WriteHandle) {}

  /** Write all alignments; returns how many. */
  abstract writeFile(alignments: Iterable<MultipleSeqAlignment>): number;

  /** Replace line breaks with spaces. */
  clean(text: string): string {
    return text.replaceAll("\n", " ").replaceAll("\r", " ");
  }
}

/** Constructor of an alignment writer class. */
export type AlignmentWriterClass = new (handle: WriteHandle) => AlignmentWriter;

/** A writer for formats where alignments are simply written one after another, with optional header and footer. */
export abstract class SequentialAlignmentWriter extends AlignmentWriter {
  writeFile(alignments: Iterable<MultipleSeqAlignment>): number {
    this.writeHeader();
    let count = 0;
    for (const alignment of alignments) {
      this.writeAlignment(alignment);
      count += 1;
    }
    this.writeFooter();
    return count;
  }

  /** Write anything that goes before the first alignment. */
  writeHeader(): void {}

  /** Write anything that goes after the last alignment. */
  writeFooter(): void {}

  /** Write one alignment. */
  abstract writeAlignment(alignment: MultipleSeqAlignment): void;
}
