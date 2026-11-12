/** FASTA readers: `fasta`, `fasta-2line`, `fasta-blast` and `fasta-pearson`. */

import { ValueError, pyFirstWord, pyRstrip, IndexError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { fastaTwoLineParser } from "./parsers.js";

/** First word of a title, or `""` for an empty title (Biopython catches the `IndexError`). */
function firstWord(title: string): string {
  try {
    return pyFirstWord(title);
  } catch (e) {
    if (e instanceof IndexError) return "";
    throw e;
  }
}

/** The ASCII sequence bytes of a record from wrapped lines: concatenated, with spaces, tabs and line breaks removed. */
function sequenceBytes(lines: string[]): Uint8Array {
  return new TextEncoder().encode(lines.join("")).filter((b) => b !== 32 && b !== 9 && b !== 13 && b !== 10);
}

/** Make a record the way the readers do: id and name are the first word of the title, the description is the whole title. */
function makeRecord(sequence: Uint8Array | string, title: string): SeqRecord {
  const word = firstWord(title);
  return new SeqRecord(new Seq(sequence), word, word, title);
}

const COMMENT_ERROR =
  "This FASTA file contains comments at the beginning of the file, which are not\nallowed by the 'fasta' parser.\n\nTo parse this file, you have three options:\n\n(1) Modify your FASTA file to remove such comments at the beginning of the\nfile.\n\n(2) Use SeqIO.parse with the 'fasta-pearson' format instead of 'fasta'. This\nformat is consistent with the FASTA format defined by William Pearson's FASTA\naligner software. This format allows for comments before the first sequence;\nlines starting with the ';' character anywhere in the file are also regarded\nas comment lines and are ignored.\n\n(3) Use the 'fasta-blast' format. This format regards any lines \"starting with\n'!', '#', or ';' as comment lines. The 'fasta-blast' format may be safer than\nthe 'fasta-pearson' format, as it explicitly indicates which lines are comments.\n";

/**
 * The standard `fasta` reader: the file must start with `>`; sequences may wrap over several lines.
 *
 * @throws {@link ValueError} if the first line is not a header (for example a comment).
 */
export class FastaIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private line: string | null;

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    super(source, null, "Fasta");
    const line = this.stream!.readline();
    if (!line) this.line = null;
    else if (!line.startsWith(">")) throw new ValueError(COMMENT_ERROR);
    else this.line = line;
  }

  protected nextRecord(): SeqRecord | null {
    let line = this.line;
    if (line === null) return null;
    const title = pyRstrip(line.slice(1));
    const lines: string[] = [];
    let reachedEnd = true;
    for (const next of this.stream!) {
      if (next[0] === ">") {
        line = next;
        reachedEnd = false;
        break;
      }
      lines.push(next);
    }
    this.line = reachedEnd ? null : line;
    return makeRecord(sequenceBytes(lines), title);
  }
}

/** Strict two-line FASTA (`fasta-2line`): one header line and one unwrapped sequence line per record. */
export class FastaTwoLineIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly data: Generator<[string, string]>;

  /** @param source - File contents. */
  constructor(source: unknown) {
    super(source, null, "FASTA");
    this.data = fastaTwoLineParser(this.stream!);
  }

  protected nextRecord(): SeqRecord | null {
    const r = this.data.next();
    if (r.done) return null;
    const [title, sequence] = r.value;
    return makeRecord(sequence, title);
  }
}

/**
 * FASTA as written by BLAST (`fasta-blast`): lines starting with `#`, `!` or `;` are comments.
 *
 * Reproduces a bug in Biopython 1.88: after the first record the reader does not advance its saved header line, so later
 * records reuse the first header (the sequence data keeps advancing). Output is identical to Biopython's, bug included.
 */
export class FastaBlastIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private line: string | null = null;

  /** @param source - File contents. @param alphabet - Not supported. @throws {@link ValueError} if a non-comment line does not start with `>`. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    super(source, null, "FASTA");
    for (const line of this.stream!) {
      if (!"#!;".includes(line[0]!)) {
        if (!line.startsWith(">")) {
          throw new ValueError(`Expected FASTA record starting with '>' character.\nIf this line is a comment, please use '#', '!', or ';' as the first character, or use the 'fasta-pearson' format for parsing.\nGot: '${line}'`);
        }
        this.line = line;
        return;
      }
    }
    this.line = null;
  }

  protected nextRecord(): SeqRecord | null {
    const line = this.line;
    if (line === null) return null;
    const title = pyRstrip(line.slice(1));
    const lines: string[] = [];
    let reachedEnd = true;
    for (const next of this.stream!) {
      if ("#!;".includes(next[0]!)) {
        // comment line: ignored
      } else if (next[0] === ">") {
        // Biopython assigns this to a misspelt local (`self_line`) instead of `self._line`, so it is lost.
        reachedEnd = false;
        break;
      } else {
        lines.push(pyRstrip(next));
      }
    }
    if (reachedEnd) this.line = null;
    return makeRecord(lines.join("").replaceAll(" ", "").replaceAll("\r", ""), title);
  }
}

/** FASTA as defined by William Pearson's FASTA software (`fasta-pearson`): text before the first `>` is ignored, and lines starting with `;` are comments. */
export class FastaPearsonIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private line: string | null = null;

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    super(source, null, "Fasta");
    for (const line of this.stream!) {
      if (line.startsWith(">")) {
        this.line = line;
        return;
      }
    }
    this.line = null;
  }

  protected nextRecord(): SeqRecord | null {
    const line = this.line;
    if (line === null) return null;
    const title = pyRstrip(line.slice(1));
    const lines: string[] = [];
    let reachedEnd = true;
    for (const next of this.stream!) {
      if (next[0] === ";") {
        // comment line: ignored
      } else if (next[0] === ">") {
        this.line = next;
        reachedEnd = false;
        break;
      } else {
        lines.push(pyRstrip(next));
      }
    }
    if (reachedEnd) this.line = null;
    return makeRecord(lines.join("").replaceAll(" ", "").replaceAll("\r", ""), title);
  }
}
