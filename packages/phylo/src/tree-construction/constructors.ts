/** Tree constructors: UPGMA and neighbour joining from distance matrices, and the abstract bases. */

import { IndexError, NotImplementedError, UnboundLocalError } from "@biolibs/core";
import { Clade } from "../base-tree/clade.js";
import { Tree } from "../base-tree/tree.js";
import { DistanceCalculator } from "./distance.js";
import { DistanceMatrix } from "./matrix.js";
import { fl } from "./num.js";

/** Base class of all tree constructors. */
export class TreeConstructor {
  /** Build a tree from an alignment (implemented by subclasses). @throws NotImplementedError. */
  buildTree(_msa: unknown): Tree { throw new NotImplementedError("Method not implemented!"); }
}

/** Copy a distance matrix (Python's `copy.deepcopy`). */
const copyMatrix = (dm: DistanceMatrix): DistanceMatrix => new DistanceMatrix([...dm.names], dm.matrix.map((r) => [...r]));

/** Builds trees from distance matrices by UPGMA or neighbour joining (`method` `"upgma"` or `"nj"`). */
export class DistanceTreeConstructor extends TreeConstructor {
  /** The methods. */
  static readonly methods = ["nj", "upgma"];
  /** The calculator used by {@link DistanceTreeConstructor.buildTree}, or null. */
  distanceCalculator: DistanceCalculator | null;
  /** `"nj"` or `"upgma"`. */
  method: string;

  /**
   * @param distanceCalculator - Needed for `buildTree`.
   * @param method - `"nj"` (default) or `"upgma"`.
   * @throws TypeError for a bad calculator or method.
   */
  constructor(distanceCalculator: unknown = null, method = "nj") {
    super();
    if (distanceCalculator === null || distanceCalculator instanceof DistanceCalculator) this.distanceCalculator = distanceCalculator;
    else throw new TypeError("Must provide a DistanceCalculator object.");
    if (DistanceTreeConstructor.methods.includes(method)) this.method = method;
    else throw new TypeError(`Bad method: ${method}. Available methods: ${DistanceTreeConstructor.methods.join(", ")}`);
  }

  override buildTree(msa: unknown): Tree {
    if (this.distanceCalculator) {
      const dm = this.distanceCalculator.getDistance(msa);
      return this.method === "upgma" ? this.upgma(dm) : this.nj(dm);
    }
    throw new TypeError("Must provide a DistanceCalculator object.");
  }

  /** An UPGMA tree (a rooted tree whose root has branch length 0). @throws TypeError unless given a `DistanceMatrix`. */
  upgma(distanceMatrix: unknown): Tree {
    if (!(distanceMatrix instanceof DistanceMatrix)) throw new TypeError("Must provide a DistanceMatrix object.");
    const dm = copyMatrix(distanceMatrix);
    const clades = dm.names.map((name) => new Clade({ name }));
    let minI = 0, minJ = 0, innerCount = 0;
    let innerClade: Clade | undefined;
    while (dm.length > 1) {
      let minDist = dm.at(1, 0);
      for (let i = 1; i < dm.length; i++) {
        for (let j = 0; j < i; j++) {
          if (minDist >= dm.at(i, j)) { minDist = dm.at(i, j); minI = i; minJ = j; }
        }
      }
      const clade1 = clades[minI]!, clade2 = clades[minJ]!;
      innerCount += 1;
      innerClade = new Clade({ name: "Inner" + String(innerCount) });
      innerClade.clades.push(clade1, clade2);
      clade1.branchLength = (minDist * 1.0) / 2 - this.heightOf(clade1);
      clade2.branchLength = (minDist * 1.0) / 2 - this.heightOf(clade2);
      clades[minJ] = innerClade;
      clades.splice(minI, 1);
      for (let k = 0; k < dm.length; k++) {
        if (k !== minI && k !== minJ) dm.set([minJ, k], fl((dm.at(minI, k) + dm.at(minJ, k)) / 2));
      }
      dm.names[minJ] = "Inner" + String(innerCount);
      dm.delete(minI);
    }
    if (innerClade === undefined) throw new UnboundLocalError("cannot access local variable 'inner_clade' where it is not associated with a value");
    innerClade.setIntBranchLength(0);
    return new Tree({ root: innerClade });
  }

  /** A neighbour-joining tree (unrooted). @throws TypeError unless given a `DistanceMatrix`. */
  nj(distanceMatrix: unknown): Tree {
    if (!(distanceMatrix instanceof DistanceMatrix)) throw new TypeError("Must provide a DistanceMatrix object.");
    const dm = copyMatrix(distanceMatrix);
    const clades = dm.names.map((name) => new Clade({ name }));
    const nodeDist: number[] = new Array<number>(dm.length).fill(0);
    let minI = 0, minJ = 0, innerCount = 0;
    let innerClade: Clade | undefined;
    if (dm.length === 1) return new Tree({ root: clades[0]!, rooted: false });
    if (dm.length === 2) {
      minI = 1; minJ = 0;
      const clade1 = clades[minI]!, clade2 = clades[minJ]!;
      clade1.branchLength = dm.at(minI, minJ) / 2.0;
      clade2.branchLength = dm.at(minI, minJ) - clade1.branchLength;
      const inner = new Clade({ name: "Inner" });
      inner.clades.push(clade1, clade2);
      clades[0] = inner;
      return new Tree({ root: clades[0], rooted: false });
    }
    while (dm.length > 2) {
      for (let i = 0; i < dm.length; i++) {
        nodeDist[i] = 0;
        for (let j = 0; j < dm.length; j++) nodeDist[i]! += dm.at(i, j);
        nodeDist[i] = nodeDist[i]! / (dm.length - 2);
      }
      let minDist = dm.at(1, 0) - nodeDist[1]! - nodeDist[0]!;
      minI = 0; minJ = 1;
      for (let i = 1; i < dm.length; i++) {
        for (let j = 0; j < i; j++) {
          const temp = dm.at(i, j) - nodeDist[i]! - nodeDist[j]!;
          if (minDist > temp) { minDist = temp; minI = i; minJ = j; }
        }
      }
      const clade1 = clades[minI]!, clade2 = clades[minJ]!;
      innerCount += 1;
      innerClade = new Clade({ name: "Inner" + String(innerCount) });
      innerClade.clades.push(clade1, clade2);
      clade1.branchLength = (dm.at(minI, minJ) + nodeDist[minI]! - nodeDist[minJ]!) / 2.0;
      clade2.branchLength = dm.at(minI, minJ) - clade1.branchLength;
      clades[minJ] = innerClade;
      clades.splice(minI, 1);
      for (let k = 0; k < dm.length; k++) {
        if (k !== minI && k !== minJ) dm.set([minJ, k], fl((dm.at(minI, k) + dm.at(minJ, k) - dm.at(minI, minJ)) / 2.0));
      }
      dm.names[minJ] = "Inner" + String(innerCount);
      dm.delete(minI);
    }
    let root: Clade;
    if (clades.length === 0) throw new IndexError("list index out of range");
    if (clades[0] === innerClade) {
      clades[0]!.setIntBranchLength(0);
      clades[1]!.setBranchLengthNum(dm.get([1, 0]) as number);
      clades[0]!.clades.push(clades[1]!);
      root = clades[0]!;
    } else {
      clades[0]!.setBranchLengthNum(dm.get([1, 0]) as number);
      clades[1]!.setIntBranchLength(0);
      clades[1]!.clades.push(clades[0]!);
      root = clades[1]!;
    }
    return new Tree({ root, rooted: false });
  }

  /** The height of a clade: the longest path to any terminal. */
  private heightOf(clade: Clade): number {
    if (clade.isTerminal()) return 0;
    return Math.max(...clade.clades.map((c) => this.heightOf(c) + (c.branchLength as number)));
  }
}

