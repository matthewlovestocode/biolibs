/** A port of the parts of Python's `xml.sax.saxutils.XMLGenerator` that the seqXML writer uses. */

import { pyTypeName } from "@biolibs/core";
import type { BinaryWriteHandle } from "../handles.js";

/** Escape `&`, `<` and `>` (Python's `saxutils.escape`). */
export function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Quote an attribute value (Python's `saxutils.quoteattr`): double quotes unless the value contains one,
 * and line breaks and tabs become character references.
 *
 * @throws TypeError if `value` is not a string (Python's `AttributeError`).
 */
export function quoteAttribute(value: unknown): string {
  if (typeof value !== "string") throw new TypeError(`'${pyTypeName(value)}' object has no attribute 'replace'`);
  let data = escapeXml(value).replaceAll("\n", "&#10;").replaceAll("\r", "&#13;").replaceAll("\t", "&#9;");
  if (data.includes('"')) {
    if (data.includes("'")) data = `"${data.replaceAll('"', "&quot;")}"`;
    else data = `'${data}'`;
  } else {
    data = `"${data}"`;
  }
  return data;
}

/**
 * Writes XML as UTF-8 bytes, one piece at a time, with no added whitespace and no self-closing tags
 * (the `XMLGenerator` defaults).
 */
export class XmlGenerator {
  private readonly encoder = new TextEncoder();

  /** @param out - The byte target. */
  constructor(private readonly out: BinaryWriteHandle) {}

  private write(text: string): void {
    this.out.write(this.encoder.encode(text));
  }

  /** Write the XML declaration. */
  startDocument(): void {
    this.write('<?xml version="1.0" encoding="utf-8"?>\n');
  }

  /** Write a start tag with attributes in the given order. */
  startElement(name: string, attrs: Iterable<[string, unknown]> = []): void {
    this.write("<" + name);
    for (const [key, value] of attrs) this.write(` ${key}=${quoteAttribute(value)}`);
    this.write(">");
  }

  /** Write an end tag. */
  endElement(name: string): void {
    this.write(`</${name}>`);
  }

  /** Write escaped character data (nothing for an empty string). */
  characters(content: string): void {
    if (content) this.write(escapeXml(content));
  }

  /** Finish the document (nothing to flush here). */
  endDocument(): void {}
}
