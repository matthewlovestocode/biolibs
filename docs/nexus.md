# @biolibs/nexus

A TypeScript port of Biopython's `Bio.Nexus`: read, edit and write NEXUS files, plus the tree classes it uses. Verified against Biopython 1.88: `packages/nexus/test/golden/nexus.json` (about 340 recorded sessions of operations on `Nexus`, `Tree`, `Node`, `StandardData`, `combine` and `consensus`) and `packages/seqio/test/golden/seqio-nexus.json` (about 700 parse, read, write and convert calls through `SeqIO`). See [PARITY.md](../PARITY.md).

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

- **No file names.** `filename` must be an object with `write(text)`; passing a string, or nothing, throws `TypeError` (Python would open the file, or use `self.filename`). The same reason keeps `export_fasta`, `export_phylip` and `write_nexus_data_partitions` unported.
- `bootstrap` and `Tree.randomize` (random numbers) and `Tree.display` (prints) are not ported. `Tree.isCompatible` does not print the names of missing taxa.
- `exclude` distinguishes "not given" from an empty list in `cropMatrix`, exactly as Python's `()` vs `[]` does.
- `combine` raises `RuntimeError` ("dictionary keys changed during iteration") when the first matrix has character or taxon sets: Biopython renames them while iterating over the dictionary.
- `constant` is checked against Biopython only for deterministic cases; with ambiguity codes Python builds sets whose order is not stable.
- `Tree.isPreterminal` reproduces Biopython's inverted test (true for a leaf, false for any internal node).
- A JavaScript stack overflow stands for Python's `RecursionError` on cyclic trees.

## Trees

`Tree` parses Newick as found in NEXUS `trees` blocks (support and branch length as `support:length`, `[&R]`/`[&U]`, comments). Methods: `walk`, `node`, `split`, `searchTaxon`, `prune`, `getTaxa`, `getTerminals`, `isTerminal`, `isInternal`, `isPreterminal`, `countTerminals`, `collapseGenera`, `sumBranchlength`, `setSubtree`, `isIdentical`, `isCompatible`, `commonAncestor`, `distance`, `isMonophyletic`, `isBifurcating`, `branchlength2support`, `convertAbsoluteSupport`, `hasSupport`, `unroot`, `rootWithOutgroup`, `mergeWithSupport`, `toString(options)` (`ladderize`, `plainNewick`, ...). `consensus(trees, threshold, outgroup)` builds a majority-rule tree. `Chain` and `Node` are the underlying linked structure; Python's `get_*`/`set_*` accessors on `Node` are the properties `data`, `id`, `prev` and `succ`.

## Other pieces

`CharBuffer`, `Commandline`, `Block`, `StepMatrix`, `StandardData`, `safename`, `quotestrip`, `getStartEnd`, `getCommandLines`, `scanfile` (the cnexus scanner), and the errors `NexusError`, `TreeError`, `ChainException`, `NodeException`.

## Files

```
packages/nexus/src/  errors.ts  char-buffer.ts  helpers.ts  standard-data.ts  nodes.ts  trees.ts  nexus-parser.ts  nexus.ts  index.ts
```
