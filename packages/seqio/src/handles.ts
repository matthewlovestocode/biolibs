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
