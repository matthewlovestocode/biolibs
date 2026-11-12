/** `PairedFastaQualIterator`: combine a FASTA file and a QUAL file into records with sequences and qualities. */

import { ValueError } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { FastaIterator } from "../fasta/iterators.js";
import { QualPhredIterator } from "./qual-iterator.js";

/**
 * Pair up records of a FASTA file and a QUAL file (same order, same ids and lengths) and yield records carrying both.
 *
 * @param fastaSource - FASTA contents.
 * @param qualSource - QUAL contents.
 * @param alphabet - Not supported.
 * @throws {@link ValueError} if the files differ in record count, ids, or lengths.
 */
export function* pairedFastaQualIterator(fastaSource: unknown, qualSource: unknown, alphabet: null | undefined = null): Generator<SeqRecord> {
  if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
  const fastaIter = new FastaIterator(fastaSource);
  const qualIter = new QualPhredIterator(qualSource);
  while (true) {
    const f = fastaIter.next();
    const q = qualIter.next();
    const fRec = f.done ? null : f.value;
    const qRec = q.done ? null : q.value;
    if (fRec === null && qRec === null) break;
    if (fRec === null) throw new ValueError("FASTA file has more entries than the QUAL file.");
    if (qRec === null) throw new ValueError("QUAL file has more entries than the FASTA file.");
    if (fRec.id !== qRec.id) throw new ValueError(`FASTA and QUAL entries do not match (${fRec.id} vs ${qRec.id}).`);
    const scores = qRec.letterAnnotations.get("phred_quality")!;
    if (fRec.length !== scores.length) throw new ValueError(`Sequence length and number of quality scores disagree for ${fRec.id}`);
    fRec.letterAnnotations.set("phred_quality", scores);
    yield fRec;
  }
}
