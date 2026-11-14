# @biolibs/phylo

`Bio.Phylo`: phylogenetic trees. All **489 items** are at parity, verified against Biopython 1.88 on
**3,329 recorded cases**: 806 tree cases (driving some 3,000 method calls, with the whole tree compared
after each one), 1,130 phyloXML cases, 956 consensus cases, 418 tree-construction cases and 19 dN/dS
matrices.

Ported: `BaseTree` (`Tree`, `Clade`, `TreeMixin`, `TreeElement`, `BranchColor`), the Newick `Tree`/`Clade`
classes (exported as `Newick.Tree` and `Newick.Clade`), the Newick `Parser` and `Writer`, the nexus reader
and writer, `parse`/`read`/`write`/`convert`, `Consensus`, `TreeConstruction`, `PhyloXML` and
`PhyloXMLIO`. Not ported: NeXML, CDAO, drawing (`draw` and `draw_ascii` need matplotlib), and what uses
Python's `random` — `Tree.randomized` and the three bootstrap functions.

See [the package README](../packages/phylo/README.md) for the API with worked examples.

## Reading and writing

```ts
import { read, parse, write } from "@biolibs/phylo";

const tree = read("((A:0.1,B:0.2)90:0.3,(C:0.4,D:0.5):0.6);", "newick");
tree.getTerminals().map((c) => c.name);        // ["A", "B", "C", "D"]
let out = "";
write(tree, { write: (s) => { out += s; } }, "newick");
// out === "((A:0.1,B:0.2)90.00:0.3,(C:0.4,D:0.5):0.6):0;\n"
```

Reading and writing is **not** a round trip, in this port or in Biopython: the Newick writer formats a
confidence with `"%1.2f"` by default, so `90` comes back as `90.00`, and it always writes a root branch
length, so the tree gains a trailing `:0`. Pass `formatConfidence` or `plain` for something else.

`parse(text, format, options)` yields each tree (even for one tree), `read` returns the only tree (`ValueError` for none or several), `write(trees, target, format, options)` writes to anything with `write(text)` and returns the number of trees, and `convert` does both. Formats: `"newick"`, `"nexus"` and `"phyloxml"`; an unknown name is a `KeyError`. Options use camel case: `valuesAreConfidence`, `commentsAreConfidence`, `rooted` for the Newick reader; `plain`, `confidenceAsBranchLength`, `branchLengthOnly`, `plainNewick`, `ladderize`, `maxConfidence`, `formatConfidence`, `formatBranchLength` for the writer (the two formats are Python `%` strings such as `"%1.2f"`).

Integer-valued numbers are `int` in Python and float in Python too, which JavaScript cannot tell apart; branch lengths are always floats, and a support value that is a whole float (such as `1.0` or the `90` of a Nexus tree) is a `PyFloat` from `@biolibs/core`, while a plain integer (the `90` of `(A,B)90`) is a JavaScript number.

## PhyloXML

```ts
import { PhyloXML, PhyloXMLIO, read } from "@biolibs/phylo";

const doc = PhyloXMLIO.read(xmlText);               // a Phyloxml: doc.phylogenies, doc.other, doc.attributes
const tree = read(xmlText, "phyloxml");             // the first (only) Phylogeny
tree.root.taxonomies[0]?.scientificName;
tree.root.confidence;                               // the only Confidence (TypeError when there are several)
const phy = newickTree.asPhyloxml();                // add phyloXML annotations to a Newick tree
let out = "";
PhyloXMLIO.write([phy], { write: (s) => { out += s; } });   // indented XML, namespace prefix "phy" registered
```

`PhyloXML` holds the element classes under their Biopython names (`Phyloxml`, `Phylogeny`, `Clade`, `Sequence`, `Taxonomy`, `Confidence`, `Events`, `Date`, `Point`, `Property`, `Annotation`, ...). Constructors take an options object in camel case (`new PhyloXML.Taxonomy({ scientificName: "Homo sapiens" })`); `_check_str` warnings are emitted as `PhyloXMLWarning`. Floats that Python reads from the XML are `PyFloat`s, so a whole value such as `2.0` is shown and written as a float. `PhyloXMLIO.read` and `parse` follow Biopython's incremental reader exactly, including its odd cases (a `Misidentified tag` error for a date directly under a phylogeny, an `IndexError` for a foreign element inside a clade, `float()` and `int()` errors for bad text) and the `ParseError` messages of `ElementTree`. `PhyloXMLIO.write` takes a `Phyloxml` or an iterable of trees and clades (a single tree is an error, as in Biopython). `Sequence.fromSeqrecord`/`toSeqrecord`, `ProteinDomain.fromSeqfeature`/`toSeqfeature` and `Phylogeny.toAlignment()`/`alignment` convert to and from `SeqRecord`s and alignments; Python dictionaries in a record's annotations are `Map`s. `Events` also works like a dictionary (`keys()`, `items()`, `get(key)`, `set(key, value)`, `delete(key)`, `has(key)`).

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

## Consensus

`Consensus.strictConsensus(trees)`, `Consensus.majorityConsensus(trees, cutoff = 0)`, `Consensus.adamConsensus(trees)`, `Consensus.getSupport(targetTree, trees, lenTrees?)` and `Consensus.equalTopology(tree1, tree2)` return trees of the base classes; `Consensus.BitString` is Biopython's `_BitString`. An empty list of trees raises a `StopIteration` error as in Python. Support values that are whole floats are `PyFloat`s. Adam consensus depends on the iteration order of Python sets of clade objects, which hash by address, so the order of the children of a clade can differ from Biopython's -- and from one Biopython run to the next. Only the order moves, never the topology, so the golden cases record those trees with every clade's children sorted and the test compares them the same way. `bootstrap`, `bootstrap_trees` and `bootstrap_consensus` use Python's random number generator and are not ported.

## TreeConstruction

`TreeConstruction.calculateDnDsMatrix(alignment, method, codonTable)` (Biopython's `Bio.Align.analysis.calculate_dn_ds_matrix`, which lives here because it returns distance matrices) gives the pairwise dN and dS matrices. `TreeConstruction.DistanceMatrix` and `TreeConstruction.Matrix` (Biopython's `_Matrix`) hold names and a lower triangular list; `get(i)`, `get([i, j])`, `set`, `delete`, `insert`, `repr()`, `toString()` and `formatPhylip(target)` follow `m[i]`, `m[i, j]`, `m[i] = v`, `del m[i]`, `insert`, `repr`, `str` and `format_phylip`. Values are JavaScript numbers (`int` when whole) or `PyFloat` (a whole float such as `1.0`), so `repr()` matches Python's. `DistanceCalculator(model, skipLetters)` gives a `DistanceMatrix` for an `Alignment` or `MultipleSeqAlignment` (`DistanceCalculator.models` lists the model names); `DistanceTreeConstructor(calculator, method)` has `upgma`, `nj` and `buildTree`; `ParsimonyScorer(matrix)`, `NNITreeSearcher(scorer)` and `ParsimonyTreeConstructor(searcher, startingTree)` do parsimony. As in Biopython, `ParsimonyScorer.getScore` roots an unrooted tree at its midpoint and sorts the alignment in place, and the constructed trees give the root clade the integer branch length 0 (use `clade.setIntBranchLength(0)` for the same).
