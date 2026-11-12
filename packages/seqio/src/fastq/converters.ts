/**
 * Direct format-to-format converters (Biopython's `_fastq_*_convert_*`).
 *
 * `convert()` uses these instead of building records, so they preserve the original text where possible and
 * translate quality characters through a 256-entry table. They write as they go, so a failure leaves partial output.
 */

import { pyChr, pyFirstWord, pyRound, warn } from "@biolibs/core";
import type { WriteHandle } from "../handles.js";
import { InvalidCharError, findIndexWhere } from "./errors.js";
import { fastqGeneralIterator } from "./general-iterator.js";
import { phredQualityFromSolexa, solexaQualityFromPhred } from "./scores.js";

const INVALID_RANGE = "not in correct range (are you sure you're using the right QualityIO parser?)";
const NUL = "\0";
const TRUNC = "\x01";

/** A converter takes the input contents and the output target and returns the record count. */
export type Converter = (source: unknown, target: WriteHandle) => number;

const zeros = (n: number): string[] => Array.from({ length: n }, () => NUL);
const chars = (from: number, to: number): string[] => Array.from({ length: to - from }, (_, i) => pyChr(from + i));
const q = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, i) => from + i);

/** Python `str.translate(table)` with a 256-character table: characters beyond the table are left unchanged. */
function translate(text: string, table: string[]): string {
  return [...text].map((c) => (c.codePointAt(0)! < 256 ? table[c.codePointAt(0)!]! : c)).join("");
}

/** Translate each quality string and write FASTQ, failing on characters mapped to NUL. */
function fastqGeneric(source: unknown, target: WriteHandle, mapping: string[], truncate?: { char: string; message: string }): number {
  let count = 0;
  for (const [title, seq, oldQual] of fastqGeneralIterator(source)) {
    count += 1;
    let qual = translate(oldQual, mapping);
    if (qual.includes(NUL)) throw new InvalidCharError(oldQual, [...qual].indexOf(NUL), INVALID_RANGE);
    if (truncate && qual.includes(truncate.char)) {
      qual = qual.replaceAll(truncate.char, pyChr(126));
      warn(truncate.message, "BiopythonWarning");
    }
    target.write(`@${title}\n${seq}\n+\n${qual}\n`);
  }
  return count;
}

const rounded = (x: number | null) => pyRound(x as number);

/** Sanger to Sanger FASTQ (validates and normalises). */
export const fastqSangerToSanger: Converter = (s, t) =>
  fastqGeneric(s, t, [...zeros(33), ...chars(33, 127), ...zeros(256 - 127)]);

/** Solexa to Solexa FASTQ. */
export const fastqSolexaToSolexa: Converter = (s, t) =>
  fastqGeneric(s, t, [...zeros(59), ...chars(59, 127), ...zeros(256 - 127)]);

/** Illumina to Illumina FASTQ. */
export const fastqIlluminaToIllumina: Converter = (s, t) =>
  fastqGeneric(s, t, [...zeros(64), ...chars(64, 127), ...zeros(256 - 127)]);

/** Illumina 1.3+ to Sanger FASTQ. */
export const fastqIlluminaToSanger: Converter = (s, t) =>
  fastqGeneric(s, t, [...zeros(64), ...q(0, 63).map((v) => pyChr(33 + v)), ...zeros(256 - 127)]);

/** Sanger to Illumina 1.3+ FASTQ; PHRED scores above 62 are capped (with a warning). */
export const fastqSangerToIllumina: Converter = (s, t) =>
  fastqGeneric(
    s, t,
    [...zeros(33), ...q(0, 63).map((v) => pyChr(64 + v)), ...Array.from({ length: 127 - 96 }, () => TRUNC), ...zeros(256 - 127)],
    { char: TRUNC, message: "Data loss - max PHRED quality 62 in Illumina 1.3+ FASTQ" },
  );

/** Solexa to Sanger FASTQ. */
export const fastqSolexaToSanger: Converter = (s, t) =>
  fastqGeneric(s, t, [...zeros(59), ...q(-5, 63).map((v) => pyChr(33 + rounded(phredQualityFromSolexa(v)))), ...zeros(256 - 127)]);

/** Sanger to Solexa FASTQ; PHRED scores above 62 are capped (with a warning). */
export const fastqSangerToSolexa: Converter = (s, t) =>
  fastqGeneric(
    s, t,
    [...zeros(33), ...q(0, 63).map((v) => pyChr(64 + rounded(solexaQualityFromPhred(v)))), ...Array.from({ length: 127 - 96 }, () => TRUNC), ...zeros(256 - 127)],
    { char: TRUNC, message: "Data loss - max Solexa quality 62 in Solexa FASTQ" },
  );

/** Solexa to Illumina 1.3+ FASTQ. */
export const fastqSolexaToIllumina: Converter = (s, t) =>
  fastqGeneric(s, t, [...zeros(59), ...q(-5, 63).map((v) => pyChr(64 + rounded(phredQualityFromSolexa(v)))), ...zeros(256 - 127)]);

/** Illumina 1.3+ to Solexa FASTQ. */
export const fastqIlluminaToSolexa: Converter = (s, t) =>
  fastqGeneric(s, t, [...zeros(64), ...q(0, 63).map((v) => pyChr(64 + rounded(solexaQualityFromPhred(v)))), ...zeros(256 - 127)]);

/** Any FASTQ to FASTA (sequence wrapped at 60). */
export const fastqToFasta: Converter = (source, target) => {
  let count = 0;
  for (const [title, seq] of fastqGeneralIterator(source)) {
    count += 1;
    target.write(`>${title}\n`);
    for (let i = 0; i < seq.length; i += 60) target.write(seq.slice(i, i + 60) + "\n");
  }
  return count;
};

/** Any FASTQ to the two-column tab format (id, sequence). */
export const fastqToTab: Converter = (source, target) => {
  let count = 0;
  for (const [title, seq] of fastqGeneralIterator(source)) {
    count += 1;
    target.write(`${pyFirstWord(title)}\t${seq}\n`);
  }
  return count;
};

/** Convert FASTQ to QUAL, using a character-to-score-text mapping and wrapping at 60 characters. */
function fastqToQual(source: unknown, target: WriteHandle, mapping: Map<string, string>): number {
  let count = 0;
  for (const [title, , qual] of fastqGeneralIterator(source)) {
    count += 1;
    target.write(`>${title}\n`);
    const letters = [...qual];
    if (!letters.every((c) => mapping.has(c))) {
      throw new InvalidCharError(qual, findIndexWhere(letters, (c) => !mapping.has(c)), INVALID_RANGE);
    }
    let data = letters.map((c) => mapping.get(c)!).join(" ");
    while (data.length > 60) {
      // Break at the last space that fits within 60 characters.
      if (data[60] === " ") {
        target.write(data.slice(0, 60) + "\n");
        data = data.slice(61);
      } else if (data[59] === " ") {
        target.write(data.slice(0, 59) + "\n");
        data = data.slice(60);
      } else {
        target.write(data.slice(0, 58) + "\n");
        data = data.slice(59);
      }
    }
    target.write(data + "\n");
  }
  return count;
}

/** Sanger FASTQ to QUAL. */
export const fastqSangerToQual: Converter = (s, t) => fastqToQual(s, t, new Map(q(0, 94).map((v) => [pyChr(v + 33), String(v)])));

/** Solexa FASTQ to QUAL (scores converted to PHRED). */
export const fastqSolexaToQual: Converter = (s, t) =>
  fastqToQual(s, t, new Map(q(-5, 63).map((v) => [pyChr(v + 64), String(rounded(phredQualityFromSolexa(v)))])));

/** Illumina 1.3+ FASTQ to QUAL. */
export const fastqIlluminaToQual: Converter = (s, t) => fastqToQual(s, t, new Map(q(0, 63).map((v) => [pyChr(v + 64), String(v)])));
