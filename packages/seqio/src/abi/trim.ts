/** Quality trimming for `abi-trim` (Richard Mott's modified Mott algorithm). */

import type { SeqRecord } from "@biolibs/seqrecord";

/**
 * Trim low-quality ends: the kept region runs from the first position whose running score turns positive to the
 * position with the highest running score. Records of 20 bases or fewer are returned unchanged.
 */
export function abiTrim(record: SeqRecord): SeqRecord {
  const cutoff = 0.05;
  const segment = 20;
  if (record.length <= segment) return record;
  const qualities = record.letterAnnotations.get("phred_quality") as unknown as number[];
  const scoreList = qualities.map((q) => cutoff - 10 ** (q / -10.0));
  const cumulative = [0];
  let start = false;
  let trimStart = 0;
  for (let i = 1; i < scoreList.length; i++) {
    const score = cumulative[cumulative.length - 1]! + scoreList[i]!;
    if (score < 0) {
      cumulative.push(0);
    } else {
      cumulative.push(score);
      if (!start) { trimStart = i; start = true; }
    }
  }
  const trimFinish = cumulative.indexOf(Math.max(...cumulative));
  return record.slice(trimStart, trimFinish);
}
