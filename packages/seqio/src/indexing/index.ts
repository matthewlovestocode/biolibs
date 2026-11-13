/**
 * @packageDocumentation
 * `SeqIO.index` (Biopython's dictionary-like access to records of large sequence files), over in-memory file contents.
 *
 * - `bytes.ts`: `ByteHandle` and ASCII byte-string helpers
 * - `proxies.ts`: `SeqFileRandomAccess`, `SequentialSeqFileRandomAccess`, `TabRandomAccess`
 * - `formats.ts`: GenBank, EMBL/IMGT, Swiss-Prot and UniProt XML indexers
 * - `flat.ts`: IntelliGenetics and FASTQ indexers
 * - `dict.ts`: `IndexedSeqFileDict`
 * - the SFF indexers live with the rest of that format, in `../sff/random-access.ts`
 */

import { ValueError, pyIsLower } from "@biolibs/core";
import { IndexedSeqFileDict, type KeyFunction } from "./dict.js";
import { EmblRandomAccess, GenBankRandomAccess, SwissRandomAccess, UniprotRandomAccess } from "./formats.js";
import { FastqRandomAccess, IntelliGeneticsRandomAccess } from "./flat.js";
import { SequentialSeqFileRandomAccess, TabRandomAccess, type SeqFileRandomAccess } from "./proxies.js";
import { SffRandomAccess, SffTrimmedRandomAccess } from "../sff/random-access.js";

export { IndexedSeqFileDict, type KeyFunction } from "./dict.js";
export { SeqFileRandomAccess, SequentialSeqFileRandomAccess, TabRandomAccess, type Entry } from "./proxies.js";
export { EmblRandomAccess, GenBankRandomAccess, SwissRandomAccess, UniprotRandomAccess } from "./formats.js";
export { FastqRandomAccess, IntelliGeneticsRandomAccess } from "./flat.js";
export { SffRandomAccess, SffTrimmedRandomAccess, readRawRecord, readRocheIndex, slowIndex } from "../sff/random-access.js";

type ProxyClass = new (bytes: Uint8Array, format: string) => SeqFileRandomAccess;

/** The indexer class for each format that can be indexed. */
export const FORMAT_TO_RANDOM_ACCESS: ReadonlyMap<string, ProxyClass> = new Map<string, ProxyClass>([
  ["ace", SequentialSeqFileRandomAccess], ["embl", EmblRandomAccess], ["fasta", SequentialSeqFileRandomAccess], ["fastq", FastqRandomAccess],
  ["fastq-sanger", FastqRandomAccess], ["fastq-solexa", FastqRandomAccess], ["fastq-illumina", FastqRandomAccess], ["genbank", GenBankRandomAccess],
  ["gb", GenBankRandomAccess], ["ig", IntelliGeneticsRandomAccess], ["imgt", EmblRandomAccess], ["phd", SequentialSeqFileRandomAccess],
  ["pir", SequentialSeqFileRandomAccess], ["swiss", SwissRandomAccess], ["tab", TabRandomAccess], ["qual", SequentialSeqFileRandomAccess],
  ["uniprot-xml", UniprotRandomAccess], ["sff", SffRandomAccess], ["sff-trim", SffTrimmedRandomAccess],
]);

/** Options of {@link index}. */
export interface IndexOptions {
  /** Turns each record id into the key; it is given the id string only, so the file need not be parsed to build the index. */
  keyFunction?: KeyFunction | null;
  /** Name of the file, shown in `repr()` (default `<memory>`). */
  name?: string;
  /** No longer supported; must be null/undefined. */
  alphabet?: null;
}

/**
 * Index the records of a sequence file, returning a dictionary-like object that parses a record only when asked.
 * Not for interleaved formats such as alignments.
 *
 * @param source - The file's contents: text, or bytes (offsets and raw records are in bytes, so UTF-8 text is encoded).
 * @param format - Lower-case format name, e.g. `"fasta"` or `"fastq"`.
 * @param options - See {@link IndexOptions}.
 * @returns The index.
 * @throws TypeError / ValueError for a bad format name, an unsupported format, a duplicate key, or a malformed file.
 *
 * @example
 * ```ts
 * const records = index(">a\nACGT\n>b\nGG\n", "fasta");
 * [...records.keys()];          // ["a", "b"]
 * records.get("b").seq!.toString();   // "GG"
 * ```
 */
export function index(source: string | Uint8Array, format: string, options: IndexOptions = {}): IndexedSeqFileDict {
  if (typeof format !== "string") throw new TypeError("Need a string for the file format (lower case)");
  if (!format) throw new ValueError("Format required (lower case string)");
  if (!pyIsLower(format)) throw new ValueError(`Format string '${format}' should be lower case`);
  if (options.alphabet !== null && options.alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
  const Proxy = FORMAT_TO_RANDOM_ACCESS.get(format);
  if (!Proxy) throw new ValueError(`Unsupported format '${format}'`);
  const keyFunction = options.keyFunction ?? null;
  const reprText = `SeqIO.index('${options.name ?? "<memory>"}', '${format}', alphabet=None, key_function=${keyFunction ? "<function>" : "None"})`;
  const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
  return new IndexedSeqFileDict(new Proxy(bytes, format), keyFunction, reprText, "SeqRecord");
}
