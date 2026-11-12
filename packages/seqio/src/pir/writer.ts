/** Writer for the NBRF/PIR format. */

import { AssertionError, ValueError, pyContains } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import type { WriteHandle } from "../handles.js";
import { SequenceWriter, getSeqString } from "../interfaces.js";
import { PIR_MOL_TYPE } from "./iterator.js";

/**
 * Writes PIR files. The type code comes from `code`, else from the record's `molecule_type`
 * (`D1` for DNA, `RL` for RNA, `P1` for protein, `XX` otherwise).
 *
 * @example
 * ```ts
 * const out = new StringHandle();
 * new PirWriter(out).writeFile([rec]);   // ">XX;id\nname - description\nACGT*\n"
 * ```
 */
export class PirWriter extends SequenceWriter {
  get modes(): string { return "t"; }
  /** Line length (null or 0: no wrapping). */
  readonly wrap: number | null;
  /** Optional function building the identifier from a record. */
  readonly record2title: ((record: SeqRecord) => string) | null;
  /** Forced type code, if any. */
  readonly code: string | null;

  /**
   * @param target - Where to write.
   * @param wrap - Sequence line length; default 60.
   * @param record2title - Custom identifier builder.
   * @param code - Force a PIR type code.
   * @throws {@link ValueError} if `wrap` is below 1.
   */
  constructor(target: WriteHandle, wrap: number | null = 60, record2title: ((record: SeqRecord) => string) | null = null, code: string | null = null) {
    super(target);
    if (wrap && wrap < 1) throw new ValueError("wrap should be None, 0, or a positive integer");
    this.wrap = wrap;
    this.record2title = record2title;
    this.code = code;
  }

  writeRecord(record: SeqRecord): void {
    const title = this.record2title ? this.clean(this.record2title(record)) : this.clean(record.id as string);
    let description: string;
    if (record.name && record.description) description = this.clean(record.name + " - " + record.description);
    else if (record.name && !record.description) description = this.clean(record.name);
    else description = this.clean(record.description);

    let code: string;
    if (this.code) {
      code = this.code;
    } else {
      const mol = record.annotations.get("molecule_type");
      if (mol === undefined || mol === null) code = "XX";
      else if (pyContains("DNA", mol)) code = "D1";
      else if (pyContains("RNA", mol)) code = "RL";
      else if (pyContains("protein", mol)) code = "P1";
      else code = "XX";
    }
    // Biopython tries to concatenate a str with dict keys here, so the user sees this TypeError.
    if (!PIR_MOL_TYPE.has(code)) throw new TypeError('can only concatenate str (not "dict_keys") to str');
    if (title.includes("\n")) throw new AssertionError();
    if (description.includes("\r")) throw new AssertionError();
    this.handle.write(`>${code};${title}\n${description}\n`);

    const data = getSeqString(record);
    if (data.includes("\n") || data.includes("\r")) throw new AssertionError();
    if (this.wrap) {
      if (!Number.isInteger(this.wrap)) throw new TypeError("'float' object cannot be interpreted as an integer");
      let line = "";
      for (let i = 0; i < data.length; i += this.wrap) line += data.slice(i, i + this.wrap) + "\n";
      // The terminator replaces the final newline (an empty sequence gives "*" after dropping nothing).
      this.handle.write(line.slice(0, -1) + "*\n");
    } else {
      this.handle.write(data + "*\n");
    }
  }
}
