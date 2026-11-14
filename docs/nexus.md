# @biolibs/nexus

A TypeScript port of Biopython's `Bio.Nexus`: read, edit and write NEXUS files, plus the tree classes it uses. All **84 items** are at parity, verified against Biopython 1.88 by **425 recorded sessions**
(`packages/nexus/test/golden/nexus.json`: 140 on trees, 119 on `Nexus`, 95 on the module functions, 28 on
`combine`, 25 on `consensus`, 18 on `StandardData`) and a further **706 cases** reaching this package
through `SeqIO`'s `nexus` format (`packages/seqio/test/golden/seqio-nexus.json`). See
[PARITY.md](../PARITY.md), and [the package README](../packages/nexus/README.md) for the API with worked
examples.

## Reading

```ts
import { Nexus } from "@biolibs/nexus";

const n = new Nexus("#NEXUS\nbegin data;\ndimensions ntax=2 nchar=4;\nformat datatype=dna missing=? gap=-;\nmatrix\na ACGT\nb AC-T\n;\nend;");
n.taxlabels;          // ["a", "b"]
n.matrix!.get("b");   // Seq("AC-T")
```

The constructor takes NEXUS text or any object with a `read()` method (a `LineStream`, say). It handles `taxa`, `characters`, `data`, `sets`, `trees`, `codons` and `unaligned` blocks; unknown blocks are kept in `unknownBlocks`. Character matrices become `Seq` (`StandardData` for `datatype=standard`). Errors are `NexusError`s with Biopython's messages.

Comments are stripped the way Biopython's C scanner (`cnexus`) does it, which is what Biopython uses when it is available.

## Editing and writing

`cropMatrix`, `appendSets`, `constant`, `cstatus`, `weightedStepmatrix`, `addSequence`, `insertGap`, `adjustCharlabels`, `invert`, `gaponly`, `terminalGapToMissing` and the module function `combine` follow their Python namesakes. `writeNexusData(options)` takes an options object instead of keyword arguments (`exclude`, `delete`, `blocksize`, `interleave`, `interleaveByPartition`, `comment`, `omitNEXUS`, `appendSets`, `mrbayes`, `codonsBlock`).

```ts
let out = "";
n.writeNexusData({ filename: { write: (t) => (out += t) }, interleave: true });
```

Differences from Python:

- **No file names.** `filename` must be an object with `write(text)`; passing a string, or nothing, throws `TypeError` (Python would open the file, or use `self.filename`). `exportFasta`, `exportPhylip` and `writeNexusDataPartitions` take the same kind of target and return the name Biopython would have derived from `filename` — a known NEXUS extension (`paup`, `nexus`, `nex`, `dat`) is replaced, anything else appended to, which is what `exportedName` does. `writeNexusDataPartitions` returns each partition's text and name in a `Map`, keyed by partition (under `""` when no character partition was given).
- `bootstrap` and `Tree.randomize` draw from Python's `random`, which `@biolibs/core` ports (MT19937 and the `Random` methods built on it), so both are here and both are measured: seed the shared generator with `pyRandom.seed(n)` and the same sites and the same tree come out as in Biopython. `Tree.randomize` resets the tree to the constructor's defaults before building the new one, as Biopython's own call to `__init__` does, and it shuffles the taxon list it is handed *in place*. A branch length drawn from `random.gauss` goes through `sin` and `cos`, whose last bit is the platform's, so those lengths are compared to twelve significant digits where everything else is exact. `Tree.display` *is* ported — it prints with `console.log` and returns the same text, which the golden cases compare. `Tree.isCompatible` does not print the names of missing taxa.
- `writeNexusDataPartitions` takes the character partition **itself** (a `Map` from `charpartitions`), not its name, because Biopython iterates the argument and subscripts it with what it yields. Passing a name there throws `TypeError: string indices must be integers, not 'str'`, exactly as it does in Biopython; an empty mapping writes the single unpartitioned block.
- `exclude` distinguishes "not given" from an empty list in `cropMatrix`, exactly as Python's `()` vs `[]` does.
- `combine` raises `RuntimeError` ("dictionary keys changed during iteration") when the first matrix has character or taxon sets: Biopython renames them while iterating over the dictionary.
- `constant` is checked against Biopython only for deterministic cases; with ambiguity codes Python builds sets whose order is not stable.
- `Tree.isPreterminal` reproduces Biopython's inverted test (true for a leaf, false for any internal node).
- A `taxa` block on its own may leave `taxlabels` empty, as it does in Biopython: the labels are kept only when a matrix or a `dimensions ntax=` in the same block gives them somewhere to go.
- Most `Tree` methods take node **ids**, not taxon names (`searchTaxon` converts), and `isMonophyletic` returns the clade's node id or `-1` rather than a boolean.
- A JavaScript stack overflow stands for Python's `RecursionError` on cyclic trees.

## Trees

`Tree` parses Newick as found in NEXUS `trees` blocks (support and branch length as `support:length`, `[&R]`/`[&U]`, comments). Methods: `walk`, `node`, `split`, `searchTaxon`, `prune`, `getTaxa`, `getTerminals`, `isTerminal`, `isInternal`, `isPreterminal`, `countTerminals`, `collapseGenera`, `sumBranchlength`, `setSubtree`, `isIdentical`, `isCompatible`, `commonAncestor`, `distance`, `isMonophyletic`, `isBifurcating`, `branchlength2support`, `convertAbsoluteSupport`, `hasSupport`, `unroot`, `rootWithOutgroup`, `mergeWithSupport`, `toString(options)` (`ladderize`, `plainNewick`, ...). `consensus(trees, threshold, outgroup)` builds a majority-rule tree. `Chain` and `Node` are the underlying linked structure; Python's `get_*`/`set_*` accessors on `Node` are the properties `data`, `id`, `prev` and `succ`.

## Other pieces

`CharBuffer`, `Commandline`, `Block`, `StepMatrix`, `StandardData`, `safename`, `quotestrip`, `getStartEnd`, `getCommandLines`, `scanfile` (the cnexus scanner), and the errors `NexusError`, `TreeError`, `ChainException`, `NodeException`.

## Files

```
packages/nexus/src/  errors.ts  char-buffer.ts  helpers.ts  standard-data.ts  nodes.ts  trees.ts  nexus-parser.ts  nexus.ts  index.ts
```
