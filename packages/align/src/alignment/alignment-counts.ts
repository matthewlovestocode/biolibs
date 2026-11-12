/**
 * `AlignmentCounts`: the number of aligned letters, identities, mismatches, gaps (by position and kind), and the
 * score parts of an alignment, as returned by `Alignment.counts` (Biopython's `_alignmentcounts.AlignmentCounts`).
 */

import { pyFloatRepr } from "@biolibs/core";

/** The raw numbers an {@link AlignmentCounts} is made of. */
export interface RawCounts {
  /** Insertion gaps opened on the left, then extended there. */
  openLeftInsertions: number;
  extendLeftInsertions: number;
  openLeftDeletions: number;
  extendLeftDeletions: number;
  openInternalInsertions: number;
  extendInternalInsertions: number;
  openInternalDeletions: number;
  extendInternalDeletions: number;
  openRightInsertions: number;
  extendRightInsertions: number;
  openRightDeletions: number;
  extendRightDeletions: number;
  /** Aligned letters, identities, mismatches. */
  aligned: number;
  identities: number;
  mismatches: number;
  /** Letters with a positive substitution score, or -1 when no substitution matrix was used. */
  positives: number;
  /** Total gap score (NaN if unknown). */
  gapScore: number;
  /** Total substitution score (NaN if unknown). */
  substitutionScore: number;
}

/** Typed read-only accessors installed on {@link AlignmentCounts}. */
export interface AlignmentCountsAccessors {
  readonly aligned: number;
  readonly identities: number;
  readonly mismatches: number;
  /** `null` when no substitution matrix was used. */
  readonly positives: number | null;
  /** Alignment score, or `null` if unknown. */
  readonly score: number | null;
  /** Total gap score, or `null` if unknown. */
  readonly gapScore: number | null;
  /** Total substitution score, or `null` if unknown. */
  readonly substitutionScore: number | null;
  readonly gaps: number; readonly openGaps: number; readonly extendGaps: number;
  readonly leftGaps: number; readonly openLeftGaps: number; readonly extendLeftGaps: number;
  readonly internalGaps: number; readonly openInternalGaps: number; readonly extendInternalGaps: number;
  readonly rightGaps: number; readonly openRightGaps: number; readonly extendRightGaps: number;
  readonly insertions: number; readonly openInsertions: number; readonly extendInsertions: number;
  readonly deletions: number; readonly openDeletions: number; readonly extendDeletions: number;
  readonly leftInsertions: number; readonly openLeftInsertions: number; readonly extendLeftInsertions: number;
  readonly leftDeletions: number; readonly openLeftDeletions: number; readonly extendLeftDeletions: number;
  readonly internalInsertions: number; readonly openInternalInsertions: number; readonly extendInternalInsertions: number;
  readonly internalDeletions: number; readonly openInternalDeletions: number; readonly extendInternalDeletions: number;
  readonly rightInsertions: number; readonly openRightInsertions: number; readonly extendRightInsertions: number;
  readonly rightDeletions: number; readonly openRightDeletions: number; readonly extendRightDeletions: number;
}

/** `[open + extend]` style sums: which base counts each derived property adds up. */
const SUMS: Record<string, (keyof RawCounts)[]> = {};
for (const region of ["Left", "Internal", "Right"]) {
  for (const kind of ["Insertions", "Deletions"]) {
    const open = `open${region}${kind}` as keyof RawCounts;
    const extend = `extend${region}${kind}` as keyof RawCounts;
    SUMS[`${region.toLowerCase()}${kind}`] = [open, extend];
  }
  const l = region.toLowerCase();
  SUMS[`${l}Gaps`] = [`open${region}Insertions`, `extend${region}Insertions`, `open${region}Deletions`, `extend${region}Deletions`] as (keyof RawCounts)[];
  SUMS[`open${region}Gaps`] = [`open${region}Insertions`, `open${region}Deletions`] as (keyof RawCounts)[];
  SUMS[`extend${region}Gaps`] = [`extend${region}Insertions`, `extend${region}Deletions`] as (keyof RawCounts)[];
}
for (const kind of ["Insertions", "Deletions"]) {
  const k = kind.toLowerCase();
  const parts = ["Left", "Internal", "Right"];
  SUMS[k] = parts.flatMap((r) => [`open${r}${kind}`, `extend${r}${kind}`]) as (keyof RawCounts)[];
  SUMS[`open${kind}`] = parts.map((r) => `open${r}${kind}`) as (keyof RawCounts)[];
  SUMS[`extend${kind}`] = parts.map((r) => `extend${r}${kind}`) as (keyof RawCounts)[];
}
const regions = ["Left", "Internal", "Right"];
const all = (prefix: string): (keyof RawCounts)[] => regions.flatMap((r) => ["Insertions", "Deletions"].map((k) => `${prefix}${r}${k}`)) as (keyof RawCounts)[];
SUMS["gaps"] = regions.flatMap((r) => ["Insertions", "Deletions"].flatMap((k) => [`open${r}${k}`, `extend${r}${k}`])) as (keyof RawCounts)[];
SUMS["openGaps"] = all("open");
SUMS["extendGaps"] = all("extend");

/** Python `str.format`-style float repr with a trailing `.0` (`repr(float)`). */
const fl = (x: number): string => pyFloatRepr(x);

/** Counts of aligned letters, identities, mismatches and gaps of an alignment. */
export class AlignmentCounts {
  /** @param raw - The counted values. */
  constructor(private readonly raw: RawCounts) {}

  /** The total of the named base counts. */
  private sum(keys: (keyof RawCounts)[]): number {
    return keys.reduce((t, k) => t + this.raw[k], 0);
  }

  /**
   * The text Biopython prints: score parts, aligned letters, then the gap counts by position and kind.
   *
   * @example
   * ```ts
   * console.log(String(alignment.counts()));   // "AlignmentCounts object with ..."
   * ```
   */
  toString(): string {
    const r = this.raw;
    const g = (name: string): number => this.sum(SUMS[name]!);
    const score = r.gapScore + r.substitutionScore;
    let p = "AlignmentCounts object with\n";
    if (!Number.isNaN(score)) {
      p += `    score = ${fl(score)}:\n`;
      if (!Number.isNaN(r.substitutionScore)) p += `        substitution_score = ${fl(r.substitutionScore)},\n`;
      if (!Number.isNaN(r.gapScore)) p += `        gap_score = ${fl(r.gapScore)}.\n`;
    } else {
      if (!Number.isNaN(r.substitutionScore)) p += `    substitution_score = ${fl(r.substitutionScore)},\n`;
      if (!Number.isNaN(r.gapScore)) p += `    gap_score = ${fl(r.gapScore)}.\n`;
    }
    p += `    aligned = ${r.aligned}:\n`;
    p += `        identities = ${r.identities},\n`;
    if (r.positives !== -1) p += `        positives = ${r.positives},\n`;
    p += `        mismatches = ${r.mismatches}.\n`;
    p += `    gaps = ${g("gaps")}:\n`;
    p += `        left_gaps = ${g("leftGaps")}:\n`;
    p += `            left_insertions = ${g("leftInsertions")}:\n                open_left_insertions = ${r.openLeftInsertions},\n                extend_left_insertions = ${r.extendLeftInsertions};\n`;
    p += `            left_deletions = ${g("leftDeletions")}:\n                open_left_deletions = ${r.openLeftDeletions},\n                extend_left_deletions = ${r.extendLeftDeletions};\n`;
    p += `        internal_gaps = ${g("internalGaps")}:\n`;
    p += `            internal_insertions = ${g("internalInsertions")}:\n                open_internal_insertions = ${r.openInternalInsertions},\n                extend_internal_insertions = ${r.extendInternalInsertions};\n`;
    p += `            internal_deletions = ${g("internalDeletions")}:\n                open_internal_deletions = ${r.openInternalDeletions},\n                extend_internal_deletions = ${r.extendInternalDeletions};\n`;
    p += `        right_gaps = ${g("rightGaps")}:\n`;
    p += `            right_insertions = ${g("rightInsertions")}:\n                open_right_insertions = ${r.openRightInsertions},\n                extend_right_insertions = ${r.extendRightInsertions};\n`;
    p += `            right_deletions = ${g("rightDeletions")}:\n                open_right_deletions = ${r.openRightDeletions},\n                extend_right_deletions = ${r.extendRightDeletions}.\n`;
    return p;
  }
}

// Read-only accessors: the base counts, the sums of them, and the score parts (NaN becomes null).
const proto = AlignmentCounts.prototype as unknown as Record<string, unknown>;
const define = (name: string, get: (this: AlignmentCounts) => unknown): void => {
  Object.defineProperty(proto, name, { get, configurable: true });
};
for (const key of ["openLeftInsertions", "extendLeftInsertions", "openLeftDeletions", "extendLeftDeletions", "openInternalInsertions", "extendInternalInsertions",
  "openInternalDeletions", "extendInternalDeletions", "openRightInsertions", "extendRightInsertions", "openRightDeletions", "extendRightDeletions", "aligned", "identities", "mismatches"] as const) {
  define(key, function (this: AlignmentCounts) { return (this as unknown as { raw: RawCounts }).raw[key]; });
}
for (const [name, keys] of Object.entries(SUMS)) define(name, function (this: AlignmentCounts) { return (this as unknown as { sum(k: (keyof RawCounts)[]): number }).sum(keys); });
const rawOf = (c: AlignmentCounts): RawCounts => (c as unknown as { raw: RawCounts }).raw;
define("positives", function (this: AlignmentCounts) { const p = rawOf(this).positives; return p === -1 ? null : p; });
define("score", function (this: AlignmentCounts) { const s = rawOf(this).gapScore + rawOf(this).substitutionScore; return Number.isNaN(s) ? null : s; });
define("gapScore", function (this: AlignmentCounts) { const s = rawOf(this).gapScore; return Number.isNaN(s) ? null : s; });
define("substitutionScore", function (this: AlignmentCounts) { const s = rawOf(this).substitutionScore; return Number.isNaN(s) ? null : s; });

/** Typed accessors for {@link AlignmentCounts}. */
export interface AlignmentCounts extends AlignmentCountsAccessors {}
