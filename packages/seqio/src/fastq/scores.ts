/**
 * Quality score conversions and the quality-string builders used by the FASTQ and QUAL writers.
 *
 * Three score types are in use: PHRED (`phred_quality`), Solexa (`solexa_quality`), and Illumina 1.3+ (PHRED stored with offset 64).
 * Tables are built at import time exactly as in Biopython, so rounding matches.
 */

import { OverflowError, ValueError, pyChr, pyRound, warn } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import type { LetterValue } from "@biolibs/seqrecord";

/** ASCII offset of Sanger FASTQ qualities (`!`). */
export const SANGER_SCORE_OFFSET = 33;
/** ASCII offset of Solexa and Illumina 1.3+ qualities (`@`). */
export const SOLEXA_SCORE_OFFSET = 64;
/** Marker byte for characters that are not valid in a quality string. */
export const INVALID_CHAR_CODE = 200;

/** Python's float `10 ** x`, which raises instead of returning Infinity. */
function pow10(x: number): number {
  const r = 10 ** x;
  if (!Number.isFinite(r)) throw new OverflowError("(34, 'Result too large')");
  return r;
}

/** Python's `math.log(x, base)`: `ln(x) / ln(base)`, which can differ in the last bit from `Math.log10`. */
const logBase = (x: number, base: number) => Math.log(x) / Math.log(base);

/**
 * Convert a PHRED quality to a Solexa quality (they differ noticeably only below 10).
 *
 * @throws {@link ValueError} for negative PHRED scores.
 */
export function solexaQualityFromPhred(phredQuality: number | null): number | null {
  if (phredQuality === null || phredQuality === undefined) return null;
  if (phredQuality > 0) return Math.max(-5.0, 10 * logBase(pow10(phredQuality / 10.0) - 1, 10));
  if (phredQuality === 0) return -5.0;
  throw new ValueError(`PHRED qualities must be positive (or zero), not ${phredQuality}`);
}

/** Convert a Solexa quality to a PHRED quality. Warns below -5, where Solexa scores are not defined. */
export function phredQualityFromSolexa(solexaQuality: number | null): number | null {
  if (solexaQuality === null || solexaQuality === undefined) return null;
  if (solexaQuality < -5) warn(`Solexa quality less than -5 passed, ${solexaQuality}`, "BiopythonWarning");
  return 10 * logBase(pow10(solexaQuality / 10.0) + 1, 10);
}

/** The numeric quality list stored under a letter-annotation key, or undefined if absent. */
function qualitiesOf(record: SeqRecord, key: string): LetterValue | undefined {
  return record.letterAnnotations.get(key);
}

/** Looks up each quality in a table; returns null if any is missing (Python raises `KeyError` and falls back to arithmetic). */
function viaTable(qualities: LetterValue, table: Map<number, string>): string | null {
  const out: string[] = [];
  for (const q of qualities as unknown[]) {
    const c = table.get(q as number);
    if (c === undefined) return null;
    out.push(c);
  }
  return out.join("");
}

/** Raises Python's errors for a quality list that table lookup could not handle. */
function checkNoNone(qualities: LetterValue): void {
  // Python evaluates `None in qualities`, which raises for a string of qualities.
  if (typeof qualities === "string") throw new TypeError("'in <string>' requires string as left operand, not NoneType");
  if ((qualities as unknown[]).some((q) => q === null || q === undefined)) throw new TypeError("A quality value of None was found");
}

/** The largest quality (Python `max`). */
const maxOf = (qualities: LetterValue) => Math.max(...(qualities as number[]));

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
const tableOf = (keys: number[], f: (k: number) => string) => new Map(keys.map((k) => [k, f(k)] as [number, string]));
const NO_QUALITY = (id: string | null) => new ValueError(`No suitable quality scores found in letter_annotations of SeqRecord (id=${id}).`);

const phredToSanger = tableOf(range(0, 94), (qp) => pyChr(Math.min(126, qp + SANGER_SCORE_OFFSET)));
const solexaToSanger = tableOf(range(-5, 94), (qs) => pyChr(Math.min(126, pyRound(phredQualityFromSolexa(qs)!) + SANGER_SCORE_OFFSET)));
const phredToIllumina = tableOf(range(0, 63), (qp) => pyChr(qp + SOLEXA_SCORE_OFFSET));
const solexaToIllumina = tableOf(range(-5, 63), (qs) => pyChr(pyRound(phredQualityFromSolexa(qs)!) + SOLEXA_SCORE_OFFSET));
const solexaToSolexa = tableOf(range(-5, 63), (qs) => pyChr(Math.min(126, qs + SOLEXA_SCORE_OFFSET)));
const phredToSolexa = tableOf(range(0, 63), (qp) => pyChr(Math.min(126, pyRound(solexaQualityFromPhred(qp)!) + SOLEXA_SCORE_OFFSET)));

/** PHRED qualities of a record, converting from `solexa_quality` if that is what it has. @throws {@link ValueError} if neither exists. */
export function getPhredQuality(record: SeqRecord): LetterValue {
  const q = qualitiesOf(record, "phred_quality");
  if (q !== undefined) return q;
  const s = qualitiesOf(record, "solexa_quality");
  if (s === undefined) throw NO_QUALITY(record.id);
  return (s as number[]).map((x) => phredQualityFromSolexa(x)!);
}

/**
 * Build a quality string from one of two letter annotations: `primary` is tried first through its exact `table`,
 * then by rounding with `fallback`; `secondary` (the other score type) is used when `primary` is absent.
 */
function qualityString(
  record: SeqRecord,
  primary: { key: string; table: Map<number, string>; arithmetic: (q: number) => number },
  secondary: { key: string; table: Map<number, string>; arithmetic: (q: number) => number },
  limit: number,
  lossMessage: string,
  offset: number,
): string {
  for (const [spec, isFirst] of [[primary, true], [secondary, false]] as const) {
    const qualities = qualitiesOf(record, spec.key);
    if (qualities === undefined) {
      if (isFirst) continue;
      throw NO_QUALITY(record.id);
    }
    const exact = viaTable(qualities, spec.table);
    if (exact !== null) return exact;
    checkNoNone(qualities);
    if (maxOf(qualities) >= limit) warn(lossMessage, "BiopythonWarning");
    return (qualities as number[]).map((q) => pyChr(Math.min(126, pyRound(spec.arithmetic(q)) + offset))).join("");
  }
  throw NO_QUALITY(record.id);
}

const identity = (q: number) => q;
const solexaToPhred = (q: number) => phredQualityFromSolexa(q)!;
const phredToSolexaQ = (q: number) => solexaQualityFromPhred(q)!;

/** Sanger (PHRED+33) quality characters for a record. Warns if PHRED 93 is exceeded. */
export function getSangerQualityStr(record: SeqRecord): string {
  return qualityString(
    record,
    { key: "phred_quality", table: phredToSanger, arithmetic: identity },
    { key: "solexa_quality", table: solexaToSanger, arithmetic: solexaToPhred },
    93.5, "Data loss - max PHRED quality 93 in Sanger FASTQ", SANGER_SCORE_OFFSET,
  );
}

/** Illumina 1.3+ (PHRED+64) quality characters for a record. Warns if PHRED 62 is exceeded. */
export function getIlluminaQualityStr(record: SeqRecord): string {
  return qualityString(
    record,
    { key: "phred_quality", table: phredToIllumina, arithmetic: identity },
    { key: "solexa_quality", table: solexaToIllumina, arithmetic: solexaToPhred },
    62.5, "Data loss - max PHRED quality 62 in Illumina FASTQ", SOLEXA_SCORE_OFFSET,
  );
}

/** Solexa (Solexa+64) quality characters for a record. Warns if Solexa 62 is exceeded. */
export function getSolexaQualityStr(record: SeqRecord): string {
  return qualityString(
    record,
    { key: "solexa_quality", table: solexaToSolexa, arithmetic: identity },
    { key: "phred_quality", table: phredToSolexa, arithmetic: phredToSolexaQ },
    62.5, "Data loss - max Solexa quality 62 in Solexa FASTQ", SOLEXA_SCORE_OFFSET,
  );
}
