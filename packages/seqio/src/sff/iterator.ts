/** Readers for SFF (Standard Flowgram Format) files: `sff` and `sff-trim`. */

import { ValueError, pyBytesRepr, pyInt, warn } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { calcsize, unpack } from "../binary/struct.js";
import type { BinaryStream } from "../handles.js";
import { SequenceIterator } from "../interfaces.js";
import { readFileHeader, nullCount } from "./header.js";
import { isUanName, readTime, readXY } from "./names.js";

const PARSER = "BiopythonParserWarning";
const READ_HEADER_FMT = ">2HI4H";
const READ_HEADER_SIZE = calcsize(READ_HEADER_FMT);

/** Python's strict UTF-8 `decode()`. */
function utf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ValueError("'utf-8' codec can't decode bytes: invalid data");
  }
}

const upper = (b: Uint8Array): Uint8Array => b.map((x) => (x >= 97 && x <= 122 ? x - 32 : x));
const lower = (b: Uint8Array): Uint8Array => b.map((x) => (x >= 65 && x <= 90 ? x + 32 : x));
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/**
 * Reads SFF files: reads with flow values, base calls and PHRED qualities. Clipped regions are lower case
 * (`sff`) or removed (`sff-trim`). An index block, if present, is skipped.
 *
 * @throws {@link ValueError} for malformed headers, reads or trailing data.
 */
export class SffIterator extends SequenceIterator {
  get modes(): string { return "b"; }
  private readonly trim: boolean;
  private offset: number;
  private readonly indexOffset: number;
  private readonly indexLength: number;
  private readonly numberOfReads: number;
  private readonly readFlowSize: number;
  private readonly flowChars: string;
  private readonly keySequence: string;
  private readCounter: number | null = 0;

  /** @param source - The file's bytes. @param alphabet - Not supported. @param trim - Remove clipped regions. */
  constructor(source: unknown, alphabet: null | undefined = null, trim = false) {
    if (alphabet !== null && alphabet !== undefined) throw new ValueError("The alphabet argument is no longer supported");
    super(source, null, "SFF");
    this.trim = trim;
    const h = readFileHeader(this.bytes!);
    this.offset = h.headerLength;
    this.indexOffset = h.indexOffset;
    this.indexLength = h.indexLength;
    this.numberOfReads = h.numberOfReads;
    this.flowChars = h.flowChars;
    this.keySequence = h.keySequence;
    this.readFlowSize = calcsize(`>${h.numberOfFlowsPerRead}H`);
    this.flowFmt = `>${h.numberOfFlowsPerRead}H`;
  }
  private readonly flowFmt: string;

  protected nextRecord(): SeqRecord | null {
    const stream = this.bytes!;
    if (this.readCounter === this.numberOfReads) {
      this.readCounter = null;
      this.checkEof(stream);
      return null;
    }
    if (this.readCounter === null) return null;
    if (this.offset === this.indexOffset) {
      let offset = this.indexOffset + this.indexLength;
      if (offset % 8) offset += 8 - (offset % 8);
      stream.seek(offset);
      this.offset = offset;
    }
    const record = this.readSeqRecord(stream);
    this.readCounter += 1;
    return record;
  }

  /** Read one read (header, flowgram, bases, qualities and padding) as a record. */
  private readSeqRecord(stream: BinaryStream): SeqRecord {
    let [readHeaderLength, nameLength, seqLen, clipQualLeft, clipQualRight, clipAdapterLeft, clipAdapterRight] =
      unpack(READ_HEADER_FMT, stream.read(READ_HEADER_SIZE)) as number[];
    if (clipQualLeft) clipQualLeft! -= 1;
    if (clipAdapterLeft) clipAdapterLeft! -= 1;
    if (readHeaderLength! < 10 || readHeaderLength! % 8 !== 0) throw new ValueError(`Malformed read header, says length is ${readHeaderLength}`);
    const name = utf8(stream.read(nameLength!));
    let padding = readHeaderLength! - READ_HEADER_SIZE - nameLength!;
    if (nullCount(stream.read(padding)) !== padding) warn(`Your SFF file is invalid, post name ${padding} byte padding region contained data`, PARSER);
    this.offset += readHeaderLength!;
    const flowValues = stream.read(this.readFlowSize);
    const tempFmt = `>${seqLen}B`;
    const flowIndex = stream.read(seqLen!);
    let seq = stream.read(seqLen!);
    const quals = [...(unpack(tempFmt, stream.read(seqLen!)) as number[])];
    this.offset += this.readFlowSize + seqLen! * 3;
    padding = (this.readFlowSize + seqLen! * 3) % 8;
    if (padding) {
      padding = 8 - padding;
      if (nullCount(stream.read(padding)) !== padding) warn(`Your SFF file is invalid, post quality ${padding} byte padding region contained data`, PARSER);
      this.offset += padding;
    }
    const clipLeft = Math.max(clipQualLeft!, clipAdapterLeft!);
    let clipRight: number;
    if (clipQualRight) clipRight = clipAdapterRight ? Math.min(clipQualRight, clipAdapterRight) : clipQualRight;
    else if (clipAdapterRight) clipRight = clipAdapterRight;
    else clipRight = seqLen!;
    const annotations = new Map<string, unknown>();
    let finalQuals = quals;
    if (this.trim) {
      if (clipLeft >= clipRight) {
        warn("Overlapping clip values in SFF record, trimmed to nothing", PARSER);
        seq = new Uint8Array(0);
        finalQuals = [];
      } else {
        seq = upper(seq.slice(clipLeft, clipRight));
        finalQuals = quals.slice(clipLeft, clipRight);
      }
    } else {
      if (clipLeft >= clipRight) {
        warn("Overlapping clip values in SFF record", PARSER);
        seq = lower(seq);
      } else {
        seq = concat(lower(seq.slice(0, clipLeft)), upper(seq.slice(clipLeft, clipRight)), lower(seq.slice(clipRight)));
      }
      annotations.set("flow_values", unpack(this.flowFmt, flowValues));
      annotations.set("flow_index", unpack(tempFmt, flowIndex));
      annotations.set("flow_chars", this.flowChars);
      annotations.set("flow_key", this.keySequence);
      annotations.set("clip_qual_left", clipQualLeft);
      annotations.set("clip_qual_right", clipQualRight);
      annotations.set("clip_adapter_left", clipAdapterLeft);
      annotations.set("clip_adapter_right", clipAdapterRight);
    }
    if (isUanName(name)) {
      annotations.set("time", readTime(name));
      annotations.set("region", pyInt(name[8]!));
      annotations.set("coords", readXY(name));
    }
    annotations.set("molecule_type", "DNA");
    const record = new SeqRecord(new Seq(seq), name, name, "", null, null, annotations);
    record.letterAnnotations.set("phred_quality", finalQuals);
    return record;
  }

  /** After the last read: skip the index and padding, then insist that nothing else follows. */
  private checkEof(stream: BinaryStream): void {
    let offset = this.offset;
    let extra: Uint8Array = new Uint8Array(0);
    let padding = 0;
    const { indexOffset, indexLength } = this;
    if (indexOffset && offset <= indexOffset) {
      if (offset < indexOffset) throw new ValueError(`Gap of ${indexOffset - offset} bytes after final record end ${offset}, before ${indexOffset} where index starts?`);
      stream.read(indexLength);
      this.offset += indexLength;
      offset = indexOffset + indexLength;
      if (offset !== this.offset) throw new ValueError(`Wanted ${offset}, got ${stream.tell()}, index is ${indexOffset} to ${indexOffset + indexLength}`);
    }
    if (offset % 8) {
      padding = 8 - (offset % 8);
      extra = stream.read(padding);
      this.offset += padding;
    }
    if (padding >= 4 && String.fromCharCode(...extra.slice(-4)) === ".sff") {
      throw new ValueError(`Your SFF file is invalid, post index ${padding} byte null padding region ended '.sff' which could be the start of a concatenated SFF file? See offset ${offset}`);
    }
    if (padding && extra.length === 0) {
      warn(`Your SFF file is technically invalid as it is missing a terminal ${padding} byte null padding region.`, PARSER);
      return;
    }
    if (nullCount(extra) !== padding) warn(`Your SFF file is invalid, post index ${padding} byte null padding region contained data: ${pyBytesRepr(extra)}`, PARSER);
    offset = this.offset;
    if (offset % 8 !== 0) throw new ValueError(`Wanted offset ${offset} % 8 = ${offset % 8} to be zero`);
    const tail = stream.read(4);
    this.offset += 4;
    if (String.fromCharCode(...tail) === ".sff") throw new ValueError(`Additional data at end of SFF file, perhaps multiple SFF files concatenated? See offset ${offset}`);
    if (tail.length > 0) throw new ValueError(`Additional data at end of SFF file, see offset ${offset}`);
  }
}

/** The `sff-trim` reader: like `sff` but with clipped regions removed and no flow annotations. */
export class SffTrimIterator extends SffIterator {
  /** @param source - The file's bytes. */
  constructor(source: unknown) {
    super(source, null, true);
  }
}

