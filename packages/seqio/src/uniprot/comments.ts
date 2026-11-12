/** Parsing of UniProt `<comment>` elements into record annotations. */

import { KeyError, ValueError, pyInt } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { StopIterationSignal } from "./errors.js";
import type { Element } from "./etree.js";
import { tostring } from "./tostring.js";
import { NS, appendToAnnotations, attr, localTag } from "./util.js";

/** Comment types whose `<text>` children are stored verbatim under `comment_<type>`. */
const SIMPLE_COMMENTS = new Set([
  "allergen", "biotechnology", "biophysicochemical properties", "catalytic activity", "caution", "cofactor", "developmental stage", "disease",
  "domain", "disruption phenotype", "enzyme regulation", "function", "induction", "miscellaneous", "pathway", "pharmaceutical", "polymorphism",
  "PTM", "RNA editing", "similarity", "subunit", "tissue specificity", "toxic dose",
]);

/** Python `next(iterator)`: the first match or a StopIteration. */
function first(el: Element, tag: string): Element {
  for (const e of el.iter(tag)) return e;
  throw new StopIterationSignal();
}

/** Position range of a "mass spectrometry" comment; Python keeps whatever was assigned before a failed `int()`. */
function massRange(element: Element): [number, number] {
  let start = 0;
  let end = 0;
  for (const el of element.iter(NS + "location")) {
    const posEls = [...el.iter(NS + "position")];
    try {
      if (posEls.length > 0) {
        end = pyInt(attr(posEls[0]!, "position"));
        start = end - 1;
      } else {
        start = pyInt(attr(first(el, NS + "begin"), "position"));
        start -= 1;
        end = pyInt(attr(first(el, NS + "end"), "position"));
      }
    } catch (e) {
      if (!(e instanceof ValueError) && !(e instanceof KeyError)) throw e;
    }
  }
  return [start, end];
}

/**
 * Parse one `<comment>` element (Biopython's `_parse_comment`).
 *
 * @param rawComments - Also store the comment's XML (as bytes) under `comment_<type>_xml`.
 * @throws {@link KeyError} for a comment without `type`, or a type's required attribute missing.
 */
export function parseComment(record: SeqRecord, element: Element, rawComments: boolean): void {
  const type = attr(element, "type");
  const squashed = type.replaceAll(" ", "");
  if (SIMPLE_COMMENTS.has(type)) {
    for (const t of element.iter(NS + "text")) if (t.text) appendToAnnotations(record, `comment_${squashed}`, t.text);
  } else if (type === "subcellular location") {
    for (const loc of element.iter(NS + "subcellularLocation")) {
      for (const el of loc.children) if (el.text) appendToAnnotations(record, `comment_${squashed}_${localTag(el.tag)}`, el.text);
    }
  } else if (type === "interaction") {
    for (const i of element.iter(NS + "interactant")) appendToAnnotations(record, `comment_${type}_intactId`, attr(i, "intactId"));
  } else if (type === "alternative products") {
    for (const alt of element.iter(NS + "isoform")) {
      for (const id of alt.iter(NS + "id")) appendToAnnotations(record, `comment_${squashed}_isoform`, id.text);
    }
  } else if (type === "mass spectrometry") {
    const [start, end] = massRange(element);
    const mass = attr(element, "mass");
    const method = attr(element, "method");
    appendToAnnotations(record, `comment_${squashed}`, start === 0 && end === 0 ? `undefined:${mass}|${method}` : `${start}..${end}:${mass}|${method}`);
  } else if (type === "online information") {
    for (const link of element.iter(NS + "link")) {
      for (const _inner of link.iter(NS + "link")) appendToAnnotations(record, `comment_${squashed}`, `${attr(element, "name")}@${attr(link, "uri")}`);
    }
  }
  // "sequence caution" is deliberately not parsed (few facts, complex structure), as in Biopython.
  if (rawComments) appendToAnnotations(record, `comment_${squashed}_xml`, tostring(element));
}
