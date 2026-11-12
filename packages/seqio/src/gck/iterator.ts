/** Reader for Gene Construction Kit (`gck`) files. */

import { ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { decodeAscii, readExact } from "../binary/ascii.js";
import { unpack } from "../binary/struct.js";
import type { BinaryStream } from "../handles.js";
import { SequenceIterator } from "../interfaces.js";

/** Read `length` bytes or fail. */
const read = (stream: BinaryStream, length: number): Uint8Array => readExact(stream, length);

/** Read a length-prefixed block; null at a clean end of file. */
function readPacket(stream: BinaryStream): Uint8Array | null {
  const length = stream.read(4);
  if (length.length === 0) return null;
  if (length.length < 4) throw new ValueError("Cannot read packet size from stream");
  return read(stream, unpack(">I", length)[0] as number);
}

/** A string with a one-byte length. */
function readPString(stream: BinaryStream): string {
  const length = unpack(">B", read(stream, 1))[0] as number;
  return decodeAscii(read(stream, length));
}

/** A string with a four-byte length. */
function readP4String(stream: BinaryStream): string {
  const length = unpack(">I", read(stream, 4))[0] as number;
  return decodeAscii(read(stream, length));
}

/** Like `readPacket` but a missing packet means the file was cut short. */
function needPacket(stream: BinaryStream): Uint8Array {
  const packet = readPacket(stream);
  if (packet === null) throw new ValueError("Premature end of file");
  return packet;
}

/**
 * Reads Gene Construction Kit files: a sequence, its features (CDS or misc_feature, with label and note), and the
 * name and topology of the construct. Sites and version history are read and skipped.
 *
 * @throws {@link ValueError} for an empty or truncated file or inconsistent packet sizes.
 */
export class GckIterator extends SequenceIterator {
  get modes(): string { return "b"; }

  /** @param source - The file's bytes. */
  constructor(source: unknown) {
    super(source, null, "GCK");
    const data = this.bytes!.read(24);
    if (data.length === 0) throw new ValueError("Empty file.");
    if (data.length < 24) throw new ValueError("Improper header, cannot read 24 bytes from stream");
  }

  protected nextRecord(): SeqRecord | null {
    const stream = this.bytes!;
    let packet = readPacket(stream);
    if (packet === null) return null;
    const seqLength = unpack(">I", packet.slice(0, 4))[0] as number;
    if (seqLength > packet.length - 4) throw new ValueError("Conflicting sequence length values");
    const sequence = decodeAscii(packet.slice(4));
    const record = new SeqRecord(new Seq(sequence));
    needPacket(stream);
    packet = needPacket(stream);
    const [featureSeqLength, numFeatures] = unpack(">IH", packet.slice(0, 6)) as [number, number];
    if (featureSeqLength !== sequence.length) throw new ValueError("Conflicting sequence length values");
    if (packet.length - 6 !== numFeatures * 92) throw new ValueError("Features packet size inconsistent with number of features");
    for (let i = 0; i < numFeatures; i++) {
      const offset = 6 + i * 92;
      const [start, end, type, strandCode, hasName, hasComment, version] = unpack(">II6xH14xB17xII35xB", packet.slice(offset, offset + 92)) as number[];
      const location = new SimpleLocation(start!, end!, strandCode === 1 ? -1 : 1);
      const qualifiers = new Map<string, unknown>();
      if (hasName! > 0) qualifiers.set("label", [readPString(stream)]);
      if (hasComment! > 0) qualifiers.set("note", [readP4String(stream)]);
      if (version! > 0) continue; // an old version of a feature: its name and comment are consumed but it is not kept
      record.features.push(new SeqFeature(location, type! > 0 ? "CDS" : "misc_feature", undefined, qualifiers));
    }
    packet = needPacket(stream);
    const [, numSites] = unpack(">IH", packet.slice(0, 6)) as [number, number];
    if (packet.length - 6 !== numSites * 88) throw new ValueError("Sites packet size inconsistent with number of sites");
    for (let i = 0; i < numSites; i++) {
      const offset = 6 + i * 88;
      const [, , hasName, hasComment] = unpack(">II24xII48x", packet.slice(offset, offset + 88)) as number[];
      if (hasName) readPString(stream);
      if (hasComment) readP4String(stream);
    }
    needPacket(stream);
    const numVersions = unpack(">H", read(stream, 2))[0] as number;
    const versions = read(stream, numVersions * 260);
    for (let i = 0; i < numVersions; i++) {
      const versionData = versions.slice(i * 260, (i + 1) * 260);
      const hasComment = unpack(">I", versionData.slice(-4))[0] as number;
      if (hasComment > 0) readP4String(stream);
    }
    read(stream, 706);
    const name = readPString(stream);
    record.name = record.id = name.split(" ")[0]!;
    record.description = name;
    const flags = read(stream, 17);
    const circularity = unpack(">16xB", flags)[0] as number;
    record.annotations.set("topology", circularity > 0 ? "circular" : "linear");
    return record;
  }
}
