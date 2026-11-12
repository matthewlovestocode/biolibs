/** Writer for the `tab` format. */

import { AssertionError } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { SequenceWriter, clean, getSeqString } from "../interfaces.js";

/**
 * Writes one `id<TAB>sequence` line per record.
 *
 * @example
 * ```ts
 * TabWriter.asString(new SeqRecord(new Seq("ACGT"), "a"));   // "a\tACGT\n"
 * ```
 * @throws {@link AssertionError} if the id or sequence contains a tab or line break.
 */
export class TabWriter extends SequenceWriter {
  get modes(): string { return "t"; }

  /** One record as a tab-format line. */
  static asString(record: SeqRecord): string {
    const title = clean(record.id as string);
    const seq = getSeqString(record);
    // Biopython asserts these in this order; any hit is an AssertionError.
    for (const text of [title, seq]) {
      if (text.includes("\t") || text.includes("\n") || text.includes("\r")) throw new AssertionError();
    }
    return `${title}\t${seq}\n`;
  }

  writeRecord(record: SeqRecord): void {
    this.handle.write(TabWriter.asString(record));
  }
}
