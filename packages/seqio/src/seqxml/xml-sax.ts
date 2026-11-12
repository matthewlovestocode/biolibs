/**
 * An incremental SAX-style reader over a pre-scanned document: feeding it N bytes delivers exactly the
 * events an expat parser would have reported after N bytes (the SeqXML reader depends on that timing).
 */

import { scanXml } from "./xml-scanner.js";
import { SAXParseException, type XmlName, type XmlScan } from "./xml-types.js";

/** Callbacks of a SAX content handler; a null slot means "not callable", as in Python. */
export interface SaxHandler {
  startElementNS: ((name: XmlName, qname: null, attrs: Map<XmlName, string> | [XmlName, string][]) => void) | null;
  endElementNS: ((name: XmlName, qname: null) => void) | null;
  characters(data: string): void;
}

/** Python's error for calling a handler slot that holds `None`. */
const notCallable = (): never => {
  throw new TypeError("'NoneType' object is not callable");
};

/** Feeds a scanned document to a handler in byte-count steps. */
export class SaxFeeder {
  private readonly scan: XmlScan;
  private next = 0;
  private started = false;
  private fed = 0;

  /** @param bytes - The whole document; it is scanned up front, but events are only released by {@link SaxFeeder.feed}. */
  constructor(bytes: Uint8Array, private readonly handler: SaxHandler, private readonly onStart: () => void) {
    this.scan = scanXml(bytes);
  }

  /**
   * Make `size` more bytes available and deliver the events they complete.
   *
   * @throws {@link SAXParseException} if the bytes reveal malformed XML.
   */
  feed(size: number): void {
    if (!this.started) { this.started = true; this.onStart(); }
    this.fed += size;
    this.deliver(this.fed);
    const p = this.scan.problem;
    if (p !== null && !p.atEnd && p.at <= this.fed) throw new SAXParseException(p.message);
  }

  /** Signal the end of input. @throws {@link SAXParseException} if the document is incomplete or malformed. */
  close(): void {
    if (!this.started) return;
    this.deliver(Infinity);
    if (this.scan.problem !== null) throw new SAXParseException(this.scan.problem.message);
  }

  /** Deliver pending events that complete within the first `limit` bytes. */
  private deliver(limit: number): void {
    const h = this.handler;
    const events = this.scan.events;
    while (this.next < events.length && events[this.next]!.end <= limit) {
      const e = events[this.next++]!;
      if (e.kind === "start") (h.startElementNS ?? notCallable)(e.name, null, e.attrs);
      else if (e.kind === "end") (h.endElementNS ?? notCallable)(e.name, null);
      else if (e.kind === "text") h.characters(e.data);
    }
  }
}
