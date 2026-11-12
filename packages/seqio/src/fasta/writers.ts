/** FASTA writers: `fasta` (wrapped at 60 by default) and `fasta-2line`. */

import { ValueError, pyFirstWord } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import type { WriteHandle } from "../handles.js";
import { SequenceWriter, clean, getSeqString } from "../interfaces.js";

/** Function producing the header (without `>`) for a record. */
export type Record2Title = (record: SeqRecord) => string;

/** The default header: the description if it starts with the id, else `"id description"`, else the id. */
function defaultTitle(id: string, description: string): string {
  if (description && pyFirstWord(description) === id) return description;
  if (description) return `${id} ${description}`;
  return id;
}

/** Throw if text that must stay on one line contains a line break (Biopython `assert`). */
function assertSingleLine(text: string): void {
  if (text.includes("\n") || text.includes("\r")) throw new Error("AssertionError");
}

/**
 * Writes FASTA, wrapping sequences at `wrap` characters (default 60; `null` or 0 means no wrapping).
 *
 * @example
 * ```ts
 * const out = new StringHandle();
 * new FastaWriter(out, 4).writeFile([new SeqRecord(new Seq("ACGTACGT"), "a")]);
 * out.getvalue();   // ">a <unknown description>\nACGT\nACGT\n"
 * ```
 */
export class FastaWriter extends SequenceWriter {
  get modes(): string { return "t"; }
  /** Line length for the sequence, or null/0 for none. */
  readonly wrap: number | null;
  /** Optional function building the header text from a record. */
  readonly record2title: Record2Title | null;

  /**
   * @param target - Where to write.
   * @param wrap - Maximum sequence line length. Default 60.
   * @param record2title - Custom header builder.
   * @throws {@link ValueError} if `wrap` is below 1.
   */
  constructor(target: WriteHandle, wrap: number | null = 60, record2title: Record2Title | null = null) {
    super(target);
    if (wrap) {
      if (wrap < 1) throw new ValueError("");
    }
    this.wrap = wrap;
    this.record2title = record2title;
  }

  /** One record as FASTA text, wrapped at 60. */
  static asString(record: SeqRecord): string {
    const id = clean(record.id as string);
    const description = clean(record.description);
    const title = defaultTitle(id, description);
    assertSingleLine(title);
    const lines = [`>${title}\n`];
    const data = getSeqString(record);
    assertSingleLine(data);
    for (let i = 0; i < data.length; i += 60) lines.push(data.slice(i, i + 60) + "\n");
    return lines.join("");
  }

  writeRecord(record: SeqRecord): void {
    let title: string;
    if (this.record2title) {
      title = this.clean(this.record2title(record));
    } else {
      title = defaultTitle(this.clean(record.id as string), this.clean(record.description));
    }
    assertSingleLine(title);
    this.handle.write(`>${title}\n`);
    const data = getSeqString(record);
    assertSingleLine(data);
    if (this.wrap) {
      // Python's range() rejects a fractional step, after the header has already been written.
      if (!Number.isInteger(this.wrap)) throw new TypeError("'float' object cannot be interpreted as an integer");
      for (let i = 0; i < data.length; i += this.wrap) this.handle.write(data.slice(i, i + this.wrap) + "\n");
    } else {
      this.handle.write(data + "\n");
    }
  }
}

/** Writes two-line FASTA (`fasta-2line`): the sequence is never wrapped. */
export class FastaTwoLineWriter extends FastaWriter {
  /** @param target - Where to write. @param record2title - Custom header builder. */
  constructor(target: WriteHandle, record2title: Record2Title | null = null) {
    super(target, null, record2title);
  }

  /** One record as two-line FASTA text. */
  static asString(record: SeqRecord): string {
    const title = defaultTitle(clean(record.id as string), clean(record.description));
    assertSingleLine(title);
    const data = getSeqString(record);
    assertSingleLine(data);
    return `>${title}\n${data}\n`;
  }
}
