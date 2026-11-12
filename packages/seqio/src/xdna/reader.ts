/** Reader for Christian Marck's DNA Strider / xdna files. */

import { ValueError, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { decodeAscii, readExact } from "../binary/ascii.js";
import { unpack } from "../binary/struct.js";
import type { BinaryStream } from "../handles.js";
import { SequenceIterator } from "../interfaces.js";

/** `molecule_type` for each sequence type code. */
const SEQ_TYPES: Record<number, string | null> = { 0: null, 1: "DNA", 2: "DNA", 3: "RNA", 4: "protein" };
/** `topology` for each topology code. */
const SEQ_TOPOLOGIES: Record<number, string> = { 0: "linear", 1: "circular" };

const read = (stream: BinaryStream, length: number): Uint8Array => readExact(stream, length, `Cannot read ${length} bytes from handle`);

/** A string with a one-byte length. */
function readPString(stream: BinaryStream): string {
  const length = unpack(">B", read(stream, 1))[0] as number;
  return decodeAscii(read(stream, length));
}

/** A length-prefixed string holding an integer. */
const readPStringAsInteger = (stream: BinaryStream): number => pyInt(readPString(stream));

/** Skip an overhang description: a signed length and that many bytes. */
function readOverhang(stream: BinaryStream): void {
  const length = readPStringAsInteger(stream);
  if (length !== 0) read(stream, Math.abs(length));
}

/**
 * Turn a feature description (`name="value"` lines separated by carriage returns) into qualifiers; a line
 * without quotes becomes a `note`.
 */
function parseFeatureDescription(desc: string, qualifiers: Map<string, unknown>): void {
  for (const line of desc.split("\r").filter((x) => x.length > 0)) {
    // Python's `$` also matches just before a final newline, hence the lookahead.
    const m = /^([^=]+)="([^"]+)"?(?=\n?$)/.exec(line);
    if (m) qualifiers.set(m[1]!, [m[2]!]);
    else if (!line.includes('"')) qualifiers.set("note", [line]);
  }
}

/** Read one feature and add it to the record. */
function readFeature(stream: BinaryStream, record: SeqRecord): void {
  const name = readPString(stream);
  const desc = readPString(stream);
  const type = readPString(stream) || "misc_feature";
  let start = readPStringAsInteger(stream);
  let end = readPStringAsInteger(stream);
  const [forward] = unpack(">BBxB", read(stream, 4)) as number[];
  let strand = 1;
  if (!forward) {
    strand = -1;
    [start, end] = [end, start];
  }
  readPString(stream);
  const location = new SimpleLocation(start - 1, end, strand as 1 | -1);
  const qualifiers = new Map<string, unknown>();
  if (name) qualifiers.set("label", [name]);
  parseFeatureDescription(desc, qualifiers);
  record.features.push(new SeqFeature(location, type, undefined, qualifiers));
}

/**
 * Reads xdna files: a 112-byte header, the sequence, a comment, then overhangs and features.
 *
 * @throws {@link ValueError} for an empty, truncated or unsupported file.
 */
export class XdnaIterator extends SequenceIterator {
  get modes(): string { return "b"; }
  private header: Uint8Array | null;

  /** @param source - The file's bytes. */
  constructor(source: unknown) {
    super(source, null, "Xdna");
    const header = this.bytes!.read(112);
    if (header.length === 0) throw new ValueError("Empty file.");
    if (header.length < 112) throw new ValueError("Improper header, cannot read 112 bytes from stream");
    this.header = header;
  }

  protected nextRecord(): SeqRecord | null {
    if (this.header === null) return null;
    const stream = this.bytes!;
    const [version, seqType, topologyCode, length, , comLength] = unpack(">BBB25xII60xI12x", this.header) as number[];
    if (version !== 0) throw new ValueError("Unsupported XDNA version");
    const sequence = decodeAscii(read(stream, length!));
    const comment = decodeAscii(read(stream, comLength!));
    const name = comment.split(" ")[0]!;
    const record = new SeqRecord(new Seq(sequence), name, name, comment);
    if (!Object.hasOwn(SEQ_TYPES, seqType!)) throw new ValueError("Unknown sequence type");
    record.annotations.set("molecule_type", SEQ_TYPES[seqType!]);
    if (Object.hasOwn(SEQ_TOPOLOGIES, topologyCode!)) record.annotations.set("topology", SEQ_TOPOLOGIES[topologyCode!]);
    if (stream.read(1).length === 1) {
      readOverhang(stream);
      readOverhang(stream);
      let numFeatures = unpack(">B", read(stream, 1))[0] as number;
      while (numFeatures > 0) {
        readFeature(stream, record);
        numFeatures -= 1;
      }
    }
    this.header = null;
    return record;
  }
}
