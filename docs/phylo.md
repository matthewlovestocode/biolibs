# @biolibs/phylo

Phylogenetic tree handling, equivalent to a small slice of Biopython's `Bio.Phylo`. Currently Newick only.

## Data model

```ts
interface TreeNode {
  name: string;         // "" for unlabelled nodes
  length?: number;      // branch length to parent, if given
  children: TreeNode[]; // empty for leaves
}
```

A tree is just its root `TreeNode`. Nodes are plain objects, so you can build or edit trees directly.

## Newick I/O

### `parseNewick(text): TreeNode`
Parses a single Newick tree. Supports internal node labels, branch lengths, quoted labels (`'a b'`, with `''` as an escaped quote), and unquoted underscores (converted to spaces, per Newick convention). The trailing `;` is optional. Throws `BioError` on unbalanced parentheses, invalid lengths, or trailing garbage.

### `toNewick(root): string`
Serialises to Newick, quoting labels that need it, ending with `;`.

```ts
const t = parseNewick("((A:0.1,B:0.2)AB:0.3,(C:0.4,D:0.5):0.6);");
toNewick(t); // round-trips to the same string
```

## Traversal

### `leaves(node): TreeNode[]`
### `isLeaf(node): boolean`
### `walk(node): Generator<TreeNode>`
Pre-order traversal of all nodes.

### `pathTo(root, name): TreeNode[] | null`
Nodes from the root to the first node with that name (depth-first), or `null`.

## Distances

### `distance(root, a, b): number`
Patristic distance: the sum of branch lengths on the path between the nodes named `a` and `b` through their last common ancestor. Missing lengths count as 0. Throws `BioError` if either name isn't found.

### `totalBranchLength(root): number`

```ts
distance(t, "A", "B"); // 0.3
distance(t, "A", "C"); // 0.1 + 0.3 + 0.6 + 0.4 = 1.4
```

## Not yet supported

Tree construction (neighbor-joining, UPGMA), NEXUS/PhyloXML, rooting and rerooting, tree drawing, multiple trees per file. Node names are assumed unique for `pathTo` and `distance`.
