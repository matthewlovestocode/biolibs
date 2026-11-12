/** Turning one `<entry>` element into a `SeqRecord` (Biopython's `UniprotIterator._create_record`). */

import { KeyError, pyInt, pySplit } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { parseComment } from "./comments.js";
import { TypeErrorPy } from "./errors.js";
import type { Element } from "./etree.js";
import { parseDbReference, parseFeature } from "./features.js";
import { parseOrganism, parseReference } from "./references.js";
import { NS, appendToAnnotations, attr, concat, localTag } from "./util.js";

/** `recommendedName`, `submittedName` and `alternativeName` children of `<protein>` become `<kind>_<field>` annotations. */
function parseProtein(record: SeqRecord, element: Element): void {
  let descrSet = false;
  for (const p of element.children) {
    if (p.tag === NS + "recommendedName" || p.tag === NS + "submittedName" || p.tag === NS + "alternativeName") {
      for (const r of p.children) {
        appendToAnnotations(record, `${localTag(p.tag)}_${localTag(r.tag)}`, r.text);
        if (r.tag === NS + "fullName" && !descrSet) {
          record.description = r.text as string;
          descrSet = true;
        }
      }
    }
  }
}

/** Gene names with a `type` attribute: `gene_<tag>_<type>` (primary names replace, others accumulate). */
function parseGene(record: SeqRecord, element: Element): void {
  for (const g of element.children) {
    const type = g.attrib.get("type");
    if (type === undefined) continue;
    const key = `gene_${localTag(g.tag)}_${type}`;
    if (type === "primary") record.annotations.set(key, g.text);
    else appendToAnnotations(record, key, g.text);
  }
}

/** The `<sequence>` element: attributes become `sequence_*` annotations and its text the sequence. */
function parseSequence(record: SeqRecord, element: Element): void {
  for (const [k, v] of element.attrib) record.annotations.set(`sequence_${k}`, k === "length" || k === "mass" || k === "version" ? pyInt(v) : v);
  if (element.text === null) throw new TypeErrorPy("'NoneType' object has no attribute 'split'");
  record.seq = new Seq(pySplit(element.text).join(""));
  record.annotations.set("molecule_type", "protein");
}

/**
 * Build the record for one entry.
 *
 * @param entry - A UniProt `entry` element.
 * @param rawComments - Keep each comment's XML as well (`return_raw_comments`).
 * @throws {@link KeyError} when a required attribute is missing, or no accession gives the record an id.
 */
export function createRecord(entry: Element, rawComments: boolean): SeqRecord {
  const record = new SeqRecord(null, "");
  const dbname = entry.attrib.get("dataset") ?? "UnknownDataset";
  for (const [k, v] of entry.attrib) {
    // Python's `k in ("version")` is a substring test on the string "version".
    record.annotations.set(k, "version".includes(k) ? pyInt(v) : v);
  }
  for (const el of entry.children) {
    switch (el.tag) {
      case NS + "name":
        record.name = el.text as string;
        record.dbxrefs.push(concat(dbname + ":", el.text));
        break;
      case NS + "accession":
        appendToAnnotations(record, "accessions", el.text);
        record.dbxrefs.push(concat(dbname + ":", el.text));
        break;
      case NS + "protein": parseProtein(record, el); break;
      case NS + "gene": parseGene(record, el); break;
      case NS + "geneLocation": appendToAnnotations(record, "geneLocation", attr(el, "type")); break;
      case NS + "organism": parseOrganism(record, el); break;
      case NS + "organismHost":
        for (const o of el.children) if (o.tag === NS + "name") appendToAnnotations(record, "organism_host", o.text);
        break;
      case NS + "keyword": appendToAnnotations(record, "keywords", el.text); break;
      case NS + "comment": parseComment(record, el, rawComments); break;
      case NS + "dbReference": parseDbReference(record, el); break;
      case NS + "reference": parseReference(record, el); break;
      case NS + "feature": parseFeature(record, el); break;
      case NS + "proteinExistence": appendToAnnotations(record, "proteinExistence", attr(el, "type")); break;
      case NS + "evidence": for (const [k, v] of el.attrib) appendToAnnotations(record, k, v); break;
      case NS + "sequence": parseSequence(record, el); break;
      default: break;
    }
  }
  record.dbxrefs = [...new Set(record.dbxrefs)].sort();
  if (!record.id) {
    const accessions = record.annotations.get("accessions");
    if (accessions === undefined) throw new KeyError("accessions");
    record.id = (accessions as string[])[0]!;
  }
  return record;
}
