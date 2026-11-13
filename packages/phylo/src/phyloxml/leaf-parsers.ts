/** The phyloXML element converters (Biopython's `Parser.accession`, `.confidence`, `.point`, ...): an XML `Element` in, an object out. */

import { PyFloat, pyFloat, pyInt, pyStrip } from "@biolibs/core";
import type { Element } from "@biolibs/seqio";
import {
  Accession, Annotation, BinaryCharacters, BranchColor, CladeRelation, Confidence, Date as PhyloDate, Distribution, DomainArchitecture, Events, Id, MolSeq, Other, Point,
  Polygon, Property, ProteinDomain, Reference, SequenceRelation, Uri,
} from "./elements.js";
import { PARAMS, attrsAsOptions } from "./kwargs.js";
import { childAs, childText, childrenAs, childrenText, collapse, splitNamespace, str2bool, strip, toFloat, toInt } from "./xml.js";

/** A parsed float, which Python holds as a `float` (so a whole value keeps its `.0`). */
export const pf = (x: number | null): PyFloat | null => (x === null ? null : new PyFloat(x));
const pfs = (s: string): PyFloat => new PyFloat(pyFloat(s));

/** `int(text)` where a missing attribute is Python's `int(None)`, a `TypeError`. */
function intOf(text: string | null): number {
  if (text === null) throw new TypeError("int() argument must be a string, a bytes-like object or a real number, not 'NoneType'");
  return pyInt(text);
}

const attr = (e: Element, key: string): string | null => e.attrib.get(key) ?? null;

/** `Parser.other`: a non-phyloXML element and its descendants. @throws TypeError for a child with no namespace. */
export function other(elem: Element, namespace: string, localTag: string): Other {
  return new Other(
    localTag, namespace, Object.fromEntries(elem.attrib), elem.text && pyStrip(elem.text) ? pyStrip(elem.text) : null,
    elem.children.map((c) => {
      const [ns, tag] = splitForOther(c.tag);
      return other(c, ns, tag);
    }),
  );
}

/** `self.other(child, *_split_namespace(child.tag))`: an unnamespaced child leaves `localtag` missing. */
function splitForOther(tag: string): [string, string] {
  try { return splitNamespace(tag); } catch { throw new TypeError("Parser.other() missing 1 required positional argument: 'localtag'"); }
}

/** An `Accession`. */
export const accession = (e: Element): Accession => new Accession(strip(e.text), attr(e, "source"));

/** A `Confidence`. @throws TypeError when the text is not a number (Python builds `float(None)`). */
export const confidence = (e: Element): Confidence => {
  const v = toFloat(e.text);
  if (v === null) throw new TypeError("float() argument must be a string or a real number, not 'NoneType'");
  return new Confidence(v, attr(e, "type"));
};

/** A `Uri`. */
export const uri = (e: Element): Uri => new Uri(strip(e.text), collapse(attr(e, "desc")), attr(e, "type"));

/** An `Id` (the provider may be given as `type`). */
export const id = (e: Element): Id => new Id(strip(e.text), attr(e, "provider") || attr(e, "type"));

/** A `Property`. */
export const property = (e: Element): Property => new Property(strip(e.text), attr(e, "ref") as string, attr(e, "applies_to") as string, attr(e, "datatype") as string, attr(e, "unit"), attr(e, "id_ref"));

/** A `Point`. */
export const point = (e: Element): Point =>
  new Point(attr(e, "geodetic_datum") as string, childText(e, "lat", pfs) as PyFloat, childText(e, "long", pfs) as PyFloat, childText(e, "alt", pfs), attr(e, "alt_unit"));

/** A `Polygon`. */
export const polygon = (e: Element): Polygon => new Polygon(childrenAs(e, "point", point));

/** An `Annotation`. */
export function annotation(e: Element): Annotation {
  const desc = collapse(childText(e, "desc"));
  const conf = childAs(e, "confidence", confidence);
  const properties = childrenAs(e, "property", property);
  const u = childAs(e, "uri", uri);
  const extra = attrsAsOptions("Annotation", PARAMS.Annotation, e.attrib, ["desc", "confidence", "properties", "uri"]);
  return new Annotation({ desc, confidence: conf, properties, uri: u, ...extra });
}

/** `BinaryCharacters`. */
export function binaryCharacters(e: Element): BinaryCharacters {
  const bc = (x: Element): string[] => childrenText(x, "bc");
  return new BinaryCharacters({
    type: attr(e, "type"), gainedCount: toInt(attr(e, "gained_count")), lostCount: toInt(attr(e, "lost_count")), presentCount: toInt(attr(e, "present_count")), absentCount: toInt(attr(e, "absent_count")),
    gained: childAs(e, "gained", bc), lost: childAs(e, "lost", bc), present: childAs(e, "present", bc), absent: childAs(e, "absent", bc),
  });
}

/** A `CladeRelation`. */
export const cladeRelation = (e: Element): CladeRelation =>
  new CladeRelation(attr(e, "type") as string, attr(e, "id_ref_0") as string, attr(e, "id_ref_1") as string, attr(e, "distance"), childAs(e, "confidence", confidence));

/** A `BranchColor`. @throws AssertionError when a channel is missing. */
export function color(e: Element): BranchColor {
  const [r, g, b] = ["red", "green", "blue"].map((c) => childText(e, c, pyInt));
  return new BranchColor(r as number, g as number, b as number);
}

/** A `Date`. */
export const date = (e: Element): PhyloDate =>
  new PhyloDate({ unit: attr(e, "unit"), desc: collapse(childText(e, "desc")), value: childText(e, "value", pfs), minimum: childText(e, "minimum", pfs), maximum: childText(e, "maximum", pfs) });

/** A `Distribution`. */
export const distribution = (e: Element): Distribution => new Distribution(collapse(childText(e, "desc")), childrenAs(e, "point", point), childrenAs(e, "polygon", polygon));

/** A `ProteinDomain` (the `from` attribute is 1-based). */
export const domain = (e: Element): ProteinDomain => new ProteinDomain(strip(e.text), intOf(attr(e, "from")) - 1, intOf(attr(e, "to")), pf(toFloat(attr(e, "confidence"))), attr(e, "id"));

/** A `DomainArchitecture`. */
export const domainArchitecture = (e: Element): DomainArchitecture => new DomainArchitecture(intOf(attr(e, "length")), childrenAs(e, "domain", domain));

/** `Events`. */
export const events = (e: Element): Events =>
  new Events({ type: childText(e, "type"), duplications: childText(e, "duplications", pyInt), speciations: childText(e, "speciations", pyInt), losses: childText(e, "losses", pyInt), confidence: childAs(e, "confidence", confidence) });

/** A `MolSeq`. */
export function molSeq(e: Element): MolSeq {
  const aligned = attr(e, "is_aligned");
  return new MolSeq(strip(e.text), aligned === null ? null : str2bool(aligned));
}

/** A `Reference`. */
export const reference = (e: Element): Reference => new Reference(attr(e, "doi"), childText(e, "desc"));

/** A `SequenceRelation`. */
export const sequenceRelation = (e: Element): SequenceRelation =>
  new SequenceRelation(attr(e, "type") as string, attr(e, "id_ref_0") as string, attr(e, "id_ref_1") as string, pf(toFloat(attr(e, "distance"))), childAs(e, "confidence", confidence));
