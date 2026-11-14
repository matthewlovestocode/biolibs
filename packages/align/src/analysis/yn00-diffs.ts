/**
 * YN00's difference counting and the codon rate matrix: how a pair of codons' differences are split
 * between synonymous and non-synonymous transitions and transversions, weighting every pathway between
 * them by the substitution probabilities, and the matrix those probabilities come from.
 */

import { expm, type Matrix } from "./expm.js";
import { acid, PURINE, PYRIMIDINE, type Table } from "./yn00-util.js";

/** Four counts — synonymous transitions and transversions, then non-synonymous ones — and where each came from. */
export interface DiffCounts {
  /** The counts themselves. */
  tv: number[];
  /** Whether each count holds a NumPy scalar, which decides how a later division by zero behaves. */
  numpy: boolean[];
}

/**
 * Transition and transversion counts between two codons, weighting the pathways by their probabilities.
 *
 * @param codon1 - The first codon. @param codon2 - The second. @param p - The substitution probabilities.
 * @param codons - The codon order `p` is indexed by. @param table - The codon table.
 * @returns The four counts and their provenance.
 */
export function countDiffYN00(codon1: string, codon2: string, p: Matrix, codons: string[], table: Table): DiffCounts {
  const out: DiffCounts = { tv: [0, 0, 0, 0], numpy: [false, false, false, false] };
  if (codon1 === codon2) return out;
  const diffPos: number[] = [];
  for (let i = 0; i < 3; i++) if (codon1[i] !== codon2[i]) diffPos.push(i);

  /**
   * Which of the four counts a single-base change belongs in.
   *
   * @param a - The codon before. @param b - The codon after. @param diff - The position that changed.
   * @returns The index into the counts.
   */
  const slot = (a: string, b: string, diff: number): number => {
    const stop = table.stopCodons.includes(a) || table.stopCodons.includes(b);
    // A stop codon counts as non-synonymous whatever it changes to.
    const synonymous = !stop && acid(table, a) === acid(table, b);
    const transition = (PURINE.includes(a[diff]!) && PURINE.includes(b[diff]!))
      || (PYRIMIDINE.includes(a[diff]!) && PYRIMIDINE.includes(b[diff]!));
    return (synonymous ? 0 : 2) + (transition ? 0 : 1);
  };
  /**
   * Add one pathway's weight to the count it belongs in.
   *
   * @param a - The codon before. @param b - The codon after. @param diff - The position that changed.
   * @param weight - Its weight. @param numpy - Whether the weight is a NumPy scalar.
   */
  const add = (a: string, b: string, diff: number, weight: number, numpy: boolean): void => {
    const i = slot(a, b, diff);
    out.tv[i] = out.tv[i]! + weight;
    if (numpy) out.numpy[i] = true;
  };
  /** @param codon - A codon. @returns Its row/column in `p`. */
  const index = (codon: string): number => codons.indexOf(codon);

  if (diffPos.length === 1) {
    add(codon1, codon2, diffPos[0]!, 1, false);
  } else if (diffPos.length === 2) {
    const temps = diffPos.map((i) => codon1.slice(0, i) + codon2[i] + codon1.slice(i + 1));
    let probs = temps.map((codon) => {
      const idx = [index(codon1), index(codon), index(codon2)];
      return p[idx[0]!]![idx[1]!]! * p[idx[1]!]![idx[2]!]!;
    });
    // NumPy's division, so a total of zero gives infinities rather than raising.
    const total = probs.reduce((a, b) => a + b, 0);
    probs = probs.map((v) => (2 * v) / total);
    diffPos.forEach((i, n) => {
      const codon = codon1.slice(0, i) + codon2[i] + codon1.slice(i + 1);
      // Counted twice, as Biopython counts it: the same half-weight is added in two identical statements.
      add(codon1, codon, i, probs[n]! / 2, true);
      add(codon1, codon, i, probs[n]! / 2, true);
    });
  } else if (diffPos.length === 3) {
    const paths = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const temps: [string, string][] = [];
    let probs: number[] = [];
    for (const [i1, i2, i3] of paths) {
      const tmp1 = codon1.slice(0, i1!) + codon2[i1!] + codon1.slice(i1! + 1);
      const tmp2 = tmp1.slice(0, i2!) + codon2[i2!] + tmp1.slice(i2! + 1);
      temps.push([tmp1, tmp2]);
      const idx = [index(codon1), index(tmp1), index(tmp2), index(codon2)];
      probs.push(p[idx[0]!]![idx[1]!]! * p[idx[1]!]![idx[2]!]! * p[idx[2]!]![idx[3]!]!);
      void i3;
    }
    const total = probs.reduce((a, b) => a + b, 0);
    probs = probs.map((v) => (3 * v) / total);
    temps.forEach(([tmp1, tmp2], n) => {
      const path = paths[n]!;
      // The middle position is used for the last two steps as well, which is what Biopython does.
      add(codon1, tmp1, path[0]!, probs[n]! / 3, true);
      add(tmp1, tmp2, path[1]!, probs[n]! / 3, true);
      add(tmp2, codon2, path[1]!, probs[n]! / 3, true);
    });
  }
  return out;
}

/**
 * The rate matrix for one codon pair.
 *
 * @param codon1 - From. @param codon2 - To. @param pi - Codon frequencies.
 * @param k - Transition/transversion ratio. @param w - Non-synonymous/synonymous rate ratio.
 * @param table - The codon table.
 * @returns The rate, which is zero for anything but a single-base change between two sense codons.
 */
export function q(codon1: string, codon2: string, pi: Map<string, number>, k: number, w: number, table: Table): number {
  if (codon1 === codon2) return 0;
  if (table.stopCodons.includes(codon1) || table.stopCodons.includes(codon2)) return 0;
  if (!pi.has(codon1) || !pi.has(codon2)) return 0;
  const diff: [number, string, string][] = [];
  for (let i = 0; i < 3; i++) if (codon1[i] !== codon2[i]) diff.push([i, codon1[i]!, codon2[i]!]);
  if (diff.length >= 2) return 0;
  const [, from, to] = diff[0]!;
  const transition = (PURINE.includes(from) && PURINE.includes(to)) || (PYRIMIDINE.includes(from) && PYRIMIDINE.includes(to));
  const same = acid(table, codon1) === acid(table, codon2);
  const rate = pi.get(codon2)!;
  if (same) return transition ? k * rate : rate;
  return transition ? w * k * rate : w * rate;
}

/**
 * The whole rate matrix, normalised so that one unit of time is one substitution per codon.
 *
 * @param pi - Codon frequencies. @param k - Transition/transversion ratio. @param w - Rate ratio.
 * @param codons - The codon order. @param table - The codon table.
 * @returns The matrix.
 */
export function getQ(pi: Map<string, number>, k: number, w: number, codons: string[], table: Table): Matrix {
  const n = codons.length;
  const out: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i1 = 0; i1 < n; i1++) {
    for (let i2 = 0; i2 < n; i2++) {
      if (i1 !== i2) out[i1]![i2] = q(codons[i1]!, codons[i2]!, pi, k, w, table);
    }
  }
  let substitutions = 0;
  codons.forEach((codon, i) => {
    out[i]![i] = -out[i]!.reduce((a, b) => a + b, 0);
    const freq = pi.get(codon);
    if (freq !== undefined) substitutions += freq * -out[i]![i]!;
  });
  return out.map((row) => row.map((v) => v / substitutions));
}
