/** Phylogenetic trees as read from NEXUS files (a port of Biopython's `Bio.Nexus.Trees`). */

import { AssertionError, IndexError, ValueError, pyFloat, pyFloatRepr, pyFormatFixed, pyStrip } from "@biolibs/core";
import { Chain, Node } from "./nodes.js";
import { TreeError } from "./errors.js";

const NODECOMMENT_START = "[&";
const NODECOMMENT_END = "]";
/** Splits a tree description at node comments, parentheses and commas, keeping the delimiters. */
const BLOCK_DELIMITERS = /(\[&|\]|[(),])/;

/** A value in a branch description: a name, a number, a node comment, or null. */
export type TreeValue = string | number | null;
/** Parsed branch information: the child clades or a leaf name, and the values after them. */
type Parsed = [Parsed[] | string, TreeValue[] | null];

/** What a tree node holds: taxon, branch length, support and a comment. */
export class NodeData {
  /** @param taxon - Leaf name. @param branchlength - Length of the branch to the parent. @param support - Support value. @param comment - Node comment. */
  constructor(public taxon: string | null = null, public branchlength: number | null = 0.0, public support: number | null = null, public comment: string | null = null) {}
}

/** Constructor of node data. */
export type NodeDataClass = new () => NodeData;

/** Options for {@link Tree.toString}. */
export interface ToStringOptions {
  supportAsBranchlengths?: boolean;
  branchlengthsOnly?: boolean;
  plain?: boolean;
  plainNewick?: boolean;
  ladderize?: string | null;
  ignoreComments?: boolean;
}

/** Python's `round(x, 3)` for a float. */
const round3 = (x: number): number => Number(pyFormatFixed(x, 3));

/**
 * A tree: a chain of nodes with a root, a name, a weight and rooted/unrooted flag. Built from a Newick description.
 *
 * @example
 * ```ts
 * const t = new Tree("((A:1,B:2):0.5,C:3);");
 * t.getTaxa();   // ["A", "B", "C"]
 * ```
 * @throws {@link TreeError} for unbalanced parentheses or a node comment without its closing bracket.
 */
export class Tree extends Chain<NodeData> {
  dataclass: NodeDataClass;
  maxSupport: number;
  weight: number;
  rooted: boolean;
  name: string;
  root: number;
  private readonly valuesAreSupport: boolean;
  /** Branches `[from, to, branchlength, support]` recorded by {@link Tree.unroot}. */
  unrooted: [number, number, number | null, number | null][] = [];

  /**
   * @param tree - Newick text (or null for a single empty root).
   * @param weight - Weight of the tree. @param rooted - Whether the tree is rooted. @param name - Tree name.
   * @param data - Class used for node data. @param valuesAreSupport - Treat single values as support, not branch length.
   * @param maxSupport - Support assigned to terminal nodes when written with support as branch lengths.
   */
  constructor(tree: string | null = null, weight = 1.0, rooted = false, name = "", data: NodeDataClass = NodeData, valuesAreSupport = false, maxSupport = 1.0) {
    super();
    this.dataclass = data;
    this.valuesAreSupport = valuesAreSupport;
    this.maxSupport = maxSupport;
    this.weight = weight;
    this.rooted = rooted;
    this.name = name;
    const root = new Node<NodeData>(new data());
    this.root = this.add(root);
    if (tree) {
      tree = pyStrip(tree).replaceAll("\n", "").replaceAll("\r", "").replace(/;+$/, "");
      const [subtreeInfo, baseInfo] = this.parse(tree);
      root.data = this.addNodedata(root.data!, [[], baseInfo]);
      this.addSubtree(root.id, subtreeInfo as Parsed[]);
    }
  }

  /** Split a (sub)tree description into its clades and values. */
  private parse(tree: string): Parsed {
    tree = pyStrip(tree);
    const count = (ch: string): number => tree.split(ch).length - 1;
    if (count("(") !== count(")")) throw new TreeError("Parentheses do not match in (sub)tree: " + tree);
    if (count("(") === 0) {
      const nodecomment = tree.indexOf(NODECOMMENT_START);
      const colon = tree.indexOf(":");
      let branch: string;
      let comment: TreeValue[] | null;
      if (colon === -1 && nodecomment === -1) [branch, comment] = [tree, [null]];
      else if (colon === -1 && nodecomment > -1) [branch, comment] = [tree.slice(0, nodecomment), this.getValues(tree.slice(nodecomment))];
      else if (colon > -1 && nodecomment === -1) [branch, comment] = [tree.slice(0, colon), this.getValues(tree.slice(colon + 1))];
      else if (colon < nodecomment) [branch, comment] = [tree.slice(0, colon), this.getValues(tree.slice(colon + 1))];
      else [branch, comment] = [tree.slice(0, nodecomment), this.getValues(tree.slice(nodecomment))];
      return [branch, comment];
    }
    const closing = tree.lastIndexOf(")");
    let val = this.getValues(tree.slice(closing + 1));
    if (!val || val.length === 0) val = [null];
    const subtrees: string[] = [];
    let plevel = 0;
    let prev = 1;
    let incomment = false;
    const blocks = tree.slice(1, closing).split(BLOCK_DELIMITERS);
    blocks.forEach((blk, idx) => {
      if (!incomment) {
        if (blk === "(") plevel += 1;
        else if (blk === ")") plevel -= 1;
        else if (blk === NODECOMMENT_START) incomment = true;
        else if (blk === "," && plevel === 0) {
          const p = blocks.slice(0, idx + 1).reduce((n, b) => n + b.length, 0);
          subtrees.push(tree.slice(prev, p));
          prev = p + 1;
        }
      } else if (blk === NODECOMMENT_END) {
        incomment = false;
      }
    });
    subtrees.push(tree.slice(prev, closing));
    return [subtrees.map((st) => this.parse(st)), val];
  }

  /** Add the clades below a node. */
  private addSubtree(parentId: number | null, tree: Parsed[] | null): void {
    if (parentId === null) throw new TreeError("Need node_id to connect to.");
    // A tree that is a single taxon parses to a bare string; Python then iterates its characters and indexes into a
    // one-character string.
    if (typeof tree === "string" && (tree as string).length > 0) throw new IndexError("string index out of range");
    for (const st of tree!) {
      let nd = new this.dataclass();
      nd = this.addNodedata(nd, st);
      if (Array.isArray(st[0])) {
        const sn = new Node<NodeData>(nd);
        this.add(sn, parentId);
        this.addSubtree(sn.id, st[0]);
      } else {
        nd.taxon = st[0];
        this.add(new Node<NodeData>(nd), parentId);
      }
    }
  }

  /** Put taxon, comment, support and branch length from parsed values into node data. */
  private addNodedata(nd: NodeData, st: Parsed | [never[], TreeValue[] | null]): NodeData {
    const values = st[1] as TreeValue[] | null;
    if (values === null) throw new TypeError("'NoneType' object is not subscriptable");
    if (values.length === 0) throw new IndexError("list index out of range");
    const last = values[values.length - 1];
    if (typeof last === "string" && last.startsWith(NODECOMMENT_START)) {
      nd.comment = values.pop() as string;
    } else if (typeof values[0] === "string") {
      nd.taxon = values[0];
      st[1] = values.slice(1);
    }
    const v = st[1] as TreeValue[];
    if (v.length >= 2) {
      nd.support = v[0] as number;
      if (v[1] !== null) nd.branchlength = v[1] as number;
    } else if (v.length === 1) {
      if (!this.valuesAreSupport) {
        if (v[0] !== null) nd.branchlength = v[0] as number;
      } else {
        nd.support = v[0] as number;
      }
    }
    return nd;
  }

  /** Read the numbers, taxonomy text and node comment from the text after a node. */
  private getValues(text: string): TreeValue[] | null {
    if (text === "") return null;
    let nodecomment: string | null = null;
    if (text.includes(NODECOMMENT_START)) {
      const start = text.indexOf(NODECOMMENT_START);
      const end = text.indexOf(NODECOMMENT_END);
      if (end === -1) throw new TreeError(`Error in tree description: Found ${NODECOMMENT_START} without matching ${NODECOMMENT_END}`);
      nodecomment = text.slice(start, end + 1);
      text = text.slice(0, start) + text.slice(end + 1);
    }
    const values: TreeValue[] = [];
    let taxonomy: string | null = null;
    for (const raw of text.split(":")) {
      const part = pyStrip(raw);
      if (part) {
        try {
          values.push(pyFloat(part));
        } catch (e) {
          if (!(e instanceof ValueError)) throw e;
          if (taxonomy !== null) throw new AssertionError("Two string taxonomies?");
          taxonomy = part;
        }
      }
    }
    if (taxonomy) values.unshift(taxonomy);
    if (nodecomment) values.push(nodecomment);
    return values;
  }

  /** Ids of all nodes below `node` (default the root), depth first. */
  walk(node: number | null = null): number[] {
    if (node === null) node = this.root;
    const out: number[] = [];
    for (const n of this.node(node).succ) {
      out.push(n);
      out.push(...this.walk(n));
    }
    return out;
  }

  /** The node with this id. @throws {@link TreeError} for an unknown id. */
  node(nodeId: number): Node<NodeData> {
    const n = this.chain.get(nodeId);
    if (n === undefined) throw new TreeError(`Unknown node_id: ${nodeId}`);
    return n;
  }

  /** Split a node into `n` children with the given branch length; returns their ids. */
  split(parentId: number | null = null, n = 2, branchlength = 1.0): number[] {
    if (parentId === null) throw new TreeError("Missing node_id.");
    const ids: number[] = [];
    const parentData = this.chain.get(parentId)!.data;
    for (let i = 0; i < n; i++) {
      const node = new Node<NodeData>();
      if (parentData) {
        node.data = new this.dataclass();
        if (parentData.taxon) node.data.taxon = parentData.taxon + String(i);
        node.data.branchlength = branchlength;
      }
      ids.push(this.add(node, parentId));
    }
    return ids;
  }

  /** Id of the node with this taxon, or null. */
  searchTaxon(taxon: string): number | null {
    for (const [id, node] of this.chain) if (node.data!.taxon === taxon) return id;
    return null;
  }

  /** Remove a terminal taxon; returns its former parent's id. @throws {@link TreeError} for an unknown or non-terminal taxon. */
  prune(taxon: string): number {
    const id = this.searchTaxon(taxon);
    if (id === null) throw new TreeError(`Taxon not found: ${taxon}`);
    if (!this.getTerminals().includes(id)) throw new TreeError(`Not a terminal taxon: ${taxon}`);
    const prev = this.unlink(id)!;
    this.kill(id);
    if (this.node(prev).succ.length === 1) {
      if (prev === this.root) {
        this.root = this.node(this.root).succ[0]!;
        (this.node(this.root) as unknown as { branchlength: number }).branchlength = 0.0;
        this.kill(prev);
      } else {
        const succ = this.node(prev).succ[0]!;
        const newBl = this.node(prev).data!.branchlength! + this.node(succ).data!.branchlength!;
        this.collapse(prev);
        this.node(succ).data!.branchlength = newBl;
      }
    }
    return prev;
  }

  /** Taxa below a node (default the root); null for a data-less leaf. */
  getTaxa(nodeId: number | null = null): (string | null)[] | null {
    if (nodeId === null) nodeId = this.root;
    if (!this.chain.has(nodeId)) throw new TreeError(`Unknown node_id: ${nodeId}.`);
    const n = this.chain.get(nodeId)!;
    if (n.succ.length === 0) return n.data ? [n.data.taxon] : null;
    return n.succ.flatMap((s) => {
      const t = this.getTaxa(s);
      if (t === null) throw new TypeError("'NoneType' object is not iterable");
      return t;
    });
  }

  /** Ids of the leaves. */
  getTerminals(): number[] {
    return this.allIds().filter((i) => this.node(i).succ.length === 0);
  }

  isTerminal(node: number): boolean { return this.node(node).succ.length === 0; }
  isInternal(node: number): boolean { return this.node(node).succ.length > 0; }

  /**
   * Whether all children are leaves. Biopython's test is inverted (a quirk kept here): it is true for a *leaf*, which has
   * no children, and false for every internal node, including real pre-terminal ones.
   */
  isPreterminal(node: number): boolean {
    if (this.isTerminal(node)) return !this.node(node).succ.map((n) => this.isTerminal(n)).includes(false);
    return false;
  }

  /** Number of leaves below a node (default the root). */
  countTerminals(node: number | null = null): number {
    if (node === null) node = this.root;
    return this.walk(node).filter((n) => this.isTerminal(n)).length;
  }

  /** Collapse clades whose taxa all share the first word (genus) of their names. */
  collapseGenera(spaceEqualsUnderscore = true): void {
    for (;;) {
      let collapsed = false;
      for (const n of this.walk()) {
        if (this.isTerminal(n)) continue;
        const genera: string[] = [];
        for (let t of this.getTaxa(n)!) {
          if (spaceEqualsUnderscore) t = t!.replaceAll(" ", "_");
          const genus = t!.split("_")[0]!;
          if (!genera.includes(genus)) genera.push(genus);
        }
        if (genera.length === 1) {
          this.node(n).data!.taxon = genera[0] + " <collapsed>";
          for (const kn of this.walk(n)) this.kill(kn);
          this.node(n).succ = [];
          collapsed = true;
          break;
        }
      }
      if (!collapsed) break;
    }
  }

  /** Sum of branch lengths from `node` up to `root`. */
  sumBranchlength(root: number | null = null, node: number | null = null): number {
    if (root === null) root = this.root;
    if (node === null) throw new TreeError("Missing node id.");
    let blen = 0.0;
    let cur: number | null = node;
    while (cur !== null && cur !== root) {
      blen += this.node(cur).data!.branchlength!;
      cur = this.node(cur).prev;
    }
    return blen;
  }

  /** A canonical key for the set structure of the subtree below a node (Biopython's nested frozensets). */
  private subtreeKey(node: number): string {
    if (this.node(node).succ.length === 0) return `L:${JSON.stringify(this.node(node).data!.taxon)}`;
    return `S[${[...new Set(this.node(node).succ.map((n) => this.subtreeKey(n)))].sort().join(",")}]`;
  }

  /**
   * The subtree as nested sets of taxa (Biopython's nested frozensets): a terminal gives its taxon, an internal node the
   * set of its children's values. Equal child subtrees collapse into one, as in a Python set; those are the same
   * `Set` instance only when built here, so compare with {@link Tree.isIdentical}.
   */
  setSubtree(node: number): string | null | Set<unknown> {
    if (this.node(node).succ.length === 0) return this.node(node).data!.taxon;
    const byKey = new Map<string, unknown>();
    for (const n of this.node(node).succ) {
      const key = this.subtreeKey(n);
      if (!byKey.has(key)) byKey.set(key, this.setSubtree(n));
    }
    return new Set(byKey.values());
  }

  /** Whether two trees have the same topology and taxa. */
  isIdentical(tree2: Tree): boolean {
    return this.subtreeKey(this.root) === tree2.subtreeKey(tree2.root);
  }

  /**
   * Find the clades of two trees that conflict, looking only at clades with support of at least `threshold`.
   *
   * Biopython also prints which taxa are missing before failing under `strict`; this port does not print.
   *
   * @param strict - Require both trees to hold the same taxa.
   * @returns One `[clade1, support1, clade2, support2, shared, only2, only1]` entry per conflict.
   * @throws {@link TreeError} if `strict` and the taxa differ.
   */
  isCompatible(tree2: Tree, threshold: number, strict = true): [Set<string | null>, number, Set<string | null>, number, Set<string | null>, Set<string | null>, Set<string | null>][] {
    const taxa1 = new Set(this.getTaxa());
    const taxa2 = new Set(tree2.getTaxa());
    const missing2 = new Set([...taxa1].filter((t) => !taxa2.has(t)));
    const missing1 = new Set([...taxa2].filter((t) => !taxa1.has(t)));
    if (strict && (missing1.size > 0 || missing2.size > 0)) throw new TreeError("Can't compare trees with different taxon compositions.");
    const clades = (tree: Tree): [Set<string | null>, number][] => tree.allIds()
      .filter((n) => {
        const node = tree.node(n);
        return node.succ.length > 0 && !!node.data && !!node.data.support && node.data.support >= threshold;
      })
      .map((n) => [new Set(tree.getTaxa(n)), tree.node(n).data!.support!]);
    const subset = (a: Set<string | null>, b: Set<string | null>): boolean => [...a].every((x) => b.has(x));
    const conflict: [Set<string | null>, number, Set<string | null>, number, Set<string | null>, Set<string | null>, Set<string | null>][] = [];
    for (const [st1, sup1] of clades(this)) {
      for (const [st2, sup2] of clades(tree2)) {
        if (!subset(st1, st2) && !subset(st2, st1)) {
          const intersect = new Set([...st1].filter((x) => st2.has(x)));
          const notin1 = new Set([...st2].filter((x) => !st1.has(x)));
          const notin2 = new Set([...st1].filter((x) => !st2.has(x)));
          if (intersect.size > 0 && !(subset(notin1, missing1) || subset(notin2, missing2))) conflict.push([st1, sup1, st2, sup2, intersect, notin1, notin2]);
        }
      }
    }
    return conflict;
  }

  /** Last node shared by the paths from the root to two nodes. */
  commonAncestor(node1: number, node2: number): number {
    const l1 = [this.root, ...(this.trace(this.root, node1) ?? [])];
    const l2 = [this.root, ...(this.trace(this.root, node2) ?? [])];
    const common = l1.filter((n) => l2.includes(n));
    return common[common.length - 1]!;
  }

  /** Branch-length distance between two nodes. */
  distance(node1: number, node2: number): number {
    const ca = this.commonAncestor(node1, node2);
    return this.sumBranchlength(ca, node1) + this.sumBranchlength(ca, node2);
  }

  /** Id of the node whose clade has exactly these taxa, or -1. */
  isMonophyletic(taxonList: (string | null)[]): number {
    const taxonSet = new Set(taxonList);
    let nodeId = this.root;
    for (;;) {
      const sub = new Set(this.getTaxa(nodeId)!);
      if (sub.size === taxonSet.size && [...sub].every((t) => taxonSet.has(t))) return nodeId;
      let next: number | null = null;
      for (const subnode of this.chain.get(nodeId)!.succ) {
        const st = new Set(this.getTaxa(subnode)!);
        if ([...taxonSet].every((t) => st.has(t))) {
          next = subnode;
          break;
        }
      }
      if (next === null) return -1;
      nodeId = next;
    }
  }

  /** Whether every internal node has two children (three at the root). */
  isBifurcating(node: number | null = null): boolean {
    if (node === null) node = this.root;
    const succ = this.node(node).succ;
    if (node === this.root && succ.length === 3) return this.isBifurcating(succ[0]!) && this.isBifurcating(succ[1]!) && this.isBifurcating(succ[2]!);
    if (succ.length === 2) return this.isBifurcating(succ[0]!) && this.isBifurcating(succ[1]!);
    return succ.length === 0;
  }

  /** Move branch lengths into support values. */
  branchlength2support(): void {
    for (const n of this.chain.keys()) {
      this.node(n).data!.support = this.node(n).data!.branchlength;
      this.node(n).data!.branchlength = 0.0;
    }
  }

  /** Divide support values by a number of replicates. */
  convertAbsoluteSupport(nrep: number): void {
    for (const n of this.walk()) if (this.node(n).data!.support) this.node(n).data!.support = this.node(n).data!.support! / nrep;
  }

  /** Whether any node below `node` has support. */
  hasSupport(node: number | null = null): boolean {
    for (const n of this.walk(node)) if (this.node(n).data!.support) return true;
    return false;
  }

  /** Make the tree unrooted: record all branches, joining the two branches at a bifurcating root into one. */
  unroot(): void {
    const getBranches = (node: number): [number, number, number | null, number | null][] => {
      const branches: [number, number, number | null, number | null][] = [];
      for (const b of this.node(node).succ) {
        branches.push([node, b, this.node(b).data!.branchlength, this.node(b).data!.support]);
        branches.push(...getBranches(b));
      }
      return branches;
    };
    this.unrooted = getBranches(this.root);
    if (this.node(this.root).succ.length === 2) {
      const rootbranches = this.unrooted.filter((b) => b[0] === this.root || b[1] === this.root);
      const b1 = this.unrooted.splice(this.unrooted.indexOf(rootbranches[0]!), 1)[0]!;
      const b2 = this.unrooted.splice(this.unrooted.indexOf(rootbranches[1]!), 1)[0]!;
      const joined: number | null = b1[3] === null ? b2[3] : b2[3] === null ? b1[3] : b1[3] === b2[3] ? b1[3] : b1[3] === 0 || b2[3] === 0 ? b1[3] + b2[3] : undefined as never;
      if (joined === undefined) throw new TreeError(`Support mismatch in bifurcating root: ${pyFormatFixed(b1[3]!, 6)}, ${pyFormatFixed(b2[3]!, 6)}`);
      this.unrooted.push([b1[1], b2[1], b1[2]! + b2[2]!, joined]);
    }
  }

  /** Re-root the tree on the branch leading to a monophyletic outgroup; returns the new root id (or -1 if not monophyletic). */
  rootWithOutgroup(outgroup: (string | null)[] | null = null): number {
    const connectSubtree = (parent: number, child: number): void => {
      let found = -1;
      for (let i = 0; i < this.unrooted.length; i++) {
        const branch = this.unrooted[i]!;
        const ends = [branch[0], branch[1]];
        if (ends.includes(parent) && ends.includes(child)) {
          found = i;
          break;
        }
      }
      if (found < 0) throw new TreeError(`Unable to connect nodes for rooting: nodes ${parent} and ${child} are not connected`);
      const branch = this.unrooted.splice(found, 1)[0]!;
      this.link(parent, child);
      this.node(child).data!.branchlength = branch[2];
      this.node(child).data!.support = branch[3];
      for (const b of this.unrooted.filter((x) => x[0] === child || x[1] === child)) connectSubtree(child, child === b[0] ? b[1] : b[0]);
    };
    if (outgroup === null) return this.root;
    const outgroupNode = this.isMonophyletic(outgroup);
    if (outgroupNode === -1) return -1;
    if ((this.node(this.root).succ.length === 2 && this.node(this.root).succ.includes(outgroupNode)) || outgroupNode === this.root) return this.root;
    this.unroot();
    let rootBranch: [number, number, number | null, number | null] | null = null;
    for (let i = 0; i < this.unrooted.length; i++) {
      const b = this.unrooted[i]!;
      const prev = this.node(outgroupNode).prev;
      if ((b[0] === outgroupNode || b[1] === outgroupNode) && (b[0] === prev || b[1] === prev)) {
        rootBranch = this.unrooted.splice(i, 1)[0]!;
        break;
      }
    }
    if (rootBranch === null) throw new TreeError("Unrooted and rooted Tree do not match");
    const ingroupNode = outgroupNode === rootBranch[1] ? rootBranch[0] : rootBranch[1];
    for (const n of this.allIds()) {
      this.node(n).prev = null;
      this.node(n).succ = [];
    }
    const root = new Node<NodeData>(new NodeData());
    this.add(root);
    this.root = root.id!;
    this.unrooted.push([root.id!, ingroupNode, rootBranch[2], rootBranch[3]]);
    this.unrooted.push([root.id!, outgroupNode, 0.0, 0.0]);
    connectSubtree(root.id!, ingroupNode);
    connectSubtree(root.id!, outgroupNode);
    const oldroot = this.allIds().filter((i) => this.node(i).prev === null && i !== this.root);
    if (oldroot.length > 1) throw new TreeError(`Isolated nodes in tree description: ${oldroot.join(",")}`);
    if (oldroot.length === 1) this.kill(oldroot[0]!);
    return this.root;
  }

  /** Copy support values from bootstrap trees (or a consensus tree) onto this tree's clades. */
  mergeWithSupport(bstrees: Tree[] | null = null, constree: Tree | null = null, threshold = 0.5, outgroup: (string | null)[] | null = null): void {
    if (bstrees && bstrees.length > 0 && constree) throw new TreeError("Specify either list of bootstrap trees or consensus tree, not both");
    if (!((bstrees && bstrees.length > 0) || constree)) throw new TreeError("Specify either list of bootstrap trees or consensus tree.");
    if (outgroup === null) {
      try {
        const succnodes = this.node(this.root).succ;
        const sizes = succnodes.map((n) => [this.getTaxa(n)!.length, n] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        outgroup = this.getTaxa(sizes[0]![1]);
      } catch {
        throw new TreeError("Error determining outgroup.");
      }
    } else {
      this.rootWithOutgroup(outgroup);
    }
    let cons: Tree;
    if (bstrees && bstrees.length > 0) {
      cons = consensus(bstrees, threshold, outgroup)!;
    } else {
      cons = constree!;
      if (!cons.hasSupport()) cons.branchlength2support();
      cons.rootWithOutgroup(outgroup);
    }
    for (const pnode of this.walk()) {
      const cnode = cons.isMonophyletic(this.getTaxa(pnode)!);
      if (cnode > -1) this.node(pnode).data!.support = cons.node(cnode).data!.support;
    }
  }

  /** Newick/NEXUS text for the tree; see {@link ToStringOptions}. */
  toString(options: ToStringOptions = {}): string {
    const { supportAsBranchlengths = false, branchlengthsOnly = false, plainNewick = false, ladderize = null } = options;
    let plain = options.plain ?? true;
    if (supportAsBranchlengths || branchlengthsOnly) plain = false;
    const f = (x: number | null, digits: number): string => {
      if (x === null) throw new TypeError("unsupported format string passed to NoneType.__format__");
      return pyFormatFixed(x, digits);
    };
    const info = (data: NodeData, terminal = false): string => {
      if (plain) return "";
      if (supportAsBranchlengths) return terminal ? `:${f(this.maxSupport, 2)}` : data.support ? `:${f(data.support, 2)}` : ":0.00";
      if (branchlengthsOnly) return `:${f(data.branchlength, 5)}`;
      if (terminal) return `:${f(data.branchlength, 5)}`;
      if (data.branchlength !== null && data.support !== null) return `${f(data.support, 2)}:${f(data.branchlength, 5)}`;
      if (data.branchlength !== null) return `0.00000:${f(data.branchlength, 5)}`;
      if (data.support !== null) return `${f(data.support, 2)}:0.00000`;
      // `data.nodecomment` does not exist, so Biopython's attempt to prepend a comment always fails quietly.
      return "0.00:0.00000";
    };
    const ladder = (nodes: number[], how: string | null): number[] => {
      if (how === "left" || how === "LEFT" || how === "right" || how === "RIGHT") {
        const pairs = nodes.map((n) => [this.countTerminals(n), n] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (how === "right" || how === "RIGHT") pairs.reverse();
        return pairs.map((p) => p[1]);
      }
      return nodes;
    };
    const newickize = (node: number, how: string | null): string => {
      const n = this.node(node);
      if (n.succ.length === 0) {
        if (n.data!.taxon === null) throw new TypeError("unsupported operand type(s) for +: 'NoneType' and 'str'");
        return n.data!.taxon + info(n.data!, true);
      }
      const subtrees = ladder(n.succ, how).map((sn) => newickize(sn, how));
      return `(${subtrees.join(",")})${info(n.data!)}`;
    };
    const treeline: string[] = ["tree", this.name ? this.name : "a_tree", "="];
    if (this.weight !== 1) treeline.push(`[&W${pyFloatRepr(round3(this.weight))}]`);
    if (this.rooted) treeline.push("[&R]");
    // Biopython orders the root's children with ladderize=None (a quirk), so only deeper levels are sorted.
    const subtrees = this.node(this.root).succ.map((sn) => newickize(sn, ladderize));
    treeline.push(`(${subtrees.join(",")})`);
    if (plainNewick) return treeline[treeline.length - 1]!;
    return treeline.join(" ") + ";";
  }
}

/**
 * Majority-rule consensus of trees: clades whose weighted frequency reaches `threshold`.
 *
 * @returns The consensus tree, or null for no trees.
 * @throws {@link TreeError} if the trees do not share the same taxa.
 */
export function consensus(trees: Tree[], threshold = 0.5, outgroup: (string | null)[] | null = null): Tree | null {
  const total = trees.length;
  if (total === 0) return null;
  const dataclass = trees[0]!.dataclass;
  const alltaxa = new Set(trees[0]!.getTaxa());
  const clades = new Map<string, number>();
  const cladeTaxa = new Map<string, string[]>();
  for (const t of trees) {
    const taxa = new Set(t.getTaxa());
    if (taxa.size !== alltaxa.size || ![...taxa].every((x) => alltaxa.has(x))) throw new TreeError("Trees for consensus must contain the same taxa");
    t.rootWithOutgroup(outgroup);
    for (const stNode of t.walk(t.root)) {
      const sub = [...t.getTaxa(stNode)!] as string[];
      sub.sort();
      const key = JSON.stringify(sub);
      cladeTaxa.set(key, sub);
      clades.set(key, (clades.get(key) ?? 0) + t.weight / total);
    }
  }
  for (const [c, p] of [...clades]) if (Number(pyFormatFixed(p, 3)) < threshold) clades.delete(c);
  const cons = new Tree(null, 1.0, false, `consensus_${pyFormatFixed(threshold, 1)}`, dataclass);
  const takes = new Map<number, Set<string | null>>();
  for (const [c, s] of clades) {
    const node = new Node<NodeData>(new dataclass());
    node.data!.support = s;
    const id = cons.add(node);
    takes.set(id, new Set(cladeTaxa.get(c)));
  }
  cons.node(cons.root).data!.support = null;
  takes.set(cons.root, new Set(alltaxa));
  const ids = cons.allIds().sort((a, b) => takes.get(a)!.size - takes.get(b)!.size);
  const superset = (x: Set<string | null>, y: Set<string | null>): boolean => [...y].every((v) => x.has(v));
  ids.slice(0, -1).forEach((current, i) => {
    let parent: number | null = null;
    for (const p of ids.slice(i + 1)) {
      if (superset(takes.get(p)!, takes.get(current)!)) {
        parent = p;
        break;
      }
    }
    if (parent === null) throw Object.assign(new Error("corrupt tree structure?"), { name: "SystemExit" });
    cons.node(current).data!.taxon = takes.get(current)!.size === 1 ? ([...takes.get(current)!][0] as string) : null;
    cons.link(parent, current);
  });
  cons.node(ids[ids.length - 1]!).data!.taxon = null;
  const final = new Set(cons.getTaxa());
  if (final.size !== alltaxa.size || ![...final].every((x) => alltaxa.has(x))) throw new TreeError("FATAL ERROR: consensus tree is corrupt");
  return cons;
}
