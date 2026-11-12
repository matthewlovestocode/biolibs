/** The QUAL writer (`qual`): quality scores as whitespace-separated integers under FASTA-style headers. */

import { ValueError, pyFirstWord, pyRound } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import type { WriteHandle } from "../handles.js";
import { SequenceWriter, clean } from "../interfaces.js";
import { getPhredQuality } from "./scores.js";

/** Function producing the header (without `>`) for a record. */
export type Record2Title = (record: SeqRecord) => string;

/** Quality scores as integer strings (Python `'%i' % round(q, 0)`), raising for missing values. */
function qualityStrings(record: SeqRecord): string[] {
  const raw = getPhredQuality(record);
  // Python's rounding fails on text, and its follow-up `None in qualities` then raises this error instead.
  if (typeof raw === "string") throw new TypeError("'in <string>' requires string as left operand, not NoneType");
  const qualities = raw as unknown[];
  if (qualities.some((q) => q === null || q === undefined)) throw new TypeError("A quality value of None was found");
  return qualities.map((q) => String(Math.trunc(pyRound(q as number))));
}

/** The default header text (same rule as the FASTA writer). */
function defaultTitle(record: SeqRecord, cleaner: (s: string) => string): string {
  const id = record.id ? cleaner(record.id) : "";
  const description = cleaner(record.description);
  if (description && pyFirstWord(description) === id) return description;
  if (description) return `${id} ${description}`;
  return id;
}

/**
 * Writes QUAL files, wrapping lines at `wrap` characters (default 60).
 *
 * @example
 * ```ts
 * QualPhredWriter.asString(record);   // ">r1\n40 40 38 12\n"
 * ```
 */
export class QualPhredWriter extends SequenceWriter {
  get modes(): string { return "t"; }
  /** Wrap width, or null for no wrapping. */
  readonly wrap: number | null;
  /** Optional custom header builder. */
  readonly record2title: Record2Title | null;

  /**
   * @param handle - Where to write.
   * @param wrap - Line width. Default 60; a falsy value means no wrapping.
   * @param record2title - Custom header builder.
   * @throws {@link ValueError} if `wrap` is below 1.
   */
  constructor(handle: WriteHandle, wrap: number | null = 60, record2title: Record2Title | null = null) {
    super(handle);
    this.wrap = null;
    if (wrap) {
      if (wrap < 1) throw new ValueError("");
      this.wrap = wrap;
    }
    this.record2title = record2title;
  }

  /** One record as QUAL text (always wrapped just under 60 characters). */
  static asString(record: SeqRecord): string {
    const lines = [`>${defaultTitle(record, clean)}\n`];
    const strs = qualityStrings(record);
    while (strs.length) {
      let line = strs.shift()!;
      while (strs.length && line.length + 1 + strs[0]!.length < 60) line += " " + strs.shift()!;
      lines.push(line + "\n");
    }
    return lines.join("");
  }

  writeRecord(record: SeqRecord): void {
    const handle = this.handle;
    const wrap = this.wrap;
    const title = this.record2title ? this.clean(this.record2title(record)) : defaultTitle(record, (s) => this.clean(s));
    handle.write(`>${title}\n`);
    const strs = qualityStrings(record);
    if (wrap !== null && wrap > 5) {
      let data = strs.join(" ");
      while (true) {
        if (data.length <= wrap) {
          handle.write(data + "\n");
          break;
        }
        const i = data.lastIndexOf(" ", wrap - 1); // Python's data.rfind(" ", 0, wrap) never looks at index `wrap` itself
        handle.write(data.slice(0, i) + "\n");
        data = data.slice(i + 1);
      }
    } else if (wrap) {
      while (strs.length) {
        let line = strs.shift()!;
        while (strs.length && line.length + 1 + strs[0]!.length < wrap) line += " " + strs.shift()!;
        handle.write(line + "\n");
      }
    } else {
      handle.write(strs.join(" ") + "\n");
    }
  }
}
