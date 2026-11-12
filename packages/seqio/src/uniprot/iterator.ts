/** `SeqIO` reader for the `uniprot-xml` format. */

import { AssertionError, ValueError } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { createRecord } from "./entry.js";
import { StopIterationSignal } from "./errors.js";
import { ParseError, PullParser, type PullEvent } from "./etree.js";
import { NS } from "./util.js";

/**
 * Reads UniProt XML, one `SeqRecord` per `<entry>`. Like Biopython (`ElementTree.iterparse`) it parses
 * 16 KiB at a time, so a well-formedness error is raised before any entry that ends in the same chunk is returned.
 *
 * @example
 * ```ts
 * for (const rec of new UniprotIterator(bytes)) console.log(rec.id, rec.annotations.get("organism"));
 * ```
 * @throws {@link ValueError} for an empty file or a namespace other than UniProt's.
 * @throws {@link ParseError} if the XML is not well-formed.
 */
export class UniprotIterator extends SequenceIterator {
  get modes(): string { return "b"; }
  private readonly parser: PullParser;
  private remaining: number;
  private pending: PullEvent[] = [];
  private closed = false;

  /**
   * @param source - The file's bytes.
   * @param alphabet - Not supported; must be null.
   * @param returnRawComments - Also store each comment's XML (bytes) under `comment_<type>_xml`.
   */
  constructor(source: unknown, alphabet: null | undefined = null, private readonly returnRawComments = false) {
    super(source, alphabet, "UniProt XML");
    const all = this.bytes!.read();
    this.remaining = all.length;
    this.parser = new PullParser(all);
  }

  /** Biopython's handling of a ParseError: running out of input with no element is "Empty file.". */
  private static translate(e: unknown): unknown {
    if (e instanceof ParseError && e.message.endsWith("no element found")) {
      if (e.position[0] !== 1 || e.position[1] !== 0) return new AssertionError("");
      return new ValueError("Empty file.");
    }
    return e;
  }

  /** Pull the next chunk of events from the parser; false when the input is exhausted. */
  private more(): boolean {
    const size = Math.min(PullParser.CHUNK, this.remaining);
    if (size > 0) {
      this.remaining -= size;
      this.pending = this.parser.feed(size);
      return true;
    }
    if (this.closed) return false;
    this.closed = true;
    try {
      this.pending = this.parser.close();
    } catch (e) {
      throw UniprotIterator.translate(e);
    }
    return this.pending.length > 0;
  }

  /** Stop producing events (a Python generator that has raised is exhausted). */
  private finish(): void {
    this.pending = [];
    this.remaining = 0;
    this.closed = true;
  }

  protected nextRecord(): SeqRecord | null {
    try {
      for (;;) {
        for (let e = this.pending.shift(); e !== undefined; e = this.pending.shift()) {
          if (e.kind === "error") {
            // The generator is finished once its error has been raised.
            this.finish();
            throw UniprotIterator.translate(e.error);
          }
          if (e.kind === "start-ns" && !(e.uri.startsWith("http://www.w3.org/") || NS === `{${e.uri}}`)) {
            throw new ValueError(`SeqIO format 'uniprot-xml' only parses xml with namespace: ${NS} but xml has namespace: {${e.uri}}`);
          }
          if (e.kind === "end" && e.elem.tag === NS + "entry") {
            const record = createRecord(e.elem, this.returnRawComments);
            e.elem.clear();
            return record;
          }
        }
        if (!this.more()) return null;
      }
    } catch (e) {
      // A StopIteration escaping from the entry parser simply ends the iteration, as it does in Python.
      if (e instanceof StopIterationSignal) return null;
      throw e;
    }
  }
}
