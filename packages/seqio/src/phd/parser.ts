/** The PHD file parser (Biopython's `Bio.Sequencing.Phd`): one `BEGIN_SEQUENCE ... END_SEQUENCE` block per read. */

import { ValueError, pyFloat, pyInt, pyRstrip, pySplit, pyStrip } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { type LineStream } from "../handles.js";
import { unpackN, unpackTwo } from "../insdc/text.js";

/** The comment keywords of a PHD file, in the order Biopython lists them (their lower-case forms key `comments`). */
export const CKEYWORDS: readonly string[] = [
  "CHROMAT_FILE", "ABI_THUMBPRINT", "PHRED_VERSION", "CALL_METHOD", "QUALITY_LEVELS", "TIME",
  "TRACE_ARRAY_MIN_INDEX", "TRACE_ARRAY_MAX_INDEX", "TRIM", "TRACE_PEAK_AREA_RATIO", "CHEM", "DYE",
];

/** Value of a comment: text, a number, the `[first, last, probability]` of `TRIM`, or null if absent. */
export type PhdComment = string | number | [number, number, number] | null;

/** One PHD read. */
export class PhdRecord {
  /** Text after `BEGIN_SEQUENCE`. */
  fileName = "";
  /** Comment fields keyed by lower-case keyword; every key in {@link CKEYWORDS} is present (null until read). */
  comments = new Map<string, PhdComment>(CKEYWORDS.map((k) => [k.toLowerCase(), null]));
  /** The `DNA` lines: base, quality and optionally peak location (as text). */
  sites: string[][] = [];
  /** The called bases. */
  seq: Seq = new Seq("");
}

/**
 * Read the next record from a PHD stream.
 *
 * @returns The record, or null when no `BEGIN_SEQUENCE` remains.
 * @throws {@link ValueError} for missing or malformed sections.
 */
export function readPhd(handle: LineStream): PhdRecord | null {
  let record: PhdRecord | null = null;
  for (const line of handle) {
    if (line.startsWith("BEGIN_SEQUENCE")) {
      record = new PhdRecord();
      record.fileName = pyRstrip(line.slice(15));
      break;
    }
  }
  if (record === null) return null;

  let found = false;
  for (const line of handle) if (line.startsWith("BEGIN_COMMENT")) { found = true; break; }
  if (!found) throw new ValueError("Failed to find BEGIN_COMMENT line");

  let ended = false;
  for (let line of handle) {
    line = pyStrip(line);
    if (!line) continue;
    if (line === "END_COMMENT") { ended = true; break; }
    const colon = line.indexOf(":");
    const [rawKeyword, rawValue] = unpackTwo(colon < 0 ? [line] : [line.slice(0, colon), line.slice(colon + 1)]);
    const keyword = rawKeyword.toLowerCase();
    const value = pyStrip(rawValue);
    if (["chromat_file", "phred_version", "call_method", "chem", "dye", "time", "basecaller_version", "trace_processor_version"].includes(keyword)) {
      record.comments.set(keyword, value);
    } else if (["abi_thumbprint", "quality_levels", "trace_array_min_index", "trace_array_max_index"].includes(keyword)) {
      record.comments.set(keyword, pyInt(value));
    } else if (keyword === "trace_peak_area_ratio") {
      record.comments.set(keyword, pyFloat(value));
    } else if (keyword === "trim") {
      const [first, last, prob] = unpackN(pySplit(value), 3) as [string, string, string];
      record.comments.set(keyword, [pyInt(first), pyInt(last), pyFloat(prob)]);
    }
  }
  if (!ended) throw new ValueError("Failed to find END_COMMENT line");

  found = false;
  for (const line of handle) if (line.startsWith("BEGIN_DNA")) { found = true; break; }
  if (!found) throw new ValueError("Failed to find BEGIN_DNA line");

  for (const line of handle) {
    if (line.startsWith("END_DNA")) break;
    const parts = pySplit(line);
    if (parts.length === 2 || parts.length === 3) record.sites.push(parts);
    else throw new ValueError("DNA line must contain a base and quality score, and optionally a peak location.");
  }

  found = false;
  for (const line of handle) if (line.startsWith("END_SEQUENCE")) { found = true; break; }
  if (!found) throw new ValueError("Failed to find END_SEQUENCE line");

  record.seq = new Seq(record.sites.map((n) => n[0]).join(""));
  return record;
}
