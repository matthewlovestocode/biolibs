/** The table of alignment file formats: which exist in Biopython, which are ported, and `parse`, `read`, `write`, `format`. */

import { ValueError } from "@biolibs/core";
import type { Alignment } from "../alignment/alignment.js";
import type { AlignmentIterator, AlignmentWriter, WriteTarget } from "./interfaces.js";

/** The parser and writer classes of one format. */
export interface FormatModule {
  /** The parser class. */
  AlignmentIterator: (new (source: string) => AlignmentIterator) & { mode: "t" | "b"; fmt: string | null };
  /** The writer class, if the format can be written. */
  AlignmentWriter?: new (target: WriteTarget | null, ...args: unknown[]) => AlignmentWriter;
}

/** Biopython's formats with whether they are binary and whether they have a writer. */
const KNOWN: Record<string, { mode: "t" | "b"; writer: boolean }> = {
  a2m: { mode: "t", writer: true }, bed: { mode: "t", writer: true }, bigbed: { mode: "b", writer: true }, bigmaf: { mode: "b", writer: true }, bigpsl: { mode: "b", writer: true },
  chain: { mode: "t", writer: true }, clustal: { mode: "t", writer: true }, emboss: { mode: "t", writer: false }, exonerate: { mode: "t", writer: true }, fasta: { mode: "t", writer: true },
  hhr: { mode: "t", writer: false }, maf: { mode: "t", writer: true }, mauve: { mode: "t", writer: true }, msf: { mode: "t", writer: false }, nexus: { mode: "t", writer: true },
  phylip: { mode: "t", writer: true }, psl: { mode: "t", writer: true }, sam: { mode: "t", writer: true }, stockholm: { mode: "t", writer: true }, tabular: { mode: "t", writer: false },
};

/** The format names Biopython's `Bio.Align.formats` lists. */
export const FORMATS: readonly string[] = Object.keys(KNOWN);

const modules = new Map<string, FormatModule>();

/** Make a format available (called by each format module). @param fmt - Lower-case name. @param mod - Its classes. */
export function registerFormat(fmt: string, mod: FormatModule): void { modules.set(fmt, mod); }

/** Raised when a binary format is written to a text target (Biopython's `StreamModeError`, a `ValueError`). */
export class StreamModeError extends ValueError {
  override name = "StreamModeError";
}

/** Python's `NotImplementedError`. */
class NotImplementedError extends Error {
  override name = "NotImplementedError";
}

/**
 * The classes of a format.
 *
 * @param fmt - The format name (case-insensitive).
 * @throws ValueError for a format Biopython does not have; NotImplementedError for one that exists there but is not ported here yet.
 */
export function loadFormat(fmt: string): FormatModule {
  const f = fmt.toLowerCase();
  const m = modules.get(f);
  if (m) return m;
  if (!Object.hasOwn(KNOWN, f)) throw new ValueError(`Unknown file format ${fmt}`);
  throw new NotImplementedError(`The ${f} alignment format is not ported yet`);
}

/**
 * Parse an alignment file.
 *
 * @param source - The file's contents.
 * @param fmt - The format (case-insensitive).
 * @returns A lazy, rewindable iterator over the alignments.
 */
export function parse(source: string, fmt: string): AlignmentIterator {
  return new (loadFormat(fmt).AlignmentIterator)(source);
}

/**
 * Read a file that holds exactly one alignment.
 *
 * @throws ValueError if there is none or more than one.
 */
export function read(source: string, fmt: string): Alignment {
  const alignments = parse(source, fmt);
  try {
    const first = alignments.next();
    if (first.done) throw new ValueError("No alignments found in file");
    if (!alignments.next().done) throw new ValueError("More than one alignment found in file");
    return first.value;
  } finally { alignments.close(); }
}

/**
 * Write alignments.
 *
 * @param alignments - One alignment, or an iterable of them.
 * @param target - Where to write.
 * @param fmt - The format (case-insensitive).
 * @param args - Extra arguments for the format's writer.
 * @returns The number of alignments written.
 * @throws ValueError for unknown formats or formats without a writer.
 */
export function write(alignments: Alignment | Iterable<Alignment>, target: WriteTarget, fmt: string, ...args: unknown[]): number {
  const list: Iterable<Alignment> = (alignments as { sequences?: unknown }).sequences !== undefined ? [alignments as Alignment] : (alignments as Iterable<Alignment>);
  const f = fmt.toLowerCase();
  if (Object.hasOwn(KNOWN, f)) {
    if (!KNOWN[f]!.writer) throw new ValueError(`File writing has not yet been implemented for the ${fmt} format`);
    // Targets here are always text, so a binary format's writer rejects them as Biopython's does for a text-mode handle.
    if (KNOWN[f]!.mode === "b") throw new StreamModeError("File must be opened in binary mode.");
  }
  const mod = loadFormat(fmt);
  if (!mod.AlignmentWriter) throw new ValueError(`File writing has not yet been implemented for the ${fmt} format`);
  return new mod.AlignmentWriter(target, ...args).write(list);
}

/**
 * One alignment as text in a file format (`alignment.format(fmt)` for a non-empty format).
 *
 * @param alignment - The alignment.
 * @param fmt - The format.
 * @param args - Extra arguments for the writer.
 * @throws ValueError for binary formats and formats without a writer.
 */
export function formatAs(alignment: Alignment, fmt: string, ...args: unknown[]): string {
  const f = fmt.toLowerCase();
  if (Object.hasOwn(KNOWN, f)) {
    if (KNOWN[f]!.mode === "b") throw new ValueError(`${fmt} is a binary file format`);
    if (!KNOWN[f]!.writer) throw new ValueError(`Formatting alignments has not yet been implemented for the ${fmt} format`);
  }
  const mod = loadFormat(fmt);
  if (!mod.AlignmentWriter) throw new ValueError(`Formatting alignments has not yet been implemented for the ${fmt} format`);
  return new mod.AlignmentWriter(null, ...args).formatAlignment(alignment);
}


