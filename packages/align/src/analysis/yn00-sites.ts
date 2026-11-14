/**
 * YN00's site counting: the proportions of transitional and transversional differences, the F84 formulae
 * that turn them into kappa or a distance, and Ina's synonymous and non-synonymous site counts as Yang
 * and Nielsen modified them.
 */

import { acid, BASES, div, type Freqs, log, npDiv, PURINE, PYRIMIDINE, type Table } from "./yn00-util.js";

/**
 * The proportions of transitional and transversional differences between two codon lists.
 *
 * @param codons1 - The first list. @param codons2 - The second.
 * @returns The two proportions.
 */
export function getTV(codons1: string[], codons2: string[]): [number, number] {
  const tv: [number, number] = [0, 0];
  let sites = 0;
  const n = Math.min(codons1.length, codons2.length);
  for (let c = 0; c < n; c++) {
    const codon1 = codons1[c]!, codon2 = codons2[c]!;
    const m = Math.min(codon1.length, codon2.length);
    for (let i = 0; i < m; i++) {
      const n1 = codon1[i]!, n2 = codon2[i]!;
      if (n1 === n2) { /* no difference */ }
      else if (PURINE.includes(n1) && PURINE.includes(n2)) tv[0] += 1;
      else if (PYRIMIDINE.includes(n1) && PYRIMIDINE.includes(n2)) tv[0] += 1;
      else tv[1] += 1;
      sites += 1;
    }
  }
  return [div(tv[0], sites), div(tv[1], sites)];
}

/**
 * Kappa under F84, or the distance implied by it, following the paper's own formulae.
 *
 * @param pi - Base frequencies, which this adds `Y` and `R` to, as Biopython does.
 * @param tv - The transition and transversion proportions.
 * @param wantT - Return the distance rather than kappa.
 * @param tvNumpy - Whether each of the two proportions is a NumPy scalar; see {@link npDiv}.
 * @returns Kappa under HKY85, or the distance.
 * @throws ZeroDivisionError or ValueError where Python's own arithmetic does.
 */
export function getKappaT(pi: Freqs, tv: readonly [number, number], wantT = false,
  tvNumpy: readonly [boolean, boolean] = [false, false]): number {
  const g = (key: string): number => pi.get(key) ?? 0;
  pi.set("Y", g("T") + g("C"));
  pi.set("R", g("A") + g("G"));
  // Written out in Python's own evaluation order, because which division is reached first decides which of
  // several zero denominators raises.
  const even = 2 * (g("T") * g("C") + g("A") * g("G"));
  const weighted = 2 * (div(g("T") * g("C") * g("R"), g("Y")) + div(g("A") * g("G") * g("Y"), g("R")));
  const numerator = even + weighted * (1 - npDiv(tv[1], 2 * g("Y") * g("R"), tvNumpy[1])) - tv[0];
  const scale = 2 * (div(g("T") * g("C"), g("Y")) + div(g("A") * g("G"), g("R")));
  const a = npDiv(numerator, scale, tvNumpy[0] || tvNumpy[1]);
  const b = 1 - npDiv(tv[1], 2 * g("Y") * g("R"), tvNumpy[1]);
  const aa = -0.5 * log(a);
  const bb = -0.5 * log(b);
  const kappaF84 = div(aa, bb) - 1;
  if (!wantT) {
    const transitional = div(g("T") * g("C"), g("Y")) + div(g("A") * g("G"), g("R"));
    return 1 + div(transitional * kappaF84, g("T") * g("C") + g("A") * g("G"));
  }
  return (4 * g("T") * g("C") * (1 + div(kappaF84, g("Y")))
    + 4 * g("A") * g("G") * (1 + div(kappaF84, g("R")))
    + 4 * g("Y") * g("R")) * bb;
}

/**
 * Synonymous and non-synonymous site counts by Ina's method as Yang and Nielsen modified it.
 *
 * @param codons1 - The codons to count. @param codons2 - The ones they are paired with.
 * @param pi - Codon counts, which weight each neighbouring codon. @param k - The transition/transversion ratio.
 * @param table - The codon table.
 * @returns The two site counts and the base frequencies in each category.
 */
export function countSiteYN00(codons1: string[], codons2: string[], pi: Map<string, number>, k: number, table: Table):
[number, number, [Freqs, Freqs]] {
  const length = codons1.length;
  const pairs = new Map<string, number>();
  const n = Math.min(length, codons2.length);
  for (let i = 0; i < n; i++) {
    const key = `${codons1[i]!}\u0000${codons2[i]!}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  let sSites = 0, nSites = 0;
  const freqSN: [Freqs, Freqs] = [new Map(BASES.map((b) => [b, 0])), new Map(BASES.map((b) => [b, 0]))];
  for (const [key, npath] of pairs) {
    const codon = key.split("\u0000")[0]!;
    let s = 0, nn = 0;
    for (let pos = 0; pos < 3; pos++) {
      for (const base of BASES) {
        if (codon[pos] === base) continue;
        const neighbor = codon.slice(0, pos) + base + codon.slice(pos + 1);
        if (table.stopCodons.includes(neighbor)) continue;
        let weight = pi.get(neighbor) ?? 0;
        const from = codon[pos]!;
        if ((PYRIMIDINE.includes(from) && PYRIMIDINE.includes(base)) || (PURINE.includes(from) && PURINE.includes(base))) weight *= k;
        if (acid(table, codon) === acid(table, neighbor)) {
          s += weight;
          freqSN[0].set(base, freqSN[0].get(base)! + weight * npath);
        } else {
          nn += weight;
          freqSN[1].set(base, freqSN[1].get(base)! + weight * npath);
        }
      }
    }
    sSites += s * npath;
    nSites += nn * npath;
  }
  const norm = div(3 * length, sSites + nSites);
  sSites *= norm;
  nSites *= norm;
  for (const freqs of freqSN) {
    let total = 0;
    for (const v of freqs.values()) total += v;
    for (const b of [...freqs.keys()]) freqs.set(b, div(freqs.get(b)!, total));
  }
  return [sSites, nSites, freqSN];
}
