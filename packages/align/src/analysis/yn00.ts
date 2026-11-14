/**
 * The YN00 method of `Bio.Align.analysis`: Yang and Nielsen (2000), PMID 10666704.
 *
 * It counts synonymous and non-synonymous sites with a transition/transversion ratio of its own working out,
 * then repeats a fixed-point iteration — build the codon rate matrix, exponentiate it, recount the differences
 * the resulting substitution probabilities imply — until dN and dS settle.
 *
 * Biopython's own oddities are kept, because the numbers depend on them: it zips two dictionaries to normalise
 * the fold counts, which stops at the shorter of the two; `_get_kappa_t` adds `Y` and `R` keys to the frequency
 * dictionary it is handed; and for a pair of codons differing in two places it adds each pathway's weight twice.
 */

import { KeyError, RuntimeError } from "@biolibs/core";
import { expm } from "./expm.js";
import { countDiffYN00, getQ } from "./yn00-diffs.js";
import { countSiteYN00, getKappaT, getTV } from "./yn00-sites.js";

import { BASES, codonList, div, type Freqs, log, npDiv, type Table } from "./yn00-util.js";
/**
 * dN and dS by the YN00 method.
 *
 * @param codons1 - The first sequence's codons. @param codons2 - The second's. @param table - The codon table.
 * @returns dN and dS, or undefined when twenty rounds of the iteration do not settle.
 * @throws Whatever the arithmetic throws for a pair too divergent for the formulae: a zero division or a log of
 *   a non-positive number, both of which Biopython also lets through.
 */
export function yn00(codons1: string[], codons2: string[], table: Table): [number, number] | undefined {
  const fcodon: Freqs[] = [0, 1, 2].map(() => new Map([["A", 0], ["G", 0], ["C", 0], ["T", 0]]));
  const foldDict = getCodonFoldLocal(table);
  const fold0 = new Map<string, number>(), fold4 = new Map<string, number>();
  for (const codon of [...codons1, ...codons2]) {
    for (let i = 0; i < 3; i++) fcodon[i]!.set(codon[i]!, (fcodon[i]!.get(codon[i]!) ?? 0) + 1);
    const folds = foldDict.get(codon);
    // `codon_fold_dict[codon]` has no entry for a stop codon, so one in the alignment stops the method here.
    if (folds === undefined) throw new KeyError(codon);
    for (let i = 0; i < folds.length; i++) {
      const base = codon[i]!;
      if (folds[i] === "0") fold0.set(base, (fold0.get(base) ?? 0) + 1);
      else if (folds[i] === "4") fold4.set(base, (fold4.get(base) ?? 0) + 1);
    }
  }
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
  const f0Total = sum(fold0), f4Total = sum(fold4);
  // `zip(fold0_cnt, fold4_cnt)` walks the two dictionaries' keys together and stops at the shorter one, so a
  // base that only one of them has is left unnormalised. Worse, both halves of the body are indexed by the
  // *first* dictionary's key, and `fold4_cnt` is a `defaultdict`, so reading a key it lacks inserts it — and
  // the next turn of the loop then finds its iterator invalidated. The sequences this happens for are the
  // common case rather than the exception, so the error has to be reproduced exactly where Python raises it:
  // after `zip` has pulled the next key out of `fold0_cnt` (which ends the loop quietly when that one runs
  // out first) and before it reaches `fold4_cnt`.
  const keys0 = [...fold0.keys()], keys4 = [...fold4.keys()];
  let grew = false;
  for (let i = 0; i < keys0.length; i++) {
    if (grew) throw new RuntimeError("dictionary changed size during iteration");
    if (i >= keys4.length) break;
    const key = keys0[i]!;
    fold0.set(key, div(fold0.get(key)!, f0Total));
    if (!fold4.has(key)) { fold4.set(key, 0); grew = true; }
    fold4.set(key, div(fold4.get(key)!, f4Total));
  }
  const tv = getTV(codons1, codons2);
  const k04 = [getKappaT(fold0, tv), getKappaT(fold4, tv)];
  let kappa = div(f0Total * k04[0]! + f4Total * k04[1]!, f0Total + f4Total);

  for (let i = 0; i < 3; i++) {
    const total = sum(fcodon[i]!);
    for (const base of [...fcodon[i]!.keys()]) fcodon[i]!.set(base, div(fcodon[i]!.get(base)!, total));
  }
  const pi = new Map<string, number>();
  for (const codon of codonList(table)) pi.set(codon, 0);
  for (const codon of [...codons1, ...codons2]) pi.set(codon, (pi.get(codon) ?? 0) + 1);
  const [sSites1, nSites1, bfreq1] = countSiteYN00(codons1, codons2, pi, kappa, table);
  const [sSites2, nSites2, bfreq2] = countSiteYN00(codons2, codons1, pi, kappa, table);
  const nSites = (nSites1 + nSites2) / 2;
  const sSites = (sSites1 + sSites2) / 2;
  const bfreqSN: [Freqs, Freqs] = [new Map(), new Map()];
  for (let i = 0; i < 2; i++) {
    for (const base of BASES) bfreqSN[i]!.set(base, ((bfreq1[i]!.get(base) ?? 0) + (bfreq2[i]!.get(base) ?? 0)) / 2);
  }

  // NG86 gives the iteration its starting point.
  let sn = [0, 0];
  const pairs = Math.min(codons1.length, codons2.length);
  for (let i = 0; i < pairs; i++) {
    const d = countDiffNG86Local(codons1[i]!, codons2[i]!, table);
    sn = [sn[0]! + d[0], sn[1]! + d[1]];
  }
  const ps = div(sn[0]!, sSites);
  const pn = div(sn[1]!, nSites);
  const p = div(sn[0]! + sn[1]!, sSites + nSites);
  let w = div(log(1 - (4.0 / 3) * pn), log(1 - (4.0 / 3) * ps));
  let t = (-3 / 4) * log(1 - (4 / 3) * p);

  const tolerance = 1e-5;
  let previous = [0, 0];
  const codons = codonList(table);
  for (let round = 0; round < 20; round++) {
    const matrix = getQ(pi, kappa, w, codons, table);
    const pMatrix = expm(matrix.map((row) => row.map((v) => v * t)));
    let tv4 = [0, 0, 0, 0];
    const np4 = [false, false, false, false];
    const npath = new Map<string, number>();
    for (let i = 0; i < pairs; i++) {
      const key = `${codons1[i]!}\u0000${codons2[i]!}`;
      npath.set(key, (npath.get(key) ?? 0) + 1);
    }
    for (const [key, count] of npath) {
      const [c1, c2] = key.split("\u0000") as [string, string];
      const one = countDiffYN00(c1, c2, pMatrix, codons, table);
      tv4 = tv4.map((v, i) => v + one.tv[i]! * count);
      one.numpy.forEach((isNp, i) => { if (isNp) np4[i] = true; });
    }
    const pair: [[number, number], [number, number]] = [
      [npDiv(tv4[0]!, sSites, np4[0]!), npDiv(tv4[1]!, sSites, np4[1]!)],
      [npDiv(tv4[2]!, nSites, np4[2]!), npDiv(tv4[3]!, nSites, np4[3]!)],
    ];
    const dSdN = [getKappaT(bfreqSN[0]!, pair[0], true, [np4[0]!, np4[1]!]),
      getKappaT(bfreqSN[1]!, pair[1], true, [np4[2]!, np4[3]!])];
    t = dSdN[0]! * 3 * sSites / (sSites + nSites) + dSdN[1]! * 3 * nSites / (sSites + nSites);
    w = div(dSdN[1]!, dSdN[0]!);
    if (dSdN.every((v, i) => Math.abs(v - previous[i]!) < tolerance)) return [dSdN[1]!, dSdN[0]!];
    previous = dSdN;
  }
  // Twenty rounds without settling: Biopython's loop simply ends, so the function answers with nothing.
  return undefined;
}

/** The fold classes of every codon, as `analysis.ts` computes them; imported here to keep that file's exports. */
let foldLocal: ((table: Table) => Map<string, string>) | null = null;
/** The NG86 difference count, likewise. */
let diffLocal: ((codon1: string, codon2: string, table: Table) => [number, number]) | null = null;

/**
 * Give this module the two helpers that live in `analysis.ts`, which cannot import this one back.
 *
 * @param fold - The fold-class table builder. @param diff - The NG86 difference counter.
 */
export function installYn00Helpers(fold: (table: Table) => Map<string, string>,
  diff: (codon1: string, codon2: string, table: Table) => [number, number]): void {
  foldLocal = fold;
  diffLocal = diff;
}

/** @param table - A codon table. @returns Its fold classes. */
const getCodonFoldLocal = (table: Table): Map<string, string> => foldLocal!(table);
/** @param codon1 - A codon. @param codon2 - Another. @param table - The table. @returns NG86's counts. */
const countDiffNG86Local = (codon1: string, codon2: string, table: Table): [number, number] => diffLocal!(codon1, codon2, table);
