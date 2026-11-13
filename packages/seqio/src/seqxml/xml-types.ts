/** Shared types for the small namespace-aware XML reader behind the `seqxml` format. */

import { BioError } from "@biolibs/core";

/** An expanded XML name: `[namespaceURI | null, localName]` (what Python's SAX reports with namespaces on). */
export type XmlName = [string | null, string];

/**
 * One parse event. `end` is the byte offset after which the event is complete, i.e. the point at
 * which an incremental parser fed that many bytes would have reported it.
 */
export type XmlEvent =
  | { kind: "start"; name: XmlName; attrs: [XmlName, string][]; end: number; nsDecls?: [string, string][] }
  | { kind: "end"; name: XmlName; end: number }
  | { kind: "text"; data: string; end: number; cdata?: boolean }
  | { kind: "comment"; data: string; end: number }
  | { kind: "pi"; target: string; data: string; end: number };

/** Options for scanning. */
export interface ScanOptions {
  /** Resolve namespace prefixes (default true). When false, names are reported as written, with no namespace. */
  namespaces?: boolean;
  /** Ignore an encoding named in the XML declaration and read the bytes as UTF-8 (for text that was already decoded). */
  ignoreDeclaredEncoding?: boolean;
}

/** A well-formedness problem found while scanning. */
export interface XmlProblem {
  /** What was wrong, with line and column as `xml.sax` writes them: `<unknown>:LINE:COL: reason`. */
  message: string;
  /** What was wrong, without the position: expat's own wording, such as `mismatched tag`. */
  reason: string;
  /** Line of the problem, counting from 1 as expat does. */
  line: number;
  /** Column of the problem, counting from 0 as expat does. */
  column: number;
  /** Byte offset at which an incremental parser notices it. */
  at: number;
  /** True when the input simply ended too early; such problems only surface when the parser is closed. */
  atEnd: boolean;
}

/** Result of scanning a whole document. */
export interface XmlScan {
  /** Events up to the first problem. */
  events: XmlEvent[];
  /** The first well-formedness problem, or null. */
  problem: XmlProblem | null;
  /** Number of bytes scanned. */
  size: number;
}

/** Mirrors `xml.sax.SAXParseException`: the XML is not well-formed. */
export class SAXParseException extends BioError {
  /** @param message - Description including line and column. */
  constructor(message: string) {
    super(message);
    this.name = "SAXParseException";
  }
}

/** Mirrors `xml.parsers.expat.ExpatError`, raised by Python's `minidom.parseString` for malformed XML. */
export class ExpatError extends BioError {
  /** @param message - Description including line and column. */
  constructor(message: string) {
    super(message);
    this.name = "ExpatError";
  }
}

/**
 * The message `xml.etree.ElementTree.ParseError` and `xml.parsers.expat.ExpatError` carry.
 *
 * Both put the position after the reason (`mismatched tag: line 2, column 949`), where `xml.sax` puts it in front
 * (`<unknown>:2:949: mismatched tag`). The scanner reports the SAX form, since seqXML is read through SAX; the other
 * two readers format the same problem their own way.
 *
 * @param problem - The problem the scanner reported.
 * @returns The message, expat's way round.
 */
export function expatMessage(problem: XmlProblem): string {
  return `${problem.reason}: line ${problem.line}, column ${problem.column}`;
}

/**
 * The reason out of an expat message, whichever way round the position was written.
 *
 * `xml.sax` puts it in front (`<unknown>:2:9: no element found`) and ElementTree and pyexpat put it behind
 * (`no element found: line 2, column 9`), so code that wants to know *what* went wrong asks this rather than
 * matching the text.
 *
 * @param message - The message from any of the three readers.
 * @returns Expat's wording on its own.
 */
export function xmlReason(message: string): string {
  return message.replace(/^<unknown>:\d+:\d+: /, "").replace(/: line \d+, column \d+$/, "");
}
