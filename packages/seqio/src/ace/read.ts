/** `Bio.Sequencing.Ace.read`: a whole ACE file, with trailing tags sorted into their contigs and reads. */

import { IndexError, ValueError, pyInt, pySplit } from "@biolibs/core";
import { openText } from "../handles.js";
import { parseAce } from "./parser.js";
import type { Contig, Ct, Wa, Rt, Wr } from "./records.js";

/** Remove the first occurrence of `item` from `list` (Python `list.remove`, comparing by identity as these objects do). */
function remove<T>(list: T[], item: T): void {
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}

/** The data of a whole ACE file. */
export class ACEFileRecord {
  ncontigs: number | null = null;
  nreads: number | null = null;
  contigs: Contig[] = [];
  wa: Wa[] | null = null;

  /**
   * Move CT, RT and WR tags found in a footer into the contig or read they name, and gather WA tags
   * (Biopython's `sort`).
   */
  sort(): void {
    const ct: Ct[] = [];
    const rt: Rt[] = [];
    const wr: Wr[] = [];
    for (const c of this.contigs) {
      if (c.wa && c.wa.length > 0) {
        if (!this.wa || this.wa.length === 0) this.wa = [];
        this.wa.push(...c.wa);
      }
      if (c.ct && c.ct.length > 0) {
        const newcts = c.ct.filter((t) => t.name !== c.name);
        for (const x of newcts) remove(c.ct, x);
        ct.push(...newcts);
      }
      for (const r of c.reads) {
        if (r.rt && r.rt.length > 0) {
          const newrts = r.rt.filter((t) => t.name !== r.rd!.name);
          for (const x of newrts) remove(r.rt, x);
          rt.push(...newrts);
        }
        if (r.wr && r.wr.length > 0) {
          const newwrs = r.wr.filter((t) => t.name !== r.rd!.name);
          for (const x of newwrs) remove(r.wr, x);
          wr.push(...newwrs);
        }
      }
    }
    for (const c of this.contigs) {
      for (const tag of ct) if (tag.name === c.name) (c.ct ??= []).push(tag);
      if (rt.length > 0 || wr.length > 0) {
        for (const r of c.reads) {
          for (const tag of rt) if (tag.name === r.rd!.name) (r.rt ??= []).push(tag);
          for (const tag of wr) if (tag.name === r.rd!.name) (r.wr ??= []).push(tag);
        }
      }
    }
  }
}

/**
 * Parse a full ACE file.
 *
 * @param source - The file's text (or a `LineStream`).
 * @throws {@link ValueError} for an empty file or one that does not start with `AS`.
 */
export function readAce(source: unknown): ACEFileRecord {
  const stream = openText(source, "ACE");
  const line = stream.readline();
  if (line === "") throw new ValueError("Premature end of file");
  if (!line.startsWith("AS")) throw new ValueError("File does not start with 'AS'.");
  const words = pySplit(line);
  const record = new ACEFileRecord();
  record.ncontigs = pyInt(words[1] ?? failIndex());
  record.nreads = pyInt(words[2] ?? failIndex());
  record.contigs = [...parseAce(stream)];
  record.sort();
  return record;
}

/** Python `words[i]` on a short list. */
function failIndex(): never {
  throw new IndexError("list index out of range");
}
