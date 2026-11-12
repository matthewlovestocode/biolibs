/** Writer for the `seqxml` format (always seqXML version 0.4). */

import { ValueError, pyContains, pyStr, pyTruthy } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import type { BinaryWriteHandle } from "../handles.js";
import { SequenceWriter } from "../interfaces.js";
import { XmlGenerator } from "./xml-generator.js";

/**
 * Writes seqXML 0.4. The XML declaration is written as soon as the writer is created, then the root element
 * with the optional `source`, `sourceVersion`, `species` and `ncbiTaxId`, then one `entry` per record.
 *
 * @example
 * ```ts
 * const out = new BytesHandle();
 * new SeqXmlWriter(out, "test").writeFile([rec]);
 * ```
 * @throws {@link ValueError} for records without an id, a sequence or a `molecule_type`, or with a malformed `dbxrefs` entry.
 */
export class SeqXmlWriter extends SequenceWriter {
  get modes(): string { return "b"; }
  private readonly xml: XmlGenerator;

  /**
   * @param target - A byte target such as `BytesHandle`.
   * @param source - Value of the root `source` attribute.
   * @param sourceVersion - Value of `sourceVersion`.
   * @param species - Species name for the root (`speciesName`).
   * @param ncbiTaxId - Taxonomy id for the root (`ncbiTaxID`); a number makes Python fail, so it throws here too.
   */
  constructor(
    target: BinaryWriteHandle,
    private readonly source: string | null = null,
    private readonly sourceVersion: string | null = null,
    private readonly species: string | null = null,
    private readonly ncbiTaxId: string | number | null = null,
  ) {
    super(target);
    this.xml = new XmlGenerator(target);
    this.xml.startDocument();
  }

  /** Write the header, all records and the footer; returns the record count. */
  writeRecords(records: Iterable<SeqRecord>): number {
    this.writeHeader();
    const count = super.writeRecords(records);
    this.writeFooter();
    return count;
  }

  /** Write the opening `seqXML` element. */
  writeHeader(): void {
    const attrs: [string, unknown][] = [
      ["xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance"],
      ["xsi:noNamespaceSchemaLocation", "http://www.seqxml.org/0.4/seqxml.xsd"],
      ["seqXMLversion", "0.4"],
    ];
    if (this.source !== null) attrs.push(["source", this.source]);
    if (this.sourceVersion !== null) attrs.push(["sourceVersion", this.sourceVersion]);
    if (this.species !== null) {
      if (typeof this.species !== "string") throw new TypeError("species should be of type string");
      attrs.push(["speciesName", this.species]);
    }
    if (this.ncbiTaxId !== null) {
      if (typeof this.ncbiTaxId !== "string" && !(typeof this.ncbiTaxId === "number" && Number.isInteger(this.ncbiTaxId))) throw new TypeError("ncbiTaxID should be of type string or int");
      attrs.push(["ncbiTaxID", this.ncbiTaxId]);
    }
    this.xml.startElement("seqXML", attrs);
  }

  /** Write one `entry`. */
  writeRecord(record: SeqRecord): void {
    if (!record.id || record.id === "<unknown id>") throw new ValueError("SeqXML requires identifier");
    const attrs: [string, unknown][] = [["id", record.id]];
    if (record.annotations.has("source") && this.source !== record.annotations.get("source")) {
      const source = record.annotations.get("source");
      if (typeof source !== "string") throw new TypeError("source should be of type string");
      attrs.push(["source", source]);
    }
    this.xml.startElement("entry", attrs);
    this.writeSpecies(record);
    this.writeDescription(record);
    this.writeSeq(record);
    this.writeDbxrefs(record);
    this.writeProperties(record);
    this.xml.endElement("entry");
  }

  /** Write the closing `seqXML` element. */
  writeFooter(): void {
    this.xml.endElement("seqXML");
    this.xml.endDocument();
  }

  private writeSpecies(record: SeqRecord): void {
    let taxid: unknown = null;
    if (record.annotations.has("ncbi_taxid")) {
      taxid = record.annotations.get("ncbi_taxid");
      if (Array.isArray(taxid)) {
        if (taxid.length === 1) taxid = taxid[0];
        else if (taxid.length === 0) taxid = null;
        else throw new ValueError(`Multiple entries for record.annotations['ncbi_taxid'], ${pyStr(taxid)}`);
      }
    }
    if (record.annotations.has("organism") && pyTruthy(taxid)) {
      const organism = record.annotations.get("organism");
      if (typeof organism !== "string") throw new TypeError("organism should be of type string");
      if (typeof taxid !== "string" && !(typeof taxid === "number" && Number.isInteger(taxid))) throw new TypeError("ncbiTaxID should be of type string or int");
      if (organism !== this.species || taxid !== this.ncbiTaxId) {
        this.xml.startElement("species", [["name", organism], ["ncbiTaxID", String(taxid)]]);
        this.xml.endElement("species");
      }
    }
  }

  private writeDescription(record: SeqRecord): void {
    if (!record.description) return;
    const description = record.description === "<unknown description>" ? "" : record.description;
    this.xml.startElement("description");
    this.xml.characters(description);
    this.xml.endElement("description");
  }

  private writeSeq(record: SeqRecord): void {
    if (record.seq === null) throw new TypeError("cannot convert 'NoneType' object to bytes");
    const seq = record.seq.toString();
    if (!(seq.length > 0)) throw new ValueError("The sequence length should be greater than 0");
    const moleculeType = record.annotations.get("molecule_type");
    let element: string;
    if (moleculeType === undefined || moleculeType === null) throw new ValueError("molecule_type is not defined");
    else if (pyContains("DNA", moleculeType)) element = "DNAseq";
    else if (pyContains("RNA", moleculeType)) element = "RNAseq";
    else if (pyContains("protein", moleculeType)) element = "AAseq";
    else throw new ValueError(`unknown molecule_type '${pyStr(moleculeType)}'`);
    this.xml.startElement(element);
    this.xml.characters(seq);
    this.xml.endElement(element);
  }

  private writeDbxrefs(record: SeqRecord): void {
    for (const dbxref of record.dbxrefs) {
      if (typeof dbxref !== "string") throw new TypeError("dbxrefs should be of type list of string");
      if (dbxref.indexOf(":") < 1) throw new ValueError("dbxrefs should be in the form ['source:id', 'source:id' ]");
      const colon = dbxref.indexOf(":");
      this.xml.startElement("DBRef", [["source", dbxref.slice(0, colon)], ["id", dbxref.slice(colon + 1)]]);
      this.xml.endElement("DBRef");
    }
  }

  private writeProperties(record: SeqRecord): void {
    for (const [key, value] of record.annotations) {
      if (key === "organism" || key === "ncbi_taxid" || key === "source") continue;
      const property = (attrs: [string, unknown][]): void => {
        this.xml.startElement("property", attrs);
        this.xml.endElement("property");
      };
      if (value === null || value === undefined) property([["name", key]]);
      else if (Array.isArray(value)) {
        for (const v of value) property(v === null ? [["name", key]] : [["name", key], ["value", pyStr(v)]]);
      } else if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        property([["name", key], ["value", pyStr(value)]]);
      }
    }
  }
}
