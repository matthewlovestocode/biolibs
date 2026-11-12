/** A minimal DOM, enough for the queries SnapGene's XML packets need (a port of the parts of `xml.dom.minidom` used). */

import { scanXml } from "../seqxml/xml-scanner.js";
import { ExpatError } from "../seqxml/xml-types.js";

/** DOM node type numbers (as in `xml.dom.Node`). */
export const ELEMENT_NODE = 1;
/** Text node. */
export const TEXT_NODE = 3;
/** CDATA section node. */
export const CDATA_SECTION_NODE = 4;
/** Processing instruction node. */
export const PROCESSING_INSTRUCTION_NODE = 7;
/** Comment node. */
export const COMMENT_NODE = 8;

/** Common shape of every node. */
export interface DomNode {
  /** One of the node type numbers above. */
  readonly nodeType: number;
}

/** Character data: text, CDATA, comment or processing instruction content. */
export class DomText implements DomNode {
  /** @param nodeType - Which kind of character node. @param data - Its text. */
  constructor(readonly nodeType: number, public data: string) {}
}

/** An element with attributes and children. */
export class DomElement implements DomNode {
  readonly nodeType = ELEMENT_NODE;
  /** Child nodes in document order. */
  readonly childNodes: (DomElement | DomText)[] = [];
  /** @param tagName - The tag as written. @param attributes - Attributes in document order. */
  constructor(readonly tagName: string, readonly attributes: Map<string, string>) {}

  /** The first child node, or null. */
  get firstChild(): DomElement | DomText | null {
    return this.childNodes[0] ?? null;
  }

  /** Whether the attribute is present. */
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  /** All descendant elements with this tag name, in document order (`"*"` matches every element). */
  getElementsByTagName(name: string): DomElement[] {
    const out: DomElement[] = [];
    const walk = (node: DomElement): void => {
      for (const child of node.childNodes) {
        if (child instanceof DomElement) {
          if (name === "*" || child.tagName === name) out.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return out;
  }
}

/** The document: a single root element reached through the same queries. */
export class DomDocument extends DomElement {
  /** The root element. */
  documentElement: DomElement | null = null;
  constructor() {
    super("#document", new Map());
  }
}

/**
 * Parse XML text into a DOM, as `minidom.parseString` does (no namespace processing; adjacent text is one node).
 *
 * @throws {@link ExpatError} if the text is not well-formed.
 */
export function parseString(text: string): DomDocument {
  const scan = scanXml(new TextEncoder().encode(text), { namespaces: false, ignoreDeclaredEncoding: true });
  if (scan.problem !== null) throw new ExpatError(scan.problem.message);
  const doc = new DomDocument();
  const stack: DomElement[] = [doc];
  for (const e of scan.events) {
    const top = stack[stack.length - 1]!;
    if (e.kind === "start") {
      const el = new DomElement(e.name[1], new Map(e.attrs.map(([n, v]) => [n[1], v])));
      top.childNodes.push(el);
      if (top === doc) doc.documentElement = el;
      stack.push(el);
    } else if (e.kind === "end") {
      stack.pop();
    } else if (e.kind === "text") {
      const last = top.childNodes[top.childNodes.length - 1];
      if (!e.cdata && last instanceof DomText && last.nodeType === TEXT_NODE) last.data += e.data;
      else top.childNodes.push(new DomText(e.cdata ? CDATA_SECTION_NODE : TEXT_NODE, e.data));
    } else if (e.kind === "comment") {
      top.childNodes.push(new DomText(COMMENT_NODE, e.data));
    } else {
      top.childNodes.push(new DomText(PROCESSING_INSTRUCTION_NODE, e.data));
    }
  }
  return doc;
}
