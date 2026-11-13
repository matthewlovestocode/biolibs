/** Splitting file text into lines the way Python iterates a text file. */

/** Lines of a text, each keeping its `\n` (the last may lack it). @param text - File contents. */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

/** A file read line by line, shared between helper functions like a Python file object. */
export class LineReader {
  private lines: string[];
  private pos = 0;
  /** @param text - The file contents. */
  constructor(text: string) { this.lines = splitLines(text); }
  /** @returns The next line (with its newline), or `undefined` at the end. */
  next(): string | undefined { return this.lines[this.pos++]; }
}
