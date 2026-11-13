/** The phyloXML element classes for annotations, events, properties, relations and taxonomy. */

import { KeyError, pyRepr } from "@biolibs/core";
import { type Num, PhyloElement, checkStr } from "./element-base.js";
import type { Confidence, Id, Other, Uri } from "./elements-core.js";

const RE_REF = /[a-zA-Z0-9_]+:[a-zA-Z0-9_\.\-\s]+/;
const EVENT_TYPES = new Set(["transfer", "fusion", "speciation_or_duplication", "other", "mixed", "unassigned"]);
const APPLIES_TO = new Set(["phylogeny", "clade", "node", "annotation", "parent_branch", "other"]);
const DATATYPES = new Set(["xsd:string", "xsd:boolean", "xsd:decimal", "xsd:float", "xsd:double", "xsd:duration", "xsd:dateTime", "xsd:time", "xsd:date", "xsd:gYearMonth", "xsd:gYear", "xsd:gMonthDay", "xsd:gDay", "xsd:gMonth", "xsd:hexBinary", "xsd:base64Binary", "xsd:anyURI", "xsd:normalizedString", "xsd:token", "xsd:integer", "xsd:nonPositiveInteger", "xsd:negativeInteger", "xsd:long", "xsd:int", "xsd:short", "xsd:byte", "xsd:nonNegativeInteger", "xsd:unsignedLong", "xsd:unsignedInt", "xsd:unsignedShort", "xsd:unsignedByte", "xsd:positiveInteger"]);
const RELATION_TYPES = new Set(["orthology", "one_to_one_orthology", "super_orthology", "paralogy", "ultra_paralogy", "xenology", "unknown", "other"]);
const RANKS = new Set(["domain", "kingdom", "subkingdom", "branch", "infrakingdom", "superphylum", "phylum", "subphylum", "infraphylum", "microphylum", "superdivision", "division", "subdivision", "infradivision", "superclass", "class", "subclass", "infraclass", "superlegion", "legion", "sublegion", "infralegion", "supercohort", "cohort", "subcohort", "infracohort", "superorder", "order", "suborder", "superfamily", "family", "subfamily", "supertribe", "tribe", "subtribe", "infratribe", "genus", "subgenus", "superspecies", "species", "subspecies", "variety", "subvariety", "form", "subform", "cultivar", "unknown", "other"]);

/** The annotation of a molecular sequence. */
export class Annotation extends PhyloElement {
  /** The attributes, in constructor order. */
  ref: string | null; source: string | null; evidence: string | null; type: string | null; desc: string | null; confidence: Confidence | null; uri: Uri | null; properties: Property[];
  /** @param o - The attributes (all optional). */
  constructor(o: { ref?: string | null; source?: string | null; evidence?: string | null; type?: string | null; desc?: string | null; confidence?: Confidence | null; uri?: Uri | null; properties?: Property[] | null } = {}) {
    super();
    checkStr(o.ref, RE_REF);
    this.ref = o.ref ?? null; this.source = o.source ?? null; this.evidence = o.evidence ?? null; this.type = o.type ?? null; this.desc = o.desc ?? null;
    this.confidence = o.confidence ?? null; this.uri = o.uri ?? null; this.properties = o.properties && o.properties.length > 0 ? o.properties : [];
  }
  override pyDict(): [string, unknown][] { return [["ref", this.ref], ["source", this.source], ["evidence", this.evidence], ["type", this.type], ["desc", this.desc], ["confidence", this.confidence], ["uri", this.uri], ["properties", this.properties]]; }
}

/** Events at the root of a clade; also usable like a dictionary of the attributes that are set. */
export class Events extends PhyloElement {
  type: string | null; duplications: number | null; speciations: number | null; losses: number | null; confidence: Confidence | null;
  /** @param o - The attributes (all optional). */
  constructor(o: { type?: string | null; duplications?: number | null; speciations?: number | null; losses?: number | null; confidence?: Confidence | null } = {}) {
    super();
    checkStr(o.type, (s) => EVENT_TYPES.has(s));
    this.type = o.type ?? null; this.duplications = o.duplications ?? null; this.speciations = o.speciations ?? null; this.losses = o.losses ?? null; this.confidence = o.confidence ?? null;
  }
  /** Attributes added through `events[key] = value` that are not among the standard five. */
  private readonly extra = new Map<string, unknown>();
  override pyDict(): [string, unknown][] {
    return [["type", this.type], ["duplications", this.duplications], ["speciations", this.speciations], ["losses", this.losses], ["confidence", this.confidence], ...this.extra];
  }
  /** The attributes that are set, as `[key, value]` pairs. */
  items(): [string, unknown][] { return this.pyDict().filter(([, v]) => v !== null); }
  /** The names of the attributes that are set. */
  keys(): string[] { return this.items().map(([k]) => k); }
  /** The values that are set. */
  values(): unknown[] { return this.items().map(([, v]) => v); }
  /** The number of attributes that are set. */
  get length(): number { return this.values().length; }
  /** `events[key]`. @throws KeyError for an unknown or unset key. */
  get(key: string): unknown {
    const entry = this.pyDict().find(([k]) => k === key);
    if (entry === undefined) throw new KeyError(key);
    if (entry[1] === null) throw new KeyError(`${pyRepr(key)} has not been set in this object`);
    return entry[1];
  }
  /** `events[key] = value`. */
  set(key: string, value: unknown): void {
    if (["type", "duplications", "speciations", "losses", "confidence"].includes(key)) (this as unknown as Record<string, unknown>)[key] = value;
    else this.extra.set(key, value);
  }
  /** `del events[key]`: set the attribute back to null. */
  delete(key: string): void { this.set(key, null); }
  /** `key in events`. */
  has(key: string): boolean { return this.items().some(([k]) => k === key); }
  [Symbol.iterator](): Iterator<string> { return this.keys()[Symbol.iterator](); }
}

/** A typed property from an external resource. */
export class Property extends PhyloElement {
  unit: string | null; idRef: string | null;
  /** @param value - The value. @param ref - Reference (`AU:km`). @param appliesTo - What it applies to. @param datatype - An `xsd:` type. @param unit - Unit. @param idRef - Id of the target. */
  constructor(public value: string, public ref: string, public appliesTo: string, public datatype: string, unit: string | null = null, idRef: string | null = null) {
    super();
    checkStr(ref, RE_REF); checkStr(appliesTo, (s) => APPLIES_TO.has(s)); checkStr(datatype, (s) => DATATYPES.has(s)); checkStr(unit, RE_REF);
    this.unit = unit; this.idRef = idRef;
  }
  override pyDict(): [string, unknown][] { return [["unit", this.unit], ["id_ref", this.idRef], ["value", this.value], ["ref", this.ref], ["applies_to", this.appliesTo], ["datatype", this.datatype]]; }
}

/** A typed relationship between two sequences. */
export class SequenceRelation extends PhyloElement {
  distance: Num | null;
  /** @param type - Relation type. @param idRef0 - First sequence. @param idRef1 - Second sequence. @param distance - Distance. @param confidence - Confidence. */
  constructor(public type: string, public idRef0: string, public idRef1: string, distance: Num | null = null, public confidence: Confidence | null = null) {
    super();
    checkStr(type, (s) => RELATION_TYPES.has(s));
    this.distance = distance;
  }
  override pyDict(): [string, unknown][] { return [["distance", this.distance], ["type", this.type], ["id_ref_0", this.idRef0], ["id_ref_1", this.idRef1], ["confidence", this.confidence]]; }
}

/** Taxonomic information for a clade. */
export class Taxonomy extends PhyloElement {
  idSource: string | null; id: Id | null; code: string | null; scientificName: string | null; authority: string | null; rank: string | null; uri: Uri | null;
  commonNames: string[]; synonyms: string[]; other: Other[];
  /** @param o - The attributes (all optional). */
  constructor(o: { idSource?: string | null; id?: Id | null; code?: string | null; scientificName?: string | null; authority?: string | null; rank?: string | null; uri?: Uri | null; commonNames?: string[] | null; synonyms?: string[] | null; other?: Other[] | null } = {}) {
    super();
    checkStr(o.code, /[a-zA-Z0-9_]{2,10}/); checkStr(o.rank, (s) => RANKS.has(s));
    this.idSource = o.idSource ?? null; this.id = o.id ?? null; this.code = o.code ?? null; this.scientificName = o.scientificName ?? null; this.authority = o.authority ?? null;
    this.rank = o.rank ?? null; this.uri = o.uri ?? null;
    this.commonNames = o.commonNames && o.commonNames.length > 0 ? o.commonNames : []; this.synonyms = o.synonyms && o.synonyms.length > 0 ? o.synonyms : []; this.other = o.other && o.other.length > 0 ? o.other : [];
  }
  override pyDict(): [string, unknown][] {
    return [["id_source", this.idSource], ["id", this.id], ["code", this.code], ["scientific_name", this.scientificName], ["authority", this.authority], ["rank", this.rank], ["uri", this.uri], ["common_names", this.commonNames], ["synonyms", this.synonyms], ["other", this.other]];
  }
  override toString(): string {
    if (this.code !== null) return this.code;
    if (this.scientificName !== null) return this.scientificName;
    if (this.rank !== null) return this.rank;
    if (this.id !== null) return String(this.id);
    return "Taxonomy";
  }
}
