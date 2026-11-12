/**
 * @packageDocumentation
 * Pairwise sequence alignment (global and local) with a linear gap penalty,
 * plus identity and edit-distance helpers. Works on any strings.
 */

/** Scoring parameters shared by {@link globalAlign} and {@link localAlign}. */
export interface AlignOptions {
  /** Score for identical characters. Default 1. */
  match?: number;
  /** Score for differing characters. Default -1. */
  mismatch?: number;
  /** Linear gap penalty applied per gap position; use a negative number. Default -2. */
  gap?: number;
  /**
   * Custom substitution scorer, for example a BLOSUM lookup. When provided it
   * overrides `match` and `mismatch`.
   */
  score?: (a: string, b: string) => number;
}

/** Result of a pairwise alignment. */
export interface Alignment {
  /** Optimal alignment score. */
  score: number;
  /** First sequence with `-` for gaps; same length as {@link Alignment.b}. */
  a: string;
  /** Second sequence with `-` for gaps; same length as {@link Alignment.a}. */
  b: string;
  /** Half-open `[start, end)` range of the first input covered by the alignment. */
  aRange: [number, number];
  /** Half-open `[start, end)` range of the second input covered by the alignment. */
  bRange: [number, number];
}

/**
 * Build the substitution scoring function from options.
 *
 * @param o - Alignment options.
 * @returns The custom scorer if given, else a match/mismatch scorer.
 */
function scorer(o: AlignOptions) {
  const { match = 1, mismatch = -1 } = o;
  return o.score ?? ((x: string, y: string) => (x === y ? match : mismatch));
}

/**
 * Dynamic-programming core shared by global and local alignment.
 *
 * Fills an (n+1)×(m+1) score matrix `H` and a parallel traceback matrix `T`,
 * then walks back from the end cell to rebuild the aligned strings.
 * Traceback codes: 0 stop, 1 diagonal (align a[i-1] with b[j-1]),
 * 2 up (a[i-1] against a gap), 3 left (gap against b[j-1]).
 *
 * Time and memory are O(n·m).
 *
 * @param a - First sequence (rows).
 * @param b - Second sequence (columns).
 * @param o - Scoring options.
 * @param local - `true` for Smith–Waterman, `false` for Needleman–Wunsch.
 */
function run(a: string, b: string, o: AlignOptions, local: boolean): Alignment {
  const gap = o.gap ?? -2;
  const sub = scorer(o);
  const n = a.length, m = b.length, w = m + 1; // w = row width of the flat matrices
  const H = new Float64Array((n + 1) * w);
  const T = new Uint8Array((n + 1) * w);

  // Global alignment must pay for leading gaps, so seed the first row and
  // column with cumulative gap penalties. Local alignment leaves them at 0 so
  // an alignment can start anywhere for free.
  if (!local) {
    for (let i = 1; i <= n; i++) { H[i * w] = i * gap; T[i * w] = 2; }
    for (let j = 1; j <= m; j++) { H[j] = j * gap; T[j] = 3; }
  }

  // For local alignment, remember the best-scoring cell. For global alignment
  // the answer is always the bottom-right cell.
  let best = 0, bi = n, bj = m;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      // The three ways to reach cell (i, j):
      const d = H[(i - 1) * w + j - 1]! + sub(a[i - 1]!, b[j - 1]!); // diagonal: align the two characters
      const u = H[(i - 1) * w + j]! + gap; // up: a[i-1] aligned to a gap
      const l = H[i * w + j - 1]! + gap; // left: b[j-1] aligned to a gap
      let v = d, t = 1;
      if (u > v) { v = u; t = 2; }
      if (l > v) { v = l; t = 3; }
      // Smith–Waterman: never let a score go negative; 0 means "restart here".
      if (local && v <= 0) { v = 0; t = 0; }
      H[i * w + j] = v; T[i * w + j] = t;
      if (local && v > best) { best = v; bi = i; bj = j; }
    }
  }
  if (!local) { bi = n; bj = m; best = H[n * w + m]!; }

  // Traceback from the end cell. Characters are prepended because we build
  // the alignment right-to-left.
  let i = bi, j = bj, ra = "", rb = "";
  while (i > 0 || j > 0) {
    const t = T[i * w + j]!;
    if (local && t === 0) break; // reached the start of the local alignment
    if (t === 1) { ra = a[i - 1] + ra; rb = b[j - 1] + rb; i--; j--; }
    else if (t === 2) { ra = a[i - 1] + ra; rb = "-" + rb; i--; }
    else { ra = "-" + ra; rb = b[j - 1] + rb; j--; }
  }
  // After traceback, (i, j) is the start and (bi, bj) the end of the alignment.
  return { score: best, a: ra, b: rb, aRange: [i, bi], bRange: [j, bj] };
}

/**
 * Global (end-to-end) alignment using the Needleman–Wunsch algorithm with a
 * linear gap penalty. If several alignments tie, one optimal alignment is
 * returned.
 *
 * @param a - First sequence.
 * @param b - Second sequence.
 * @param o - Scoring options; see {@link AlignOptions}.
 * @returns The optimal {@link Alignment}; ranges span both full inputs.
 *
 * @example
 * ```ts
 * const r = globalAlign("ACGT", "AGT", { gap: -1 });
 * // r.a === "ACGT", r.b === "A-GT", r.score === 2
 * ```
 */
export const globalAlign = (a: string, b: string, o: AlignOptions = {}) => run(a, b, o, false);

/**
 * Local alignment using the Smith–Waterman algorithm with a linear gap
 * penalty: finds the best-scoring pair of substrings. If several local
 * alignments tie, one is returned.
 *
 * @param a - First sequence.
 * @param b - Second sequence.
 * @param o - Scoring options; see {@link AlignOptions}.
 * @returns The best local {@link Alignment}; ranges give the covered substrings.
 *
 * @example
 * ```ts
 * const r = localAlign("TTTACGTAAA", "GGGACGTCCC");
 * // r.a === "ACGT", r.score === 4, r.aRange deep-equals [3, 7]
 * ```
 */
export const localAlign = (a: string, b: string, o: AlignOptions = {}) => run(a, b, o, true);

/**
 * Fraction of alignment columns that are identical and not gaps.
 * Gap columns count in the denominator, so this is identities / alignment length.
 *
 * @param al - An alignment (only `a` and `b` are used).
 * @returns A value in `[0, 1]`; `0` for an empty alignment.
 */
export function identity(al: Pick<Alignment, "a" | "b">): number {
  if (!al.a.length) return 0;
  let same = 0;
  for (let i = 0; i < al.a.length; i++) if (al.a[i] === al.b[i] && al.a[i] !== "-") same++;
  return same / al.a.length;
}

/**
 * Levenshtein edit distance: the minimum number of single-character
 * insertions, deletions and substitutions to turn `a` into `b`.
 * Uses two rolling rows, so memory is O(b.length) rather than O(n·m).
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns The edit distance (0 for equal strings).
 *
 * @example
 * ```ts
 * editDistance("kitten", "sitting"); // 3
 * ```
 */
export function editDistance(a: string, b: string): number {
  // prev[j] = distance between a[0..i-1] and b[0..j]; start with i = 0 (all insertions).
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; // distance from a[0..i] to the empty prefix of b
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j]! + 1, // delete a[i-1]
        cur[j - 1]! + 1, // insert b[j-1]
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1), // substitute (free if equal)
      );
    prev = cur;
  }
  return prev[b.length]!;
}
