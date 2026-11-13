/** `Bio.Phylo.PhyloXMLIO`: `read`, `parse` and `write` for phyloXML text. */

import type { Phylogeny } from "./clade.js";
import type { Phyloxml } from "./elements.js";
import { Parser, PhyloXMLError } from "./parser.js";
import { write as writeDoc, Writer, type XmlTarget } from "./writer.js";

export { Parser, PhyloXMLError, Writer, type XmlTarget };

/** Parse a phyloXML document into one `Phyloxml` (trees and any other top-level elements). @param source - Text or bytes. */
export function read(source: string | Uint8Array): Phyloxml { return new Parser(source).read(); }

/** Iterate over the trees of a phyloXML document, ignoring other top-level data. @param source - Text or bytes. */
export function parse(source: string | Uint8Array): Generator<Phylogeny> { return new Parser(source).parse(); }

/** Write phyloXML; see {@link writeDoc}. */
export const write = writeDoc;
