/** Consensus trees (Biopython's `Bio.Phylo.Consensus`): strict, majority rule and Adam consensus, and branch support. */

import { IndexError, PyFloat, ValueError } from "@biolibs/core";
import { Clade } from "../base-tree/clade.js";
import { Tree } from "../base-tree/tree.js";
import { BitString } from "./bitstring.js";

/** Python's `StopIteration` escaping from `next()` on an empty iterator. */
function stopIteration(): Error { return Object.assign(new Error(""), { name: "StopIteration" }); }

/** Python's `round(x, ndigits)`. */
const pyRound = (x: number, n: number): number => Number(x.toFixed(n));

/** `{term.name for term in clade.find_clades(terminal=True)}` in the order of the tree's own terminals. */
const terminalNames = (clade: Clade | Tree): (string | null)[] => [...clade.findClades(null, { terminal: true })].map((t) => t.name);

/** The bit string of a clade, given the ordered taxon names of a tree. */
function cladeToBitstr(clade: Clade | Tree, treeTermNames: (string | null)[]): BitString {
  const names = new Set(terminalNames(clade));
  return BitString.fromBool(treeTermNames.map((name) => names.has(name)));
}

/** The bit string of every internal clade of a tree, in preorder. */
function treeToBitstrs(tree: Tree): Map<Clade, BitString> {
  const out = new Map<Clade, BitString>();
  const names = terminalNames(tree);
  for (const clade of tree.findClades(null, { terminal: false })) out.set(clade, cladeToBitstr(clade, names));
  return out;
}

/** Count each distinct clade (set of terminal names) over the trees: occurrences and total branch length, plus the number of trees. */
function countClades(trees: Iterable<Tree>): { bitstrs: Map<string, [number, number]>; treeCount: number } {
  const bitstrs = new Map<string, [number, number]>();
  let treeCount = 0;
  for (const tree of trees) {
    treeCount += 1;
    const cb = treeToBitstrs(tree);
    for (const clade of tree.findClades(null, { terminal: false })) {
      const key = cb.get(clade)!.value;
      const bl = clade.branchLength || 0;
      const old = bitstrs.get(key);
      bitstrs.set(key, old === undefined ? [1, bl] : [old[0] + 1, old[1] + bl]);
    }
  }
  return { bitstrs, treeCount };
}

/** The first tree and the full list (so that the first tree can be counted too). */
function firstOf(trees: Iterable<Tree>): { first: Tree; all: Tree[] } {
  const all = [...trees];
  if (all.length === 0) throw stopIteration();
  return { first: all[0]!, all };
}

/** The strict consensus tree: the clades found in every tree. @throws ValueError if the trees do not have the same taxa. */
export function strictConsensus(trees: Iterable<Tree>): Tree {
  const { first, all } = firstOf(trees);
  const terms = first.getTerminals();
  const { bitstrs: counts, treeCount } = countClades(all);
  const strict = [...counts].filter(([, t]) => t[0] === treeCount).map(([b]) => new BitString(b));
  strict.sort((a, b) => b.ones() - a.ones());
  const root = new Clade();
  if (strict.length === 0) throw new IndexError("list index out of range");
  if (strict[0]!.ones() === terms.length) root.clades.push(...terms);
  else throw new ValueError("Taxons in provided trees should be consistent");
  const bitstrClades = new Map<string, Clade>([[strict[0]!.value, root]]);
  for (const bitstr of strict.slice(1)) {
    const cladeTerms = bitstr.indexOne().map((i) => terms[i]!);
    const clade = new Clade();
    clade.clades.push(...cladeTerms);
    for (const [bsKey, c] of bitstrClades) {
      const bs = new BitString(bsKey);
      if (bs.contains(bitstr)) {
        bitstrClades.delete(bsKey);
        c.clades = c.clades.filter((child) => !cladeTerms.includes(child));
        c.clades.push(clade);
        bitstrClades.set(bs.xor(bitstr).value, c);
        break;
      }
    }
    bitstrClades.set(bitstr.value, clade);
  }
  return new Tree({ root });
}

/**
 * The majority-rule consensus tree. `cutoff` (0 to 1, default 0) is the support a clade needs; with 0 the tree is made as binary as the
 * trees allow. The branch length of a clade is the average over the trees that have it, and `confidence` is the percentage of trees.
 *
 * @throws ValueError if the trees do not have the same taxa.
 */
export function majorityConsensus(trees: Iterable<Tree>, cutoff = 0): Tree {
  const { first, all } = firstOf(trees);
  const terms = first.getTerminals();
  const { bitstrs: counts, treeCount } = countClades(all);
  // Sort by descending number of occurrences, then number of tips, then the string itself.
  const bitstrs = [...counts.keys()].sort((a, b) => {
    const ca = counts.get(a)![0], cb = counts.get(b)![0];
    if (ca !== cb) return cb - ca;
    const oa = new BitString(a).ones(), ob = new BitString(b).ones();
    if (oa !== ob) return ob - oa;
    return a < b ? 1 : a > b ? -1 : 0;
  }).map((s) => new BitString(s));
  const root = new Clade();
  if (bitstrs.length === 0) throw new IndexError("list index out of range");
  if (bitstrs[0]!.ones() === terms.length) root.clades.push(...terms);
  else throw new ValueError("Taxons in provided trees should be consistent");
  const bitstrClades = new Map<string, Clade>([[bitstrs[0]!.value, root]]);
  for (const bitstr of bitstrs.slice(1)) {
    const [countInTrees, branchLengthSum] = counts.get(bitstr.value)!;
    const confidence = (100.0 * countInTrees) / treeCount;
    if (confidence < cutoff * 100.0) break;
    const cladeTerms = bitstr.indexOne().map((i) => terms[i]!);
    const clade = new Clade();
    clade.clades.push(...cladeTerms);
    clade.confidence = Number.isInteger(confidence) ? new PyFloat(confidence) : confidence;
    clade.branchLength = branchLengthSum / countInTrees;
    const bsckeys = [...bitstrClades.keys()].sort((a, b) => new BitString(b).ones() - new BitString(a).ones());
    let compatible = true;
    let parentBitstr: BitString | null = null;
    const childBitstrs: BitString[] = [];
    for (const key of bsckeys) {
      const bs = new BitString(key);
      if (!bs.iscompatible(bitstr)) { compatible = false; break; }
      if (bs.contains(bitstr)) parentBitstr = bs;
      if (bitstr.contains(bs) && bs.value !== bitstr.value && childBitstrs.every((c) => c.independent(bs))) childBitstrs.push(bs);
    }
    if (!compatible) continue;
    let parentClade: Clade | undefined;
    if (parentBitstr !== null) {
      parentClade = bitstrClades.get(parentBitstr.value)!;
      bitstrClades.delete(parentBitstr.value);
      parentClade.clades = parentClade.clades.filter((c) => !cladeTerms.includes(c));
      parentClade.clades.push(clade);
      bitstrClades.set(parentBitstr.value, parentClade);
    }
    if (childBitstrs.length > 0) {
      const removeList: number[] = [];
      for (const c of childBitstrs) {
        removeList.push(...c.indexOne());
        const childClade = bitstrClades.get(c.value)!;
        if (parentClade === undefined) throw Object.assign(new Error("cannot access local variable 'parent_clade' where it is not associated with a value"), { name: "UnboundLocalError" });
        const at = parentClade.clades.indexOf(childClade);
        if (at < 0) throw new ValueError("list.remove(x): x not in list");
        parentClade.clades.splice(at, 1);
        clade.clades.push(childClade);
      }
      const removeTerms = removeList.map((i) => terms[i]!);
      clade.clades = clade.clades.filter((c) => !removeTerms.includes(c));
    }
    bitstrClades.set(bitstr.value, clade);
    if (bitstrClades.size === terms.length - 1 || (bitstrClades.size === terms.length - 2 && root.clades.length === 3)) break;
  }
  return new Tree({ root });
}

/** The Adam consensus tree of a list of trees. */
export function adamConsensus(trees: Tree[]): Tree {
  const clades = [...trees].map((t) => t.root);
  return new Tree({ root: part(clades), rooted: true });
}

/** The recursive step of the Adam consensus algorithm. */
function part(clades: Clade[]): Clade {
  if (clades.length === 0) throw new IndexError("list index out of range");
  const terms = clades[0]!.getTerminals();
  const termNames = terms.map((t) => t.name);
  if (terms.length === 1 || terms.length === 2) return clades[0]!;
  let bitstrs = new Set<string>(["1".repeat(terms.length)]);
  for (const clade of clades) {
    for (const child of clade.clades) {
      const bitstr = cladeToBitstr(child, termNames);
      const toRemove = new Set<string>(), toAdd = new Set<string>();
      for (const key of bitstrs) {
        const bs = new BitString(key);
        if (bs.value === bitstr.value) continue;
        else if (bs.contains(bitstr)) { toAdd.add(bitstr.value); toAdd.add(bs.xor(bitstr).value); toRemove.add(bs.value); }
        else if (bitstr.contains(bs)) toAdd.add(bs.xor(bitstr).value);
        else if (!bs.independent(bitstr)) {
          toAdd.add(bs.and(bitstr).value);
          toAdd.add(bs.and(bitstr).xor(bitstr).value);
          toAdd.add(bs.and(bitstr).xor(bs).value);
          toRemove.add(bs.value);
        }
      }
      // `bitstrs ^= to_remove` (to_remove is a subset, so this removes).
      const next = new Set<string>();
      for (const k of bitstrs) if (!toRemove.has(k)) next.add(k);
      for (const k of toRemove) if (!bitstrs.has(k)) next.add(k);
      bitstrs = next;
      if (toAdd.size > 0) {
        for (const ta of [...toAdd].sort((a, b) => new BitString(a).ones() - new BitString(b).ones())) {
          const t = new BitString(ta);
          if ([...bitstrs].every((bs) => t.independent(new BitString(bs)))) bitstrs.add(ta);
        }
      }
    }
  }
  const newClade = new Clade();
  for (const key of [...bitstrs].sort()) {
    const indices = new BitString(key).indexOne();
    if (indices.length === 1) newClade.clades.push(terms[indices[0]!]!);
    else if (indices.length === 2) newClade.clades.push(new Clade({ clades: [terms[indices[0]!]!, terms[indices[1]!]!] }));
    else if (indices.length > 2) {
      const partNames = indices.map((i) => termNames[i]!);
      newClade.clades.push(part(clades.map((c) => subClade(c, partNames))));
    }
  }
  return newClade;
}

/** A compatible subclade containing only the named terminals. */
function subClade(clade: Clade, termNames: string[]): Clade {
  const termClades = termNames.map((name) => clade.findAny(name) as Clade | null);
  let sub = clade.commonAncestor(termClades);
  if (termNames.length !== sub.countTerminals()) {
    const temp = new Clade();
    temp.clades.push(...(termClades as Clade[]));
    for (const c of sub.findClades(null, { terminal: false, order: "preorder" })) {
      if (c === sub.root) continue;
      const termSet = new Set(termClades);
      const children = new Set([...c.findClades(null, { terminal: true })].filter((x) => termSet.has(x)));
      if (children.size > 0) {
        for (const tc of temp.findClades(null, { terminal: false, order: "preorder" })) {
          const tcChildren = new Set(tc.clades);
          const tcNew = new Set([...tcChildren].filter((x) => !children.has(x)));
          if ([...children].every((x) => tcChildren.has(x)) && tcNew.size > 0) {
            tc.clades = [...tcNew];
            tc.clades.push(new Clade({ clades: [...children] }));
          }
        }
      }
    }
    sub = temp;
  }
  return sub;
}

/**
 * Branch support of a target tree from replicate trees: sets `confidence` (a percentage) on its internal clades.
 *
 * @param targetTree - The tree to annotate (changed in place and returned).
 * @param trees - The replicates.
 * @param lenTrees - The number of replicates; needed when `trees` is not a list.
 * @throws TypeError if the number of replicates cannot be found.
 */
export function getSupport(targetTree: Tree, trees: Iterable<Tree>, lenTrees: number | null = null): Tree {
  const termNames = [...targetTree.findClades(null, { terminal: true })].map((t) => t.name as string).sort();
  const bitstrs = new Map<string, [Clade, number]>();
  let size = lenTrees;
  if (size === null) {
    if (!Array.isArray(trees)) throw new TypeError("Trees does not support len(trees), you must provide the number of replicates in trees as the optional parameter len_trees.");
    size = trees.length;
  }
  for (const clade of targetTree.findClades(null, { terminal: false })) bitstrs.set(cladeToBitstr(clade, termNames).value, [clade, 0]);
  for (const tree of trees) {
    for (const clade of tree.findClades(null, { terminal: false })) {
      const key = cladeToBitstr(clade, termNames).value;
      const hit = bitstrs.get(key);
      if (hit !== undefined) {
        const [c, t] = hit;
        const conf = ((t + 1) * 100.0) / size;
        c.confidence = Number.isInteger(conf) ? new PyFloat(conf) : conf;
        bitstrs.set(key, [c, t + 1]);
      }
    }
  }
  return targetTree;
}

/** The branch lengths (rounded to 5 places) of a tree's clades, by bit string. */
function bitstringTopology(tree: Tree): Map<string, number> {
  const out = new Map<string, number>();
  for (const [clade, bitstr] of treeToBitstrs(tree)) out.set(bitstr.value, pyRound(clade.branchLength || 0.0, 5));
  return out;
}

/** Whether two trees have the same taxa, topology and branch lengths (to 5 decimal places). */
export function equalTopology(tree1: Tree, tree2: Tree): boolean {
  const a = new Set(terminalNames(tree1)), b = new Set(terminalNames(tree2));
  if (a.size !== b.size || ![...a].every((x) => b.has(x))) return false;
  const t1 = bitstringTopology(tree1), t2 = bitstringTopology(tree2);
  return t1.size === t2.size && [...t1].every(([k, v]) => t2.get(k) === v);
}
