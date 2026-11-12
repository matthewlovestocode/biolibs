/** `SeqIO` reader for the `phd` format. */

import { IndexError, pyInt, pyFirstWord } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { readPhd } from "./parser.js";

/**
 * Reads PHRED/PHD files. Each read becomes a record with `id` and `name` from the first word of the
 * `BEGIN_SEQUENCE` line, the comment fields as `annotations` (absent ones are null), and
 * `phred_quality` (and `peak_location`, if every site has one) as per-letter annotations.
 *
 * @example
 * ```ts
 * const [r] = [...new PhdIterator(text)];
 * r.letterAnnotations.get("phred_quality");   // [9, 13, 22, ...]
 * ```
 */
export class PhdIterator extends SequenceIterator {
  get modes(): string { return "t"; }

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    super(source, alphabet, "PHD");
  }

  protected nextRecord(): SeqRecord | null {
    const phd = readPhd(this.stream!);
    if (phd === null) return null;
    // An empty file name makes `split(None, 1)[0]` raise IndexError in Python.
    if (pyFirstWordOrNull(phd.fileName) === null) throw new IndexError("list index out of range");
    const name = pyFirstWord(phd.fileName);
    const record = new SeqRecord(phd.seq, name, name, phd.fileName);
    record.annotations = phd.comments as Map<string, unknown>;
    record.annotations.set("molecule_type", "DNA");
    record.letterAnnotations.set("phred_quality", phd.sites.map((site) => pyInt(site[1]!)));
    // Peak locations are only there if every site has a third column; otherwise Python's IndexError is swallowed.
    // Convert in order, as Python's list comprehension does, so a bad number in an earlier site is reported first.
    const peaks: number[] = [];
    let complete = true;
    for (const site of phd.sites) {
      if (site.length < 3) { complete = false; break; }
      peaks.push(pyInt(site[2]!));
    }
    if (complete) record.letterAnnotations.set("peak_location", peaks);
    return record;
  }
}

/** First whitespace-delimited word of `s`, or null if there is none. */
function pyFirstWordOrNull(s: string): string | null {
  try {
    return pyFirstWord(s);
  } catch (e) {
    if (e instanceof IndexError) return null;
    throw e;
  }
}
