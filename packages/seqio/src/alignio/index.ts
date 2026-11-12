/**
 * @packageDocumentation
 * Multiple sequence alignment file formats read and written through `SeqIO`, a port of Biopython's `Bio.AlignIO`
 * modules together with the `SeqIO` adapters that turn alignments into records.
 *
 * - `interfaces.ts`: alignment reader and writer base classes
 * - `bridge.ts`: adapters to `SeqIO` readers and writers
 * - `phylip.ts`: `phylip`, `phylip-sequential`, `phylip-relaxed`
 * - `clustal.ts`: `clustal`
 */

import { MultipleSeqAlignment } from "@biolibs/align";
import { StringHandle } from "../handles.js";
import { registerIterator, registerWriter } from "../registry.js";
import { alignmentSequenceIterator, alignmentSequenceWriter } from "./bridge.js";
import { ClustalIterator, ClustalWriter } from "./clustal.js";
import type { AlignmentIteratorClass, AlignmentWriterClass } from "./interfaces.js";
import { PhylipIterator, PhylipWriter, RelaxedPhylipIterator, RelaxedPhylipWriter, SequentialPhylipIterator, SequentialPhylipWriter } from "./phylip.js";

const READERS: [string, AlignmentIteratorClass][] = [
  ["clustal", ClustalIterator],
  ["phylip", PhylipIterator],
  ["phylip-sequential", SequentialPhylipIterator],
  ["phylip-relaxed", RelaxedPhylipIterator],
];
const WRITERS: [string, AlignmentWriterClass][] = [
  ["clustal", ClustalWriter as AlignmentWriterClass],
  ["phylip", PhylipWriter as AlignmentWriterClass],
  ["phylip-sequential", SequentialPhylipWriter as AlignmentWriterClass],
  ["phylip-relaxed", RelaxedPhylipWriter as AlignmentWriterClass],
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
