/** `SeqIO` reader for the `swiss` format. */

import { IndexError, ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { Reference } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { readEntry } from "./parser.js";

/**
 * Reads SwissProt/UniProt text entries as `SeqRecord`s: the first accession is the `id`, the entry name the `name`,
 * and the rest goes into `annotations`, `dbxrefs` and `features`.
 *
 * @throws {@link ValueError} for reference keys other than PubMed/MEDLINE/DOI/AGRICOLA.
 */
export class SwissIterator extends SequenceIterator {
  get modes(): string { return "t"; }

  /** @param source - File contents. @param alphabet - Not supported. */
  constructor(source: unknown, alphabet: null | undefined = null) {
    super(source, alphabet, "SwissProt");
  }

  protected nextRecord(): SeqRecord | null {
    const swiss = readEntry(this.stream!);
    if (swiss === null) return null;
    if (swiss.accessions.length === 0) throw new IndexError("list index out of range");
    const record = new SeqRecord(new Seq(swiss.sequence), swiss.accessions[0]!, swiss.entryName as string, swiss.description as string, null, swiss.features);
    for (const crossReference of swiss.crossReferences) {
      if (crossReference.length < 2) continue;
      const dbxref = `${crossReference[0]}:${crossReference[1]}`;
      if (!record.dbxrefs.includes(dbxref)) record.dbxrefs.push(dbxref);
    }
    const ann = record.annotations;
    ann.set("molecule_type", "protein");
    ann.set("accessions", swiss.accessions);
    if (swiss.proteinExistence) ann.set("protein_existence", swiss.proteinExistence);
    if (swiss.created) {
      ann.set("date", swiss.created[0]);
      ann.set("sequence_version", swiss.created[1]);
    }
    if (swiss.sequenceUpdate) {
      ann.set("date_last_sequence_update", swiss.sequenceUpdate[0]);
      ann.set("sequence_version", swiss.sequenceUpdate[1]);
    }
    if (swiss.annotationUpdate) {
      ann.set("date_last_annotation_update", swiss.annotationUpdate[0]);
      ann.set("entry_version", swiss.annotationUpdate[1]);
    }
    if (swiss.geneName.length > 0) ann.set("gene_name", swiss.geneName);
    ann.set("organism", (swiss.organism as string).replace(/\.+$/, ""));
    ann.set("taxonomy", swiss.organismClassification);
    ann.set("ncbi_taxid", swiss.taxonomyId);
    if (swiss.hostOrganism.length > 0) ann.set("organism_host", swiss.hostOrganism);
    if (swiss.hostTaxonomyId.length > 0) ann.set("host_ncbi_taxid", swiss.hostTaxonomyId);
    if (swiss.comments.length > 0) ann.set("comment", swiss.comments.join("\n"));
    if (swiss.references.length > 0) {
      const refs: Reference[] = [];
      ann.set("references", refs);
      for (const reference of swiss.references) {
        const feature = new Reference();
        // Biopython formats each comment as "%s=%s;" % pair; a merged (string) comment fails that formatting.
        feature.comment = reference.comments.map((c) => {
          if (typeof c === "string") throw new TypeError("not enough arguments for format string (got 1)");
          return `${c[0]}=${c[1]};`;
        }).join(" ");
        for (const [key, value] of reference.references) {
          if (key === "PubMed") feature.pubmedId = value;
          else if (key === "MEDLINE") feature.medlineId = value;
          else if (key === "DOI" || key === "AGRICOLA") continue;
          else throw new ValueError(`Unknown key ${key} found in references`);
        }
        feature.authors = reference.authors as string;
        feature.title = reference.title as string;
        feature.journal = reference.location as string;
        refs.push(feature);
      }
    }
    if (swiss.keywords.length > 0) ann.set("keywords", swiss.keywords);
    return record;
  }
}
