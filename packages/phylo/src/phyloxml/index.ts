/**
 * @packageDocumentation
 * `Bio.Phylo.PhyloXML` and `Bio.Phylo.PhyloXMLIO`: trees with the annotations the phyloXML format defines.
 *
 * - `elements.ts`: one import for the element classes, which live in `element-base.ts` (`PhyloElement`, `checkStr`, number helpers), `elements-core.ts`
 *   (`Phyloxml`, `Other`, `Accession`, `Confidence`, `Date`, `Id`, `Uri`, `BranchColor`, ...), `elements-geo.ts` (`Point`, `Polygon`, `Distribution`, `ProteinDomain`,
 *   `DomainArchitecture`) and `elements-meta.ts` (`Annotation`, `Events`, `Property`, `SequenceRelation`, `Taxonomy`)
 * - `sequence.ts`: `Sequence`
 * - `clade.ts`: the phyloXML `Clade` and `Phylogeny`
 * - `px.ts`, `io.ts`: the two public namespaces
 * - `xml.ts`, `kwargs.ts`, `leaf-parsers.ts`, `parser-seq.ts`, `parser.ts`: the incremental reader
 * - `writer.ts`: the writer
 */

import { supportedFormats } from "../io.js";
import { registerPhyloxmlFactory } from "../base-tree/tree.js";
import { Phylogeny } from "./clade.js";
import { Phyloxml } from "./elements.js";
import * as PhyloXMLIO from "./io.js";
import type { Tree } from "../base-tree/tree.js";

registerPhyloxmlFactory((tree, kwargs) => Phylogeny.fromTree(tree, kwargs));

supportedFormats.phyloxml = {
  parse: (text) => PhyloXMLIO.parse(text),
  write: (trees, target, options = {}) => {
    // `PhyloXMLIO.write(obj, file, encoding="unicode", indent=True)`
    for (const key of Object.keys(options)) if (key !== "encoding" && key !== "indent") throw new TypeError(`write() got an unexpected keyword argument '${key}'`);
    return PhyloXMLIO.write(trees as unknown as Phyloxml | Iterable<Tree>, target, (options.indent as boolean | undefined) ?? true);
  },
};

export * as PhyloXML from "./px.js";
export * as PhyloXMLIO from "./io.js";
export type { Phylogeny };
