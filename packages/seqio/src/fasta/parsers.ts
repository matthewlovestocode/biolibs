/** Low-level FASTA parsers that yield `[title, sequence]` pairs (Biopython's `SimpleFastaParser` and `FastaTwoLineParser`). */

import { ValueError, pyRstrip, pyStrip } from "@biolibs/core";

/**
 * Parse FASTA from any iterable of lines (each ending in `"\n"`), yielding `[title, sequence]`.
 * The title is the header line without `>` and trailing whitespace; the sequence joins the wrapped lines with spaces and `\r` removed.
 *
 * Text before the first `>` is skipped.
 *
 * @example
 * ```ts
 * [...simpleFastaParser(new LineStream(">a b\nAC\nGT\n"))]; // [["a b", "ACGT"]]
 * ```
 */
export function* simpleFastaParser(handle: Iterable<string>): Generator<[string, string]> {
  let title = "";
  let found = false;
  // Skip anything before the first ">" line.
  for (const line of handle) {
    if (line[0] === ">") {
      title = pyRstrip(line.slice(1));
      found = true;
      break;
    }
  }
  if (!found) return;
  let lines: string[] = [];
  for (const line of handle) {
    if (line[0] === ">") {
      yield [title, lines.join("").replaceAll(" ", "").replaceAll("\r", "")];
      lines = [];
      title = pyRstrip(line.slice(1));
      continue;
    }
    lines.push(pyRstrip(line));
  }
  yield [title, lines.join("").replaceAll(" ", "").replaceAll("\r", "")];
}

/**
 * Parse strict two-line FASTA (one header line, one sequence line per record), yielding `[title, sequence]`.
 *
 * @throws {@link ValueError} for wrapped sequences, two headers in a row, or a header with no sequence line at the end.
 */
export function* fastaTwoLineParser(handle: Iterable<string>): Generator<[string, string]> {
  let idx = -1;
  let title = "";
  let line = "";
  for (line of handle) {
    idx += 1;
    if (idx % 2 === 0) {
      if (line[0] !== ">") {
        throw new ValueError(`Expected FASTA record starting with '>' character. Perhaps this file is using FASTA line wrapping? Got: '${line}'`);
      }
      title = pyRstrip(line.slice(1));
    } else {
      if (line[0] === ">") {
        throw new ValueError(`Two '>' FASTA lines in a row. Missing sequence line if this is strict two-line-per-record FASTA format. Have '>${title}' and '${line}'`);
      }
      yield [title, pyStrip(line)];
    }
  }
  if (idx === -1) return;
  if (idx % 2 === 0) {
    throw new ValueError(`Missing sequence line at end of file if this is strict two-line-per-record FASTA format. Have title line '${line}'`);
  }
}
