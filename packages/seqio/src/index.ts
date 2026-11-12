/**
 * @packageDocumentation
 * Parse and write sequence file formats (FASTA, FASTQ, a minimal GenBank).
 *
 * All functions work on strings rather than files or streams, so they run
 * unchanged in Node and the browser. Read the file yourself and pass the text.
 */

import { BioError, type SeqRecord } from "@biolibs/core";

/**
 * Split a FASTA/FASTQ header (without its leading `>` or `@`) into an id and
 * a description, following Biopython: the id is the first whitespace-delimited
 * token and the description is the whole header.
 *
 * @param header - Header text with the marker character removed.
 */
function splitHeader(header: string): { id: string; description: string } {
  // `\S*` also matches an empty id for headers that are blank or start with a space.
  const m = /^(\S*)\s*(.*)$/.exec(header)!;
  return { id: m[1]!, description: header };
}

/**
 * Parse FASTA text into records.
 *
 * Multi-line sequences are joined and whitespace inside sequence lines is
 * removed. Blank lines and `;`-prefixed comment lines are skipped. Both LF and
 * CRLF line endings are accepted.
 *
 * @param text - Contents of a FASTA file.
 * @returns One {@link SeqRecord} per `>` header, in file order.
 * @throws {@link BioError} if sequence data appears before the first header.
 *
 * @example
 * ```ts
 * parseFasta(">a first\nACGT\nAC\n");
 * // [{ id: "a", description: "a first", sequence: "ACGTAC" }]
 * ```
 */
export function parseFasta(text: string): SeqRecord[] {
  const records: SeqRecord[] = [];
  // The record currently being accumulated; null before the first header.
  let cur: { header: string; parts: string[] } | null = null;
  // Emit the in-progress record, if any, into `records`.
  const flush = () => {
    if (cur) records.push({ ...splitHeader(cur.header), sequence: cur.parts.join("") });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";")) continue; // blank or comment
    if (line.startsWith(">")) {
      flush(); // a new header ends the previous record
      cur = { header: line.slice(1).trim(), parts: [] };
    } else {
      if (!cur) throw new BioError("FASTA data before first '>' header");
      cur.parts.push(line.replace(/\s+/g, ""));
    }
  }
  flush(); // the final record has no following header to trigger a flush
  return records;
}

/**
 * Serialise records as FASTA text.
 *
 * @param records - Records to write. `description` is used as the header,
 *   falling back to `id` when empty.
 * @param lineWidth - Maximum residues per line. Default 60.
 * @returns FASTA text, ending in a newline.
 */
export function writeFasta(records: SeqRecord[], lineWidth = 60): string {
  return records
    .map((r) => {
      // Chop the sequence into fixed-width lines.
      const lines: string[] = [];
      for (let i = 0; i < r.sequence.length; i += lineWidth) lines.push(r.sequence.slice(i, i + lineWidth));
      return `>${r.description || r.id}\n${lines.join("\n")}\n`;
    })
    .join("");
}

/**
 * Decode a FASTQ quality string into Phred scores.
 *
 * @param q - Quality characters, one per base.
 * @param offset - ASCII offset: 33 for Sanger/Illumina 1.8+ (default),
 *   64 for older Illumina.
 * @returns Phred scores (`charCode - offset`).
 */
export const decodePhred = (q: string, offset = 33): number[] => [...q].map((c) => c.charCodeAt(0) - offset);

/**
 * Encode Phred scores as a FASTQ quality string.
 *
 * @param q - Phred scores.
 * @param offset - ASCII offset (default 33).
 * @returns Quality characters, one per score.
 */
export const encodePhred = (q: number[], offset = 33): string => String.fromCharCode(...q.map((v) => v + offset));

/**
 * Parse strict four-line FASTQ text. Qualities are decoded as Phred+33 into
 * `record.quality`. Multi-line FASTQ is not supported.
 *
 * @param text - Contents of a FASTQ file.
 * @returns One {@link SeqRecord} per read, with `quality` set.
 * @throws {@link BioError} if the line count is not a multiple of four, a
 *   header does not start with `@`, the separator does not start with `+`,
 *   or sequence and quality lengths differ.
 *
 * @example
 * ```ts
 * const [r] = parseFastq("@r1\nACGT\n+\nIIII\n");
 * r.quality; // [40, 40, 40, 40]
 * ```
 */
export function parseFastq(text: string): SeqRecord[] {
  const lines = text.split(/\r?\n/);
  // Drop trailing empty lines produced by the final newline.
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length % 4 !== 0) throw new BioError("FASTQ line count is not a multiple of 4");
  const out: SeqRecord[] = [];
  for (let i = 0; i < lines.length; i += 4) {
    // Each record: header, sequence, '+' separator (may repeat the header), quality.
    const [h, seq, plus, qual] = [lines[i]!, lines[i + 1]!, lines[i + 2]!, lines[i + 3]!];
    const n = i / 4 + 1; // 1-based record number for error messages
    if (!h.startsWith("@")) throw new BioError(`FASTQ record ${n}: header must start with '@'`);
    if (!plus.startsWith("+")) throw new BioError(`FASTQ record ${n}: missing '+' line`);
    if (seq.length !== qual.length) throw new BioError(`FASTQ record ${n}: sequence/quality length mismatch`);
    out.push({ ...splitHeader(h.slice(1)), sequence: seq, quality: decodePhred(qual) });
  }
  return out;
}

/**
 * Serialise records as four-line FASTQ text (Phred+33).
 *
 * @param records - Records to write; each must have `quality`.
 * @returns FASTQ text, ending in a newline.
 * @throws {@link BioError} if any record has no quality scores.
 */
export function writeFastq(records: SeqRecord[]): string {
  return records
    .map((r) => {
      if (!r.quality) throw new BioError(`Record ${r.id} has no quality scores`);
      return `@${r.description || r.id}\n${r.sequence}\n+\n${encodePhred(r.quality)}\n`;
    })
    .join("");
}

/**
 * Minimal GenBank flat-file parser. Reads LOCUS, DEFINITION, ACCESSION,
 * VERSION, ORGANISM and the ORIGIN sequence; the FEATURES table is kept as raw
 * text in `annotations.featuresRaw`. Multiple entries separated by `//` are
 * supported.
 *
 * Annotations set on each record: `locus`, `length` (as declared on the LOCUS
 * line), `version`, `organism`, `featuresRaw`.
 *
 * @param text - Contents of a GenBank file.
 * @returns One {@link SeqRecord} per entry. The sequence keeps its original case.
 * @throws {@link BioError} if an entry has no LOCUS line.
 */
export function parseGenBank(text: string): SeqRecord[] {
  const out: SeqRecord[] = [];
  // Entries are terminated by a line containing only `//`.
  for (const entry of text.split(/^\/\/\s*$/m)) {
    if (!entry.trim()) continue; // trailing chunk after the last `//`

    /**
     * Read a header field. The value starts after the keyword and continues
     * on following lines indented by 12 spaces (GenBank continuation style).
     */
    const field = (name: string) => {
      const m = new RegExp(`^${name}\\s+((?:.*)(?:\\n {12}.*)*)`, "m").exec(entry);
      return m ? m[1]!.replace(/\n\s+/g, " ").trim() : "";
    };

    const locus = /^LOCUS\s+(\S+)\s+(\d+)\s+(bp|aa)/m.exec(entry);
    if (!locus) throw new BioError("GenBank entry missing LOCUS line");

    // Everything after the ORIGIN line is sequence; keep letters only so that
    // position numbers and spaces are stripped.
    const origin = /^ORIGIN.*\n([\s\S]*)$/m.exec(entry);
    const sequence = origin ? origin[1]!.replace(/[^A-Za-z]/g, "") : "";

    // Raw feature table: from FEATURES up to ORIGIN (or CONTIG).
    const features = /^FEATURES.*\n([\s\S]*?)^(?:ORIGIN|CONTIG)/m.exec(entry);

    // ACCESSION may list secondary accessions; the first is primary.
    const accession = field("ACCESSION").split(/\s+/)[0] || locus[1]!;
    out.push({
      id: accession,
      description: field("DEFINITION"),
      sequence,
      annotations: {
        locus: locus[1],
        length: Number(locus[2]),
        version: field("VERSION"),
        organism: field("  ORGANISM"),
        featuresRaw: features?.[1] ?? "",
      },
    });
  }
  return out;
}
