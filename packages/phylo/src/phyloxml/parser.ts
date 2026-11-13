/** The incremental phyloXML reader (Biopython's `PhyloXMLIO.Parser`, `read` and `parse`). */

import { IndexError, ValueError } from "@biolibs/core";
import type { Element } from "@biolibs/seqio";
import { Clade, Phylogeny, type PhyloCladeOptions, type PhylogenyOptions } from "./clade.js";
import { Id, Phyloxml, type Other } from "./elements.js";
import { PARAMS, attrsAsOptions } from "./kwargs.js";
import * as L from "./leaf-parsers.js";
import { parseSequence, parseTaxonomy } from "./parser-seq.js";
import { PHY, collapse, iterparse, local, ns, splitNamespace, str2bool, toFloat, type XmlEvent } from "./xml.js";
import { pyFloat } from "@biolibs/core";

/** Valid XML that breaks the phyloXML specification. */
export class PhyloXMLError extends Error {
  override name = "PhyloXMLError";
}

const CLADE_COMPLEX: Record<string, (e: Element) => unknown> = { color: L.color, events: L.events, binary_characters: L.binaryCharacters, date: L.date };
const CLADE_LISTS: Record<string, [string, (e: Element) => unknown]> = {
  confidence: ["confidences", L.confidence], distribution: ["distributions", L.distribution], reference: ["references", L.reference], property: ["properties", L.property],
};
const CLADE_TRACKED = new Set([...Object.keys(CLADE_COMPLEX), ...Object.keys(CLADE_LISTS), "branch_length", "name", "node_id", "width"]);
const PHYLOGENY_LISTS: Record<string, [string, (e: Element) => unknown]> = {
  confidence: ["confidences", L.confidence], property: ["properties", L.property], clade_relation: ["cladeRelations", L.cladeRelation], sequence_relation: ["sequenceRelations", L.sequenceRelation],
};

/** Reads a phyloXML document event by event, clearing finished elements as `iterparse` consumers do. */
export class Parser {
  private readonly context: Generator<XmlEvent>;
  private readonly root: Element;

  /** @param source - The document text or bytes. @throws ParseError for malformed XML (including an empty document). */
  constructor(source: string | Uint8Array) {
    this.context = iterparse(source);
    const first = this.context.next();
    this.root = first.value![1];
  }

  /** The next event, or null at the end of the stream (a Python `for` loop over the shared iterator). */
  private next(): XmlEvent | null {
    const r = this.context.next();
    return r.done ? null : r.value;
  }

  /** Parse the whole document into one `Phyloxml`. */
  read(): Phyloxml {
    const phyloxml = new Phyloxml(Object.fromEntries([...this.root.attrib].map(([k, v]) => [local(k), v])));
    let otherDepth = 0;
    for (let ev = this.next(); ev !== null; ev = this.next()) {
      const [event, elem] = ev;
      const [namespace, tag] = splitNamespace(elem.tag);
      if (event === "start") {
        if (namespace !== PHY) { otherDepth++; continue; }
        if (tag === "phylogeny") phyloxml.phylogenies.push(this.parsePhylogeny(elem));
      }
      if (event === "end" && namespace !== PHY) {
        otherDepth--;
        if (otherDepth === 0) {
          phyloxml.other.push(L.other(elem, namespace, tag));
          this.root.clear();
        }
      }
    }
    return phyloxml;
  }

  /** Parse incrementally, yielding each phylogeny. */
  *parse(): Generator<Phylogeny> {
    const phytag = ns("phylogeny");
    for (let ev = this.next(); ev !== null; ev = this.next()) if (ev[0] === "start" && ev[1].tag === phytag) yield this.parsePhylogeny(ev[1]);
  }

  private parsePhylogeny(parent: Element): Phylogeny {
    const opts = attrsAsOptions("Phylogeny", PARAMS.Phylogeny, parent.attrib) as PhylogenyOptions & Record<string, unknown>;
    for (const key of ["rooted", "rerootable"]) if (key in opts) opts[key] = str2bool(opts[key] as string);
    const phylogeny = new Phylogeny(opts);
    for (let ev = this.next(); ev !== null; ev = this.next()) {
      const [event, elem] = ev;
      const [namespace, tag] = splitNamespace(elem.tag);
      if (event === "start" && tag === "clade") {
        if (phylogeny.rootClade !== null) throw new ValueError("Phylogeny object should only have 1 clade");
        phylogeny.rootClade = this.parseClade(elem);
        continue;
      }
      if (event === "end") {
        if (tag === "phylogeny") { parent.clear(); break; }
        const list = PHYLOGENY_LISTS[tag];
        if (list) (phylogeny as unknown as Record<string, unknown[]>)[list[0]]!.push(list[1](elem));
        else if (tag === "date") phylogeny.date = L.date(elem);
        else if (tag === "id") phylogeny.id = L.id(elem);
        else if (tag === "name" || tag === "description") (phylogeny as unknown as Record<string, unknown>)[tag] = collapse(elem.text);
        else if (namespace !== PHY) { phylogeny.other.push(L.other(elem, namespace, tag)); parent.clear(); }
        else throw new PhyloXMLError("Misidentified tag: " + tag);
      }
    }
    return phylogeny;
  }

  private parseClade(parent: Element): Clade {
    const opts = attrsAsOptions("Clade", PARAMS.Clade, parent.attrib) as PhyloCladeOptions & Record<string, unknown>;
    const clade = new Clade(opts);
    if (opts.branchLength !== undefined && opts.branchLength !== null) clade.branchLength = pyFloat(opts.branchLength as unknown as string);
    const stack: string[] = [];
    for (let ev = this.next(); ev !== null; ev = this.next()) {
      const [event, elem] = ev;
      const [namespace, tag] = splitNamespace(elem.tag);
      if (event === "start") {
        if (tag === "clade") { clade.clades.push(this.parseClade(elem)); continue; }
        if (tag === "taxonomy") { clade.taxonomies.push(parseTaxonomy(this, elem)); continue; }
        if (tag === "sequence") { clade.sequences.push(parseSequence(this, elem)); continue; }
        if (CLADE_TRACKED.has(tag)) stack.push(tag);
      }
      if (event === "end") {
        if (tag === "clade") { elem.clear(); break; }
        const top = stack.at(-1);
        if (top === undefined) throw new IndexError("list index out of range");
        if (tag !== top) continue;
        stack.pop();
        const list = CLADE_LISTS[tag];
        if (list) (clade as unknown as Record<string, unknown[]>)[list[0]]!.push(list[1](elem));
        else if (tag in CLADE_COMPLEX) (clade as unknown as Record<string, unknown>)[tag === "binary_characters" ? "binaryCharacters" : tag] = CLADE_COMPLEX[tag]!(elem);
        else if (tag === "branch_length") {
          if (clade.branchLength !== null) throw new PhyloXMLError("Attribute branch_length was already set for this Clade.");
          clade.branchLength = toFloat(elem.text);
        } else if (tag === "width") clade.width = L.pf(toFloat(elem.text));
        else if (tag === "name") clade.name = collapse(elem.text);
        else if (tag === "node_id") clade.nodeId = new Id((elem.text ?? nullText()).trim(), elem.attrib.get("provider") ?? null);
        else if (namespace !== PHY) { clade.other.push(L.other(elem, namespace, tag)); elem.clear(); }
        else throw new PhyloXMLError("Misidentified tag: " + tag);
      }
    }
    return clade;
  }

  /** @internal The event source shared with the sub-parsers. */
  nextEvent(): XmlEvent | null { return this.next(); }
}

function nullText(): string { throw new TypeError("'NoneType' object has no attribute 'strip'"); }

export type { Other };
