/** `SeqIO` reader for the `ace` format: contig consensus sequences with their PHRED qualities. */

import { AssertionError, IndexError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { parseAce } from "./parser.js";
import type { Contig } from "./records.js";

/**
 * Reads the contigs of an ACE file as records: id and name are the contig name, `*` gaps in the consensus become
 * `-`, and `letter_annotations["phred_quality"]` holds the base qualities (0 at gaps, which have none in the file).
 * Footer tags (WA, CT, RT, WR) are not available in a single pass and are ignored.
 *
 * @throws {@link ValueError} for a malformed file.
 */
export class AceIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly contigs: Generator<Contig>;

  /** @param source - The file's text. */
  constructor(source: unknown) {
    super(source, null, "ACE");
    this.contigs = parseAce(this.stream!);
  }

  protected nextRecord(): SeqRecord | null {
    const next = this.contigs.next();
    if (next.done) return null;
    const contig = next.value;
    let text = contig.sequence;
    if (text.includes("*")) {
      // Biopython asserts there is no "-" already, so that the mapping is reversible.
      if (text.includes("-")) throw new AssertionError("");
      text = text.replaceAll("*", "-");
    }
    const record = new SeqRecord(new Seq(text), contig.name, contig.name);
    const quals: number[] = [];
    let i = 0;
    for (const base of text) {
      if (base === "-") quals.push(0);
      else {
        // `ace_contig.quality[i]` raises IndexError when there are fewer qualities than bases.
        if (i >= contig.quality.length) throw new IndexError("list index out of range");
        quals.push(contig.quality[i]!);
        i++;
      }
    }
    if (i !== contig.quality.length) throw new AssertionError("");
    record.letterAnnotations = new Map([["phred_quality", quals]]);
    return record;
  }
}
