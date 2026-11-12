/** `FastqGeneralIterator`: the fast, validation-light FASTQ reader that yields raw text. */

import { ValueError, pyRstrip } from "@biolibs/core";
import { StreamModeError } from "../errors.js";
import { LineStream } from "../handles.js";

/**
 * Parse FASTQ, yielding `[title, sequence, quality]` strings with no score decoding.
 *
 * Handles wrapped sequence and quality lines, and a `+` line that either repeats the title or is empty.
 * Whitespace inside the sequence, differing captions, and mismatched lengths are errors.
 *
 * @param source - The file contents (or a `LineStream`).
 * @throws {@link StreamModeError} for binary input.
 * @throws {@link ValueError} for malformed records, with Biopython's messages.
 *
 * @example
 * ```ts
 * [...fastqGeneralIterator("@r1\nACGT\n+\nIIII\n")]; // [["r1", "ACGT", "IIII"]]
 * ```
 */
export function* fastqGeneralIterator(source: unknown): Generator<[string, string, string]> {
  if (source instanceof Uint8Array) throw new StreamModeError("Fastq files must be opened in text mode");
  const handle = source instanceof LineStream ? source : new LineStream(source as string);
  let line: string | null = handle.readline();
  if (line === "") return;
  while (true) {
    if (line![0] !== "@") throw new ValueError("Records in Fastq files should start with '@' character");
    const titleLine = pyRstrip(line!.slice(1));
    let seqString = "";
    let plus: string | null = null;
    for (const l of handle) {
      if (l[0] === "+") {
        plus = l;
        break;
      }
      seqString += pyRstrip(l);
    }
    if (plus === null) {
      throw new ValueError(seqString ? "End of file without quality information." : "Unexpected end of file");
    }
    const secondTitle = pyRstrip(plus.slice(1));
    if (secondTitle && secondTitle !== titleLine) throw new ValueError("Sequence and quality captions differ.");
    if (seqString.includes(" ") || seqString.includes("\t")) throw new ValueError("Whitespace is not allowed in the sequence.");
    const seqLen = [...seqString].length;
    line = null;
    let qualityString = "";
    let sawAny = false;
    let broke = false;
    for (const l of handle) {
      sawAny = true;
      line = l;
      if (l[0] === "@" && [...qualityString].length >= seqLen) {
        broke = true;
        break;
      }
      qualityString += pyRstrip(l);
    }
    if (!broke) {
      if (!sawAny) throw new ValueError("Unexpected end of file");
      line = null;
    }
    if (seqLen !== [...qualityString].length) {
      throw new ValueError(`Lengths of sequence and quality values differs for ${titleLine} (${seqLen} and ${[...qualityString].length}).`);
    }
    yield [titleLine, seqString, qualityString];
    if (line === null) break;
  }
}
