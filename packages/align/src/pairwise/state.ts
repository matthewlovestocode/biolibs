/** The scoring settings of a pairwise aligner: twelve gap scores, optional gap functions, and the algorithm choice. */

import type { GapScoreFunction } from "./gap-properties.js";

/** Alignment mode: `global`, `local`, or the FOGSAA global algorithm. */
export type Mode = "global" | "local" | "fogsaa";

/** The algorithm Biopython selects from the gap scores and mode. */
export type Algorithm = "NeedlemanWunschSmithWaterman" | "Gotoh" | "WatermanSmithBeyer" | "FOGSAA";

/** The twelve base gap scores: open or extend, at the internal, left or right end, for insertions or deletions. */
export interface GapScores {
  openInternalInsertionScore: number;
  extendInternalInsertionScore: number;
  openLeftInsertionScore: number;
  extendLeftInsertionScore: number;
  openRightInsertionScore: number;
  extendRightInsertionScore: number;
  openInternalDeletionScore: number;
  extendInternalDeletionScore: number;
  openLeftDeletionScore: number;
  extendLeftDeletionScore: number;
  openRightDeletionScore: number;
  extendRightDeletionScore: number;
}

/** Names of the twelve base gap scores. */
export const GAP_SCORE_NAMES: (keyof GapScores)[] = [
  "openInternalInsertionScore", "extendInternalInsertionScore", "openLeftInsertionScore", "extendLeftInsertionScore", "openRightInsertionScore", "extendRightInsertionScore",
  "openInternalDeletionScore", "extendInternalDeletionScore", "openLeftDeletionScore", "extendLeftDeletionScore", "openRightDeletionScore", "extendRightDeletionScore",
];

/** Gap functions replace the affine scores of one side when set. */
export interface GapFunctions {
  insertionScoreFunction: GapScoreFunction | null;
  deletionScoreFunction: GapScoreFunction | null;
}

/**
 * Choose the algorithm like `_get_algorithm`: FOGSAA for that mode, Waterman-Smith-Beyer with a gap function,
 * Needleman-Wunsch/Smith-Waterman when every open score equals its extend score (linear gaps), else Gotoh.
 */
export function chooseAlgorithm(s: GapScores & GapFunctions, mode: Mode): Algorithm {
  if (mode === "fogsaa") return "FOGSAA";
  if (s.insertionScoreFunction || s.deletionScoreFunction) return "WatermanSmithBeyer";
  if (s.openInternalInsertionScore === s.extendInternalInsertionScore
   && s.openInternalDeletionScore === s.extendInternalDeletionScore
   && s.openLeftInsertionScore === s.extendLeftInsertionScore
   && s.openRightInsertionScore === s.extendRightInsertionScore
   && s.openLeftDeletionScore === s.extendLeftDeletionScore
   && s.openRightDeletionScore === s.extendRightDeletionScore) return "NeedlemanWunschSmithWaterman";
  return "Gotoh";
}
