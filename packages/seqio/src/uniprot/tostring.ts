/** `ElementTree.tostring(element)` (US-ASCII, short empty elements), used for `return_raw_comments`. */

import type { Element } from "./etree.js";

/** Prefixes ElementTree knows without being told (`_namespace_map`). */
const WELL_KNOWN: Record<string, string> = {
  "http://www.w3.org/XML/1998/namespace": "xml",
  "http://www.w3.org/1999/xhtml": "html",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf",
  "http://schemas.xmlsoap.org/wsdl/": "wsdl",
  "http://www.w3.org/2001/XMLSchema": "xs",
  "http://www.w3.org/2001/XMLSchema-instance": "xsi",
  "http://purl.org/dc/elements/1.1/": "dc",
};

const escapeCdata = (s: string): string => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeAttrib = (s: string): string =>
  escapeCdata(s).replaceAll('"', "&quot;").replaceAll("\r", "&#13;").replaceAll("\n", "&#10;").replaceAll("\t", "&#09;");

/**
 * Decide the prefix for every namespace used under `root` (`ElementTree._namespaces`): tags first, then attribute
 * names, per element in document order; unknown namespaces become `ns0`, `ns1`, ... by order of first use.
 *
 * @returns `qnames` (expanded name to written name) and `namespaces` (uri to prefix, excluding `xml`).
 */
function namespaces(root: Element, registered: ReadonlyMap<string, string> = new Map()): { qnames: Map<string, string>; namespaces: Map<string, string> } {
  const qnames = new Map<string, string>();
  const ns = new Map<string, string>();
  const add = (q: string): void => {
    if (qnames.has(q)) return;
    if (q.startsWith("{")) {
      const close = q.lastIndexOf("}");
      const uri = q.slice(1, close);
      const tag = q.slice(close + 1);
      let prefix = ns.get(uri);
      if (prefix === undefined) {
        prefix = registered.get(uri) ?? (Object.hasOwn(WELL_KNOWN, uri) ? WELL_KNOWN[uri]! : `ns${ns.size}`);
        if (prefix !== "xml") ns.set(uri, prefix);
      }
      qnames.set(q, prefix ? `${prefix}:${tag}` : tag);
    } else qnames.set(q, q);
  };
  for (const e of root.iter()) {
    add(e.tag);
    for (const k of e.attrib.keys()) add(k);
  }
  return { qnames, namespaces: ns };
}

/** Serialise one element (and its tail) to `out`; only the root carries the `xmlns` declarations. */
function write(e: Element, qnames: Map<string, string>, decls: Map<string, string> | null, out: string[]): void {
  const tag = qnames.get(e.tag)!;
  out.push(`<${tag}`);
  if (decls) {
    // Declarations sorted by prefix.
    for (const [uri, prefix] of [...decls].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))) out.push(` xmlns${prefix ? `:${prefix}` : ""}="${escapeAttrib(uri)}"`);
  }
  for (const [k, v] of e.attrib) out.push(` ${qnames.get(k)!}="${escapeAttrib(v)}"`);
  if (e.text || e.children.length > 0) {
    out.push(">");
    if (e.text) out.push(escapeCdata(e.text));
    for (const c of e.children) write(c, qnames, null, out);
    out.push(`</${tag}>`);
  } else out.push(" />");
  if (e.tail) out.push(escapeCdata(e.tail));
}

/**
 * Serialise an element to a string the way `ElementTree.tostring(element, encoding="unicode")` does: nothing is
 * escaped beyond the XML specials, and namespaces get prefixes such as `ns0` (or the registered one).
 *
 * @param element - The element (its tail text is included, as in Python).
 * @param registered - Prefixes registered with `register_namespace` (uri to prefix), consulted before `ns0`, `ns1`, ...
 */
export function serializeUnicode(element: Element, registered: ReadonlyMap<string, string> = new Map()): string {
  const { qnames, namespaces: decls } = namespaces(element, registered);
  const out: string[] = [];
  write(element, qnames, decls, out);
  return out.join("");
}

/**
 * Serialise an element to US-ASCII bytes the way `ElementTree.tostring(element)` does: non-ASCII characters become
 * numeric character references, and namespaces get prefixes such as `ns0`.
 *
 * @param element - The element (its tail text is included, as in Python).
 */
export function tostring(element: Element): Uint8Array {
  let text = "";
  for (const ch of serializeUnicode(element)) {
    const cp = ch.codePointAt(0)!;
    text += cp < 128 ? ch : `&#${cp};`;
  }
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
