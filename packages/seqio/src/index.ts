/**
 * @packageDocumentation
 * `@biolibs/seqio`: a TypeScript port of Biopython's `Bio.SeqIO` — **49 formats readable, 26 writable**,
 * verified against Biopython 1.88 by 37,552 recorded cases. Every checklist item is at parity except
 * `index_db`, whose index lives in an SQLite file.
 *
 * Inputs are the *text contents* of a file (or a `LineStream`) for a text format and a `Uint8Array` for a
 * binary one; outputs are any object with `write(text)`, such as `StringHandle` or `BytesHandle`. There is
 * no file-system access anywhere, which is what lets this run in a browser as well as in Node — and what
 * makes `index_db` inapplicable.
 *
 * Importing this package registers every format, which also fills in `SeqRecord.format()` for the
 * writable ones.
 *
 * - `api.ts`: `parse`, `read`, `write`, `toDict`, `convert`
 * - `handles.ts`: `LineStream`, `StringHandle`, `BytesHandle`
 * - `interfaces.ts`, `registry.ts`: reader/writer base classes, the format registries, and
 *   `registerIterator` / `registerWriter` / `registerConverter` for a format of your own
 * - `indexing/`: `index`, the dictionary-like access that parses a record only when asked
 * - text formats: `fasta/` (four dialects), `fastq/` (three quality scales, and QUAL), `insdc/`
 *   (GenBank, EMBL, IMGT and their `-cds` forms), `swiss/`, `pir/`, `ig/`, `phd/`, `ace/`, `tab/`
 * - binary formats: `sff/`, `abi/`, `twobit/`, `nib/`, `gck/`, `xdna/`, `snapgene/`
 * - XML: `seqxml/` and `uniprot/`, over a SAX parser written for the job (`seqxml/xml-sax.ts`)
 * - `alignio/`: the `Bio.AlignIO` bridge — Clustal, Stockholm, PHYLIP and its variants, NEXUS, MSF, MAF,
 *   Mauve, EMBOSS and FASTA-m10, as one record per alignment row
 * - `pdb/`: sequences out of PDB and mmCIF files, from `SEQRES` or from the atoms
 * - `binary/`: Python's `struct` and the ASCII helpers the binary readers share
 * - `range.ts`: `ByteSource` and `bytesSource`, `blobSource`, `urlSource`, `countingSource` — reading
 *   part of a file, for a file too large to load. `TwoBitWindow` in `twobit/` reads a genome through
 *   one. Neither has a Biopython counterpart.
 */

import "./fasta/index.js"; // registers the formats
import "./fastq/index.js";
import "./insdc/index.js";
import "./tab/index.js";
import "./pir/index.js";
import "./swiss/index.js";
import "./phd/index.js";
import "./ig/index.js";
import "./seqxml/index.js";
import "./nib/index.js";
import "./twobit/index.js";
import "./gck/index.js";
import "./xdna/index.js";
import "./abi/index.js";
import "./snapgene/index.js";
import "./sff/index.js";
import "./pdb/index.js";
import "./gfa/index.js";
import "./uniprot/index.js";
import "./ace/index.js";
import "./alignio/index.js";

export * from "./api.js";
export * from "./errors.js";
export * from "./handles.js";
export * from "./interfaces.js";
export { FORMAT_TO_ITERATOR, FORMAT_TO_WRITER, registerConverter, registerIterator, registerWriter } from "./registry.js";
export * from "./fasta/index.js";
export * from "./fastq/index.js";
export * from "./insdc/index.js";
export * from "./tab/index.js";
export * from "./pir/index.js";
export * from "./swiss/index.js";
export * from "./phd/index.js";
export * from "./ig/index.js";
export * from "./seqxml/index.js";
export * from "./nib/index.js";
export * from "./range.js";
export * from "./twobit/index.js";
export * from "./gck/index.js";
export * from "./pdb/index.js";
export * from "./gfa/index.js";
export * from "./uniprot/index.js";
export * from "./ace/index.js";
export * from "./xdna/index.js";
export * from "./abi/index.js";
export * from "./snapgene/index.js";
export * from "./sff/index.js";
export * from "./alignio/index.js";
export * from "./indexing/index.js";
export { StructError, pack, unpack, calcsize, intFromBytes } from "./binary/struct.js";
export { decodeAscii, encodeAscii, readExact } from "./binary/ascii.js";
