/** The top-level functions of `Bio.SeqIO`: parse, read, write, toDict, convert. */

import { ValueError, pyContains, pyIsLower } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import type { WriteHandle } from "./handles.js";
import type { SequenceIterator } from "./interfaces.js";
import { FORMAT_TO_ITERATOR, FORMAT_TO_WRITER } from "./registry.js";

/** Check the shape of a format name, with Biopython's messages. */
function checkFormat(format: unknown): asserts format is string {
  if (typeof format !== "string") throw new TypeError("Need a string for the file format (lower case)");
  if (!format) throw new ValueError("Format required (lower case string)");
  if (!pyIsLower(format)) throw new ValueError(`Format string '${format}' should be lower case`);
}

/**
 * Iterate over the records in a sequence file.
 *
 * @param source - The file's text contents (a string is the *contents*, not a file name), or an open `LineStream`.
 * @param format - Lower-case format name such as `"fasta"`.
 * @param alphabet - No longer supported; must be null/undefined.
 * @returns An iterator of `SeqRecord`s; errors in the file surface while iterating.
 * @throws {@link ValueError} for an unknown or malformed format name.
 *
 * @example
 * ```ts
 * for (const record of parse(">a\nACGT\n>b\nGG\n", "fasta")) console.log(record.id, record.seq!.toString());
 * ```
 */
export function parse(source: unknown, format: string, alphabet: null | undefined = null): SequenceIterator {
  checkFormat(format);
  if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
  const Cls = FORMAT_TO_ITERATOR.get(format);
  if (Cls) return new Cls(source);
  throw new ValueError(`Unknown format '${format}'`);
}

/**
 * Read a file that contains exactly one record.
 *
 * @throws {@link ValueError} if it has no records or more than one.
 */
export function read(source: unknown, format: string, alphabet: null | undefined = null): SeqRecord {
  const records = parse(source, format, alphabet);
  try {
    const first = records.next();
    if (first.done) throw new ValueError("No records found in handle");
    const second = records.next();
    if (!second.done) throw new ValueError("More than one record found in handle");
    return first.value;
  } finally {
    records.close();
  }
}

/**
 * Write records to a target in a given format.
 *
 * @param sequences - A record or an iterable of records.
 * @param handle - Where to write: anything with `write(text)`, such as `StringHandle`.
 * @param format - Lower-case format name.
 * @returns The number of records written.
 * @throws TypeError if the arguments are in the wrong order (a record or array as the handle).
 * @throws {@link ValueError} for an unknown format, or one that can be read but not written.
 */
export function write(sequences: Iterable<SeqRecord> | SeqRecord, handle: WriteHandle, format: string): number {
  checkFormat(format);
  if ((handle as unknown) instanceof SeqRecord) throw new TypeError("Check arguments, handle should NOT be a SeqRecord");
  if (Array.isArray(handle)) throw new TypeError("Check arguments, handle should NOT be a list");
  if (sequences instanceof SeqRecord) sequences = [sequences];
  const Writer = FORMAT_TO_WRITER.get(format);
  if (Writer) {
    return new Writer(handle).writeFile(sequences);
  }
  if (FORMAT_TO_ITERATOR.has(format)) throw new ValueError(`Reading format '${format}' is supported, but not writing`);
  throw new ValueError(`Unknown format '${format}'`);
}

/**
 * Collect records into a `Map` keyed by id (or by `keyFunction`).
 *
 * @throws {@link ValueError} on a duplicate key.
 */
export function toDict(sequences: Iterable<SeqRecord>, keyFunction: ((record: SeqRecord) => string) | null = null): Map<string, SeqRecord> {
  const key = keyFunction ?? ((rec: SeqRecord) => rec.id as string);
  const d = new Map<string, SeqRecord>();
  for (const record of sequences) {
    const k = key(record);
    if (d.has(k)) throw new ValueError(`Duplicate key '${k}'`);
    d.set(k, record);
  }
  return d;
}

/**
 * Convert between two formats: parse `source` and write the result to `target`.
 *
 * @param source - Input text.
 * @param inFormat - Input format.
 * @param target - Output target (`write(text)`).
 * @param outFormat - Output format.
 * @param moleculeType - Optional override for the `molecule_type` annotation (must mention DNA, RNA or protein).
 * @returns The number of records converted.
 */
export function convert(source: unknown, inFormat: string, target: WriteHandle, outFormat: string, moleculeType: string | null = null): number {
  if (moleculeType) {
    if (typeof moleculeType !== "string") throw new TypeError(`Molecule type should be a string, not ${String(moleculeType)}`);
    if (!(pyContains("DNA", moleculeType) || pyContains("RNA", moleculeType) || pyContains("protein", moleculeType))) {
      throw new ValueError(`Unexpected molecule type, '${moleculeType}'`);
    }
  }
  let records: Iterable<SeqRecord> = parse(source, inFormat);
  if (moleculeType) {
    const mt = moleculeType;
    const original = records;
    records = (function* () {
      for (const record of original) {
        record.annotations.set("molecule_type", mt);
        yield record;
      }
    })();
  }
  return write(records, target, outFormat);
}
