/** `Tree`: a phylogenetic tree with its global information. */

import { AssertionError, UnboundLocalError, ValueError, pyStr } from "@biolibs/core";
import { Clade } from "./clade.js";
import { TreeElement } from "./tree-element.js";
import { TreeMixin, lengthOf } from "./tree-mixin.js";

/** The constructor arguments of a {@link Tree}. */
export interface TreeOptions {
  /** The starting node; a new empty clade by default. */
  root?: Clade | null;
  /** Whether the tree is rooted (default true). */
  rooted?: boolean;
  /** The identifier of the tree. */
  id?: string | null;
  /** The name of the tree. */
  name?: string | null;
}

let formatter: ((tree: Tree, fmt: string) => string) | null = null;

/** Connect `Tree.format` to the tree writers (called by `io.ts`, which depends on this file). */
export function registerFormatter(f: (tree: Tree, fmt: string) => string): void { formatter = f; }

const orZero = (x: number | null): number => (x === null || x === 0 ? 0 : x);

/** A phylogenetic tree: a root clade plus `rooted`, `id` and `name`. */
export class Tree extends TreeMixin {
  /** The root clade. */
  rootClade: Clade;
  /** Whether the tree is rooted. */
  rooted: boolean;
  /** The identifier, or null. */
  id: string | null;
  /** The name, or null. */
  name: string | null;

  /** @param o - The attributes (all optional). */
  constructor(o: TreeOptions = {}) {
    super();
    this.rootClade = o.root ?? this.newClade();
    this.rooted = o.rooted ?? true;
    this.id = o.id ?? null;
    this.name = o.name ?? null;
  }

  /** A new empty clade of the kind this tree uses (subclasses override it). */
  protected newClade(): Clade { return new Clade(); }

  override pyDict(): [string, unknown][] { return [["root", this.rootClade], ["rooted", this.rooted], ["id", this.id], ["name", this.name]]; }

  /** The root clade (`tree.root`). */
  get root(): Clade { return this.rootClade; }
  set root(clade: Clade) { this.rootClade = clade; }
  /** The first clade of the tree (its root). */
  get clade(): Clade { return this.rootClade; }
  protected override isTree(): boolean { return true; }
  protected override setRoot(clade: Clade): Clade { this.rootClade = clade; return clade; }

  /** Whether the root is terminal. */
  isTerminal(): boolean { return this.rootClade.clades.length === 0; }

  /** A new tree whose root is a deep copy of the clade. */
  static fromClade<T extends Tree>(this: new (o?: TreeOptions) => T, clade: Clade, options: Omit<TreeOptions, "root"> = {}): T {
    return new this({ ...options, root: cloneClade(clade) });
  }

  /**
   * Reroot this tree in place with the outgroup clade containing the targets.
   *
   * @param outgroupTargets - A list of targets, or one target (more can follow in `more`).
   * @param more - More targets, when the first argument is a single target.
   * @param options - `outgroupBranchLength`: the length of the branch to the outgroup after rerooting.
   */
  rootWithOutgroup(outgroupTargets: unknown, ...more: unknown[]): void;
  rootWithOutgroup(outgroupTargets: unknown, ...more: unknown[]): void {
    let outgroupBranchLength: number | null = null;
    const last = more[more.length - 1];
    if (last !== null && typeof last === "object" && !(last instanceof TreeElement) && !Array.isArray(last) && "outgroupBranchLength" in last) {
      outgroupBranchLength = (last as { outgroupBranchLength: number | null }).outgroupBranchLength;
      more = more.slice(0, -1);
    }
    const outgroup = this.commonAncestor(outgroupTargets, ...more);
    const outgroupPath = this.getPath(outgroup)!;
    if (outgroupPath.length === 0) return;
    let prevBlen: number | null = orZero(outgroup.branchLength);
    let newRoot: Clade, newParent: Clade;
    if (outgroup.isTerminal() || outgroupBranchLength !== null) {
      outgroup.branchLength = outgroupBranchLength === null || outgroupBranchLength === 0 ? 0.0 : outgroupBranchLength;
      newRoot = new (this.root.constructor as new (o: object) => Clade)({ branchLength: this.root.branchLength, clades: [outgroup] });
      if (outgroupPath.length === 1) newParent = newRoot;
      else {
        const parent = outgroupPath.splice(outgroupPath.length - 2, 1)[0]!;
        parent.clades.splice(parent.clades.indexOf(outgroup), 1);
        const oldParentBlen = parent.branchLength;
        parent.branchLength = (prevBlen as number) - outgroup.branchLength;
        prevBlen = oldParentBlen;
        newRoot.clades.unshift(parent);
        newParent = parent;
      }
    } else {
      newRoot = outgroup;
      newRoot.branchLength = this.root.branchLength;
      newParent = newRoot;
    }
    // Trace the outgroup lineage backwards, reattaching the subclades under the new root.
    const rest = outgroupPath.slice(0, Math.max(outgroupPath.length - 1, 0)).reverse();
    for (const parent of rest) {
      parent.clades.splice(parent.clades.indexOf(newParent), 1);
      const tmp = parent.branchLength;
      parent.branchLength = prevBlen;
      prevBlen = tmp;
      newParent.clades.unshift(parent);
      newParent = parent;
    }
    const oldRoot = this.root;
    if (oldRoot.clades.includes(outgroup)) {
      if (outgroupPath.length !== 1) throw new AssertionError("");
      oldRoot.clades.splice(oldRoot.clades.indexOf(outgroup), 1);
    } else oldRoot.clades.splice(oldRoot.clades.indexOf(newParent), 1);
    if (oldRoot.clades.length === 1) {
      const ingroup = oldRoot.clades[0]!;
      if (ingroup.branchLength) {
        if (prevBlen === null) throw new TypeError("unsupported operand type(s) for +=: 'float' and 'NoneType'");
        ingroup.branchLength += prevBlen;
      } else ingroup.branchLength = prevBlen;
      newParent.clades.unshift(ingroup);
    } else {
      oldRoot.branchLength = prevBlen;
      newParent.clades.unshift(oldRoot);
    }
    this.rootClade = newRoot;
    this.rooted = true;
  }

  /** Root the tree at the midpoint of the two most distant taxa (in place, leaving a bifurcating root). */
  rootAtMidpoint(): void {
    let maxDistance = 0.0;
    let tip1: Clade | undefined, tip2: Clade | undefined;
    for (const tip of this.getTerminals()) {
      this.rootWithOutgroup(tip);
      let best: [Clade, number] | null = null;
      for (const entry of this.depths()) if (best === null || entry[1] > best[1]) best = entry;
      if (best![1] > maxDistance) { tip1 = tip; tip2 = best![0]; maxDistance = best![1]; }
    }
    if (tip1 === undefined) throw new UnboundLocalError("cannot access local variable 'tip1' where it is not associated with a value");
    this.rootWithOutgroup(tip1);
    let remainder = 0.5 * (maxDistance - orZero(this.root.branchLength));
    if (!(remainder >= 0)) throw new AssertionError("");
    let outgroupNode: Clade | undefined, outgroupBranchLength = 0;
    for (const node of this.getPath(tip2!)!) {
      if (node.branchLength === null) throw new TypeError("unsupported operand type(s) for -=: 'float' and 'NoneType'");
      remainder -= node.branchLength;
      if (remainder < 0) { outgroupNode = node; outgroupBranchLength = -remainder; break; }
    }
    if (outgroupNode === undefined) throw new ValueError("Somehow, failed to find the midpoint!");
    this.rootWithOutgroup(outgroupNode, { outgroupBranchLength });
  }

  /**
   * The tree as text in a file format; without a format, the same as `toString()`.
   *
   * @param fmt - A format name accepted by `write` (such as `"newick"`).
   * @throws KeyError for an unknown format.
   */
  format(fmt?: string | null): string {
    if (fmt && formatter !== null) return formatter(this, fmt);
    return this.toString();
  }

  /** Python's `str(tree)`: the repr of every element, indented by depth. */
  override toString(): string {
    const lines: string[] = [];
    const print = (obj: TreeElement, indent: number): void => {
      lines.push("    ".repeat(indent) + (obj instanceof Tree || obj instanceof Clade ? obj.repr() : obj.toString()));
      for (const [, child] of obj.pyDict()) {
        if (child instanceof TreeElement) print(child, indent + 1);
        else if (Array.isArray(child)) for (const e of child) if (e instanceof TreeElement) print(e, indent + 1);
      }
    };
    print(this, 0);
    return lines.join("\n");
  }

  /** Python's `str(x)` for use in messages. */
  static str(x: unknown): string { return pyStr(x); }
}

/** A deep copy of a clade and everything below it. */
export function cloneClade(clade: Clade): Clade {
  const copy = Object.create(Object.getPrototypeOf(clade)) as Clade;
  for (const [k, v] of Object.entries(clade)) {
    (copy as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? v.map((c) => (c instanceof Clade ? cloneClade(c) : c)) : v;
  }
  return copy;
}

export { lengthOf };
