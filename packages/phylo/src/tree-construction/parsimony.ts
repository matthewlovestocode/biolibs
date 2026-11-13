/** Parsimony scoring and tree search: `ParsimonyScorer`, `NNITreeSearcher` and `ParsimonyTreeConstructor`. */

import { Alignment, MultipleSeqAlignment } from "@biolibs/align";
import { NotImplementedError, ValueError } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { Clade } from "../base-tree/clade.js";
import { Tree, cloneTree } from "../base-tree/tree.js";
import { DistanceCalculator } from "./distance.js";
import { DistanceTreeConstructor, TreeConstructor } from "./constructors.js";
import { Matrix } from "./matrix.js";
import { val } from "./num.js";

/** Base class of the tree scoring methods. */
export class Scorer {
  /** The score of a tree for an alignment (implemented by subclasses). @throws NotImplementedError. */
  getScore(_tree: Tree, _alignment: unknown): number { throw new NotImplementedError("Method not implemented!"); }
}

/** Base class of the tree searching methods. */
export class TreeSearcher {
  /** The best tree found from a starting tree (implemented by subclasses). @throws NotImplementedError. */
  search(_startingTree: Tree, _alignment: unknown): Tree { throw new NotImplementedError("Method not implemented!"); }
}

/** Parsimony score by the Fitch algorithm, or by the Sankoff algorithm with a scoring matrix. */
export class ParsimonyScorer extends Scorer {
  /** The scoring matrix, or null/empty for Fitch. */
  matrix: Matrix | null;

  /** @param matrix - Scoring matrix (names are the alphabet). @throws TypeError for a non-matrix. */
  constructor(matrix: unknown = null) {
    super();
    if (matrix === null || matrix === undefined || matrix instanceof Matrix) this.matrix = (matrix ?? null) as Matrix | null;
    else throw new TypeError("Must provide a _Matrix object.");
  }

  /**
   * The parsimony score of a tree and an alignment (the tree must be bifurcating; an unrooted tree is rooted at its midpoint first,
   * and the alignment is sorted by id).
   *
   * @throws ValueError for a non-bifurcating tree or taxon names that differ from the alignment's.
   */
  override getScore(tree: Tree, alignment: unknown): number {
    if (!tree.isBifurcating()) throw new ValueError("The tree provided should be bifurcating.");
    if (!tree.rooted) tree.rootAtMidpoint();
    const terms = tree.getTerminals();
    terms.sort((a, b) => (a.name as string) < (b.name as string) ? -1 : (a.name as string) > (b.name as string) ? 1 : 0);
    const isMsa = alignment instanceof MultipleSeqAlignment;
    (alignment as MultipleSeqAlignment | Alignment).sort();
    const ids: (string | null)[] = isMsa ? [...(alignment as MultipleSeqAlignment)].map((r: SeqRecord) => r.id) : (alignment as Alignment).sequences.map((s) => (s as SeqRecord).id);
    const n = Math.min(terms.length, ids.length);
    for (let i = 0; i < n; i++) if (terms[i]!.name !== ids[i]) throw new ValueError("Taxon names of the input tree should be the same with the alignment.");
    const rows: string[] = isMsa ? [...(alignment as MultipleSeqAlignment)].map((r) => String(r.seq)) : Array.from({ length: (alignment as Alignment).size }, (_, i) => (alignment as Alignment).get(i) as string);
    const width = Array.from(rows[0] ?? "").length;
    let score = 0;
    for (let i = 0; i < width; i++) {
      let scoreI = 0;
      const column = rows.map((r) => Array.from(r)[i]!);
      if (column.every((c) => c === column[0])) continue;
      if (!this.matrix || this.matrix.length === 0) {
        const states = new Map<Clade, Set<string>>();
        terms.forEach((t, j) => { if (j < column.length) states.set(t, new Set([column[j]!])); });
        for (const clade of tree.getNonterminals("postorder")) {
          const left = states.get(clade.clades[0]!), right = states.get(clade.clades[1]!);
          if (left === undefined || right === undefined) throw Object.assign(new Error("KeyError"), { name: "KeyError" });
          let state = new Set([...left].filter((x) => right.has(x)));
          if (state.size === 0) { state = new Set([...left, ...right]); scoreI += 1; }
          states.set(clade, state);
        }
      } else {
        const inf = Infinity;
        const alphabet = this.matrix.names;
        const length = alphabet.length;
        const scores = new Map<Clade, number[]>();
        column.forEach((c, j) => {
          const array = new Array<number>(length).fill(inf);
          const index = alphabet.indexOf(c);
          if (index < 0) throw new ValueError("list.index(x): x not in list");
          array[index] = 0;
          scores.set(terms[j]!, array);
        });
        let array: number[] = [];
        for (const clade of tree.getNonterminals("postorder")) {
          const leftScore = scores.get(clade.clades[0]!)!, rightScore = scores.get(clade.clades[1]!)!;
          array = [];
          for (let m = 0; m < length; m++) {
            let minL = inf, minR = inf;
            for (let k = 0; k < length; k++) {
              const cost = val(this.matrix.get([alphabet[m]!, alphabet[k]!]) as number);
              const sl = cost + leftScore[k]!, sr = cost + rightScore[k]!;
              if (minL > sl) minL = sl;
              if (minR > sr) minR = sr;
            }
            array.push(minL + minR);
          }
          scores.set(clade, array);
        }
        scoreI = Math.min(...array);
      }
      score += scoreI;
    }
    return score;
  }
}

/** Searches the best parsimony tree by nearest-neighbour interchanges (binary rooted trees only). */
export class NNITreeSearcher extends TreeSearcher {
  /** The scorer. */
  scorer: Scorer;

  /** @param scorer - A `Scorer`. @throws TypeError for anything else. */
  constructor(scorer: unknown) {
    super();
    if (scorer instanceof Scorer) this.scorer = scorer;
    else throw new TypeError("Must provide a Scorer object.");
  }

  override search(startingTree: Tree, alignment: unknown): Tree { return this.nni(startingTree, alignment); }

  private nni(startingTree: Tree, alignment: unknown): Tree {
    let best = startingTree;
    for (;;) {
      let bestScore = this.scorer.getScore(best, alignment);
      const temp = bestScore;
      for (const t of this.getNeighbors(best)) {
        const score = this.scorer.getScore(t, alignment);
        if (score < bestScore) { bestScore = score; best = t; }
      }
      if (bestScore >= temp) break;
    }
    return best;
  }

  /** All neighbour trees of a tree (binary rooted trees only). */
  getNeighbors(tree: Tree): Tree[] { return this.neighbors(tree); }

  private neighbors(tree: Tree): Tree[] {
    const parents = new Map<Clade, Clade>();
    for (const clade of tree.findClades()) {
      if (clade !== tree.root) {
        const path = tree.getPath(clade)!;
        parents.set(clade, path.length === 1 ? tree.root : path[path.length - 2]!);
      }
    }
    const neighbors: Tree[] = [];
    const rootChilds: Clade[] = [];
    for (const clade of tree.getNonterminals("level")) {
      if (clade === tree.root) {
        const left = clade.clades[0]!, right = clade.clades[1]!;
        rootChilds.push(left, right);
        if (!left.isTerminal() && !right.isTerminal()) {
          const leftRight = left.clades[1]!, rightLeft = right.clades[0]!, rightRight = right.clades[1]!;
          left.clades.splice(1, 1); right.clades.splice(1, 1);
          left.clades.push(rightRight); right.clades.push(leftRight);
          neighbors.push(cloneTree(tree));
          left.clades.splice(1, 1); right.clades.splice(0, 1);
          left.clades.push(rightLeft); right.clades.push(rightRight);
          neighbors.push(cloneTree(tree));
          left.clades.splice(1, 1); right.clades.splice(0, 1);
          left.clades.push(leftRight); right.clades.unshift(rightLeft);
        }
      } else if (rootChilds.includes(clade)) continue;
      else {
        const left = clade.clades[0]!, right = clade.clades[1]!;
        const parent = parents.get(clade)!;
        if (clade === parent.clades[0]) {
          const sister = parent.clades[1]!;
          parent.clades.splice(1, 1); clade.clades.splice(1, 1);
          parent.clades.push(right); clade.clades.push(sister);
          neighbors.push(cloneTree(tree));
          parent.clades.splice(1, 1); clade.clades.splice(0, 1);
          parent.clades.push(left); clade.clades.push(right);
          neighbors.push(cloneTree(tree));
          parent.clades.splice(1, 1); clade.clades.splice(0, 1);
          parent.clades.push(sister); clade.clades.unshift(left);
        } else {
          const sister = parent.clades[0]!;
          parent.clades.splice(0, 1); clade.clades.splice(1, 1);
          parent.clades.unshift(right); clade.clades.push(sister);
          neighbors.push(cloneTree(tree));
          parent.clades.splice(0, 1); clade.clades.splice(0, 1);
          parent.clades.unshift(left); clade.clades.push(right);
          neighbors.push(cloneTree(tree));
          parent.clades.splice(0, 1); clade.clades.splice(0, 1);
          parent.clades.unshift(sister); clade.clades.unshift(left);
        }
      }
    }
    return neighbors;
  }
}

/** Builds a parsimony tree with a searcher, starting from a UPGMA tree on identity distances unless given one. */
export class ParsimonyTreeConstructor extends TreeConstructor {
  /** @param searcher - The tree searcher. @param startingTree - The starting tree (optional). */
  constructor(public searcher: TreeSearcher, public startingTree: Tree | null = null) { super(); }

  override buildTree(alignment: unknown): Tree {
    if (this.startingTree === null) {
      const dtc = new DistanceTreeConstructor(new DistanceCalculator("identity"), "upgma");
      this.startingTree = dtc.buildTree(alignment);
    }
    return this.searcher.search(this.startingTree, alignment);
  }
}
