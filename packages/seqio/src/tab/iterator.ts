/** Reader for the `tab` format: one `title<TAB>sequence` pair per line. */

import { ValueError, pyRepr, pyStrip } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";

/**
 * Reads tab-separated plain text: each non-blank line holds a title and a sequence separated by exactly one tab.
 * The title becomes both `id` and `name`; the description is empty.
 *
 * @example
 * ```ts
 * [...new TabIterator("a\tACGT\nb\tTTGG\n")].map((r) => r.id);   // ["a", "b"]
 * ```
 * @throws {@link ValueError} for a non-blank line without exactly one tab.
 */
export class TabIterator extends SequenceIterator {
  get modes(): string { return "t"; }

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    super(source, alphabet, "Tab-separated plain-text");
  }

  protected nextRecord(): SeqRecord | null {
    for (const line of this.stream!) {
      const parts = line.split("\t");
      // Python unpacks `title, seq = line.split("\t")`; any other count is a ValueError it catches.
      if (parts.length !== 2) {
        if (pyStrip(line) === "") continue;
        throw new ValueError(
          "Each line should have one tab separating the title and sequence, this line has " +
            `${parts.length - 1} tabs: ${pyRepr(line)}`,
        );
      }
      const title = pyStrip(parts[0]!);
      const seq = pyStrip(parts[1]!);
      return new SeqRecord(new Seq(seq), title, title, "");
    }
    return null;
  }
}
