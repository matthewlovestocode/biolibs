/**
 * @packageDocumentation
 * `Bio.Phylo`: phylogenetic trees. The base classes (`Tree`, `Clade`, `BranchColor`) and their search and editing methods.
 *
 * - `base-tree/`: `TreeElement`, `TreeMixin`, `Clade`, `Tree`, `BranchColor` and the matcher functions
 * - `newick/`: the Newick `Tree` and `Clade` (as `Newick`), the Newick `Parser` and `Writer`
 * - `io.ts`: `parse`, `read`, `write`, `convert` for the newick and nexus formats
 */

export * from "./base-tree/index.js";
export * as Newick from "./newick/newick.js";
export { NewickError, Parser, type ParseOptions } from "./newick/parser.js";
export { Writer, type WriteTarget, type WriterOptions } from "./newick/writer.js";
export * from "./io.js";
