/** `Alignment.parse_printed_alignment`: recover sequences and coordinates from lines of a printed alignment. */

import type { Matrix } from "./coords.js";

/** The sequences (bytes, gaps removed) and the coordinates of a printed alignment. */
export interface ParsedAlignment {
  /** One ungapped sequence per line, as bytes. */
  sequences: Uint8Array[];
  /** Coordinates, one row per line. */
  coordinates: Matrix;
}

const DASH = 0x2d;
const NEWLINE = 0x0a;

/**
 * Parse printed alignment lines (bytes; `-` marks a gap). Reading of each line stops at the first newline or NUL
 * byte. As in Biopython, lines of different lengths are not rejected (the first line sets the width).
 *
 * @param lines - One `Uint8Array` per sequence.
 * @returns The ungapped sequences and the coordinates array.
 */
export function parsePrintedAlignment(lines: Uint8Array[]): ParsedAlignment {
  const sequences: Uint8Array[] = [];
  /** For each line, the columns at which a run of letters switches to a run of gaps or back (0 if it starts with a gap). */
  const breaks: number[][] = [];
  let width = 0;
  lines.forEach((line, n) => {
    let end = 0;
    while (end < line.length && line[end] !== 0 && line[end] !== NEWLINE) end++;
    const row: number[] = [];
    if (line[0] === DASH) row.push(0);
    const letters: number[] = [];
    let s = 0;
    while (s < end) {
      if (line[s] === DASH) {
        while (s < end && line[s] === DASH) s++;
      } else {
        const start = s;
        while (s < end && line[s] !== DASH) s++;
        for (let q = start; q < s; q++) letters.push(line[q]!);
      }
      row.push(s);
    }
    if (n === 0) width = end;
    breaks.push(row);
    sequences.push(Uint8Array.from(letters));
  });
  const n = lines.length;
  if (n === 0) return { sequences, coordinates: [] };
  // Biopython's shape computation reads past the empty rows of a zero-width alignment and settles on a single column.
  if (width === 0) return { sequences, coordinates: lines.map(() => [0]) };
  // Walk through the columns at which any line changes state, accumulating the letters seen so far.
  const coordinates: Matrix = Array.from({ length: n }, () => [0]);
  const gaps = breaks.map((row) => row[0] === 0);
  const cursor = breaks.map((row) => (row[0] === 0 ? 1 : 0));
  const starts = new Array<number>(n).fill(0);
  let start = 0;
  do {
    for (let i = 0; i < n; i++) if (start === starts[i]) starts[i] = breaks[i]![cursor[i]!] ?? Number.MAX_SAFE_INTEGER;
    let end = width;
    for (let i = 0; i < n; i++) if (starts[i]! < end) end = starts[i]!;
    const step = end - start;
    for (let i = 0; i < n; i++) {
      const row = coordinates[i]!;
      row.push(gaps[i] ? row[row.length - 1]! : row[row.length - 1]! + step);
      if (end === starts[i]) {
        cursor[i]!++;
        gaps[i] = !gaps[i];
      }
    }
    start = end;
  } while (start < width);
  return { sequences, coordinates };
}
