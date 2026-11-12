/** FASTQ readers: `fastq`/`fastq-sanger`, `fastq-solexa` and `fastq-illumina`. */

import { ValueError, pyFirstWord, pyIsAscii, pyIsPrintable, pyRstrip } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { InvalidCharError, findIndexWhere } from "./errors.js";
import { INVALID_CHAR_CODE, SANGER_SCORE_OFFSET, SOLEXA_SCORE_OFFSET } from "./scores.js";

/** A 256-entry byte table mapping quality characters to scores (200 marks an invalid character). */
function table(f: (letter: number) => number): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, letter) => f(letter));
}

const PHRED_MAP = table((l) => (l >= SANGER_SCORE_OFFSET && l < 94 + SANGER_SCORE_OFFSET ? l - SANGER_SCORE_OFFSET : INVALID_CHAR_CODE));
const SOLEXA_MAP = table((l) => (l >= SOLEXA_SCORE_OFFSET - 5 && l < 63 + SOLEXA_SCORE_OFFSET ? (((l - SOLEXA_SCORE_OFFSET) % 256) + 256) % 256 : INVALID_CHAR_CODE));
const ILLUMINA_MAP = table((l) => (l >= SOLEXA_SCORE_OFFSET && l < 63 + SOLEXA_SCORE_OFFSET ? l - SOLEXA_SCORE_OFFSET : INVALID_CHAR_CODE));

/**
 * Shared FASTQ reader: reads four-ish lines per record (sequence and quality may wrap), decodes the quality
 * characters through `qMapping`, and stores them in `letterAnnotations[qKey]`.
 *
 * @throws {@link ValueError} / {@link InvalidCharError} for malformed records, as in Biopython.
 */
export abstract class FastqIteratorAbstractBaseClass extends SequenceIterator {
  get modes(): string { return "t"; }
  /** Byte table from quality character to score (200 = invalid). */
  protected abstract get qMapping(): Uint8Array;
  /** Letter-annotation key for the scores: `"phred_quality"` or `"solexa_quality"`. */
  protected abstract get qKey(): string;
  private line: string | null = null;

  /** @param source - File contents. */
  constructor(source: unknown) {
    super(source, null, "Fastq");
  }

  protected nextRecord(): SeqRecord | null {
    const stream = this.stream!;
    let line = this.line;
    if (line === null) line = stream.readline();
    if (!line) return null;
    if (line[0] !== "@") throw new ValueError("Records in Fastq files should start with '@' character");
    const titleLine = pyRstrip(line.slice(1));
    let seqString = "";
    let plus: string | null = null;
    for (const l of stream) {
      if (l[0] === "+") {
        plus = l;
        break;
      }
      seqString += pyRstrip(l);
    }
    if (plus === null) throw new ValueError(seqString ? "End of file without quality information." : "Unexpected end of file");
    const seqLen = [...seqString].length;
    const secondTitle = pyRstrip(plus.slice(1));
    if (secondTitle && secondTitle !== titleLine) throw new ValueError("Sequence and quality captions differ.");
    if (!pyIsPrintable(seqString) || seqString.includes(" ")) throw new ValueError("Whitespace is not allowed in the sequence.");
    let qualityString = "";
    let sawAny = false;
    let broke = false;
    for (const l of stream) {
      sawAny = true;
      if (l[0] === "@" && [...qualityString].length >= seqLen) {
        this.line = l;
        broke = true;
        break;
      }
      qualityString += pyRstrip(l);
    }
    if (!broke) {
      if (!sawAny) throw new ValueError("Unexpected end of file");
      this.line = null;
    }
    const descr = titleLine;
    const id = pyFirstWord(descr);
    if (!pyIsAscii(qualityString)) {
      const index = findIndexWhere(qualityString, (c) => !pyIsAscii(c));
      throw new InvalidCharError(qualityString, index, "is not an ASCII character");
    }
    if (qualityString.length !== seqLen) {
      throw new ValueError(`Lengths of sequence and quality values differs for ${titleLine} (${seqLen} and ${qualityString.length}).`);
    }
    const mapping = this.qMapping;
    const scores = Uint8Array.from(qualityString, (c) => mapping[c.charCodeAt(0)]!);
    const invalid = scores.indexOf(INVALID_CHAR_CODE);
    if (invalid !== -1) {
      throw new InvalidCharError(qualityString, invalid, "not in correct range (are you sure you're using the right QualityIO parser?)");
    }
    // Scores are stored as signed bytes, so Solexa's negative qualities (-5 .. -1) come out negative.
    const qualities = Array.from(scores, (b) => (b > 127 ? b - 256 : b));
    return SeqRecord.fromValidated(new Seq(new TextEncoder().encode(seqString)), id, id, descr, null, null, null, new Map([[this.qKey, qualities]]));
  }
}

/** Sanger FASTQ (`fastq`, `fastq-sanger`): PHRED scores 0 to 93, offset 33. */
export class FastqPhredIterator extends FastqIteratorAbstractBaseClass {
  protected get qMapping(): Uint8Array { return PHRED_MAP; }
  protected get qKey(): string { return "phred_quality"; }

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    super(source);
  }
}

/** Solexa FASTQ (`fastq-solexa`): Solexa scores -5 to 62, offset 64. */
export class FastqSolexaIterator extends FastqIteratorAbstractBaseClass {
  protected get qMapping(): Uint8Array { return SOLEXA_MAP; }
  protected get qKey(): string { return "solexa_quality"; }

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    super(source);
  }
}

/** Illumina 1.3+ FASTQ (`fastq-illumina`): PHRED scores 0 to 62, offset 64. */
export class FastqIlluminaIterator extends FastqIteratorAbstractBaseClass {
  protected get qMapping(): Uint8Array { return ILLUMINA_MAP; }
  protected get qKey(): string { return "phred_quality"; }

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    super(source);
  }
}
