/** XML plumbing for the phyloXML reader: `iterparse`, namespace helpers and Biopython's text conversions. */

import { ValueError, pyFloat, pyInt, pySplit, pyStrip } from "@biolibs/core";
import { Element, ParseError, PullParser } from "@biolibs/seqio";

/** The phyloXML namespace. */
export const PHY = "http://www.phyloxml.org";

/** One `iterparse` event. */
export type XmlEvent = ["start" | "end", Element];

/**
 * `ElementTree.iterparse(file, events=("start", "end"))`: events are released 16 KiB at a time, and a
 * well-formedness error is raised when the reader reaches it.
 *
 * @param source - The document.
 */
export function* iterparse(source: string | Uint8Array): Generator<XmlEvent> {
  try {
    yield* iterparseRaw(source);
  } catch (e) {
    // ElementTree words its `ParseError` as "message: line L, column C".
    if (e instanceof ParseError) throw new ParseError(`${e.message.replace(/^<unknown>:\d+:\d+: /, "")}: line ${e.position[0]}, column ${e.position[1]}`, e.position);
    throw e;
  }
}

function* iterparseRaw(source: string | Uint8Array): Generator<XmlEvent> {
  const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
  const parser = new PullParser(bytes);
  let remaining = bytes.length;
  const release = function* (events: ReturnType<PullParser["feed"]>): Generator<XmlEvent> {
    for (const e of events) {
      if (e.kind === "error") throw e.error;
      if (e.kind !== "start-ns") yield [e.kind, e.elem];
    }
  };
  while (remaining > 0) {
    const size = Math.min(PullParser.CHUNK, remaining);
    remaining -= size;
    yield* release(parser.feed(size));
  }
  yield* release(parser.close());
}

/** `_local`: the tag without its `{namespace}`. */
export function local(tag: string): string { return tag[0] === "{" ? tag.slice(tag.indexOf("}") + 1) : tag; }

/**
 * `_split_namespace` followed by Python's two-name unpacking.
 *
 * @throws ValueError ("not enough values to unpack") for a tag with no namespace, as in Biopython.
 */
export function splitNamespace(tag: string): [string, string] {
  const rest = tag.slice(1);
  const i = rest.indexOf("}");
  if (i < 0) throw new ValueError("not enough values to unpack (expected 2, got 1)");
  return [rest.slice(0, i), rest.slice(i + 1)];
}

/** `_ns`: a tag in the phyloXML namespace. */
export const ns = (tag: string, namespace = PHY): string => `{${namespace}}${tag}`;

/** `parent.find(tag)`: the first child with the tag. */
export function find(parent: Element, tag: string): Element | null { return parent.children.find((c) => c.tag === tag) ?? null; }

/** `_get_child_as`: a child passed through a constructor, or null. */
export function childAs<T>(parent: Element, tag: string, construct: (e: Element) => T): T | null {
  const child = find(parent, ns(tag));
  return child === null ? null : construct(child);
}

/** `_get_child_text`: a child's text passed through a constructor, or null when missing or empty. */
export function childText<T = string>(parent: Element, tag: string, construct: (s: string) => T = (s) => s as unknown as T): T | null {
  const child = find(parent, ns(tag));
  return child !== null && child.text ? construct(child.text) : null;
}

/** `_get_children_as`. */
export function childrenAs<T>(parent: Element, tag: string, construct: (e: Element) => T): T[] { return parent.findall(ns(tag)).map(construct); }

/** `_get_children_text`: the non-empty texts of the children with the tag. */
export function childrenText(parent: Element, tag: string): string[] { return parent.findall(ns(tag)).filter((c) => c.text).map((c) => c.text!); }

/** `_str2bool`. @throws ValueError for text other than `true`, `false`, `1`, `0`. */
export function str2bool(text: string): boolean {
  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;
  throw new ValueError("String could not be converted to boolean: " + text);
}

/** `_int`: an integer, or null when the text is missing or invalid. */
export function toInt(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  try { return pyInt(text); } catch { return null; }
}

/** `_float`: a float, or null when the text is missing or invalid. */
export function toFloat(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  try { return pyFloat(text); } catch { return null; }
}

/** `_collapse_wspace`: runs of whitespace become one space and the ends are trimmed. */
export function collapse(text: string | null | undefined): string | null {
  return text === null || text === undefined ? null : pySplit(text).join(" ");
}

/** `text.strip()` where `None` raises Python's `AttributeError`. */
export function strip(text: string | null): string {
  if (text === null) throw new TypeError("'NoneType' object has no attribute 'strip'");
  return pyStrip(text);
}
