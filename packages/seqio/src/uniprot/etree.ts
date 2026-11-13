/**
 * A small `xml.etree.ElementTree` work-alike: elements with `text`/`tail`, and an incremental pull
 * parser that releases events with the same timing as `ElementTree.iterparse` (16 KiB chunks).
 */

import { BioError } from "@biolibs/core";
import { scanXml } from "../seqxml/xml-scanner.js";
import { expatMessage, type XmlEvent, type XmlName, type XmlProblem, type XmlScan } from "../seqxml/xml-types.js";

/** Mirrors `xml.etree.ElementTree.ParseError`: the XML is not well-formed. */
export class ParseError extends BioError {
  /** Expat error position as `[line, column]`. */
  readonly position: [number, number];
  /** @param message - Description. @param position - `[line, column]`. */
  constructor(message: string, position: [number, number]) {
    super(message);
    this.name = "ParseError";
    this.position = position;
  }
}

/** An XML element: `tag` is `{uri}local` when namespaced; `text` and `tail` are null when absent (Python `None`). */
export class Element {
  /** Child elements in document order. */
  readonly children: Element[] = [];
  /** Text before the first child. */
  text: string | null = null;
  /** Text after this element's end tag. */
  tail: string | null = null;
  /** @param tag - Expanded tag. @param attrib - Attributes by expanded name, in document order. */
  constructor(readonly tag: string, readonly attrib: Map<string, string>) {}

  /** Depth-first iteration over this element and its descendants whose tag matches (all when `tag` is omitted). */
  *iter(tag?: string): Generator<Element> {
    if (tag === undefined || this.tag === tag) yield this;
    for (const c of this.children) yield* c.iter(tag);
  }

  /** Direct children with the given tag. */
  findall(tag: string): Element[] {
    return this.children.filter((c) => c.tag === tag);
  }

  /** Remove text, tail, attributes and children (`Element.clear()`). */
  clear(): void {
    this.children.length = 0;
    this.attrib.clear();
    this.text = this.tail = null;
  }
}

/** One iterparse event. */
export type PullEvent = { kind: "start-ns"; prefix: string; uri: string } | { kind: "start" | "end"; elem: Element } | { kind: "error"; error: ParseError };

const expand = (n: XmlName): string => (n[0] ? `{${n[0]}}${n[1]}` : n[1]);

/** The `ParseError` for a scanner problem, worded and positioned as ElementTree words it. */
function parseError(problem: XmlProblem): ParseError {
  return new ParseError(expatMessage(problem), [problem.line, problem.column]);
}

/**
 * Feeds a document to the tree builder in byte steps, like `ElementTree.iterparse` reading 16 KiB at a time:
 * a malformed chunk raises before any event of that chunk is released.
 */
export class PullParser {
  /** Bytes per `feed`, as in `iterparse`. */
  static readonly CHUNK = 16 * 1024;
  private readonly scan: XmlScan;
  private next = 0;
  private fed = 0;
  private readonly stack: Element[] = [];
  private last: Element | null = null;
  private tailMode = false;
  private data: string[] = [];
  private readonly queue: PullEvent[] = [];

  /** @param bytes - The whole document. */
  constructor(bytes: Uint8Array) {
    this.scan = scanXml(bytes);
  }

  /** Turn accumulated character data into the text or tail of the last element (`TreeBuilder._flush`). */
  private flush(): void {
    if (this.data.length === 0) return;
    const text = this.data.join("");
    this.data = [];
    if (this.last === null) return;
    if (this.tailMode) this.last.tail = text;
    else this.last.text = text;
  }

  private process(e: XmlEvent): void {
    if (e.kind === "text") this.data.push(e.data);
    else if (e.kind === "start") {
      this.flush();
      for (const [prefix, uri] of e.nsDecls ?? []) this.queue.push({ kind: "start-ns", prefix, uri });
      const attrib = new Map<string, string>();
      for (const [n, v] of e.attrs) attrib.set(expand(n), v);
      const elem = new Element(expand(e.name), attrib);
      this.stack.at(-1)?.children.push(elem);
      this.stack.push(elem);
      this.last = elem;
      this.tailMode = false;
      this.queue.push({ kind: "start", elem });
    } else if (e.kind === "end") {
      this.flush();
      this.last = this.stack.pop()!;
      this.tailMode = true;
      this.queue.push({ kind: "end", elem: this.last });
    }
    // Comments and processing instructions are dropped, without splitting the surrounding text.
  }

  /**
   * Hand the parser the next `size` bytes; returns the events they complete. Like `XMLPullParser.feed`, a
   * well-formedness error does not abort the step: it is queued after the events that preceded it, and the
   * reader raises it when it gets there.
   */
  feed(size: number): PullEvent[] {
    this.fed += size;
    const p = this.scan.problem;
    const events = this.scan.events;
    while (this.next < events.length && events[this.next]!.end <= this.fed) this.process(events[this.next++]!);
    if (p !== null && !p.atEnd && p.at <= this.fed) this.queue.push({ kind: "error", error: parseError(p) });
    return this.queue.splice(0);
  }

  /**
   * Signal end of input.
   *
   * @throws {@link ParseError} if the document is incomplete or malformed.
   */
  close(): PullEvent[] {
    const events = this.scan.events;
    while (this.next < events.length) this.process(events[this.next++]!);
    if (this.scan.problem !== null) throw parseError(this.scan.problem);
    return this.queue.splice(0);
  }
}
