/** Parsing of UniProt `<reference>` and `<organism>` elements. */

import { Reference } from "@biolibs/seqfeature";
import type { SeqRecord } from "@biolibs/seqrecord";
import type { Element } from "./etree.js";
import { NS, appendToAnnotations, attr, concat, join } from "./util.js";

/** Parse a `<reference>` element into a `Reference` appended to `annotations["references"]`. */
export function parseReference(record: SeqRecord, element: Element): void {
  const reference = new Reference();
  const authors: string[] = [];
  const scopes: (string | null)[] = [];
  const tissues: (string | null)[] = [];
  let journalName = "";
  let pubType = "";
  let pubDate = "";
  let volume = "";
  let first = "";
  let last = "";
  for (const ref of element.children) {
    if (ref.tag === NS + "citation") {
      pubType = attr(ref, "type");
      if (pubType === "submission") pubType += " to the " + attr(ref, "db");
      if (ref.attrib.has("name")) journalName = ref.attrib.get("name")!;
      pubDate = ref.attrib.get("date") ?? "";
      volume = ref.attrib.get("volume") ?? "";
      first = ref.attrib.get("first") ?? "";
      last = ref.attrib.get("last") ?? "";
      for (const cit of ref.children) {
        if (cit.tag === NS + "title") reference.title = cit.text as string;
        else if (cit.tag === NS + "authorList") for (const person of cit.children) authors.push(attr(person, "name"));
        else if (cit.tag === NS + "dbReference") {
          record.dbxrefs.push(concat(attr(cit, "type") + ":", attr(cit, "id")));
          if (attr(cit, "type") === "PubMed") reference.pubmedId = attr(cit, "id");
          else if (attr(ref, "type") === "MEDLINE") reference.medlineId = attr(cit, "id");
        }
      }
    } else if (ref.tag === NS + "scope") scopes.push(ref.text);
    else if (ref.tag === NS + "source") for (const s of ref.children) if (s.tag === NS + "tissue") tissues.push(s.text);
  }
  const scopesStr = scopes.length > 0 ? "Scope: " + join(", ", scopes) : "";
  const tissuesStr = tissues.length > 0 ? "Tissue: " + join(", ", tissues) : "";
  reference.location = [];
  reference.authors = authors.join(", ");
  if (journalName) {
    reference.journal = pubDate && volume && first && last ? `${journalName} ${volume}:${first}-${last}(${pubDate})` : journalName;
  }
  reference.comment = [pubType, pubDate, scopesStr, tissuesStr].join(" | ");
  appendToAnnotations(record, "references", reference);
}

/** Parse an `<organism>` element into `annotations["organism"]`, `taxonomy` and database cross-references. */
export function parseOrganism(record: SeqRecord, element: Element): void {
  let sci = "";
  let com = "";
  for (const o of element.children) {
    if (o.tag === NS + "name") {
      if (o.text) {
        const type = attr(o, "type");
        if (type === "scientific") sci = o.text;
        else if (type === "common") com = o.text;
        else appendToAnnotations(record, "organism_name", o.text);
      }
    } else if (o.tag === NS + "dbReference") record.dbxrefs.push(attr(o, "type") + ":" + attr(o, "id"));
    else if (o.tag === NS + "lineage") for (const t of o.children) if (t.tag === NS + "taxon") appendToAnnotations(record, "taxonomy", t.text);
  }
  const name = sci && com ? `${sci} (${com})` : sci || com;
  record.annotations.set("organism", name);
}
