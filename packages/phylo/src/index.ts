/**
 * @packageDocumentation
 * `@biolibs/phylo`: a TypeScript port of Biopython's `Bio.Phylo` — all **489 items** at parity, verified
 * against Biopython 1.88 by 3,329 recorded cases. Each tree case compares the **whole tree** after the
 * call, not just the return value, which is what catches an edit that moved a clade it should not have.
 *
 * Not ported: NeXML, CDAO, drawing (matplotlib), and what uses Python's `random` — `Tree.randomized` and
 * the bootstrap functions.
 *
 * - `base-tree/`: `TreeElement`, `TreeMixin`, `Clade`, `Tree`, `BranchColor` and the matcher functions
 *   behind `findClades` — a target may be a clade, a class, a name, a pattern object or a predicate
 * - `newick/`: the Newick `Tree` and `Clade` (as `Newick`), and the Newick `Parser` and `Writer`. Note
 *   that writing reformats: a confidence of `90` is written `90.00` and the root gains `:0`, as in
 *   Biopython
 * - `consensus/`: strict, majority-rule and Adam consensus, branch support, and `BitString`. Adam
 *   consensus can order a clade's children differently from any given Biopython run, because Biopython
 *   iterates sets of clades that hash by address; only the order moves, never the topology
 * - `tree-construction/`: distance matrices in 31 substitution models, UPGMA, neighbour joining,
 *   parsimony with NNI search, and the dN/dS matrices of `Bio.Align.analysis`
 * - `phyloxml/`: `PhyloXML` and `PhyloXMLIO` — every element class, the incremental reader, the writer,
 *   and conversion to and from `SeqRecord`s and alignments
 * - `io.ts`: `parse`, `read`, `write`, `convert` for the newick, nexus and phyloxml formats
 *
 * The constructors take an options object (`new Clade({ branchLength: 0.5, name: "x" })`) because the
 * classes have a dozen optional fields each and Python's callers pass them all by keyword.
 */

export * from "./base-tree/index.js";
export * as Newick from "./newick/newick.js";
export { NewickError, Parser, type ParseOptions } from "./newick/parser.js";
export { Writer, type WriteTarget, type WriterOptions } from "./newick/writer.js";
export * from "./io.js";
export * as Consensus from "./consensus/index.js";
export * as TreeConstruction from "./tree-construction/index.js";
export { PhyloXML, PhyloXMLIO } from "./phyloxml/index.js";
