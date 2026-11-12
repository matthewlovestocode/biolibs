/** `SeqIO` reader for the `seqxml` format. */

import { ValueError } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { SeqXmlContentHandler } from "./content-handler.js";
import { SaxFeeder } from "./xml-sax.js";

/**
 * Reads seqXML (versions 0.1 to 0.4) from bytes. Like Biopython it feeds the parser 1024 bytes at a time,
 * so an error late in the file surfaces only after the earlier records have been handed out.
 *
 * @example
 * ```ts
 * for (const rec of new SeqXmlIterator(fs.readFileSync("x.xml"))) console.log(rec.id);
 * ```
 * @throws {@link ValueError} for an empty file, a file that ends before the root element, or invalid seqXML.
 * @throws {@link SAXParseException} if the XML is not well-formed.
 * @throws {@link StreamModeError} if given text instead of bytes.
 */
export class SeqXmlIterator extends SequenceIterator {
  get modes(): string { return "b"; }
  /** Bytes handed to the parser per step. */
  static readonly BLOCK = 1024;

  /** seqXML version of the file. */
  readonly seqXMLversion: string;
  /** `source` attribute of the root element. */
  readonly sourceName: string | null;
  /** `sourceVersion` attribute of the root element. */
  readonly sourceVersion: string | null;
  /** `ncbiTaxID` attribute of the root element. */
  readonly ncbiTaxID: string | null;
  /** `speciesName` attribute of the root element. */
  readonly speciesName: string | null;

  private readonly handler = new SeqXmlContentHandler();
  private readonly feeder: SaxFeeder;
  private remaining: number;
  private closed = false;

  /** @param source - The file's bytes. @param namespace - Unused, kept for signature compatibility. */
  constructor(source: unknown, namespace: unknown = null) {
    super(source, null, "SeqXML");
    void namespace;
    const all = this.bytes!.read();
    this.remaining = all.length;
    this.feeder = new SaxFeeder(all, this.handler, () => this.handler.startDocument());
    let started = false;
    for (;;) {
      const size = this.nextBlock();
      if (size === 0) throw new ValueError(started ? "XML file contains no data." : "Empty file.");
      started = true;
      this.feeder.feed(size);
      if (this.handler.seqXMLversion !== null) break;
    }
    this.seqXMLversion = this.handler.seqXMLversion;
    this.sourceName = this.handler.source;
    this.sourceVersion = this.handler.sourceVersion;
    this.ncbiTaxID = this.handler.ncbiTaxID;
    this.speciesName = this.handler.speciesName;
  }

  /** Take the next block of input; returns its size (0 at the end). */
  private nextBlock(): number {
    const size = Math.min(SeqXmlIterator.BLOCK, this.remaining);
    this.remaining -= size;
    return size;
  }

  protected nextRecord(): SeqRecord | null {
    const records = this.handler.records;
    for (;;) {
      // A record is released only once the next one has started, so its entry is complete.
      if (records.length > 1) return records.shift()!;
      const size = this.nextBlock();
      if (size === 0) {
        if (!this.closed) {
          this.closed = true;
          this.feeder.close();
        }
        break;
      }
      this.feeder.feed(size);
    }
    return records.length > 0 ? records.shift()! : null;
  }
}
