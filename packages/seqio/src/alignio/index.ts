/**
 * @packageDocumentation
 * Multiple sequence alignment file formats read and written through `SeqIO`, a port of Biopython's `Bio.AlignIO`
 * modules together with the `SeqIO` adapters that turn alignments into records.
 *
 * - `interfaces.ts`: alignment reader and writer base classes
 * - `bridge.ts`: adapters to `SeqIO` readers and writers
 * - `phylip.ts`: `phylip`, `phylip-sequential`, `phylip-relaxed`
 * - `clustal.ts`: `clustal`
 * - `stockholm.ts`: `stockholm`
 * - `msf.ts`: `msf`
 * - `emboss.ts`: `emboss`
 * - `fasta-m10.ts`: `fasta-m10`
 * - `mauve.ts`: `mauve`
 * - `maf.ts`: `maf`
 */

import { MultipleSeqAlignment } from "@biolibs/align";
import { StringHandle } from "../handles.js";
import { registerIterator, registerWriter } from "../registry.js";
import { alignmentSequenceIterator, alignmentSequenceWriter } from "./bridge.js";
import { ClustalIterator, ClustalWriter } from "./clustal.js";
import type { AlignmentIteratorClass, AlignmentWriterClass } from "./interfaces.js";
import { EmbossIterator } from "./emboss.js";
import { FastaM10Iterator } from "./fasta-m10.js";
import { MafIterator, MafWriter } from "./maf.js";
import { MauveIterator, MauveWriter } from "./mauve.js";
import { MsfIterator } from "./msf.js";
import { StockholmIterator, StockholmWriter } from "./stockholm.js";
import { PhylipIterator, PhylipWriter, RelaxedPhylipIterator, RelaxedPhylipWriter, SequentialPhylipIterator, SequentialPhylipWriter } from "./phylip.js";

const READERS: [string, AlignmentIteratorClass][] = [
  ["clustal", ClustalIterator],
  ["phylip", PhylipIterator],
  ["phylip-sequential", SequentialPhylipIterator],
  ["phylip-relaxed", RelaxedPhylipIterator],
  ["stockholm", StockholmIterator],
  ["msf", MsfIterator],
  ["emboss", EmbossIterator],
  ["fasta-m10", FastaM10Iterator],
  ["mauve", MauveIterator],
  ["maf", MafIterator],
];
const WRITERS: [string, AlignmentWriterClass][] = [
  ["clustal", ClustalWriter as AlignmentWriterClass],
  ["phylip", PhylipWriter as AlignmentWriterClass],
  ["phylip-sequential", SequentialPhylipWriter as AlignmentWriterClass],
  ["phylip-relaxed", RelaxedPhylipWriter as AlignmentWriterClass],
  ["stockholm", StockholmWriter as AlignmentWriterClass],
  ["mauve", MauveWriter as AlignmentWriterClass],
  ["maf", MafWriter as AlignmentWriterClass],
];

for (const [fmt, cls] of READERS) registerIterator(fmt, alignmentSequenceIterator(fmt, cls));
for (const [fmt, cls] of WRITERS) {
  registerWriter(fmt, alignmentSequenceWriter(cls) as never);
  // `format(alignment, "clustal")`
  MultipleSeqAlignment.writers.set(fmt, (alignment) => {
    const out = new StringHandle();
    new cls(out).writeFile([alignment]);
    return out.getvalue();
  });
}

export * from "./interfaces.js";
export * from "./phylip.js";
export * from "./clustal.js";
export * from "./stockholm.js";
export * from "./msf.js";
export * from "./emboss.js";
export * from "./fasta-m10.js";
export * from "./mauve.js";
export * from "./maf.js";
