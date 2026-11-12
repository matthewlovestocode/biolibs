/** The SAX content handler that builds `SeqRecord`s from seqXML (Biopython's `SeqXmlIO.ContentHandler`). */

import { AssertionError, KeyError, RuntimeError, ValueError, pyInt, pyRepr } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import type { SaxHandler } from "./xml-sax.js";
import type { XmlName } from "./xml-types.js";

type Attrs = [XmlName, string][];
const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const isName = (n: XmlName, local: string): boolean => n[0] === null && n[1] === local;

/**
 * State machine over seqXML events. Like Biopython's handler it swaps its own `startElementNS` /
 * `endElementNS` slots as the document progresses, so unexpected structure is reported with the same errors.
 */
export class SeqXmlContentHandler implements SaxHandler {
  source: string | null = null;
  sourceVersion: string | null = null;
  seqXMLversion: string | null = null;
  ncbiTaxID: string | null = null;
  speciesName: string | null = null;
  startElementNS: SaxHandler["startElementNS"] = null;
  endElementNS: SaxHandler["endElementNS"] = () => {};
  data: string | null = null;
  records: SeqRecord[] = [];

  /** Called when parsing starts. */
  startDocument(): void {
    this.startElementNS = (n, q, a) => this.startSeqXMLElement(n, q, a as Attrs);
  }

  /** Character data is only kept while an element that wants text is open. */
  characters(data: string): void {
    if (this.data !== null) this.data += data;
  }

  private startSeqXMLElement(name: XmlName, qname: null, attrs: Attrs): void {
    if (!isName(name, "seqXML")) throw new ValueError("Failed to find the start of seqXML element");
    let schema: string | null = null;
    for (const [[ns, local], value] of attrs) {
      if (ns === null) {
        if (local === "source") this.source = value;
        else if (local === "sourceVersion") this.sourceVersion = value;
        else if (local === "seqXMLversion") this.seqXMLversion = value;
        else if (local === "ncbiTaxID") { pyInt(value); this.ncbiTaxID = value; }
        else if (local === "speciesName") this.speciesName = value;
        else throw new ValueError("Unexpected attribute for XML Schema");
      } else if (ns === XSI) {
        if (local === "noNamespaceSchemaLocation") schema = value;
        else throw new ValueError("Unexpected attribute for XML Schema in namespace");
      } else {
        throw new ValueError(`Unexpected namespace '${ns}' for seqXML attribute`);
      }
    }
    if (this.seqXMLversion === null) throw new ValueError("Failed to find seqXMLversion");
    if (!["0.1", "0.2", "0.3", "0.4"].includes(this.seqXMLversion)) throw new ValueError("Unsupported seqXMLversion");
    const url = `http://www.seqxml.org/${this.seqXMLversion}/seqxml.xsd`;
    if (schema !== null && schema !== url) throw new ValueError(`XML Schema '${schema}' found not consistent with reported seqXML version ${this.seqXMLversion}`);
    if (this.speciesName && this.seqXMLversion !== "0.4") throw new ValueError("Attribute 'speciesName' on root is only supported in version 0.4");
    if (this.ncbiTaxID && this.seqXMLversion !== "0.4") throw new ValueError("Attribute 'ncbiTaxID' on root is only supported in version 0.4");
    this.endElementNS = (n) => this.endSeqXMLElement(n);
    this.startElementNS = (n, q, a) => this.startEntryElement(n, q, a as Attrs);
  }

  private endSeqXMLElement(name: XmlName): void {
    if (name[0] !== null) throw new RuntimeError(`Unexpected namespace '${name[0]}' for seqXML end`);
    if (name[1] !== "seqXML") throw new RuntimeError("Failed to find end of seqXML element");
    this.startElementNS = null;
    this.endElementNS = null;
  }

  private startEntryElement(name: XmlName, _q: null, attrs: Attrs): void {
    if (!isName(name, "entry")) throw new ValueError("Expected to find the start of an entry element");
    const record = new SeqRecord(null, null);
    if (this.speciesName !== null) record.annotations.set("organism", this.speciesName);
    if (this.ncbiTaxID !== null) record.annotations.set("ncbi_taxid", this.ncbiTaxID);
    record.annotations.set("source", this.source);
    for (const [[ns, local], value] of attrs) {
      if (ns !== null) throw new ValueError(`Unexpected namespace '${ns}' for entry attribute`);
      if (local === "id") record.id = value;
      else if (local === "source" && (this.seqXMLversion === "0.3" || this.seqXMLversion === "0.4")) record.annotations.set("source", value);
      else throw new ValueError(`Unexpected attribute ${local} in entry element`);
    }
    if (record.id === null) throw new ValueError("Failed to find entry ID");
    this.records.push(record);
    this.startElementNS = this.seqXMLversion === "0.1" ? (n, q, a) => this.startEntryField(n, a as Attrs, true) : (n, q, a) => this.startEntryField(n, a as Attrs, false);
    this.endElementNS = (n) => this.endEntryElement(n);
  }

  private endEntryElement(name: XmlName): void {
    if (!isName(name, "entry")) throw new ValueError("Expected to find the end of an entry element");
    if (this.records[this.records.length - 1]!.seq === null) throw new ValueError("Failed to find a sequence for entry element");
    this.startElementNS = (n, q, a) => this.startEntryElement(n, q, a as Attrs);
    this.endElementNS = (n) => this.endSeqXMLElement(n);
  }

  /** Dispatch a child of `<entry>`; `old` selects the version 0.1 element names. */
  private startEntryField(name: XmlName, attrs: Attrs, old: boolean): void {
    const [namespace, local] = name;
    if (namespace !== null) throw new ValueError(`Unexpected namespace '${namespace}' for ${local} element`);
    if (local === "species") return this.startSpecies(attrs);
    if (local === "description") return this.startText(attrs, "description", (n) => this.endDescription(n));
    if (old ? ["dnaSeq", "rnaSeq", "aaSeq"].includes(local) : ["DNAseq", "RNAseq", "AAseq"].includes(local)) {
      return this.startText(attrs, "sequence", (n) => this.endSequence(n));
    }
    if (local === (old ? "alternativeID" : "DBRef")) return this.startDBRef(attrs);
    if (local === "property") return this.startProperty(attrs);
    throw new ValueError(`Unexpected field ${local} in entry`);
  }

  private last(): SeqRecord { return this.records[this.records.length - 1]!; }

  private startSpecies(attrs: Attrs): void {
    let name: string | null = null;
    let taxid: string | null = null;
    for (const [key, value] of attrs) {
      if (key[0] !== null) throw new ValueError(`Unexpected namespace '${key[0]}' for species attribute`);
      if (key[1] === "name") name = value;
      else if (key[1] === "ncbiTaxID") { pyInt(value); taxid = value; }
      else throw new ValueError(`Unexpected attribute '${`(None, ${pyRepr(key[1])})`}' found in species tag`);
    }
    if (name === null) throw new ValueError("Failed to find species name");
    if (taxid === null) throw new ValueError("Failed to find ncbiTaxId");
    this.last().annotations.set("organism", name);
    this.last().annotations.set("ncbi_taxid", taxid);
    this.endElementNS = (n) => this.endSimple(n, "species");
  }

  /** End of an element that only needs its name checked (`species`, `property`). */
  private endSimple(name: XmlName, expected: string): void {
    if (name[0] !== null) throw new RuntimeError(`Unexpected namespace '${name[0]}' for ${expected} end`);
    if (name[1] !== expected) throw new RuntimeError(`Failed to find end of ${expected} element`);
    this.endElementNS = (n) => this.endEntryElement(n);
  }

  /** Begin collecting text for `description` or a sequence element. */
  private startText(attrs: Attrs, what: string, end: (name: XmlName) => void): void {
    if (attrs.length > 0) throw new ValueError(`Unexpected attributes found in ${what} element`);
    if (this.data !== null) throw new RuntimeError(`Unexpected data found: '${this.data}'`);
    this.data = "";
    this.endElementNS = (n) => end(n);
  }

  private endDescription(name: XmlName): void {
    if (name[0] !== null) throw new RuntimeError(`Unexpected namespace '${name[0]}' for description end`);
    if (name[1] !== "description") throw new RuntimeError("Failed to find end of description element");
    if (this.data) this.last().description = this.data;
    this.data = null;
    this.endElementNS = (n) => this.endEntryElement(n);
  }

  private endSequence(name: XmlName): void {
    if (name[0] !== null) throw new RuntimeError(`Unexpected namespace '${name[0]}' for sequence end`);
    const local = name[1];
    const v = this.seqXMLversion;
    const record = this.last();
    // Python's string comparison `version >= '0.1'` is true for every supported version.
    if ((local === "DNAseq" && v !== "0.1") || (local === "dnaSeq" && v === "0.1")) record.annotations.set("molecule_type", "DNA");
    else if ((local === "RNAseq" && v !== "0.1") || (local === "rnaSeq" && v === "0.1")) record.annotations.set("molecule_type", "RNA");
    else if ((local === "AAseq" && v! >= "0.1") || (local === "aaSeq" && v === "0.1")) record.annotations.set("molecule_type", "protein");
    else throw new RuntimeError(`Failed to find end of sequence (localname = ${local})`);
    record.seq = new Seq(this.data!);
    this.data = null;
    this.endElementNS = (n) => this.endEntryElement(n);
  }

  private startDBRef(attrs: Attrs): void {
    let type: string | null = null;
    let source: string | null = null;
    let id: string | null = null;
    for (const [key, value] of attrs) {
      if (key[0] !== null) throw new ValueError(`Unexpected namespace '${key[0]}' for DBRef attribute`);
      if (key[1] === "type") type = value;
      else if (key[1] === "source") source = value;
      else if (key[1] === "id") id = value;
      else throw new ValueError(`Unexpected attribute '${`(None, ${pyRepr(key[1])})`}' found for DBRef element`);
    }
    if (source === null) throw new ValueError("Failed to find source for DBRef element");
    if (id === null) throw new ValueError("Failed to find id for DBRef element");
    if (type === null && (this.seqXMLversion === "0.2" || this.seqXMLversion === "0.3")) throw new ValueError("Failed to find type for DBRef element");
    if (this.data !== null) throw new RuntimeError(`Unexpected data found: '${this.data}'`);
    this.data = "";
    const dbxref = `${source}:${id}`;
    if (!this.last().dbxrefs.includes(dbxref)) this.last().dbxrefs.push(dbxref);
    this.endElementNS = (n) => this.endDBRef(n);
  }

  private endDBRef(name: XmlName): void {
    if (name[0] !== null) throw new RuntimeError(`Unexpected namespace '${name[0]}' for DBRef element`);
    const old = this.seqXMLversion === "0.1";
    if ((name[1] !== "DBRef" && !old) || (name[1] !== "alternativeID" && old)) throw new RuntimeError(`Unexpected localname '${name[1]}' for DBRef element`);
    if (this.data) throw new RuntimeError(`Unexpected data received for DBRef element: '${this.data}'`);
    this.data = null;
    this.endElementNS = (n) => this.endEntryElement(n);
  }

  private startProperty(attrs: Attrs): void {
    let pname: string | null = null;
    let pvalue: string | null = null;
    for (const [key, value] of attrs) {
      if (key[0] !== null) throw new ValueError(`Unexpected namespace '${key[0]}' for property attribute`);
      if (key[1] === "name") pname = value;
      else if (key[1] === "value") pvalue = value;
      // Biopython passes the key as a second argument instead of formatting it, so the message shows both.
      else throw new ValueError(`(${pyRepr("Unexpected attribute '%s' found for property element")}, (None, ${pyRepr(key[1])}))`);
    }
    if (pname === null) throw new ValueError("Failed to find name for property element");
    const annotations = this.last().annotations;
    if (pname === "molecule_type") {
      // `assert old in new`: the existing value must be contained in the new one (a missing key or None value fails differently).
      const old = annotations.get(pname);
      if (!annotations.has(pname)) throw new KeyError(pname);
      if (pvalue === null) throw new TypeError("argument of type 'NoneType' is not a container or iterable");
      if (typeof old !== "string") throw new TypeError(`'in <string>' requires string as left operand, not ${old === null ? "NoneType" : typeof old}`);
      if (!pvalue.includes(old)) throw new AssertionError();
      annotations.set(pname, pvalue);
    } else {
      if (!annotations.has(pname)) annotations.set(pname, []);
      (annotations.get(pname) as unknown[]).push(pvalue);
    }
    this.endElementNS = (n) => this.endSimple(n, "property");
  }
}
