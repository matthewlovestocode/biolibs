/** A minimal ElementTree front end for the XML motif formats, built on the parser in `@biolibs/seqio`. */

import { Element, ParseError, PullParser } from "@biolibs/seqio";

export { Element, ParseError };

/**
 * Parse a whole XML document and return its root element.
 *
 * @param text - The document.
 * @throws ParseError when the text is not well-formed XML.
 */
export function parseXml(text: string): Element {
  const bytes = new TextEncoder().encode(text);
  const parser = new PullParser(bytes);
  const events = parser.feed(bytes.length);
  for (const e of events) if (e.kind === "error") throw e.error;
  events.push(...parser.close());
  for (const e of events) if (e.kind === "error") throw e.error;
  const root = events.find((e) => e.kind === "start");
  if (root === undefined || root.kind !== "start") throw new ParseError("no element found: line 1, column 0", [1, 0]);
  return root.elem;
}

/** ElementTree's `find(tag)` on children: the first child with the tag, or null. */
export function find(e: Element | null, tag: string): Element | null {
  if (e === null) throw new TypeError("'NoneType' object has no attribute 'find'");
  return e.children.find((c) => c.tag === tag) ?? null;
}

/** `element.get(name)`, with Python's AttributeError for a missing element. */
export function attr(e: Element | null, name: string): string | null {
  if (e === null) throw new TypeError("'NoneType' object has no attribute 'get'");
  return e.attrib.get(name) ?? null;
}
