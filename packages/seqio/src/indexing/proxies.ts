/** Random-access proxies for sequential formats: one per file format, each yielding `[key, offset, length]` for every record. */

import { SeqRecord } from "@biolibs/seqrecord";
import { FORMAT_TO_ITERATOR } from "../registry.js";
import { ByteHandle, bstrip, decodeUtf8, firstToken, toBytes } from "./bytes.js";

/** One record's key, start offset and length. */
export type Entry = [key: string, offset: number, length: number];

/** What the index dictionary needs from a format: iterate the records, fetch one, fetch its raw bytes. */
export abstract class SeqFileRandomAccess {
  /** The file. */
  readonly handle: ByteHandle;
  /** The format name. */
  readonly format: string;

  /** @param bytes - The file contents. @param format - Format name. */
  constructor(bytes: Uint8Array, format: string) {
    this.handle = new ByteHandle(bytes);
    this.format = format;
  }

  /** @returns Every record's key, offset and length, in file order. */
  abstract iterate(): Generator<Entry>;

  /** @param offset - Start of a record. @returns The raw record as a binary string. */
  abstract getRaw(offset: number): string;

  /**
   * Parse the record that starts at an offset, by running the format's reader over just that text.
   *
   * @param offset - Start of a record.
   * @throws An error named `StopIteration` if the text yields no record.
   */
  get(offset: number): SeqRecord {
    const Cls = FORMAT_TO_ITERATOR.get(this.format)!;
    const it = new Cls(decodeUtf8(this.getRaw(offset)));
    try {
      const first = it.next();
      if (first.done) throw Object.assign(new Error(""), { name: "StopIteration" });
      return first.value;
    } finally { it.close(); }
  }

  /** @returns The raw record as bytes. @param offset - Start of a record. */
  getRawBytes(offset: number): Uint8Array { return toBytes(this.getRaw(offset)); }
}

/** Start-of-record markers by format. `pir` is the regular expression `>..;`. */
const MARKERS: Record<string, string> = {
  ace: "CO ", embl: "ID ", fasta: ">", genbank: "LOCUS ", gb: "LOCUS ", imgt: "ID ", phd: "BEGIN_SEQUENCE", pir: ">..;", qual: ">", swiss: "ID ", "uniprot-xml": "<entry ",
};

/** Records that start with a marker line and run to the next one; the key is the first word after the marker. */
export class SequentialSeqFileRandomAccess extends SeqFileRandomAccess {
  /** The marker text (for the key offset). */
  protected marker: string;
  private re: RegExp;

  constructor(bytes: Uint8Array, format: string) {
    super(bytes, format);
    this.marker = MARKERS[format]!;
    this.re = format === "pir" ? /^>[^\n]{2};/ : new RegExp("^" + this.marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }

  /** @param line - A line. @returns Whether it starts a record. */
  protected isMarker(line: string): boolean { return this.re.test(line); }

  /** Skip to the first marker line; returns its offset and text (`""` at the end of the file). */
  protected skipToFirst(): [number, string] {
    const h = this.handle;
    h.seek(0);
    for (;;) {
      const start = h.tell();
      const line = h.readline();
      if (this.isMarker(line) || !line) return [start, line];
    }
  }

  *iterate(): Generator<Entry> {
    const h = this.handle;
    const markerOffset = this.marker.length;
    let [start, line] = this.skipToFirst();
    while (this.isMarker(line)) {
      // The id is the first word after the marker (not right for GenBank, EMBL or Swiss-Prot, which override this).
      const id = firstToken(bstrip(line.slice(markerOffset)));
      let length = line.length;
      for (;;) {
        const end = h.tell();
        line = h.readline();
        if (this.isMarker(line) || !line) { yield [decodeUtf8(id), start, length]; start = end; break; }
        length += line.length;
      }
    }
  }

  getRaw(offset: number): string {
    const h = this.handle;
    h.seek(offset);
    const lines = [h.readline()];
    for (;;) {
      const line = h.readline();
      if (this.isMarker(line) || !line) break;
      lines.push(line);
    }
    return lines.join("");
  }
}

/** Tab-separated files: one record per line, keyed by the first column (blank lines too, as in Biopython). */
export class TabRandomAccess extends SeqFileRandomAccess {
  *iterate(): Generator<Entry> {
    const h = this.handle;
    h.seek(0);
    for (;;) {
      const start = h.tell();
      const line = h.readline();
      if (!line) break;
      yield [decodeUtf8(line.split("\t")[0]!), start, line.length];
    }
  }

  getRaw(offset: number): string {
    this.handle.seek(offset);
    return this.handle.readline();
  }
}

