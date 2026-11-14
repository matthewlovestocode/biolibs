/**
 * The maximum-likelihood method of `Bio.Align.analysis`: Goldman and Yang (1994), PMID 7968486.
 *
 * The codon substitution model's three parameters — the distance `t`, the transition/transversion ratio
 * `k` and the non-synonymous/synonymous rate ratio `w` — are fitted by maximizing the likelihood of the
 * observed codon pairs, and then the expected numbers of synonymous and non-synonymous substitutions are
 * read off the fitted rate matrix. The fit is done with L-BFGS-B over a numerical gradient, so the answer
 * depends on where that optimizer stops and not only on the model.
 */

import { expm } from "./expm.js";
import { minimizeLbfgsb } from "./lbfgsb/index.js";
import { getQ } from "./yn00-diffs.js";
import { codonList, type Table } from "./yn00-util.js";

/**
 * The expected codon frequencies, by one of the three models `cfreq` names.
 *
 * @param codons1 - The first sequence's codons. @param codons2 - The second's.
 * @param cmethod - `"F1x4"`, `"F3x4"` or `"F61"`. @param table - The codon table.
 * @returns The frequency of every codon the table knows that is not spelled with U.
 * @throws TypeError for `"F1x4"` and `"F61"`, which add a list to `dict.keys()` — an expression Python
 *   has not accepted since version 2, so neither model can be used at all.
 */
export function getPi(codons1: string[], codons2: string[], cmethod: string, table: Table): Map<string, number> {
  const pi = new Map<string, number>();
  if (cmethod === "F1x4" || cmethod === "F61") {
    throw new TypeError("unsupported operand type(s) for +: 'dict_keys' and 'list'");
  }
  if (cmethod === "F3x4") {
    const fcodon = [0, 1, 2].map(() => new Map<string, number>([["A", 0], ["G", 0], ["C", 0], ["T", 0]]));
    for (const codon of [...codons1, ...codons2]) {
      for (let i = 0; i < 3; i++) fcodon[i]!.set(codon[i]!, (fcodon[i]!.get(codon[i]!) ?? 0) + 1);
    }
    for (let i = 0; i < 3; i++) {
      let total = 0;
      for (const v of fcodon[i]!.values()) total += v;
      for (const base of [...fcodon[i]!.keys()]) fcodon[i]!.set(base, fcodon[i]!.get(base)! / total);
    }
    for (const codon of codonList(table)) {
      pi.set(codon, fcodon[0]!.get(codon[0]!)! * fcodon[1]!.get(codon[1]!)! * fcodon[2]!.get(codon[2]!)!);
    }
  }
  return pi;
}

/**
 * The log likelihood of the observed codon pairs under the model.
 *
 * @param t - The distance. @param k - The transition/transversion ratio. @param w - The rate ratio.
 * @param pi - The codon frequencies. @param counts - How often each ordered codon pair was seen.
 * @param codons - The codon order the matrices are indexed by. @param table - The codon table.
 * @returns The log likelihood, with pairs of probability zero contributing nothing.
 */
export function likelihood(t: number, k: number, w: number, pi: Map<string, number>,
  counts: Map<string, number>, codons: string[], table: Table): number {
  const matrix = getQ(pi, k, w, codons, table);
  const p = expm(matrix.map((row) => row.map((v) => v * t)));
  let total = 0;
  codons.forEach((codon1, i) => {
    codons.forEach((codon2, j) => {
      const count = counts.get(`${codon1}\u0000${codon2}`);
      if (count === undefined) return;
      if (p[i]![j]! * pi.get(codon1)! <= 0) total += count * 0;
      else total += count * Math.log(pi.get(codon1)! * p[i]![j]!);
    });
  });
  return total;
}

/**
 * dN and dS by maximum likelihood.
 *
 * @param codons1 - The first sequence's codons. @param codons2 - The second's.
 * @param cmethod - Which codon frequency model to use. @param table - The codon table.
 * @returns dN and dS.
 * @throws TypeError when `cmethod` is one of the two models Biopython cannot build.
 */
export function ml(codons1: string[], codons2: string[], cmethod: string, table: Table): [number, number] {
  const pi = getPi(codons1, codons2, cmethod, table);
  const counts = new Map<string, number>();
  const pairs = Math.min(codons1.length, codons2.length);
  for (let i = 0; i < pairs; i++) {
    const key = `${codons1[i]!}\u0000${codons2[i]!}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const codons = codonList(table);
  const acid = (codon: string): string | undefined => table.forwardTable.get(codon);

  /**
   * The expected numbers of synonymous and non-synonymous substitutions under one fitted matrix.
   *
   * @param k - The transition/transversion ratio. @param w - The rate ratio.
   * @returns The synonymous and non-synonymous sums, before they are scaled.
   */
  const expected = (k: number, w: number): [number, number] => {
    const matrix = getQ(pi, k, w, codons, table);
    let sd = 0, nd = 0;
    codons.forEach((codon1, i) => {
      codons.forEach((codon2, j) => {
        if (i === j) return;
        // Biopython catches the KeyError a stop codon raises here and lets that pair go.
        const a1 = acid(codon1), a2 = acid(codon2);
        if (a1 === undefined || a2 === undefined) return;
        if (a1 === a2) sd += pi.get(codon1)! * matrix[i]![j]!;
        else nd += pi.get(codon1)! * matrix[i]![j]!;
      });
    });
    return [sd, nd];
  };

  const free = minimizeLbfgsb((params) => -likelihood(params[0]!, params[1]!, params[2]!, pi, counts, codons, table),
    [1, 0.1, 2], [[1e-10, 20], [1e-10, 20], [1e-10, 10]], 1e-5);
  const [t, k, w] = [free.x[0]!, free.x[1]!, free.x[2]!];
  let [sd, nd] = expected(k, w);
  sd *= t;
  nd *= t;

  // The same fit again with w held at 1, which gives the numbers of synonymous and non-synonymous sites.
  const neutral = minimizeLbfgsb((params) => -likelihood(params[0]!, params[1]!, 1.0, pi, counts, codons, table),
    [1, 0.1], [[1e-10, 20], [1e-10, 20]], 1e-5);
  let [rhoS, rhoN] = expected(neutral.x[1]!, 1.0);
  rhoS *= 3;
  rhoN *= 3;
  return [nd / rhoN, sd / rhoS];
}
