/** The base classes of the alignment parsers and writers (Biopython's `Bio.Align.interfaces`), over text instead of files. */

import { ValueError } from "@biolibs/core";
import type { Alignment } from "../alignment/alignment.js";
import { TextStream } from "./stream.js";
import { ByteStream } from "./byte-stream.js";

/** Anything that accepts text, such as a string builder with `write`. */
export interface WriteTarget {
  /** Append text. */
  write(text: string): unknown;
}

/** A list of alignments that can also be iterated like a parser (Biopython's `Alignments`). Parsers attach their header information (for example `metadata`) to it. */
export class Alignments extends Array<Alignment> {
  /** Header information read from the file (Clustal, Stockholm, MAF, ...). */
  metadata?: Record<string, unknown>;
  private cursor = -1;

  /** @returns The next alignment, or `done` at the end. */
  next(): IteratorResult<Alignment> {
    const i = this.cursor + 1;
    if (i >= this.length) return { done: true, value: undefined };
    this.cursor = i;
    return { done: false, value: this[i]! };
  }

  /** Start again from the first alignment. */
  rewind(): void { this.cursor = -1; }

  /** Iteration restarts, as it does for Biopython's `Alignments`. */
  override [Symbol.iterator](): IterableIterator<Alignment> {
    this.rewind();
    return this as unknown as IterableIterator<Alignment>;
  }
}

/** Any format's iterator, whatever kind of stream it reads: what the registry and `parse` hand back. */
export type AnyAlignmentIterator = AlignmentIterator<{ seek(offset: number): void }>;

/** A lazy sequence of alignments read from a text or byte source; subclasses define the format. */
export abstract class AlignmentIterator<S extends { seek(offset: number): void } = TextStream> implements IterableIterator<Alignment> {
  /** The format name used in messages. */
  static fmt: string | null = null;
  /** `t` for text formats, `b` for binary ones. */
  static mode: "t" | "b" = "t";
  /** What is being read: a {@link TextStream} for a text format, a {@link ByteStream} for a binary one. */
  protected stream: S | null;
  /** The number of alignments returned so far. */
  protected index = 0;
  private len?: number;
  /** Header information (set by the formats that have a header). */
  metadata?: Record<string, unknown>;

  /**
   * @param source - The file's contents.
   * @throws ValueError (for example `Empty file.`) when the header cannot be read.
   */
  constructor(readonly source: string | Uint8Array | S) {
    // A string is a text format's contents and bytes are a binary format's; anything else is already a stream.
    this.stream = (typeof source === "string" ? new TextStream(source)
      : source instanceof Uint8Array ? new ByteStream(source) : source) as S;
    this.readHeader(this.stream);
  }

  /** Read what precedes the first alignment (nothing by default). @param _stream - The source. */
  protected readHeader(_stream: S): void { /* no header */ }

  /** @returns The next alignment from the stream, or null at the end. @param stream - The source. */
  protected abstract readNextAlignment(stream: S): Alignment | null;

  /** @returns The next alignment. */
  next(): IteratorResult<Alignment> {
    if (this.stream === null) return { done: true, value: undefined };
    const alignment = this.readNextAlignment(this.stream);
    if (alignment === null) { this.len = this.index; return { done: true, value: undefined }; }
    this.index += 1;
    return { done: false, value: alignment };
  }

  /** Iterating rewinds first (as in Biopython), so each loop starts at the beginning. */
  [Symbol.iterator](): IterableIterator<Alignment> {
    this.rewind();
    return this;
  }

  /** The number of alignments in the file (reads through it once, then restores the position). */
  get length(): number {
    if (this.len === undefined) {
      const index = this.index;
      this.rewind();
      let n = 0;
      while (!this.next().done) n++;
      this.rewind();
      while (this.index < index) this.next();
      this.len = n;
    }
    return this.len;
  }

  /** Start again at the beginning of the file. */
  rewind(): void {
    this.stream!.seek(0);
    this.readHeader(this.stream!);
    this.index = 0;
  }

  /** Release the stream; further reads end immediately. */
  close(): void { this.stream = null; }

  /** All the alignments as an {@link Alignments} list carrying the header information (Python `parser[:]`). */
  all(): Alignments {
    const index = this.index;
    const alignments = new Alignments();
    this.stream!.seek(0);
    (this as unknown as { readHeader(this: unknown, s: S): void }).readHeader.call(alignments, this.stream!);
    this.rewind();
    alignments.push(...(this as Iterable<Alignment>));
    this.len = this.index;
    this.rewind();
    while (this.index < index) this.next();
    return alignments;
  }
}

/** Writes alignments in a format. Subclasses define `formatAlignment` and, where needed, header, footer and how many alignments a file may hold. */
export abstract class AlignmentWriter {
  /** The format name used in messages. */
  static fmt: string | null = null;
  /** `t` for text formats. */
  static mode: "t" | "b" = "t";

  /** @param target - Where `write` sends the text (may be null when only `formatAlignment` is used). */
  constructor(protected readonly target: WriteTarget | null = null) {}

  /** Write what precedes the alignments. @param _stream - The output. @param _alignments - The alignments to be written. */
  writeHeader(_stream: WriteTarget, _alignments: unknown): void { /* none */ }
  /** Write what follows the alignments. @param _stream - The output. */
  writeFooter(_stream: WriteTarget): void { /* none */ }

  /** @returns One alignment as text. @param _alignment - The alignment. */
  abstract formatAlignment(alignment: Alignment): string;

  /** For formats that hold a single alignment: write it, and fail on a second. @throws ValueError for more than one. */
  protected writeSingleAlignment(stream: WriteTarget, alignments: Iterable<Alignment>): number {
    let count = 0;
    for (const alignment of alignments) {
      if (count === 1) throw new ValueError(`Alignment files in the ${(this.constructor as typeof AlignmentWriter).fmt} format can contain a single alignment only.`);
      stream.write(this.formatAlignment(alignment));
      count++;
    }
    return count;
  }

  /** Write every alignment. @param stream - The output. @param alignments - The alignments. */
  protected writeMultipleAlignments(stream: WriteTarget, alignments: Iterable<Alignment>): number {
    let count = 0;
    for (const alignment of alignments) { stream.write(this.formatAlignment(alignment)); count++; }
    return count;
  }

  /** Write the alignments' bodies (all of them by default). @param stream - The output. @param alignments - The alignments. */
  writeAlignments(stream: WriteTarget, alignments: Iterable<Alignment>): number { return this.writeMultipleAlignments(stream, alignments); }

  /** Header, alignments and footer. @returns The number of alignments written. */
  writeFile(stream: WriteTarget, alignments: Iterable<Alignment>): number {
    this.writeHeader(stream, alignments);
    const count = this.writeAlignments(stream, alignments);
    this.writeFooter(stream);
    return count;
  }

  /** Write everything to the target. @param alignments - The alignments. @returns The number written. @throws TypeError without a target. */
  write(alignments: Iterable<Alignment>): number {
    if (this.target === null) throw new TypeError("'NoneType' object has no attribute 'write'");
    return this.writeFile(this.target, alignments);
  }
}
