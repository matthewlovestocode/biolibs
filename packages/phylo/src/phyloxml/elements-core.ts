/** The phyloXML element classes for documents, identifiers and small value types. */

import { KeyError, PyFloat, pyClassRepr, pyFloatRepr, pyRepr } from "@biolibs/core";
import { BranchColor as BaseBranchColor } from "../base-tree/branch-color.js";
import { type Attributes, type Num, PhyloElement, checkStr, numStr } from "./element-base.js";

/** Root of a phyloXML document: namespace attributes, phylogenies and other elements. */
export class Phyloxml extends PhyloElement {
  /** The XML attributes of the root element. */
  attributes: Attributes;
  /** The trees. */
  phylogenies: unknown[];
  /** Elements from other namespaces. */
  other: Other[];

  /** @param attributes - Namespace definitions merged over the defaults. @param phylogenies - Trees. @param other - Other elements. */
  constructor(attributes: Attributes | null, phylogenies: unknown[] | null = null, other: Other[] | null = null) {
    super();
    this.attributes = { "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance", xmlns: "http://www.phyloxml.org", "xsi:schemaLocation": "http://www.phyloxml.org http://www.phyloxml.org/1.10/phyloxml.xsd" };
    if (attributes) Object.assign(this.attributes, attributes);
    this.phylogenies = phylogenies && phylogenies.length > 0 ? phylogenies : [];
    this.other = other && other.length > 0 ? other : [];
  }
  override pyDict(): [string, unknown][] { return [["attributes", this.attributes], ["phylogenies", this.phylogenies], ["other", this.other]]; }

  /** A phylogeny by position or name. @throws KeyError for an unknown name or a bad index type. */
  get(index: number | string): unknown {
    if (typeof index === "number" && Number.isInteger(index)) {
      const i = index < 0 ? index + this.phylogenies.length : index;
      if (i < 0 || i >= this.phylogenies.length) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
      return this.phylogenies[i];
    }
    if (typeof index !== "string") throw new KeyError(`can't use ${pyClassRepr(index)} as an index`);
    for (const tree of this.phylogenies) if ((tree as { name: string | null }).name === index) return tree;
    throw new KeyError(`no phylogeny found with name ${pyRepr(index)}`);
  }
  /** The number of phylogenies. */
  get length(): number { return this.phylogenies.length; }
  [Symbol.iterator](): Iterator<unknown> { return this.phylogenies[Symbol.iterator](); }
  override toString(): string { return `${this.constructor.name}([${this.phylogenies.map(String).join(",\n")}])`; }
}

/** A non-phyloXML element inside a tree. */
export class Other extends PhyloElement {
  /** @param tag - Local tag. @param namespace - XML namespace. @param attributes - XML attributes. @param value - Text. @param children - Child `Other`s. */
  constructor(public tag: string, public namespace: string | null = null, public attributes: Attributes = {}, public value: string | null = null, public children: Other[] = []) { super(); }
  override pyDict(): [string, unknown][] { return [["tag", this.tag], ["namespace", this.namespace], ["attributes", this.attributes], ["value", this.value], ["children", this.children]]; }
  [Symbol.iterator](): Iterator<Other> { return this.children[Symbol.iterator](); }
}

/** An accession code (`source:value`). */
export class Accession extends PhyloElement {
  /** @param value - The code. @param source - Its source. */
  constructor(public value: string, public source: string | null) { super(); }
  override pyDict(): [string, unknown][] { return [["value", this.value], ["source", this.source]]; }
  override toString(): string { return `${this.source === null ? "None" : this.source}:${this.value}`; }
}

/** Binary characters at the root of a clade. */
export class BinaryCharacters extends PhyloElement {
  type: string | null; gainedCount: number | null; lostCount: number | null; presentCount: number | null; absentCount: number | null;
  gained: string[]; lost: string[]; present: string[]; absent: string[];
  /** @param o - The attributes (all optional). */
  constructor(o: { type?: string | null; gainedCount?: number | null; lostCount?: number | null; presentCount?: number | null; absentCount?: number | null; gained?: string[] | null; lost?: string[] | null; present?: string[] | null; absent?: string[] | null } = {}) {
    super();
    this.type = o.type ?? null; this.gainedCount = o.gainedCount ?? null; this.lostCount = o.lostCount ?? null; this.presentCount = o.presentCount ?? null; this.absentCount = o.absentCount ?? null;
    this.gained = o.gained && o.gained.length > 0 ? o.gained : []; this.lost = o.lost && o.lost.length > 0 ? o.lost : [];
    this.present = o.present && o.present.length > 0 ? o.present : []; this.absent = o.absent && o.absent.length > 0 ? o.absent : [];
  }
  override pyDict(): [string, unknown][] {
    return [["type", this.type], ["gained_count", this.gainedCount], ["lost_count", this.lostCount], ["present_count", this.presentCount], ["absent_count", this.absentCount], ["gained", this.gained], ["lost", this.lost], ["present", this.present], ["absent", this.absent]];
  }
}

/** A typed relationship between two clades. */
export class CladeRelation extends PhyloElement {
  distance: string | null;
  /** @param type - Relation type. @param idRef0 - First clade. @param idRef1 - Second clade. @param distance - Distance. @param confidence - Confidence. */
  constructor(public type: string, public idRef0: string, public idRef1: string, distance: string | null = null, public confidence: Confidence | null = null) { super(); this.distance = distance; }
  override pyDict(): [string, unknown][] { return [["distance", this.distance], ["type", this.type], ["id_ref_0", this.idRef0], ["id_ref_1", this.idRef1], ["confidence", this.confidence]]; }
}

/** A confidence value (Biopython's `float` subclass with a `type`). */
export class Confidence extends PhyloElement {
  /** The number. */
  readonly value: number;
  /** @param value - The number. @param type - What it measures (default `"unknown"`). */
  constructor(value: number, public type: string | null = "unknown") { super(); this.value = value; }
  override pyDict(): [string, unknown][] { return [["type", this.type]]; }
  /** `repr(float)`. */
  override repr(): string { return new PyFloat(this.value).toString(); }
  override toString(): string { return this.repr(); }
}

/** A date for a clade. */
export class Date extends PhyloElement {
  value: Num | null; unit: string | null; desc: string | null; minimum: Num | null; maximum: Num | null;
  /** @param o - The attributes (all optional). */
  constructor(o: { value?: Num | null; unit?: string | null; desc?: string | null; minimum?: Num | null; maximum?: Num | null } = {}) {
    super();
    this.value = o.value ?? null; this.unit = o.unit ?? null; this.desc = o.desc ?? null; this.minimum = o.minimum ?? null; this.maximum = o.maximum ?? null;
  }
  override pyDict(): [string, unknown][] { return [["value", this.value], ["unit", this.unit], ["desc", this.desc], ["minimum", this.minimum], ["maximum", this.maximum]]; }
  override toString(): string {
    if (this.unit && this.value !== null) return `${numStr(this.value)} ${this.unit}`;
    if (this.desc !== null) return this.desc;
    return "Date";
  }
}

/** A general-purpose identifier with an optional provider. */
export class Id extends PhyloElement {
  /** @param value - The identifier. @param provider - Who issued it. */
  constructor(public value: string, public provider: string | null = null) { super(); }
  override pyDict(): [string, unknown][] { return [["value", this.value], ["provider", this.provider]]; }
  override toString(): string { return this.provider !== null ? `${this.provider}:${this.value}` : this.value; }
}

/** A molecular sequence. */
export class MolSeq extends PhyloElement {
  /** @param value - The sequence text. @param isAligned - Whether it is aligned. */
  constructor(public value: string, public isAligned: boolean | null = null) { super(); checkStr(value, /[a-zA-Z\.\-\?\*_]+/); }
  override pyDict(): [string, unknown][] { return [["value", this.value], ["is_aligned", this.isAligned]]; }
  override toString(): string { return this.value; }
}

/** A literature reference. */
export class Reference extends PhyloElement {
  /** @param doi - DOI. @param desc - Free-text description. */
  constructor(public doi: string | null = null, public desc: string | null = null) { super(); checkStr(doi, /[a-zA-Z0-9_\.]+\/[a-zA-Z0-9_\.]+/); }
  override pyDict(): [string, unknown][] { return [["doi", this.doi], ["desc", this.desc]]; }
}

/** A uniform resource identifier. */
export class Uri extends PhyloElement {
  /** @param value - The URI. @param desc - Description. @param type - Kind (such as `image`). */
  constructor(public value: string, public desc: string | null = null, public type: string | null = null) { super(); }
  override pyDict(): [string, unknown][] { return [["value", this.value], ["desc", this.desc], ["type", this.type]]; }
  override toString(): string { return this.value ? this.value : this.repr(); }
}

/** The colour of a branch (a `BranchColor` that is also a phyloXML element). */
export class BranchColor extends BaseBranchColor {
  /** @param red - 0 to 255. @param green - 0 to 255. @param blue - 0 to 255. */
  constructor(red: number, green: number, blue: number) { super(red, green, blue); }
  /** The attributes under their Python names. */
  pyDict(): [string, unknown][] { return [["red", this.red], ["green", this.green], ["blue", this.blue]]; }
  /** `BranchColor(blue=3, green=2, red=1)`: the `TreeElement` repr (attributes sorted). */
  override repr(): string { return `BranchColor(blue=${this.blue}, green=${this.green}, red=${this.red})`; }
  override toString(): string { return this.repr(); }
}
