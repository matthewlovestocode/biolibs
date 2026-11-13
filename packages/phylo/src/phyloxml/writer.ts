/** The phyloXML writer (Biopython's `PhyloXMLIO.Writer` and `write`): an `Element` tree built from the objects, indented and serialised. */

import { PyFloat, ValueError, pyFloatRepr } from "@biolibs/core";
import { Element, serializeUnicode } from "@biolibs/seqio";
import { Clade as BaseClade } from "../base-tree/clade.js";
import { Tree as BaseTree } from "../base-tree/tree.js";
import { Clade, Phylogeny } from "./clade.js";
import { Confidence, Other, Phyloxml, ProteinDomain } from "./elements.js";
import { PHY, ns } from "./xml.js";

/** What a writer needs from its target. */
export interface XmlTarget { write(text: string): void }

/** `_serialize`: a float prints as upper-case `str(float)`, a bool as `true`/`false`. */
export function serialize(value: unknown): string {
  if (value instanceof PyFloat) return pyFloatRepr(value.value).toUpperCase();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (value instanceof Confidence) return pyFloatRepr(value.value).toUpperCase();
  if (typeof value === "number" && !Number.isInteger(value)) return pyFloatRepr(value).toUpperCase();
  return String(value);
}

type Sub = string | [method: string, plural: string];
interface Spec { attrs: string[]; subs: Sub[]; text?: boolean }

/** Attribute and sub-node order of every complex element. */
const SPEC: Record<string, Spec> = {
  phylogeny: { attrs: ["rooted", "rerootable", "branch_length_unit", "type"], subs: ["name", "id", "description", "date", ["confidence", "confidences"], "clade", ["clade_relation", "clade_relations"], ["sequence_relation", "sequence_relations"], ["property", "properties"], ["other", "other"]] },
  clade: { attrs: ["id_source"], subs: ["name", "branch_length", ["confidence", "confidences"], "width", "color", "node_id", ["taxonomy", "taxonomies"], ["sequence", "sequences"], "events", "binary_characters", ["distribution", "distributions"], "date", ["reference", "references"], ["property", "properties"], ["clade", "clades"], ["other", "other"]] },
  accession: { attrs: ["source"], subs: [], text: true },
  annotation: { attrs: ["ref", "source", "evidence", "type"], subs: ["desc", "confidence", ["property", "properties"], "uri"] },
  clade_relation: { attrs: ["id_ref_0", "id_ref_1", "distance", "type"], subs: ["confidence"] },
  color: { attrs: [], subs: ["red", "green", "blue"] },
  confidence: { attrs: ["type"], subs: [], text: true },
  date: { attrs: ["unit"], subs: ["desc", "value", "minimum", "maximum"] },
  distribution: { attrs: [], subs: ["desc", ["point", "points"], ["polygon", "polygons"]] },
  domain_architecture: { attrs: ["length"], subs: [["domain", "domains"]] },
  events: { attrs: [], subs: ["type", "duplications", "speciations", "losses", "confidence"] },
  id: { attrs: ["provider"], subs: [], text: true },
  mol_seq: { attrs: ["is_aligned"], subs: [], text: true },
  node_id: { attrs: ["provider"], subs: [], text: true },
  point: { attrs: ["geodetic_datum", "alt_unit"], subs: ["lat", "long", "alt"] },
  polygon: { attrs: [], subs: [["point", "points"]] },
  property: { attrs: ["ref", "unit", "datatype", "applies_to", "id_ref"], subs: [], text: true },
  reference: { attrs: ["doi"], subs: ["desc"] },
  sequence: { attrs: ["type", "id_ref", "id_source"], subs: ["symbol", "accession", "name", "location", "mol_seq", "uri", ["annotation", "annotations"], "domain_architecture", ["other", "other"]] },
  sequence_relation: { attrs: ["id_ref_0", "id_ref_1", "distance", "type"], subs: ["confidence"] },
  taxonomy: { attrs: ["id_source"], subs: ["id", "code", "scientific_name", "authority", ["common_name", "common_names"], ["synonym", "synonyms"], "rank", "uri", ["other", "other"]] },
  uri: { attrs: ["desc", "type"], subs: [], text: true },
};
const SIMPLE = new Set(["alt", "branch_length", "lat", "long", "maximum", "minimum", "value", "width", "blue", "duplications", "green", "losses", "red", "speciations", "bc", "code", "common_name", "desc", "description", "location", "name", "rank", "scientific_name", "symbol", "synonym", "type"]);

/** `getattr(obj, name)` by Python name: through `pyDict` so floats keep their type. */
function attrOf(obj: object, name: string): unknown {
  if (name === "clade") return (obj as Phylogeny).rootClade;
  if (obj instanceof Confidence && name === "value") return new PyFloat(obj.value);
  const key = name === "color" ? "_color" : name;
  const entry = (obj as { pyDict(): [string, unknown][] }).pyDict().find(([k]) => k === key);
  if (entry === undefined) return (obj as unknown as Record<string, unknown>)[name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())];
  return entry[1];
}

const cleanAttrib = (obj: object, attrs: string[]): Map<string, string> => {
  const out = new Map<string, string>();
  for (const key of attrs) { const v = attrOf(obj, key); if (v !== null && v !== undefined) out.set(key, serialize(v)); }
  return out;
};

/** Builds the `Element` tree of a `Phyloxml` and writes it. */
export class Writer {
  private readonly root: Element;

  /** @param phyloxml - The object to serialise. */
  constructor(phyloxml: Phyloxml) { this.root = this.phyloxml(phyloxml); }

  /** Write the document; returns the number of top-level elements. @param target - Where to write. @param indent - Pretty-print (default true). */
  write(target: XmlTarget, indent = true): number {
    if (indent) this.indent(this.root);
    target.write(serializeUnicode(this.root, new Map([[PHY, "phy"]])));
    return this.root.children.length;
  }

  /** `_indent`: add line breaks and two-space indentation in place. */
  private indent(elem: Element, level = 0): void {
    const i = "\n" + "  ".repeat(level);
    const blank = (s: string | null): boolean => !s || !s.trim();
    if (elem.children.length > 0) {
      if (blank(elem.text)) elem.text = i + "  ";
      let last = elem;
      for (const e of elem.children) { this.indent(e, level + 1); if (blank(e.tail)) e.tail = i + "  "; last = e; }
      if (blank(last.tail)) last.tail = i;
    } else if (level && blank(elem.tail)) elem.tail = i;
  }

  private phyloxml(obj: Phyloxml): Element {
    const elem = new Element("phyloxml", new Map(Object.entries(obj.attributes)));
    for (const tree of obj.phylogenies) elem.children.push(this.node("phylogeny", tree as object));
    for (const o of obj.other) elem.children.push(this.other(o));
    return elem;
  }

  private other(obj: Other): Element {
    const elem = new Element(ns(obj.tag, String(obj.namespace)), new Map(Object.entries(obj.attributes)));
    elem.text = obj.value;
    for (const c of obj.children) elem.children.push(this.other(c));
    return elem;
  }

  /** Serialise `value` with the handler called `method`. */
  private node(method: string, value: unknown): Element {
    if (method === "other") return this.other(value as Other);
    if (method === "binary_characters") return this.binaryCharacters(value as object);
    if (method === "domain") return this.domain(value as ProteinDomain);
    const spec = SPEC[method === "taxonomy" || method === "sequence" ? method : method];
    if (spec) return this.complex(method, spec, value as object);
    if (SIMPLE.has(method)) { const e = new Element(method, new Map()); e.text = serialize(value); return e; }
    throw new TypeError(`'Writer' object has no attribute '${method}'`);
  }

  private complex(tag: string, spec: Spec, obj: object): Element {
    const elem = new Element(tag, cleanAttrib(obj, spec.attrs));
    for (const sub of spec.subs) {
      if (typeof sub === "string") { const v = attrOf(obj, sub); if (v !== null && v !== undefined) elem.children.push(this.node(sub, v)); }
      else for (const item of attrOf(obj, sub[1]) as unknown[]) elem.children.push(this.node(sub[0], item));
    }
    if (spec.text) elem.text = serialize(attrOf(obj, "value"));
    return elem;
  }

  private binaryCharacters(obj: object): Element {
    const elem = new Element("binary_characters", cleanAttrib(obj, ["type", "gained_count", "lost_count", "present_count", "absent_count"]));
    for (const name of ["gained", "lost", "present", "absent"]) {
      const sub = new Element(name, new Map());
      for (const token of attrOf(obj, name) as string[]) sub.children.push(this.node("bc", token));
      elem.children.push(sub);
    }
    return elem;
  }

  private domain(obj: ProteinDomain): Element {
    const elem = new Element("domain", new Map([["from", String(obj.start + 1)], ["to", String(obj.end)]]));
    if (obj.confidence !== null) elem.attrib.set("confidence", serialize(obj.confidence));
    if (obj.id !== null) elem.attrib.set("id", obj.id);
    elem.text = serialize(obj.value);
    return elem;
  }
}

/** `fix_single`: a phylogeny from a tree or clade. @throws ValueError for anything else. */
function fixSingle(tree: unknown): Phylogeny {
  if (tree instanceof Phylogeny) return tree;
  if (tree instanceof Clade) return tree.toPhylogeny();
  if (tree instanceof BaseTree) return Phylogeny.fromTree(tree);
  if (tree instanceof BaseClade) return Phylogeny.fromTree(new BaseTree({ root: tree }));
  throw new ValueError("iterable must contain Tree or Clade types");
}

/**
 * Write a phyloXML document.
 *
 * @param obj - A `Phyloxml`, or an iterable of trees/clades (each converted to a `Phylogeny`).
 * @param target - Where to write.
 * @param indent - Pretty-print (default true).
 * @returns The number of top-level elements written.
 * @throws ValueError for a first argument of another type, or an item that is not a tree or clade.
 */
export function write(obj: Phyloxml | Iterable<unknown>, target: XmlTarget, indent = true): number {
  let doc: Phyloxml;
  if (obj instanceof Phyloxml) doc = obj;
  // Biopython calls `fix_single(obj).to_phyloxml()`, a method that does not exist.
  else if (obj instanceof BaseTree || obj instanceof BaseClade) { fixSingle(obj); throw new TypeError("'Phylogeny' object has no attribute 'to_phyloxml'"); }
  else if (obj !== null && typeof obj === "object" && Symbol.iterator in obj) doc = new Phyloxml({}, [...obj].map(fixSingle));
  else throw new ValueError("First argument must be a Phyloxml, Phylogeny, Tree, or iterable of Trees or Phylogenies.");
  return new Writer(doc).write(target, indent);
}
