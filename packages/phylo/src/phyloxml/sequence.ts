/** The phyloXML `Sequence`: a molecular sequence attached to a clade. */

import { PyFloat } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Accession, Annotation, Confidence, DomainArchitecture, MolSeq, Other, PhyloElement, Property, ProteinDomain, Uri, checkStr } from "./elements.js";
import { callKwargs } from "./kwargs.js";

const TYPES = new Set(["dna", "rna", "protein"]);

/** The constructor arguments of a {@link Sequence}. */
export interface SequenceOptions {
  /** `dna`, `rna` or `protein`. */
  type?: string | null;
  /** Reference to another resource. */
  idRef?: string | null;
  /** Source of the reference. */
  idSource?: string | null;
  /** Short symbol (at most 10 characters). */
  symbol?: string | null;
  /** Accession code. */
  accession?: Accession | null;
  /** Full name. */
  name?: string | null;
  /** Location on a genome or chromosome. */
  location?: string | null;
  /** The sequence itself. */
  molSeq?: MolSeq | null;
  /** A link. */
  uri?: Uri | null;
  /** Protein domains. */
  domainArchitecture?: DomainArchitecture | null;
  /** Annotations. */
  annotations?: Annotation[] | null;
  /** Elements from other namespaces. */
  other?: Other[] | null;
}

/** A molecular sequence (protein, DNA or RNA) associated with a node. */
export class Sequence extends PhyloElement {
  type: string | null; idRef: string | null; idSource: string | null; symbol: string | null; accession: Accession | null; name: string | null; location: string | null;
  molSeq: MolSeq | null; uri: Uri | null; domainArchitecture: DomainArchitecture | null; annotations: Annotation[]; other: Other[];

  /** @param o - The attributes (all optional). */
  constructor(o: SequenceOptions = {}) {
    super();
    checkStr(o.type, (s) => TYPES.has(s));
    checkStr(o.symbol, /\S{1,10}/);
    this.type = o.type ?? null; this.idRef = o.idRef ?? null; this.idSource = o.idSource ?? null; this.symbol = o.symbol ?? null;
    this.accession = o.accession ?? null; this.name = o.name ?? null; this.location = o.location ?? null; this.molSeq = o.molSeq ?? null;
    this.uri = o.uri ?? null; this.domainArchitecture = o.domainArchitecture ?? null;
    this.annotations = o.annotations && o.annotations.length > 0 ? o.annotations : [];
    this.other = o.other && o.other.length > 0 ? o.other : [];
  }
  override pyDict(): [string, unknown][] {
    return [
      ["type", this.type], ["id_ref", this.idRef], ["id_source", this.idSource], ["symbol", this.symbol], ["accession", this.accession], ["name", this.name],
      ["location", this.location], ["mol_seq", this.molSeq], ["uri", this.uri], ["domain_architecture", this.domainArchitecture],
      ["annotations", this.annotations], ["other", this.other],
    ];
  }

  /**
   * A phyloXML sequence from a `SeqRecord`.
   *
   * @param record - The record; its `annotations` may hold `id_ref`, `id_source`, `location`, `uri` (a dict), `molecule_type` and `annotations` (a list of dicts).
   * @param isAligned - Whether the sequence is aligned (default: it contains a `-`).
   */
  static fromSeqrecord(record: SeqRecord, isAligned: boolean | null = null): Sequence {
    const text = record.seq!.toString();
    if (isAligned === null) isAligned = text.includes("-");
    const params: SequenceOptions = { accession: new Accession(record.id as string, ""), symbol: record.name, name: record.description, molSeq: new MolSeq(text, isAligned) };
    const molType = record.annotations.get("molecule_type");
    if (molType !== undefined && molType !== null) {
      if (String(molType).includes("DNA")) params.type = "dna";
      else if (String(molType).includes("RNA")) params.type = "rna";
      else if (String(molType).includes("protein")) params.type = "protein";
    }
    for (const [key, field] of [["id_ref", "idRef"], ["id_source", "idSource"], ["location", "location"]] as const) {
      if (record.annotations.has(key)) (params as Record<string, unknown>)[field] = record.annotations.get(key);
    }
    const uri = record.annotations.get("uri");
    if (uri instanceof Map) params.uri = callKwargs("Uri", ["value", "desc", "type"], ["value"], uri, (a) => new Uri(a.value as string, (a.desc ?? null) as string | null, (a.type ?? null) as string | null));
    const annots = record.annotations.get("annotations");
    if (annots !== undefined && annots !== null && (!Array.isArray(annots) || annots.length > 0)) {
      params.annotations = [];
      for (const annot of annots as Map<string, unknown>[]) {
        const args: Record<string, unknown> = {};
        for (const key of ["ref", "source", "evidence", "type", "desc"]) if (annot.has(key)) args[key] = annot.get(key);
        const conf = annot.get("confidence");
        if (Array.isArray(conf)) args.confidence = callConfidence(conf);
        const props = annot.get("properties");
        if (Array.isArray(props)) {
          args.properties = props.filter((p): p is Map<string, unknown> => p instanceof Map).map((p) =>
            callKwargs("Property", ["value", "ref", "applies_to", "datatype", "unit", "id_ref"], ["value", "ref", "applies_to", "datatype"], p,
              (a) => new Property(a.value as string, a.ref as string, a.applies_to as string, a.datatype as string, (a.unit ?? null) as string | null, (a.id_ref ?? null) as string | null)));
        }
        params.annotations.push(new Annotation(args as ConstructorParameters<typeof Annotation>[0]));
      }
    }
    if (record.features.length > 0) {
      params.domainArchitecture = new DomainArchitecture(record.seq!.length, record.features.map((f) => ProteinDomain.fromSeqfeature(f)));
    }
    return new Sequence(params);
  }

  /**
   * A `SeqRecord` from this sequence. Attributes with no `SeqRecord` equivalent (`id_ref`, `id_source`, `location`, `uri`,
   * the molecule type and the annotations) are packed into `record.annotations` as dictionaries (`Map`s) and lists.
   *
   * @throws TypeError (Python's `AttributeError`) when there is no `mol_seq`.
   */
  toSeqrecord(): SeqRecord {
    if (this.molSeq === null) throw new TypeError("'NoneType' object has no attribute 'value'");
    const clean = (entries: [string, unknown][]): Map<string, unknown> => new Map(entries.filter(([, v]) => v !== null && v !== undefined));
    const rec = new SeqRecord(new Seq(this.molSeq.value), this.accession === null ? "None" : String(this.accession), this.symbol ?? undefined, this.name ?? undefined);
    if (this.domainArchitecture) rec.features = (this.domainArchitecture.domains ?? []).map((d) => d.toSeqfeature());
    const molType = this.type === "dna" ? "DNA" : this.type === "rna" ? "RNA" : this.type === "protein" ? "protein" : null;
    const uri = this.uri === null ? null : clean([["value", this.uri.value], ["desc", this.uri.desc], ["type", this.uri.type]]);
    const annotations = this.annotations.map((ann) =>
      clean([
        ["ref", ann.ref], ["source", ann.source], ["evidence", ann.evidence], ["type", ann.type],
        // `ann.confidence and [...]`: a zero confidence is falsy, so Python keeps the confidence object itself.
        ["confidence", ann.confidence === null ? null : ann.confidence.value === 0 ? ann.confidence : [new PyFloat(ann.confidence.value), ann.confidence.type]],
        ["properties", ann.properties.map((p) => clean([["value", p.value], ["ref", p.ref], ["applies_to", p.appliesTo], ["datatype", p.datatype], ["unit", p.unit], ["id_ref", p.idRef]]))],
      ]));
    rec.annotations = clean([["id_ref", this.idRef], ["id_source", this.idSource], ["location", this.location], ["uri", uri], ["molecule_type", molType], ["annotations", annotations]]);
    return rec;
  }
}

/** `Confidence(*values)` for a list from an annotation: `[value]` or `[value, type]`. */
function callConfidence(values: unknown[]): Confidence {
  if (values.length === 0) throw new TypeError("Confidence.__new__() missing 1 required positional argument: 'value'");
  if (values.length > 2) throw new TypeError(`Confidence.__new__() takes from 2 to 3 positional arguments but ${values.length + 1} were given`);
  const v = values[0];
  const num = v instanceof PyFloat ? v.value : (v as number);
  return values.length === 2 ? new Confidence(num, values[1] as string | null) : new Confidence(num);
}
