/**
 * Open reading frames, the way `pydna.utils` finds them.
 *
 * Two of pydna's own helpers live here rather than in a port of `pydna.utils` as a whole, because they are
 * what `pydna.seq.Seq.orfs` and `orfs2` are: the rest of that module belongs with the record layer.
 */

/** One reading frame's open reading frame: which frame, where it starts, where it ends. */
export type Orf = readonly [frame: number, start: number, stop: number];

/**
 * The index of the leftmost entry of a sorted array strictly greater than a value.
 *
 * This is Python's `bisect.bisect`, which `three_frame_orfs` uses to pair each start codon with the next
 * stop codon after it.
 *
 * @param sorted - An ascending array. @param value - What to look for.
 * @returns Where `value` would be inserted to keep the order, after any equal entries.
 */
function bisectRight(sorted: readonly number[], value: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (value < sorted[mid]!) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Every open reading frame in all three forward frames, which may overlap one another.
 *
 * Each start codon is paired with the first stop codon that follows it *in its own frame*, and the pair is
 * kept when enough codons separate them. Two starts in the same frame therefore often share a stop, so the
 * frames come back with nested readings rather than one reading each.
 *
 * @param dna - The sequence; read in upper case, so the case of the input does not matter.
 * @param limit - The shortest reading to report, in bases. pydna turns it into a codon count the same
 *   surprising way: `ceil(limit / 3) - 1`, so a limit of 100 asks for 33 codons between start and stop and a
 *   limit of 3 asks for none at all.
 * @param startCodons - What counts as a start; `["ATG"]` by default.
 * @param stopCodons - What counts as a stop; the three standard ones by default.
 * @returns The readings, in frame order and then by position, each as `[frame, start, stop]` where `stop`
 *   is past the end of the stop codon.
 * @example
 * ```ts
 * threeFrameOrfs("ATGGCCTTTAAATTTGGGTGCTGA", 1);   // [[0, 0, 24]]
 * ```
 */
export function threeFrameOrfs(
  dna: string,
  limit = 100,
  startCodons: readonly string[] = ["ATG"],
  stopCodons: readonly string[] = ["TAG", "TAA", "TGA"],
): Orf[] {
  // pydna's own conversion from bases to codons, reproduced including the off-by-one it carries.
  const codonLimit = Math.ceil(limit / 3) - 1;
  const s = dna.toUpperCase();
  const orfs: Orf[] = [];
  for (const frame of [0, 1, 2]) {
    // The last "codon" of a frame can be one or two bases long, which simply matches nothing.
    const codons: string[] = [];
    for (let i = frame; i < s.length; i += 3) codons.push(s.slice(i, i + 3));
    const starts: number[] = [];
    const stops: number[] = [];
    codons.forEach((codon, i) => {
      if (startCodons.includes(codon)) starts.push(i);
      if (stopCodons.includes(codon)) stops.push(i);
    });
    for (const start of starts) {
      // The first stop strictly after this start; a start with no stop after it is not a reading.
      const at = bisectRight(stops, start);
      if (at >= stops.length) continue;
      const stop = stops[at]!;
      if (stop - start >= codonLimit) orfs.push([frame, start * 3 + frame, (stop + 1) * 3 + frame]);
    }
  }
  return orfs;
}
