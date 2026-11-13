/** Splitting file text into lines the way Python iterates a text file. */

/** Lines of a text, each keeping its `\n` (the last may lack it). @param text - File contents. */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}
