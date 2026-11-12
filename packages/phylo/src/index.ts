/**
 * @packageDocumentation
 * Phylogenetic tree handling: Newick parsing and writing, traversal, and
 * patristic distances. A tree is represented by its root {@link TreeNode}.
 */

import { BioError } from "@biolibs/core";

/** A node in a rooted tree. Leaves have an empty `children` array. */
export interface TreeNode {
  /** Node label; the empty string for unlabelled nodes. */
  name: string;
  /** Branch length to the parent, if one was given. Absent on the root. */
  length?: number;
  /** Child nodes, in input order. */
  children: TreeNode[];
}

/**
 * Parse a single Newick tree.
 *
 * Supports internal node labels, branch lengths, and single-quoted labels
 * (with `''` as an escaped quote). In unquoted labels underscores become
 * spaces, per the Newick convention. The trailing `;` is optional.
 *
 * @param text - Newick string.
 * @returns The root node.
 * @throws {@link BioError} on unbalanced parentheses, non-numeric branch
 *   lengths, or unexpected trailing input.
 *
 * @example
 * ```ts
 * const t = parseNewick("((A:0.1,B:0.2)AB:0.3,(C:0.4,D:0.5):0.6);");
 * leaves(t).map((l) => l.name); // ["A", "B", "C", "D"]
 * ```
 */
export function parseNewick(text: string): TreeNode {
  const s = text.trim();
  let pos = 0; // cursor into `s`, advanced by the helpers below

  /**
   * Read a node label starting at the cursor.
   * @param stops - Characters that terminate an unquoted label.
   */
  const readLabel = (stops: string): string => {
    let out = "";
    if (s[pos] === "'") {
      // Quoted label: read until a closing quote that is not doubled.
      pos++;
      while (pos < s.length && !(s[pos] === "'" && s[pos + 1] !== "'")) {
        if (s[pos] === "'") pos++; // skip the first of a doubled quote ('')
        out += s[pos++];
      }
      pos++; // consume the closing quote
      return out;
    }
    while (pos < s.length && !stops.includes(s[pos]!)) out += s[pos++];
    return out.trim().replace(/_/g, " ");
  };

  /** Read an optional `:length` suffix; returns undefined if none is present. */
  const readLength = (): number | undefined => {
    if (s[pos] !== ":") return undefined;
    pos++;
    const start = pos;
    while (pos < s.length && !",()();".includes(s[pos]!)) pos++;
    const v = Number(s.slice(start, pos));
    if (Number.isNaN(v)) throw new BioError(`Invalid branch length at ${start}`);
    return v;
  };

  /** Recursive-descent parse of one node: `[ '(' children ')' ] [label] [':' length]`. */
  const node = (): TreeNode => {
    const n: TreeNode = { name: "", children: [] };
    if (s[pos] === "(") {
      pos++;
      // A comma-separated list of child nodes. The do/while handles the
      // first child (no leading comma) and each subsequent one.
      do {
        if (s[pos] === ",") pos++;
        n.children.push(node());
      } while (s[pos] === ",");
      if (s[pos] !== ")") throw new BioError(`Expected ')' at ${pos}`);
      pos++;
    }
    n.name = readLabel(":,();");
    const len = readLength();
    if (len !== undefined) n.length = len;
    return n;
  };

  const root = node();
  if (s[pos] === ";") pos++;
  // Anything left over means the input was not a single well-formed tree.
  if (pos < s.length) throw new BioError(`Unexpected trailing input at ${pos}`);
  return root;
}

/**
 * Serialise a tree as a Newick string. Labels containing whitespace or
 * Newick punctuation are single-quoted.
 *
 * @param root - Root node.
 * @returns Newick text ending with `;`.
 */
export function toNewick(root: TreeNode): string {
  const rec = (n: TreeNode): string => {
    // Quote labels that would otherwise be misparsed; double any inner quotes.
    const label = /[\s:,();']/.test(n.name) ? `'${n.name.replace(/'/g, "''")}'` : n.name;
    return (
      (n.children.length ? `(${n.children.map(rec).join(",")})` : "") +
      label +
      (n.length !== undefined ? `:${n.length}` : "")
    );
  };
  return rec(root) + ";";
}

/**
 * Whether a node is a leaf (tip).
 *
 * @param n - Node to test.
 */
export const isLeaf = (n: TreeNode) => n.children.length === 0;

/**
 * Collect all leaves under a node, left to right.
 *
 * @param n - Subtree root.
 * @returns The leaf nodes (just `[n]` if `n` is itself a leaf).
 */
export function leaves(n: TreeNode): TreeNode[] {
  return isLeaf(n) ? [n] : n.children.flatMap(leaves);
}

/**
 * Pre-order traversal: each node is visited before its children.
 *
 * @param n - Subtree root.
 * @yields Every node in the subtree, including `n`.
 */
export function* walk(n: TreeNode): Generator<TreeNode> {
  yield n;
  for (const c of n.children) yield* walk(c);
}

/**
 * Find the path from the root to the first node with the given name
 * (depth-first order).
 *
 * @param root - Tree root.
 * @param name - Node name to look for.
 * @returns Nodes from `root` down to the match, or `null` if no node matches.
 */
export function pathTo(root: TreeNode, name: string): TreeNode[] | null {
  if (root.name === name) return [root];
  for (const c of root.children) {
    const p = pathTo(c, name);
    if (p) return [root, ...p];
  }
  return null;
}

/**
 * Patristic distance: the sum of branch lengths along the path between two
 * named nodes. Missing branch lengths count as 0. Node names are assumed
 * unique; the first match in depth-first order is used.
 *
 * @param root - Tree root.
 * @param a - Name of the first node.
 * @param b - Name of the second node.
 * @returns The distance (0 if `a` and `b` are the same node).
 * @throws {@link BioError} if either name is not found.
 *
 * @example
 * ```ts
 * distance(t, "A", "B"); // 0.3
 * ```
 */
export function distance(root: TreeNode, a: string, b: string): number {
  const pa = pathTo(root, a), pb = pathTo(root, b);
  if (!pa || !pb) throw new BioError(`Node not found: ${!pa ? a : b}`);
  // Both paths start at the root; the shared prefix ends at the last common
  // ancestor. `i` becomes the index of the first node that differs.
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  // Each branch length belongs to the edge above its node, so summing the
  // nodes *after* the common prefix counts exactly the edges on the path.
  const sum = (p: TreeNode[]) => p.slice(i).reduce((t, n) => t + (n.length ?? 0), 0);
  return sum(pa) + sum(pb);
}

/**
 * Sum of all branch lengths in the tree.
 *
 * @param root - Tree root.
 * @returns Total branch length; missing lengths count as 0.
 */
export function totalBranchLength(root: TreeNode): number {
  let t = 0;
  for (const n of walk(root)) t += n.length ?? 0;
  return t;
}
