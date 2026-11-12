/**
 * Python-like file handles over strings, so parsers can be written the way
 * Biopython writes them (`readline()`, iterating lines, `write()`) and run
 * unchanged in Node and the browser.
 */

import { StreamModeError } from "./errors.js";

/**
 * A readable text stream: iterate lines (each keeps its trailing `"\n"`) or call
 * {@link LineStream.readline}. Both share one position, like a Python text file.
 *
 * Only `"\n"` ends a line (Python's `io.StringIO` default); `"\r"` stays in the text.
 *
 * @example
 * ```ts
 * const s = new LineStream(">a\nACGT\n");
 * s.readline();   // ">a\n"
 * [...s];         // ["ACGT\n"]
 * ```
 */
export class LineStream implements Iterable<string> {
  private pos = 0;

  /** @param text - The full contents. */
  constructor(private readonly text: string) {}

  /** The next line including its newline, or `""` at the end (Python `readline()`). */
  readline(): string {
    if (this.pos >= this.text.length) return "";
    const nl = this.text.indexOf("\n", this.pos);
    const end = nl === -1 ? this.text.length : nl + 1;
    const line = this.text.slice(this.pos, end);
    this.pos = end;
    return line;
  }

  /** Read up to `size` characters, or everything left if omitted or negative (Python `read()`). */
  read(size = -1): string {
    const end = size < 0 ? this.text.length : Math.min(this.text.length, this.pos + size);
    const chunk = this.text.slice(this.pos, end);
    this.pos = end;
    return chunk;
  }

  /** Iterate the remaining lines; the stream keeps its position, so iteration can resume after `readline()`. */
  [Symbol.iterator](): Iterator<string> {
    return { next: () => {
      const line = this.readline();
      return line === "" ? { done: true, value: undefined } : { done: false, value: line };
    } };
  }
}

/** A writable text target (anything with a `write(text)` method, such as {@link StringHandle}). */
export interface WriteHandle {
  /** Append text. */
  write(text: string): unknown;
}

/** An in-memory text target, like Python's `io.StringIO`. */
export class StringHandle implements WriteHandle {
  private parts: string[] = [];

  /** Append text. */
  write(text: string): number {
    this.parts.push(text);
    return text.length;
  }

  /** Everything written so far. */
  getvalue(): string {
    return this.parts.join("");
  }
}

/** What a text parser accepts: the file's contents as a string, or an already open {@link LineStream}. */
export type TextSource = string | LineStream;

/**
 * Open a text source for a parser.
 *
 * A string is the contents (not a file name). Binary data is rejected, as Biopython rejects a binary file handle for a text format.
 *
 * @param source - The input.
 * @param fmt - Format name for error messages, e.g. `"Fasta"`.
 * @throws {@link StreamModeError} for binary input.
 */
export function openText(source: unknown, fmt: string): LineStream {
  if (source instanceof LineStream) return source;
  if (typeof source === "string") return new LineStream(source);
  if (source instanceof Uint8Array) throw new StreamModeError(`${fmt} files must be opened in text mode.`);
  throw new TypeError("Expected the text contents of a file, or a LineStream");
}

/**
 * A readable stream of bytes, for binary formats (Python's `io.BytesIO` opened for reading).
 *
 * @example
 * ```ts
 * const s = new BinaryStream(new Uint8Array([1, 2, 3]));
 * s.read(2);   // Uint8Array [1, 2]
 * s.read(2);   // Uint8Array [3]
 * s.read(2);   // Uint8Array []
 * ```
 */
export class BinaryStream {
  private pos = 0;

  /** @param data - The full contents. */
  constructor(private readonly data: Uint8Array) {}

  /** Read up to `size` bytes, or everything left if `size` is omitted or negative; empty at the end. */
  read(size = -1): Uint8Array {
    const end = size < 0 ? this.data.length : Math.min(this.data.length, this.pos + size);
    const chunk = this.data.subarray(this.pos, end);
    this.pos = end;
    return chunk;
  }

  /** Move to an absolute position (Python `seek(offset)`); positions past the end read as empty. */
  seek(offset: number): void {
    this.pos = Math.max(0, offset);
  }

  /** Move to the end of the data (Python `seek(0, io.SEEK_END)`). */
  seekEnd(): void {
    this.pos = this.data.length;
  }

  /** The current position (Python `tell()`). */
  tell(): number {
    return this.pos;
  }
}

/**
 * Open a binary source for a parser.
 *
 * Only bytes (`Uint8Array`, so also a Node `Buffer`) are accepted. A string or a `LineStream` is text, which Biopython rejects for binary formats.
 *
 * @param source - The input.
 * @param fmt - Format name for error messages, e.g. `"SeqXML"`.
 * @throws {@link StreamModeError} for text input.
 */
export function openBinary(source: unknown, fmt: string): BinaryStream {
  if (source instanceof BinaryStream) return source;
  if (source instanceof Uint8Array) return new BinaryStream(source);
  if (typeof source === "string" || source instanceof LineStream) throw new StreamModeError(`${fmt} files must be opened in binary mode.`);
  throw new TypeError("Expected the bytes of a file, or a BinaryStream");
}

/** A writable byte target (anything with `binary: true` and a `write(bytes)` method, such as {@link BytesHandle}). */
export interface BinaryWriteHandle {
  /** Marks the target as binary, so text writers reject it and binary writers accept it. */
  readonly binary: true;
  /** Append bytes. */
  write(data: Uint8Array): unknown;
}

/**
 * An in-memory byte target, like Python's `io.BytesIO`: bytes are written at the current position, which
 * `seek` and `tell` read and change, so a writer can go back and fill in a header.
 */
export class BytesHandle implements BinaryWriteHandle {
  readonly binary = true as const;
  private buffer = new Uint8Array(256);
  private size = 0;
  private pos = 0;

  /** Write bytes at the current position, overwriting what is there and growing the buffer as needed. */
  write(data: Uint8Array): number {
    const end = this.pos + data.length;
    if (end > this.buffer.length) {
      const bigger = new Uint8Array(Math.max(end, this.buffer.length * 2));
      bigger.set(this.buffer.subarray(0, this.size));
      this.buffer = bigger;
    }
    // Seeking past the end and writing leaves zeros in the gap, as a file would.
    if (this.pos > this.size) this.buffer.fill(0, this.size, this.pos);
    this.buffer.set(data, this.pos);
    this.pos = end;
    this.size = Math.max(this.size, end);
    return data.length;
  }

  /** Move to an absolute position. */
  seek(offset: number): number {
    this.pos = Math.max(0, offset);
    return this.pos;
  }

  /** The current position. */
  tell(): number {
    return this.pos;
  }

  /** Everything written so far. */
  getvalue(): Uint8Array {
    return this.buffer.slice(0, this.size);
  }
}

/** Whether a write target takes bytes rather than text. */
export function isBinaryHandle(target: unknown): target is BinaryWriteHandle {
  return typeof target === "object" && target !== null && (target as { binary?: unknown }).binary === true;
}
