/** `TreeMixin`: the traversal, search and editing methods shared by `Tree` and `Clade`. */

import { PyFloat, ValueError, pyRepr, pySum } from "@biolibs/core";
import { combineArgs, combineMatchers, snake, type Matcher, type Pattern, type Target } from "./matchers.js";
import { TreeElement } from "./tree-element.js";
import type { Clade } from "./clade.js";

/** Traversal orders of the search methods. */
export type Order = "preorder" | "postorder" | "level";

/** Options of the search methods: `terminal`, `order` and attribute patterns. */
export interface FindOptions extends Pattern {
  /** `true` for leaves only, `false` for internal nodes only, `null` for both. */
  terminal?: boolean | null;
  /** Traversal order (default `"preorder"`). */
  order?: Order;
}

/** Python's `x or 0` for a branch length. */
const orZero = (x: number | null | undefined): number => (x === null || x === undefined || x === 0 ? 0 : x);
/** A branch length as a plain number. */
export const lengthOf = (x: unknown): number => (x instanceof PyFloat ? x.value : (x as number));

/** `sorted(elem.__dict__.items())` flattened to the `TreeElement`s inside (single values first, then lists), skipping the named attributes. */
export function sortedAttrs(elem: TreeElement, skip: ReadonlySet<string> = new Set()): TreeElement[] {
  const singles: unknown[] = [], lists: unknown[] = [];
  const entries = elem.pyDict().filter(([k]) => !skip.has(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [, child] of entries) {
    if (child === null || child === undefined) continue;
    if (Array.isArray(child)) lists.push(...child); else singles.push(child);
  }
  return [...singles, ...lists].filter((x): x is TreeElement => x instanceof TreeElement);
}

function* preorder<T>(root: T, children: (x: T) => T[]): Generator<T> { yield root; for (const v of children(root)) yield* preorder(v, children); }
function* postorder<T>(root: T, children: (x: T) => T[]): Generator<T> { for (const v of children(root)) yield* postorder(v, children); yield root; }
function* level<T>(root: T, children: (x: T) => T[]): Generator<T> {
  const queue = [root];
  for (let i = 0; i < queue.length; i++) { const v = queue[i]!; yield v; queue.push(...children(v)); }
}

/** Methods for `Tree` and `Clade`: both need only a `root` clade and `isTerminal`. */
export abstract class TreeMixin extends TreeElement {
  /** The clade the methods start from (a clade is its own root). */
  abstract get root(): Clade;
  /** Whether the root has no clades. */
  abstract isTerminal(): boolean;

  /** BFS or DFS over this tree's elements; `followAttrs` also visits the non-clade elements of each element (phyloXML annotations). */
  protected *filterSearch(filter: Matcher, order: string, followAttrs: boolean, skipClades = false): Generator<TreeElement> {
    const orders: Record<string, typeof preorder> = { preorder, postorder, level };
    const walk = orders[order];
    if (walk === undefined) throw new ValueError(`Invalid order '${order}'; must be one of: ${pyRepr(["preorder", "postorder", "level"]).replace(/^\[/, "(").replace(/\]$/, ")")}`);
    const skip = skipClades ? new Set(["clades"]) : new Set<string>();
    const children = followAttrs ? (e: TreeElement): TreeElement[] => sortedAttrs(e, skip) : (e: TreeElement): TreeElement[] => (e as Clade).clades;
    const start: TreeElement = followAttrs ? this : this.root;
    for (const e of walk(start, children)) if (filter(e)) yield e;
  }

  /** The first element {@link findElements} finds, or null. */
  findAny(target?: Target, options: FindOptions = {}): TreeElement | null {
    const r = this.findElements(target, options).next();
    return r.done ? null : r.value;
  }

  /**
   * Find all tree elements matching the target and attribute patterns, depth first by default.
   *
   * @param target - See {@link Target}.
   * @param options - `terminal`, `order` and attribute patterns (camel-case names).
   */
  *findElements(target?: Target, options: FindOptions = {}): Generator<TreeElement> {
    const { terminal = null, order = "preorder", ...rest } = options;
    const kwargs: Pattern = { ...rest };
    if (terminal !== null) kwargs["terminal"] = terminal;
    yield* this.filterSearch(combineMatchers(target, kwargs, false), order, true);
  }

  /** Find each clade containing a matching element (the usual way to search). */
  *findClades(target?: Target, options: FindOptions = {}): Generator<Clade> {
    const { terminal = null, order = "preorder", ...rest } = options;
    const matchAttrs = (elem: TreeElement): boolean => {
      // Search the element itself and its non-clade parts, never its sub-clades.
      const m = combineMatchers(target, rest, false);
      for (const _ of (elem as TreeMixin).filterSearch(m, "preorder", true, true)) return true;
      return false;
    };
    const filter: Matcher = terminal === null ? (e) => matchAttrs(e as TreeElement) : (e) => (e as Clade).isTerminal() === terminal && matchAttrs(e as TreeElement);
    yield* this.filterSearch(filter, order, false) as Generator<Clade>;
  }

  /**
   * The clades between this root and the target, ending with the target and excluding the root.
   *
   * @returns The list, or null if the target is not in the tree.
   */
  getPath(target?: Target, kwargs: Pattern = {}): Clade[] | null {
    const path: Clade[] = [];
    const match = combineMatchers(target, kwargs, true);
    const check = (v: Clade): boolean => {
      if (match(v)) { path.push(v); return true; }
      if (v.isTerminal()) return false;
      for (const child of v.clades) if (check(child)) { path.push(v); return true; }
      return false;
    };
    if (!check(this.root)) return null;
    return path.slice(0, path.length - 1).reverse();
  }

  /** All internal nodes. */
  getNonterminals(order: Order = "preorder"): Clade[] { return [...this.findClades(null, { terminal: false, order })]; }
  /** All leaves. */
  getTerminals(order: Order = "preorder"): Clade[] { return [...this.findClades(null, { terminal: true, order })]; }

  /** The clades between two targets, excluding `start` and including `finish`. */
  trace(start: Target, finish: Target): Clade[] {
    const mrca = this.commonAncestor(start, finish);
    const fromStart = mrca.getPath(start)!;
    const left = fromStart.slice(0, fromStart.length - 1).reverse();
    return [...left, mrca, ...mrca.getPath(finish)!];
  }

  /**
   * The most recent common ancestor of all the targets (the root for none, the target for one).
   *
   * @throws ValueError if a target is not in the tree; TypeError when called without arguments.
   */
  commonAncestor(targets: unknown, ...more: unknown[]): Clade {
    if (arguments.length === 0) throw new TypeError("TreeMixin.common_ancestor() missing 1 required positional argument: 'targets'");
    const list = combineArgs(targets, ...more);
    const paths = list.map((t) => this.getPath(t as Target));
    paths.forEach((p, i) => { if (p === null) throw new ValueError(`target ${reprOf(list[i])} is not in this tree`); });
    let mrca = this.root;
    const n = paths.length === 0 ? 0 : Math.min(...paths.map((p) => p!.length));
    for (let depth = 0; depth < n; depth++) {
      const ref = paths[0]![depth]!;
      const same = paths.slice(1).every((p) => p![depth] === ref);
      if (same) mrca = ref;
      if (ref !== mrca) break;
    }
    return mrca;
  }

  /** The number of leaves. */
  countTerminals(): number { let n = 0; for (const _ of this.findClades(null, { terminal: true })) n++; return n; }

  /** Depth of every clade, by cumulative branch length (or by number of branches with `unitBranchLengths`). */
  depths(unitBranchLengths = false): Map<Clade, number> {
    const depthOf = (c: Clade): number => (unitBranchLengths ? 1 : orZero(c.branchLength));
    const depths = new Map<Clade, number>();
    const update = (node: Clade, current: number): void => {
      depths.set(node, current);
      for (const child of node.clades) update(child, current + depthOf(child));
    };
    update(this.root, orZero(this.root.branchLength));
    return depths;
  }

  /** The sum of the branch lengths between two targets (or from the root to one). */
  distance(target1: Target, target2?: Target | null): number {
    if (target2 === undefined || target2 === null) {
      const path = this.getPath(target1);
      if (path === null) throw new TypeError("'NoneType' object is not iterable");
      return pySum(path.filter((n) => n.branchLength !== null).map((n) => n.branchLength as number));
    }
    const mrca = this.commonAncestor(target1, target2);
    return mrca.distance(target1) + mrca.distance(target2);
  }

  /** Whether every node below has 2 or 0 children (a tree's root may have 3). */
  isBifurcating(): boolean {
    const root = this.root;
    if (this.isTree() && root.clades.length === 3) return root.clades.every((c) => c.isBifurcating());
    if (root.clades.length === 2) return root.clades[0]!.isBifurcating() && root.clades[1]!.isBifurcating();
    return root.clades.length === 0;
  }

  /** Whether this is a `Tree` (not a `Clade`). */
  protected abstract isTree(): boolean;

  /**
   * The common ancestor of the terminals if they make up a complete subclade, otherwise false.
   *
   * @param terminals - A list of targets, or one target (more can follow).
   */
  isMonophyletic(terminals: unknown, ...more: unknown[]): Clade | false {
    const target = new Set<unknown>(combineArgs(terminals, ...more));
    let current = this.root;
    for (;;) {
      const here = new Set<unknown>(current.getTerminals());
      if (here.size === target.size && [...here].every((x) => target.has(x))) return current;
      const next = current.clades.find((sub) => { const s = new Set<unknown>(sub.getTerminals()); return [...target].every((x) => s.has(x)); });
      if (next === undefined) return false;
      current = next;
    }
  }

  /** Whether the target is a descendant of this tree. */
  isParentOf(target?: Target, kwargs: Pattern = {}): boolean { return this.getPath(target, kwargs) !== null; }

  /** Whether all direct descendants are terminal. */
  isPreterminal(): boolean {
    if (this.root.isTerminal()) return false;
    return this.root.clades.every((c) => c.isTerminal());
  }

  /** The sum of all branch lengths. */
  totalBranchLength(): number {
    const lengths: number[] = [];
    for (const node of this.findClades(null, { branchLength: true })) lengths.push(lengthOf(node.branchLength));
    return pySum(lengths);
  }

  /** Delete the target from the tree, relinking its children to its parent. @returns The parent. @throws ValueError if it is not found. */
  collapse(target?: Target, kwargs: Pattern = {}): Clade {
    const path = this.getPath(target, kwargs);
    if (path === null || path.length === 0) throw new ValueError(`couldn't collapse ${describe(target, kwargs)} in this tree`);
    const parent = path.length === 1 ? this.root : path[path.length - 2]!;
    const popped = parent.clades.splice(parent.clades.indexOf(path[path.length - 1]!), 1)[0]!;
    const extra = orZero(popped.branchLength);
    for (const child of popped.clades) if (child.branchLength !== null) child.branchLength += extra;
    parent.clades.push(...popped.clades);
    return parent;
  }

  /** Collapse every matching internal node, keeping the distances to the terminals. */
  collapseAll(target?: Target, kwargs: Pattern = {}): void {
    const matches = [...this.findClades(target, { ...kwargs, terminal: false, order: "level" })];
    if (matches.length === 0) return;
    if (matches[0] === this.root) matches.shift();
    for (const clade of matches) this.collapse(clade);
  }

  /** Sort clades in place by their number of terminals (deepest last unless `reverse`). */
  ladderize(reverse = false): void {
    const counts = new Map(this.root.clades.map((c) => [c, c.countTerminals()] as [Clade, number]));
    this.root.clades.sort((a, b) => (reverse ? counts.get(b)! - counts.get(a)! : counts.get(a)! - counts.get(b)!));
    for (const sub of this.root.clades) sub.ladderize(reverse);
  }

  /** Prune a terminal clade, collapsing the bifurcation it leaves. @returns The parent of the pruned target. */
  prune(target?: Target, kwargs: Pattern = {}): Clade {
    if ("terminal" in kwargs && kwargs["terminal"]) throw new ValueError("target must be terminal");
    const path = this.getPath(target, { ...kwargs, terminal: true });
    if (path === null || path.length === 0) throw new ValueError("can't find a matching target below this root");
    let parent = path.length === 1 ? this.root : path[path.length - 2]!;
    const idx = parent.clades.indexOf(path[path.length - 1]!);
    if (idx < 0) throw new ValueError("list.remove(x): x not in list");
    parent.clades.splice(idx, 1);
    if (parent.clades.length === 1) {
      const child = parent.clades[0]!;
      if (child.branchLength !== null) child.branchLength += orZero(parent.branchLength);
      if (path.length === 1) { parent = this.setRoot(child); }
      else {
        const grandparent = path.length < 3 ? this.root : path[path.length - 3]!;
        const index = grandparent.clades.indexOf(parent);
        grandparent.clades.splice(index, 1, child);
        parent = grandparent;
      }
    }
    return parent;
  }

  /** Replace the root (a `Tree` does; a `Clade` cannot). */
  protected abstract setRoot(clade: Clade): Clade;

  /** Add `n` new descendants named after the root's name plus an index (prefix `n` when it has none). */
  split(n = 2, branchLength = 1.0): void {
    const root = this.root;
    const baseName = root.name || "n";
    for (let i = 0; i < n; i++) {
      const clade = new (root.constructor as new (o: { name: string; branchLength: number }) => Clade)({ name: baseName + String(i), branchLength });
      root.clades.push(clade);
    }
  }
}

/** Python's `{x!r}` of a search target. */
function reprOf(t: unknown): string {
  if (t instanceof TreeElement) return t.repr();
  return pyRepr(t);
}

/** Python's `"%s" % (target or kwargs)` of a collapse target. */
function describe(target: unknown, kwargs: Pattern): string {
  if (target !== null && target !== undefined && target !== "" && !(typeof target === "object" && !(target instanceof TreeElement) && Object.keys(target as object).length === 0)) {
    return target instanceof TreeElement ? target.toString() : typeof target === "string" ? target : pyRepr(target);
  }
  return pyRepr(Object.fromEntries(Object.entries(kwargs).map(([k, v]) => [snake(k), v])));
}
