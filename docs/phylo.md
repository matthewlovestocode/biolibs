# @biolibs/phylo

`Bio.Phylo`: phylogenetic trees. This package replaces the earlier string-based scaffold (`TreeNode`, `parseNewick`) with a port of Biopython's classes, verified against Biopython 1.88 on about 800 cases (about 3,000 method calls, with the tree checked after each one). Ported: `BaseTree` (`Tree`, `Clade`, `TreeMixin`, `TreeElement`, `BranchColor`), the Newick `Tree`/`Clade` classes (exported as `Newick.Tree` and `Newick.Clade`), the Newick `Parser` and `Writer`, the nexus reader and writer, and `parse`, `read`, `write` and `convert`. Not ported yet: PhyloXML, NeXML, CDAO, `Consensus`, `TreeConstruction`, drawing, and `Tree.randomized` (it uses Python's `random`).

## Reading and writing

```ts
import { read, parse, write } from "@biolibs/phylo";

const tree = read("((A:0.1,B:0.2)90:0.3,(C:0.4,D:0.5):0.6);", "newick");
tree.getTerminals().map((c) => c.name);        // ["A", "B", "C", "D"]
let out = "";
write(tree, { write: (s) => { out += s; } }, "newick");   // "((A:0.1,B:0.2)90:0.3,(C:0.4,D:0.5):0.6);\n"
```

`parse(text, format, options)` yields each tree (even for one tree), `read` returns the only tree (`ValueError` for none or several), `write(trees, target, format, options)` writes to anything with `write(text)` and returns the number of trees, and `convert` does both. Formats: `"newick"` and `"nexus"`; an unknown name is a `KeyError`. Options use camel case: `valuesAreConfidence`, `commentsAreConfidence`, `rooted` for the Newick reader; `plain`, `confidenceAsBranchLength`, `branchLengthOnly`, `plainNewick`, `ladderize`, `maxConfidence`, `formatConfidence`, `formatBranchLength` for the writer (the two formats are Python `%` strings such as `"%1.2f"`).

Integer-valued numbers are `int` in Python and float in Python too, which JavaScript cannot tell apart; branch lengths are always floats, and a support value that is a whole float (such as `1.0` or the `90` of a Nexus tree) is a `PyFloat` from `@biolibs/core`, while a plain integer (the `90` of `(A,B)90`) is a JavaScript number.

## Searching

Attribute names are camel case (`branchLength`, not `branch_length`). `findClades`, `findElements` and `findAny` take a target and options, as in Python:

| Python | TypeScript |
|---|---|
| `tree.find_clades(target, terminal, order, **kw)` | `tree.findClades(target, { terminal, order, ...patterns })` (a generator) |
| `tree.find_any(...)`, `find_elements(...)` | `findAny(...)` (null if none), `findElements(...)` |
| `get_path`, `trace`, `common_ancestor`, `is_monophyletic`, `distance`, `depths` | `getPath`, `trace`, `commonAncestor`, `isMonophyletic`, `distance`, `depths` (a `Map` of clade to depth) |
| `get_terminals`, `get_nonterminals`, `count_terminals`, `total_branch_length`, `is_bifurcating`, `is_preterminal`, `is_parent_of` | the same in camel case |
| `collapse`, `collapse_all`, `prune`, `split`, `ladderize` | `collapse`, `collapseAll`, `prune`, `split`, `ladderize` |
| `root_with_outgroup(targets..., outgroup_branch_length=x)`, `root_at_midpoint()` | `rootWithOutgroup(targets..., { outgroupBranchLength: x })`, `rootAtMidpoint()` |

A target is a clade (matched by identity), a class (`instanceof`), a string (the clade's name), a plain object of attribute patterns (strings are whole-string regular expressions, integers compare, booleans compare truthiness, `null` means "is None"; like Biopython, only the first key is tested, and a float pattern is a `TypeError`) or a function (which counts as a non-match when it throws a `TypeError`, `ValueError`, `IndexError`, `KeyError` or `AttributeError`). `commonAncestor`, `isMonophyletic` and `rootWithOutgroup` take either one list or separate targets. A clade is indexed with `clade.get(index)` (an integer, a `{ start, stop, step }` slice or a path of integers), has `length` and can be iterated; `clade.color = "red" | "#ff0000" | [255, 0, 0] | new BranchColor(...)`.

`str(tree)` and `repr` are `tree.toString()` and `tree.repr()`; `tree.format("newick")` writes the tree in a format. As in Biopython, a search whose pattern raises (such as a float) leaves the clade it was testing without its `clades`; the port does not reproduce that corrupted state.
