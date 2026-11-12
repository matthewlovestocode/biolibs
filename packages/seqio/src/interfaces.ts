/**
 * Base classes for sequence readers and writers (Biopython's `SeqIO.Interfaces`).
 *
 * A reader is an iterator of `SeqRecord`s over a text source; a writer sends
 * records to a {@link WriteHandle}.
 */

import { Seq, MutableSeq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { ValueError } from "@biolibs/core";
import { StringHandle, isBinaryHandle, openBinary, openText, type BinaryStream, type BinaryWriteHandle, type LineStream, type WriteHandle } from "./handles.js";
import { StreamModeError } from "./errors.js";

/** The `modes` of a reader or writer, read in a base constructor (TypeScript forbids touching the abstract getter directly there). */
function modesOf(self: object): string {
  return (self as { modes: string }).modes;
}

/**
 * Base class of format readers. Iterate it with `for...of`, or call {@link SequenceIterator.next}.
 * Subclasses implement {@link SequenceIterator.nextRecord} and declare their `modes`.
 */
export abstract class SequenceIterator implements IterableIterator<SeqRecord> {
  /** `"t"` for text formats (all that are currently supported). */
  abstract get modes(): string;

  /** What was passed in. */
  readonly source: unknown;
  /** The open text input (text formats), or undefined after {@link SequenceIterator.close}. */
  protected stream: LineStream | undefined;
  /** The open byte input (binary formats), or undefined after {@link SequenceIterator.close}. */
  protected bytes: BinaryStream | undefined;

  /**
   * @param source - The file's text contents (or an open `LineStream`).
   * @param alphabet - No longer supported; must be null/undefined.
   * @param fmt - Format name for error messages.
   * @throws {@link ValueError} if an alphabet is given.
   * @throws {@link StreamModeError} for binary input to a text format.
   */
  constructor(source: unknown, alphabet: null | undefined = null, fmt = "Sequence") {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    this.source = source;
    if (modesOf(this) === "b") this.bytes = openBinary(source, fmt);
    else this.stream = openText(source, fmt);
  }

  /** The next record, or null when there are no more. */
  protected abstract nextRecord(): SeqRecord | null;

  /** Iterator protocol: the next record, or done. */
  next(): IteratorResult<SeqRecord> {
    const record = this.nextRecord();
    return record === null ? { done: true, value: undefined } : { done: false, value: record };
  }

  [Symbol.iterator](): this {
    return this;
  }

  /** Release the input (Python's `with ... as records:` exit). */
  close(): void {
    this.stream = undefined;
    this.bytes = undefined;
  }
}

/**
 * The sequence of a record as a string.
 *
 * @throws TypeError if `record` is not a `SeqRecord` or has no sequence.
 */
export function getSeqString(record: SeqRecord): string {
  if (!(record instanceof SeqRecord)) throw new TypeError("Expected a SeqRecord object");
  if (record.seq === null) throw new TypeError(`SeqRecord (id=${record.id}) has None for its sequence.`);
  if (!(record.seq instanceof Seq) && !(record.seq instanceof MutableSeq)) throw new TypeError(`SeqRecord (id=${record.id}) has an invalid sequence.`);
  return record.seq.toString();
}

/** Replace line breaks with spaces, so a value fits on one line (Biopython's `_clean`). */
export function clean(text: string): string {
  return text.replaceAll("\n", " ").replaceAll("\r", " ");
}

/** A writer class as stored in the registry. */
export interface WriterClass {
  new (target: WriteHandle, ...options: never[]): SequenceWriter;
  /** The record in this format, as text. */
  asString(record: SeqRecord): string;
}

/**
 * Base class of format writers. Create one around a target and call {@link SequenceWriter.writeFile}, or use `write()` from the API.
 */
export abstract class SequenceWriter {
  /** `"t"` for text formats. */
  abstract get modes(): string;

  /** The target passed in. */
  readonly target: WriteHandle;
  /** Where text is written. */
  protected handle: WriteHandle;

  /**
   * @param target - Anything with a `write(text)` method, such as `StringHandle`.
   * @throws TypeError if `target` cannot be written to.
   */
  constructor(target: WriteHandle | BinaryWriteHandle) {
    if (target === null || typeof target !== "object" || typeof (target as { write?: unknown }).write !== "function") {
      throw new TypeError("The target must be an object with a write(text) method");
    }
    // Biopython probes the handle and refuses one whose mode does not match the format.
    const binary = isBinaryHandle(target);
    if (binary && !modesOf(this).includes("b")) throw new StreamModeError("File must be opened in text mode.");
    if (!binary && !modesOf(this).includes("t")) throw new StreamModeError("File must be opened in binary mode.");
    this.target = target as WriteHandle;
    this.handle = target as WriteHandle;
  }

  /** Replace line breaks with spaces. */
  clean(text: string): string {
    return clean(text);
  }

  /** One record in this format, as text (Python's `to_string` classmethod). */
  static asString(this: new (target: WriteHandle) => SequenceWriter, record: SeqRecord): string {
    const handle = new StringHandle();
    new this(handle).writeFile([record]);
    return handle.getvalue();
  }

  /** Write one record. */
  abstract writeRecord(record: SeqRecord): void;

  /** Write all records; returns how many. */
  writeRecords(records: Iterable<SeqRecord>): number {
    let count = 0;
    for (const record of records) {
      this.writeRecord(record);
      count += 1;
    }
    return count;
  }

  /** Write a whole file (header, records, footer) and return the record count. */
  writeFile(records: Iterable<SeqRecord>): number {
    return this.writeRecords(records);
  }
}
