/**
 * Finding reference pieces in a sequence.
 *
 * A piece matches where the sequence agrees with it base for base over the piece's whole length, allowing a few
 * substitutions — no insertions or deletions. That is the right model for this job: the variants of a standard part
 * that turn up in real plasmids (the AmpR of pUC19 against the AmpR of pBR322, say) differ by scattered
 * substitutions, while a part with bases inserted into it is a different part and should be found as such by
 * alignment, not by this.
 *
 * Short pieces are held to a stricter standard than long ones, because a 20-base promoter with one base different is
 * a different promoter, while a 900-base gene with nine bases different is the same gene. {@link DEFAULT_DETECT}
 * spells out where the line falls.
 *
 * Both strands are searched, and a circular sequence is searched across its origin, so a part that straddles the
 * origin of a plasmid is still found.
 */

import { ValueError } from "@biolibs/core";
import { type ReferencePiece, requireLibrary } from "./reference.js";

/** Whether a sequence is a line with two ends or a closed circle. */
export type Topology = "linear" | "circular";

/** How tolerant the search is. */
export interface DetectOptions {
  /**
   * Mismatches tolerated as a fraction of a piece's length, for pieces without their own `tolerance`. Defaults to
   * 0.05, so a 900-base gene may differ at up to 45 bases.
   */
  tolerance?: number;
  /**
   * Pieces at or below this length must match exactly, whatever the tolerance. Defaults to 30: a difference in a
   * short element is a different element.
   */
  exactBelow?: number;
  /** Most hits to report, so a short piece against a large sequence cannot run away. Defaults to 1000. */
  maxHits?: number;
}

/** 5% mismatches, exact matching at 30 bases and under, at most 1000 hits. */
export const DEFAULT_DETECT: Required<DetectOptions> = { tolerance: 0.05, exactBelow: 30, maxHits: 1000 };

/** One place a reference piece was found. */
export interface DetectedFeature {
  /** The piece that matched. */
  piece: ReferencePiece;
  /** First base of the match, 0-based. */
  start: number;
  /** One past the last base. On a circular sequence this may exceed the length, meaning the match wraps. */
  end: number;
  /** `1` when the piece matches the top strand, `-1` when it matches the bottom. */
  strand: 1 | -1;
  /** How many bases differ from the piece. */
  mismatches: number;
  /** The fraction of bases that are the same, from 0 to 1. */
  identity: number;
  /** True when the match runs across the origin of a circular sequence. */
  wraps: boolean;
}

/** The reverse complement of unambiguous DNA. */
function reverseComplement(dna: string): string {
  const complement: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
  let result = "";
  for (let i = dna.length - 1; i >= 0; i--) result += complement[dna[i]!] ?? dna[i]!;
  return result;
}

/**
 * How many mismatches a piece is allowed at a given length.
 *
 * @param piece - The piece.
 * @param options - The search's settings.
 * @returns The mismatch budget, 0 for a piece at or below `exactBelow` bases.
 */
export function mismatchBudget(piece: ReferencePiece, options: Required<DetectOptions>): number {
  if (piece.sequence.length <= options.exactBelow) return 0;
  const tolerance = piece.tolerance ?? options.tolerance;
  return Math.floor(piece.sequence.length * tolerance);
}

/**
 * Find every place a library's pieces occur in a sequence.
 *
 * @param residues - The sequence, upper case. Characters outside A, C, G and T never match.
 * @param topology - `"linear"` or `"circular"`. A circular sequence is searched across its origin.
 * @param library - The pieces to look for; see {@link ReferencePiece} on why none ship with this package.
 * @param options - How tolerant to be; see {@link DEFAULT_DETECT}.
 * @returns The hits, ordered by `start`, then by the longer piece first, then by name.
 * @throws {@link ValueError} for an unusable library or a bad option.
 * @example
 * ```ts
 * const library = [{ name: "T7 promoter", type: "promoter", sequence: "TAATACGACTCACTATAG" }];
 * const hits = detectFeatures(plasmid, "circular", library);
 * hits[0]?.identity; // 1 for an exact match
 * ```
 */
export function detectFeatures(
  residues: string, topology: Topology, library: readonly ReferencePiece[], options: DetectOptions = {},
): DetectedFeature[] {
  const o = { ...DEFAULT_DETECT, ...options };
  requireLibrary(library);
  if (!Number.isFinite(o.tolerance) || o.tolerance < 0 || o.tolerance > 1) throw new ValueError(`tolerance must be between 0 and 1, got ${o.tolerance}`);
  if (!Number.isInteger(o.exactBelow) || o.exactBelow < 0) throw new ValueError(`exactBelow must be a non-negative integer, got ${o.exactBelow}`);
  if (!Number.isInteger(o.maxHits) || o.maxHits < 0) throw new ValueError(`maxHits must be a non-negative integer, got ${o.maxHits}`);

  const length = residues.length;
  const hits: DetectedFeature[] = [];

  for (const piece of library) {
    const size = piece.sequence.length;
    if (size > length) continue;
    const budget = mismatchBudget(piece, o);
    // A circular sequence is searched as itself with its first size-1 bases repeated, so a match across the origin
    // is found once, at a start inside the original sequence.
    const searchable = topology === "circular" ? residues + residues.slice(0, size - 1) : residues;
    const probes: [string, 1 | -1][] = [[piece.sequence, 1], [reverseComplement(piece.sequence), -1]];

    for (let start = 0; start + size <= searchable.length; start++) {
      for (const [probe, strand] of probes) {
        const mismatches = countMismatches(searchable, start, probe, budget);
        if (mismatches === null) continue;
        hits.push({
          piece, start, end: start + size, strand, mismatches,
          identity: (size - mismatches) / size,
          wraps: start + size > length,
        });
      }
    }
  }

  hits.sort((a, b) =>
    a.start - b.start
    || (b.end - b.start) - (a.end - a.start)
    || a.piece.name.localeCompare(b.piece.name)
    || a.strand - b.strand);
  return hits.slice(0, o.maxHits);
}

/**
 * Count mismatches between a sequence window and a probe, giving up once the budget is used.
 *
 * @param text - The sequence being searched.
 * @param start - Where the window starts.
 * @param probe - The piece as it would lie on the top strand.
 * @param budget - Most mismatches allowed.
 * @returns The count, or `null` when the budget is exceeded or the window holds an unpairable character.
 */
function countMismatches(text: string, start: number, probe: string, budget: number): number | null {
  let mismatches = 0;
  for (let i = 0; i < probe.length; i++) {
    const base = text[start + i]!;
    // Anything that is not an unambiguous base cannot be said to match, so a run of Ns is never a hit.
    if (!"ACGT".includes(base)) return null;
    if (base === probe[i]) continue;
    if (++mismatches > budget) return null;
  }
  return mismatches;
}

/**
 * Keep only the best hit where several overlap, so one part is not reported three times over.
 *
 * Hits are taken in order of how good they are — more bases covered first, then fewer mismatches — and a hit is
 * kept only if it does not overlap one already kept by more than `maxOverlap` of the *longer* of the two. Measuring
 * against the longer is what distinguishes the two cases that matter: a short promoter inside a long gene covers
 * little of the gene and is kept, while two variants of the same gene at the same place cover all of each other and
 * only the better survives.
 *
 * @param hits - Hits from {@link detectFeatures}.
 * @param maxOverlap - How much of the longer of two hits may be shared before the worse one is dropped, as a
 *   fraction. Defaults to 0.5.
 * @returns The hits kept, in the order {@link detectFeatures} gives them.
 * @throws {@link ValueError} for a `maxOverlap` outside 0 to 1.
 */
export function bestHits(hits: readonly DetectedFeature[], maxOverlap = 0.5): DetectedFeature[] {
  if (!Number.isFinite(maxOverlap) || maxOverlap < 0 || maxOverlap > 1) throw new ValueError(`maxOverlap must be between 0 and 1, got ${maxOverlap}`);

  const byQuality = [...hits].sort((a, b) =>
    (b.end - b.start) - (a.end - a.start)
    || a.mismatches - b.mismatches
    || a.start - b.start
    || a.piece.name.localeCompare(b.piece.name));

  const kept: DetectedFeature[] = [];
  for (const hit of byQuality) {
    const crowded = kept.some((other) => {
      const overlap = Math.min(hit.end, other.end) - Math.max(hit.start, other.start);
      if (overlap <= 0) return false;
      const longer = Math.max(hit.end - hit.start, other.end - other.start);
      return longer > 0 && overlap / longer > maxOverlap;
    });
    if (!crowded) kept.push(hit);
  }
  // Give them back in the order detectFeatures used, so a caller's display order is unchanged.
  const order = new Map(hits.map((hit, i) => [hit, i]));
  return kept.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
