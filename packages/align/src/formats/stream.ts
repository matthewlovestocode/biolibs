/** A text source read line by line, like a Python text file opened for reading. */

/** Reading position over a text; lines keep their `\n`. Iteration continues from the current position. */
export class TextStream implements Iterable<string> {
  private pos = 0;
  /** @param text - The whole contents. */
  constructor(private readonly text: string) {}

  /** @returns The next line including its `\n`, or `""` at the end. */
  readline(): string {
    if (this.pos >= this.text.length) return "";
    const nl = this.text.indexOf("\n", this.pos);
    const end = nl === -1 ? this.text.length : nl + 1;
    const line = this.text.slice(this.pos, end);
    this.pos = end;
    return line;
  }

  /** Iterate over the remaining lines; breaking out of a loop leaves the position after the last line read. */
  [Symbol.iterator](): Iterator<string> {
    return { next: (): IteratorResult<string> => { const l = this.readline(); return l === "" ? { done: true, value: undefined } : { done: false, value: l }; } };
  }

  /** @returns The current offset (0 until something has been read). */
  tell(): number { return this.pos; }

  /** @param offset - Where to move to (only 0 is used). */
  seek(offset: number): void { this.pos = offset; }
}
