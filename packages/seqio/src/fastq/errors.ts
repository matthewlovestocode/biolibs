/** `InvalidCharError`: a bad character in a quality string. */

import { ValueError } from "@biolibs/core";

/**
 * Raised when a quality string contains a character that is not valid for the chosen FASTQ flavour
 * (Biopython's `InvalidCharError`). The message shows the character and its surroundings.
 */
export class InvalidCharError extends ValueError {
  /**
   * @param fullString - The whole quality string.
   * @param index - Position of the offending character.
   * @param details - Why it is invalid.
   * @param r - How many characters of context to show on each side. Default 3.
   */
  constructor(readonly fullString: string, readonly index: number, readonly details: string, readonly r = 3) {
    super(InvalidCharError.describe(fullString, index, details, r));
    this.name = "InvalidCharError";
  }

  private static describe(full: string, index: number, details: string, r: number): string {
    const chars = [...full];
    const char = chars[index]!;
    const surrounding = chars.slice(Math.max(index - r, 0), index + r + 1).join("");
    const prefix = index - r < 0 ? "" : "...";
    const suffix = index + r + 1 >= chars.length ? "" : "...";
    const hex = [...new TextEncoder().encode(char)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `Invalid character (${char}) or (0x${hex}) in quality string ${details} with context: [${prefix}${surrounding}${suffix}]`;
  }
}

/** Index of the first item satisfying `predicate`, or -1 (Biopython's `_find_index_where`). */
export function findIndexWhere<T>(items: Iterable<T>, predicate: (item: T) => boolean): number {
  let i = 0;
  for (const x of items) {
    if (predicate(x)) return i;
    i++;
  }
  return -1;
}
