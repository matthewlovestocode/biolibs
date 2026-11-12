/** Parsing of UniProt `<feature>` and `<dbReference>` elements. */

import { AssertionError, IndexError, NotImplementedError, pyInt } from "@biolibs/core";
import { AfterPosition, BeforePosition, ExactPosition, SeqFeature, SimpleLocation, UncertainPosition, UnknownPosition, type Position } from "@biolibs/seqfeature";
import type { SeqRecord } from "@biolibs/seqrecord";
import { pyRepr } from "@biolibs/core";
import { TypeErrorPy } from "./errors.js";
import type { Element } from "./etree.js";
import { NS, attr, concat, localTag } from "./util.js";

/** Python's complaint when a position class is built from `None`. */
const noInt = (): never => {
  throw new TypeErrorPy("int() argument must be a string, a bytes-like object or a real number, not 'NoneType'");
};

/**
 * Turn a `<position>`/`<begin>`/`<end>` element into a Position (Biopython's `_parse_position`).
 *
 * @param offset - Added to the position (-1 converts the 1-based start to 0-based).
 * @throws {@link AssertionError} for status `unknown` with a position; {@link NotImplementedError} for an unknown status.
 */
function parsePosition(element: Element, offset = 0): Position {
  const raw = element.attrib.get("position");
  const position = raw === undefined ? null : pyInt(raw) + offset;
  const status = element.attrib.get("status") ?? "";
  const at = (): number => (position === null ? noInt() : position);
  if (status === "unknown") {
    if (position !== null) throw new AssertionError("");
    return new UnknownPosition();
  }
  if (!status) return new ExactPosition(at());
  if (status === "greater than") return new AfterPosition(at());
  if (status === "less than") return new BeforePosition(at());
  if (status === "uncertain") return new UncertainPosition(at());
  throw new NotImplementedError(`Position status ${pyRepr(status)}`);
}

/** Parse a `<feature>` element and append the resulting `SeqFeature` to the record. */
export function parseFeature(record: SeqRecord, element: Element): void {
  const feature = new SeqFeature();
  for (const [k, v] of element.attrib) feature.qualifiers.set(k, v);
  feature.type = element.attrib.get("type") ?? "";
  if (element.attrib.has("id")) feature.id = element.attrib.get("id")!;
  for (const child of element.children) {
    if (child.tag === NS + "location") {
      const positions = child.findall(NS + "position");
      let start: Position;
      let end: Position;
      if (positions.length > 0) {
        start = parsePosition(positions[0]!, -1);
        end = parsePosition(positions[0]!);
      } else {
        start = parsePosition(firstOf(child, "begin"), -1);
        end = parsePosition(firstOf(child, "end"));
      }
      feature.location = new SimpleLocation(start, end);
    } else if (child.tag === NS + "ligand") {
      let name: string | null = null;
      let dbRef: string | null = null;
      for (const c of child.children) {
        if (c.tag === NS + "name") name = c.text ? c.text.trim() : null;
        else if (c.tag === NS + "dbReference") dbRef = c.attrib.get("id") ?? null;
      }
      if (!feature.qualifiers.has("ligands")) feature.qualifiers.set("ligands", []);
      const ligands = feature.qualifiers.get("ligands");
      if (!Array.isArray(ligands)) throw new TypeErrorPy("'str' object has no attribute 'append'");
      ligands.push(new Map<string, string | null>([["name", name], ["db_ref", dbRef]]));
    } else feature.qualifiers.set(localTag(child.tag), child.text as never);
  }
  record.features.push(feature);
}

/** `findall(NS + tag)[0]`. @throws IndexError when absent. */
function firstOf(el: Element, tag: string): Element {
  const found = el.findall(NS + tag)[0];
  if (found === undefined) throw new IndexError("list index out of range");
  return found;
}

/**
 * Parse a top-level `<dbReference>`: record the cross-reference and, for PDB entries, validate the chain ranges
 * (Biopython builds features from them but never keeps them, so only the errors are visible).
 */
export function parseDbReference(record: SeqRecord, element: Element): void {
  record.dbxrefs.push(concat(attr(element, "type") + ":", attr(element, "id")));
  if (attr(element, "type") !== "PDB") return;
  for (const ref of element.children) {
    if (ref.tag !== NS + "property") continue;
    // Every property must carry a type; method and resolution must carry a value (Python reads them unconditionally).
    const datType = attr(ref, "type");
    if (datType === "method" || datType === "resolution") attr(ref, "value");
    if (datType !== "chains") continue;
    for (const piece of attr(ref, "value").split(",")) {
      const pair = piece.trim().split("=");
      if (pair[1] === undefined) throw new IndexError("list index out of range");
      if (pair[1] === "-") continue;
      const range = pair[1].split("-");
      const start = pyInt(range[0]!) - 1;
      if (range[1] === undefined) throw new IndexError("list index out of range");
      new SimpleLocation(start, pyInt(range[1]));
    }
  }
}
