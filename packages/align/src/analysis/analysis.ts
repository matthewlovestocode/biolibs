/** `Bio.Align.analysis`: dN/dS (NG86, LWL85, YN00 and ML) and the McDonald-Kreitman test. */

import { KeyError, ValueError, pyFloatRepr } from "@biolibs/core";
import { CodonTable } from "@biolibs/seq";
import type { Alignment } from "../alignment/alignment.js";
import { erfc } from "./erfc.js";
import { ml } from "./ml.js";
import { installYn00Helpers, yn00 } from "./yn00.js";

/** Python's `ZeroDivisionError`. */
class ZeroDivisionError extends Error { override name = "ZeroDivisionError"; }

/** Python's `a / b`. */
const div = (a: number, b: number): number => { if (b === 0) throw new ZeroDivisionError("division by zero"); return a / b; };

/** Python's `math.log(x)`. */
function log(x: number): number {
  if (x <= 0) throw new ValueError(`expected a positive input, got ${pyFloatRepr(x)}`);
  return Math.log(x);
}

/** Python's `math.sqrt(x)`. */
function sqrt(x: number): number {
  if (x < 0) throw new ValueError(`expected a nonnegative input, got ${pyFloatRepr(x)}`);
  return Math.sqrt(x);
}

type Table = InstanceType<typeof CodonTable.NCBICodonTable>;
const BASES = new Set(["A", "T", "C", "G"]);
const PURINE = ["A", "G"], PYRIMIDINE = ["T", "C"];
const standardTable = (): Table => CodonTable.genericById.get(1) as Table;
/** `forward_table[codon]`. */
const aminoAcid = (table: Table, codon: string): string => { const a = table.forwardTable.get(codon); if (a === undefined) throw new KeyError(codon); return a; };

/**
 * dN and dS of two aligned coding sequences.
 *
 * @param alignment - A pairwise alignment (target and query) whose aligned blocks are in frame.
 * @param method - `"NG86"` (default), `"LWL85"`, `"YN00"` or `"ML"`.
 * @param codonTable - The genetic code (default: the standard code).
 * @param k - Transition/transversion rate ratio (NG86).
 * @param cfreq - Codon frequency model; only valid with `"ML"`.
 * @returns `[dN, dS]`.
 * @throws ValueError for bad arguments or characters that are not A, T, C or G; KeyError for a stop codon.
 */
export function calculateDnDs(alignment: Alignment, method = "NG86", codonTable: Table | null = null, k = 1, cfreq: string | null = null): [number, number] {
  if (cfreq === null) cfreq = "F3x4";
  else if (method !== "ML") throw new ValueError("cfreq can only be specified when you are using ML method");
  else if (!["F1x4", "F3x4", "F61"].includes(cfreq)) throw new ValueError("cfreq must be 'F1x4', 'F3x4', or 'F61'");
  const table = codonTable ?? standardTable();
  if (alignment.sequences.length !== 2) throw new ValueError(alignment.sequences.length < 2 ? `not enough values to unpack (expected 2, got ${alignment.sequences.length})` : `too many values to unpack (expected 2, got ${alignment.sequences.length})`);
  const text = (s: unknown): string => String((s as { seq?: unknown } | null)?.seq !== undefined ? (s as { seq: unknown }).seq : s);
  const [sequence1, sequence2] = [text(alignment.sequences[0]), text(alignment.sequences[1])];
  const [aligned1, aligned2] = alignment.aligned as [number[][], number[][]];
  const codons1: string[] = [], codons2: string[] = [];
  const nBlocks = Math.min(aligned1.length, aligned2.length);
  for (let b = 0; b < nBlocks; b++) {
    const [start1, end1] = aligned1[b] as [number, number], [start2, end2] = aligned2[b] as [number, number];
    for (let i = start1; i < end1; i += 3) codons1.push(sequence1.slice(i, i + 3));
    for (let i = start2; i < end2; i += 3) codons2.push(sequence2.slice(i, i + 3));
  }
  for (const c of codons1) if (![...c].every((n) => BASES.has(n))) throw new ValueError(`Unrecognized character in ${c} in the target sequence (Codons consist of A, T, C or G)`);
  for (const c of codons2) if (![...c].every((n) => BASES.has(n))) throw new ValueError(`Unrecognized character in ${c} in the query sequence (Codons consist of A, T, C or G)`);
  if (method === "NG86") return ng86(codons1, codons2, k, table);
  if (method === "LWL85") return lwl85(codons1, codons2, table);
  if (method === "YN00") {
    installYn00Helpers(getCodonFold, countDiffNG86);
    const out = yn00(codons1, codons2, table);
    // Twenty rounds without the iteration settling leaves Biopython's function returning nothing at all, and
    // the caller's `dN, dS = _yn00(...)` then fails on unpacking that `None`.
    if (out === undefined) throw new TypeError("cannot unpack non-iterable NoneType object");
    return out;
  }
  if (method === "ML") return ml(codons1, codons2, cfreq, table);
  throw new ValueError(`Unknown method '${method}'`);
}

function ng86(codons1: string[], codons2: string[], k: number, table: Table): [number, number] {
  const [s1, n1] = countSiteNG86(codons1, table, k);
  const [s2, n2] = countSiteNG86(codons2, table, k);
  const sSites = (s1 + s2) / 2.0, nSites = (n1 + n2) / 2.0;
  let sn: [number, number] = [0, 0];
  const n = Math.min(codons1.length, codons2.length);
  for (let i = 0; i < n; i++) {
    const d = countDiffNG86(codons1[i]!, codons2[i]!, table);
    sn = [sn[0] + d[0], sn[1] + d[1]];
  }
  const ps = div(sn[0], sSites), pn = div(sn[1], nSites);
  const dS = ps < 3 / 4 ? Math.abs((-3.0 / 4) * log(1 - (4.0 / 3) * ps)) : -1;
  const dN = pn < 3 / 4 ? Math.abs((-3.0 / 4) * log(1 - (4.0 / 3) * pn)) : -1;
  return [dN, dS];
}

/** Synonymous and non-synonymous sites of a list of codons. */
function countSiteNG86(codons: string[], table: Table, k = 1): [number, number] {
  let sSite = 0, nSite = 0;
  for (const raw of codons) {
    const transition: string[] = [], transversion: string[] = [];
    const codon = raw.replaceAll("U", "T");
    [...codon].forEach((nucleotide, i) => {
      for (const base of ["A", "T", "C", "G"]) {
        if (nucleotide === base) continue;
        const chars = [...codon];
        chars[i] = base;
        const neighbor = chars.join("");
        if ((PURINE.includes(nucleotide) && PURINE.includes(base)) || (PYRIMIDINE.includes(nucleotide) && PYRIMIDINE.includes(base))) transition.push(neighbor);
        else transversion.push(neighbor);
      }
    });
    const aa = aminoAcid(table, codon);
    let thisN = 0, thisS = 0;
    for (const nb of transition) {
      if (table.stopCodons.includes(nb)) thisN += k;
      else if (aminoAcid(table, nb) === aa) thisS += k;
      else thisN += k;
    }
    for (const nb of transversion) {
      if (table.stopCodons.includes(nb)) thisN += 1;
      else if (aminoAcid(table, nb) === aa) thisS += 1;
      else thisN += 1;
    }
    const norm = (thisN + thisS) / 3;
    sSite += div(thisS, norm);
    nSite += div(thisN, norm);
  }
  return [sSite, nSite];
}

/** Synonymous and non-synonymous differences between two codons, over all pathways. */
function countDiffNG86(codon1: string, codon2: string, table: Table): [number, number] {
  let sn: [number, number] = [0, 0];
  if (codon1 === codon2) return sn;
  const diffPos: number[] = [];
  const m = Math.min(codon1.length, codon2.length);
  for (let i = 0; i < m; i++) if (codon1[i] !== codon2[i]) diffPos.push(i);
  const compare = (a: string, b: string, weight = 1): [number, number] => {
    // `len(set(map(forward_table.get, [a, b]))) == 1`: two stop codons count as the same.
    return table.forwardTable.get(a) === table.forwardTable.get(b) ? [weight, 0] : [0, weight];
  };
  const add = (c: [number, number]): void => { sn = [sn[0] + c[0], sn[1] + c[1]]; };
  if (diffPos.length === 1) add(compare(codon1, codon2));
  else if (diffPos.length === 2) {
    for (const i of diffPos) {
      const temp = codon1.slice(0, i) + codon2[i] + codon1.slice(i + 1);
      add(compare(codon1, temp, 0.5));
      add(compare(temp, codon2, 0.5));
    }
  } else if (diffPos.length === 3) {
    for (const [i1, i2] of [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]] as const) {
      const tmp1 = codon1.slice(0, i1) + codon2[i1] + codon1.slice(i1 + 1);
      const tmp2 = tmp1.slice(0, i2) + codon2[i2] + tmp1.slice(i2 + 1);
      add(compare(codon1, tmp1, 0.5 / 3));
      add(compare(tmp1, tmp2, 0.5 / 3));
      add(compare(tmp2, codon2, 0.5 / 3));
    }
  }
  return sn;
}

function lwl85(codons1: string[], codons2: string[], table: Table): [number, number] {
  const foldDict = getCodonFold(table);
  const fold = (codon: string): string => { const f = foldDict.get(codon); if (f === undefined) throw new KeyError(codon); return f; };
  let f0 = 0, f2 = 0, f4 = 0;
  for (const codon of [...codons1, ...codons2]) {
    for (const f of fold(codon)) { if (f === "0") f0++; else if (f === "2") f2++; else if (f === "4") f4++; }
  }
  const L = [f0 / 2.0, f2 / 2.0, f4 / 2.0];
  let PQ = [0, 0, 0, 0, 0, 0];
  const n = Math.min(codons1.length, codons2.length);
  for (let i = 0; i < n; i++) {
    if (codons1[i] === codons2[i]) continue;
    const d = diffCodon(codons1[i]!, codons2[i]!, foldDict);
    PQ = PQ.map((v, j) => v + d[j]!);
  }
  PQ = PQ.map((v, j) => div(v, [...L, ...L][j]!));
  const P = PQ.slice(0, 3), Q = PQ.slice(3);
  const A = P.map((i, idx) => (1.0 / 2) * log(div(1.0, 1 - 2 * i - Q[idx]!)) - (1.0 / 4) * log(div(1.0, 1 - 2 * Q[idx]!)));
  const B = Q.map((i) => (1.0 / 2) * log(div(1.0, 1 - 2 * i)));
  const dS = div(3 * (L[2]! * A[1]! + L[2]! * (A[2]! + B[2]!)), L[1]! + 3 * L[2]!);
  const dN = div(3 * (L[2]! * B[1]! + L[0]! * (A[0]! + B[0]!)), 2 * L[1]! + 3 * L[0]!);
  return [dN, dS];
}

/** The degeneracy ("0", "2" or "4"-fold) of each position of each sense codon. */
function getCodonFold(table: Table): Map<string, string> {
  const out = new Map<string, string>();
  const forward = table.forwardTable as unknown as Map<string, string>;
  for (const [codon, aa] of forward) {
    if (codon.includes("U")) continue;
    let fold = "";
    const chars = [...codon];
    chars.forEach((base, i) => {
      const synonyms: string[] = [];
      for (const other of ["A", "T", "C", "G"].filter((b) => b !== base)) {
        chars[i] = other;
        synonyms.push(forward.get(chars.join("")) ?? "stop");
      }
      const count = synonyms.filter((x) => x === aa).length;
      fold += count === 0 ? "0" : count === 3 ? "4" : "2";
      chars[i] = base;
    });
    out.set(codon, fold);
  }
  return out;
}

/** Counts of transitions (P) and transversions (Q) per degeneracy class: `[P0, P2, P4, Q0, Q2, Q4]`. */
function diffCodon(codon1: string, codon2: string, foldDict: Map<string, string>): number[] {
  const r = [0, 0, 0, 0, 0, 0];
  const fold = foldDict.get(codon1);
  if (fold === undefined) throw new KeyError(codon1);
  const m = Math.min(codon1.length, codon2.length);
  for (let n = 0; n < m; n++) {
    const a = codon1[n]!, b = codon2[n]!;
    if (a === b) continue;
    const transition = (PURINE.includes(a) && PURINE.includes(b)) || (PYRIMIDINE.includes(a) && PYRIMIDINE.includes(b));
    r[(transition ? 0 : 3) + Number(fold[n]) / 2]! += 1;
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------
// McDonald-Kreitman test

type Graph = Map<string, Map<string, number>>;

/**
 * The McDonald-Kreitman test for neutrality (counting changes rather than sites).
 *
 * @param alignment - Alignment of the nucleotide sequences of a gene.
 * @param species - The species id of each sequence.
 * @param codonTable - The genetic code (default: the standard code).
 * @returns The p-value.
 * @throws KeyError for a codon that is not a sense or stop codon; ValueError / ZeroDivisionError from the G test when a count is zero.
 */
export function mktest(alignment: Alignment, species: unknown[] | null = null, codonTable: Table | null = null): number {
  const table = codonTable ?? standardTable();
  const [G, nonsynG] = getCodon2CodonMatrix(table);
  if (species === null || species === undefined) throw new TypeError("'NoneType' object is not iterable");
  const unique = [...new Set(species)];
  const sequences = alignment.sequences.map((s) => String((s as { seq?: unknown } | null)?.seq !== undefined ? (s as { seq: unknown }).seq : s));
  let synFix = 0, nonsynFix = 0, synPoly = 0, nonsynPoly = 0;
  const coords = alignment.coordinates!;
  const ncol = coords[0]!.length;
  let starts: number[] = coords.map(() => Number.MAX_SAFE_INTEGER);
  for (let c = 0; c < ncol; c++) {
    const ends = coords.map((row) => row[c]!);
    const step = Math.min(...ends.map((e, i) => e - starts[i]!));
    for (let j = 0; j < step; j += 3) {
      const codons = new Map<unknown, string[]>(unique.map((key) => [key, []]));
      const n = Math.min(species.length, sequences.length, starts.length);
      for (let i = 0; i < n; i++) codons.get(species[i])!.push(sequences[i]!.slice(starts[i]! + j, starts[i]! + j + 3));
      let fixed = true;
      const allCodons = new Set<string>();
      for (const value of codons.values()) {
        const set = new Set(value);
        if (set.size > 1) fixed = false;
        for (const v of set) allCodons.add(v);
      }
      if (allCodons.size === 1) continue;
      const nonsyn = countReplacement(allCodons, nonsynG);
      const syn = countReplacement(allCodons, G) - nonsyn;
      if (fixed) { nonsynFix += nonsyn; synFix += syn; } else { nonsynPoly += nonsyn; synPoly += syn; }
    }
    starts = ends;
  }
  return gTest([synFix, nonsynFix, synPoly, nonsynPoly]);
}

/** Codon-to-codon substitution counts (all codons, and counting only non-synonymous changes). */
function getCodon2CodonMatrix(table: Table): [Map<string, Map<string, number>>, Map<string, Map<string, number>>] {
  const forward = table.forwardTable as unknown as Map<string, string>;
  const codons = [...forward.keys(), ...table.stopCodons].filter((c) => !c.includes("U"));
  const dict = new Map(forward);
  for (const stop of table.stopCodons) dict.set(stop, "stop");
  const graph: Graph = new Map(), graphNonsyn: Graph = new Map();
  for (const codon of codons) {
    const g = new Map<string, number>(), gn = new Map<string, number>();
    graph.set(codon, g); graphNonsyn.set(codon, gn);
    for (let p = 0; p < 3; p++) {
      for (const base of ["A", "T", "C", "G"]) {
        const tmp = codon.slice(0, p) + base + codon.slice(p + 1);
        if (dict.get(codon) !== dict.get(tmp)) { gn.set(tmp, 1); g.set(tmp, 1); }
        else if (codon !== tmp) { gn.set(tmp, 0.1); g.set(tmp, 1); }
      }
    }
  }
  const nonsynG = new Map<string, Map<string, number>>(), G = new Map<string, Map<string, number>>();
  for (const c1 of codons) {
    const a = new Map<string, number>(), b = new Map<string, number>();
    nonsynG.set(c1, a); G.set(c1, b);
    for (const c2 of codons) {
      if (c1 === c2) { a.set(c2, 0); b.set(c2, 0); }
      else { a.set(c2, dijkstra(graphNonsyn, c1, c2)); b.set(c2, dijkstra(graph, c1, c2)); }
    }
  }
  return [G, nonsynG];
}

/** Dijkstra's algorithm as Biopython writes it (unreachable distance 100); returns the distance from `start` to `end`. */
function dijkstra(graph: Graph, start: string, end: string): number {
  const D = new Map<string, number>(), P = new Map<string, string>();
  for (const node of graph.keys()) { D.set(node, 100); P.set(node, ""); }
  D.set(start, 0);
  const unseen = [...graph.keys()];
  while (unseen.length > 0) {
    let shortest: number | null = null, node = "";
    for (const t of unseen) {
      if (shortest === null) { shortest = D.get(t)!; node = t; }
      else if (D.get(t)! < shortest) { shortest = D.get(t)!; node = t; }
    }
    unseen.splice(unseen.indexOf(node), 1);
    for (const [child, value] of graph.get(node)!) {
      if (D.get(child)! > D.get(node)! + value) { D.set(child, D.get(node)! + value); P.set(child, node); }
    }
    if (node === end) break;
  }
  const path: string[] = [];
  let node = end;
  while (node !== start) {
    if (!path.includes(node)) { path.unshift(node); node = P.get(node)!; } else break;
  }
  path.unshift(start);
  let distance = 0;
  for (let i = 0; i < path.length - 1; i++) distance += graph.get(path[i]!)!.get(path[i + 1]!)!;
  return distance;
}

/** Substitutions needed for a set of codons (the sum of the floors of a spanning tree for three or more). */
function countReplacement(codons: Set<string>, G: Map<string, Map<string, number>>): number {
  if (codons.size === 1) return 0;
  const row = (c: string): Map<string, number> => { const r = G.get(c); if (r === undefined) throw new KeyError(c); return r; };
  if (codons.size === 2) {
    const [a, b] = [...codons] as [string, string];
    const v = row(a).get(b);
    if (v === undefined) throw new KeyError(b);
    return Math.floor(v);
  }
  const sub = new Map<string, Map<string, number>>();
  for (const c1 of codons) {
    const m = new Map<string, number>();
    for (const c2 of codons) if (c1 !== c2) { const v = row(c1).get(c2); if (v === undefined) throw new KeyError(c2); m.set(c2, v); }
    sub.set(c1, m);
  }
  return prim(sub);
}

/**
 * Prim's algorithm as Biopython writes it: it starts from `set(nodes[0])`, the set of the letters of the first codon, so the nodes
 * counted as already used are those letters (not the codon).
 */
function prim(G: Graph): number {
  const nodes: string[] = [];
  const edges: [string, string, number][] = [];
  for (const [i, adj] of G) {
    nodes.push(i);
    for (const [j, c] of adj) {
      if (!edges.some(([a, b, w]) => a === i && b === j && w === c) && !edges.some(([a, b, w]) => a === j && b === i && w === c)) edges.push([i, j, c]);
    }
  }
  const conn = new Map<string, [number, string, string][]>();
  for (const [n1, n2, c] of edges) {
    if (!conn.has(n1)) conn.set(n1, []);
    if (!conn.has(n2)) conn.set(n2, []);
    conn.get(n1)!.push([c, n1, n2]);
    conn.get(n2)!.push([c, n2, n1]);
  }
  const mst: [string, string, number][] = [];
  const used = new Set<string>(nodes[0]!);
  const heap: [number, string, string][] = [...(conn.get(nodes[0]!) ?? [])];
  const cmp = (a: [number, string, string], b: [number, string, string]): number => (a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? (a[1] < b[1] ? -1 : 1) : a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
  // heapq: a binary min-heap; popping the smallest tuple is all that matters, so a sorted list suffices.
  while (heap.length > 0) {
    heap.sort(cmp);
    const [cost, n1, n2] = heap.shift()!;
    if (!used.has(n2)) {
      used.add(n2);
      mst.push([n1, n2, cost]);
      for (const e of conn.get(n2) ?? []) if (!used.has(e[2])) heap.push(e);
    }
  }
  let length = 0;
  for (const p of mst) length += Math.floor(p[2]);
  return length;
}

/** The G test of a 2x2 table `[syn_fix, nonsyn_fix, syn_poly, nonsyn_poly]`; returns the p-value. */
function gTest(counts: number[]): number {
  const tot = counts[0]! + counts[1]! + counts[2]! + counts[3]!;
  const totSyn = counts[0]! + counts[2]!, totNon = counts[1]! + counts[3]!;
  const totFix = counts[0]! + counts[1]!, totPoly = counts[2]! + counts[3]!;
  const exp = [div(totFix * totSyn, tot), div(totFix * totNon, tot), div(totPoly * totSyn, tot), div(totPoly * totNon, tot)];
  let G = 0;
  counts.forEach((obs, i) => { G += obs * log(div(obs, exp[i]!)); });
  return erfc(sqrt(G));
}
