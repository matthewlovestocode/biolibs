/** `Bio.Align.analysis.calculate_dn_ds_matrix`: pairwise dN and dS as distance matrices. */

import { Alignment, analysis } from "@biolibs/align";
import { CodonTable } from "@biolibs/seq";
import type { SeqRecord } from "@biolibs/seqrecord";
import { DistanceMatrix } from "./matrix.js";
import { fl, type PyNum } from "./num.js";

/**
 * dN and dS for every pair of sequences of a codon alignment.
 *
 * @param alignment - An alignment of coding sequences.
 * @param method - `"NG86"` (default) or `"LWL85"`.
 * @param codonTable - The genetic code (default: the standard code).
 * @returns The dN and the dS matrix (a value of -1, used when two sequences differ too much, is an `int` as in Biopython).
 */
export function calculateDnDsMatrix(alignment: Alignment, method = "NG86", codonTable: InstanceType<typeof CodonTable.NCBICodonTable> | null = null): [DistanceMatrix, DistanceMatrix] {
  const sequences = alignment.sequences;
  const coordinates = alignment.coordinates!;
  const names = sequences.map((s) => (s as SeqRecord).id as string);
  const num = (x: number): PyNum => (x === -1 ? -1 : fl(x));
  const dn: PyNum[][] = [], ds: PyNum[][] = [];
  for (let i = 0; i < names.length; i++) {
    dn.push([]); ds.push([]);
    for (let j = 0; j < i; j++) {
      const pair = new Alignment([sequences[i], sequences[j]], [coordinates[i]!, coordinates[j]!]);
      const [n, s] = analysis.calculateDnDs(pair, method, codonTable);
      dn[i]!.push(num(n)); ds[i]!.push(num(s));
    }
    dn[i]!.push(fl(0)); ds[i]!.push(fl(0));
  }
  return [new DistanceMatrix(names, dn), new DistanceMatrix(names, ds)];
}
