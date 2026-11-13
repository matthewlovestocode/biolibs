/** The sequence and taxonomy sub-parsers of the phyloXML reader. */

import type { Element } from "@biolibs/seqio";
import { PHY, collapse, splitNamespace } from "./xml.js";
import { Sequence, type SequenceOptions } from "./sequence.js";
import { Taxonomy } from "./elements.js";
import { PARAMS, attrsAsOptions } from "./kwargs.js";
import * as L from "./leaf-parsers.js";
import type { Parser } from "./parser.js";

/** `Parser._parse_sequence`: read a `sequence` element up to its end tag. */
export function parseSequence(p: Parser, parent: Element): Sequence {
  const sequence = new Sequence(attrsAsOptions("Sequence", PARAMS.Sequence, parent.attrib) as SequenceOptions);
  for (let ev = p.nextEvent(); ev !== null; ev = p.nextEvent()) {
    const [event, elem] = ev;
    const [namespace, tag] = splitNamespace(elem.tag);
    if (event !== "end") continue;
    if (tag === "sequence") { parent.clear(); break; }
    if (tag === "accession") sequence.accession = L.accession(elem);
    else if (tag === "mol_seq") sequence.molSeq = L.molSeq(elem);
    else if (tag === "uri") sequence.uri = L.uri(elem);
    else if (tag === "domain_architecture") sequence.domainArchitecture = L.domainArchitecture(elem);
    else if (tag === "annotation") sequence.annotations.push(L.annotation(elem));
    else if (tag === "name") sequence.name = collapse(elem.text);
    else if (tag === "symbol") sequence.symbol = elem.text;
    else if (tag === "location") sequence.location = elem.text;
    else if (namespace !== PHY) { sequence.other.push(L.other(elem, namespace, tag)); parent.clear(); }
  }
  return sequence;
}

/** `Parser._parse_taxonomy`: read a `taxonomy` element up to its end tag. */
export function parseTaxonomy(p: Parser, parent: Element): Taxonomy {
  const taxonomy = new Taxonomy(attrsAsOptions("Taxonomy", PARAMS.Taxonomy, parent.attrib));
  for (let ev = p.nextEvent(); ev !== null; ev = p.nextEvent()) {
    const [event, elem] = ev;
    const [namespace, tag] = splitNamespace(elem.tag);
    if (event !== "end") continue;
    if (tag === "taxonomy") { parent.clear(); break; }
    if (tag === "id") taxonomy.id = L.id(elem);
    else if (tag === "uri") taxonomy.uri = L.uri(elem);
    else if (tag === "common_name") taxonomy.commonNames.push(collapse(elem.text) as string);
    else if (tag === "synonym") taxonomy.synonyms.push(elem.text as string);
    else if (tag === "code" || tag === "scientific_name" || tag === "authority" || tag === "rank") (taxonomy as unknown as Record<string, unknown>)[tag === "scientific_name" ? "scientificName" : tag] = elem.text;
    else if (namespace !== PHY) { taxonomy.other.push(L.other(elem, namespace, tag)); parent.clear(); }
  }
  return taxonomy;
}
