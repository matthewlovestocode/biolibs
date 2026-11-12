/** SnapGene packet parsers (a port of the helpers in Biopython's `SeqIO.SnapGeneIO`). */

import { ValueError, pyInt, pyStrip } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqFeature, SimpleLocation, type CompoundLocation } from "@biolibs/seqfeature";
import type { SeqRecord } from "@biolibs/seqrecord";
import { decodeAscii } from "../binary/ascii.js";
import { unpack } from "../binary/struct.js";
import type { BinaryStream } from "../handles.js";
import { dateFromStrptime } from "./strptime.js";
import { DomElement, TEXT_NODE, parseString } from "./dom.js";

/** A location of either kind. */
type Loc = SimpleLocation | CompoundLocation;

/** Strict UTF-8 decoding (Python raises `UnicodeDecodeError`, a `ValueError`). */
function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ValueError("'utf-8' codec can't decode bytes: invalid data");
  }
}

/** Remove markup tags from a value (`re.sub("<[^>]+>", "", text)`). */
const decode = (text: string): string => text.replace(/<[^>]+>/g, "");

/** An attribute value with tags stripped, a default, or an error when `error` is given. */
function attr(node: DomElement, name: string, def: string | null = null, error: string | null = null): string | null {
  if (node.hasAttribute(name)) return decode(node.attributes.get(name)!);
  if (error) throw new ValueError(error);
  return def;
}

/** Text of the first child element named `name`, or a default. */
function childValue(node: DomElement, name: string, def: string | null = null): string | null {
  const children = node.getElementsByTagName(name);
  const first = children[0];
  if (first && first.childNodes.length > 0 && first.firstChild!.nodeType === TEXT_NODE) return decode((first.firstChild as { data: string }).data);
  return def;
}

/** Packets of the file as `[type, length, data]`; the generator ends at a clean end of file. */
export function* iteratePackets(stream: BinaryStream): Generator<[number, number, Uint8Array]> {
  for (;;) {
    const typeByte = stream.read(1);
    if (typeByte.length < 1) return;
    const length = stream.read(4);
    if (length.length < 4) throw new ValueError("Unexpected end of packet");
    const size = unpack(">I", length)[0] as number;
    const data = stream.read(size);
    if (data.length < size) throw new ValueError("Unexpected end of packet");
    yield [typeByte[0]!, size, data];
  }
}

/** Packet 0: the sequence and its topology. */
function parseDnaPacket(length: number, data: Uint8Array, record: SeqRecord): void {
  if (record.seq && record.seq.length > 0) throw new ValueError("The file contains more than one DNA packet");
  const [flags, sequence] = unpack(`>B${length - 1}s`, data) as [number, Uint8Array];
  record.seq = new Seq(decodeAscii(sequence));
  record.annotations.set("molecule_type", "DNA");
  record.annotations.set("topology", flags & 1 ? "circular" : "linear");
}

/** Packet 6: type, date, accession and comments. */
function parseNotesPacket(_length: number, data: Uint8Array, record: SeqRecord): void {
  const xml = parseString(decodeUtf8(data));
  record.annotations.set("data_file_division", childValue(xml, "Type") === "Synthetic" ? "SYN" : "UNC");
  const date = childValue(xml, "LastModified");
  if (date) record.annotations.set("date", dateFromStrptime(date));
  const acc = childValue(xml, "AccessionNumber");
  if (acc) record.id = acc;
  const comment = childValue(xml, "Comments");
  if (comment) {
    const space = comment.indexOf(" ");
    record.name = space < 0 ? comment : comment.slice(0, space);
    record.description = comment;
    if (!acc) record.id = record.name;
  }
}

/** Packet 9: the file signature. */
export function parseCookiePacket(_length: number, data: Uint8Array): void {
  const [cookie] = unpack(">8sHHH", data) as [Uint8Array, number, number, number];
  if (decodeAscii(cookie) !== "SnapGene") throw new ValueError("The file is not a valid SnapGene file");
}

/** Convert a `start-end` range to a location; a start after the end wraps around the origin. */
function parseLocation(rangespec: string, strand: 1 | -1, record: SeqRecord, isPrimer = false): Loc {
  const pieces = rangespec.split("-");
  if (pieces.length < 2) throw new ValueError(`not enough values to unpack (expected 2, got ${pieces.length})`);
  if (pieces.length > 2) throw new ValueError(`too many values to unpack (expected 2, got ${pieces.length})`);
  let start = pyInt(pieces[0]!);
  let end = pyInt(pieces[1]!);
  start -= 1;
  if (isPrimer) {
    start += 1;
    end += 1;
  }
  if (start >= end) return new SimpleLocation(start, record.length, strand).add(new SimpleLocation(0, end, strand)) as Loc;
  return new SimpleLocation(start, end, strand);
}

/** Packet 10: features. */
function parseFeaturesPacket(_length: number, data: Uint8Array, record: SeqRecord): void {
  const xml = parseString(decodeUtf8(data));
  for (const feature of xml.getElementsByTagName("Feature")) {
    const quals = new Map<string, unknown>();
    const type = attr(feature, "type", "misc_feature")!;
    let strand: 1 | -1 = 1;
    if (pyInt(attr(feature, "directionality", "1")!) === 2) strand = -1;
    let location: Loc | null = null;
    let subparts: [number, string][] = [];
    let nParts = 0;
    for (const segment of feature.getElementsByTagName("Segment")) {
      if (attr(segment, "type", "standard") === "gap") continue;
      const rng = attr(segment, "range");
      nParts += 1;
      if (rng === null) throw new TypeError("'NoneType' object has no attribute 'split'");
      const next = parseLocation(rng, strand, record);
      if (location === null) location = next;
      else if (strand === -1) location = next.add(location) as Loc;
      else location = location.add(next) as Loc;
      const name = attr(segment, "name");
      if (name) subparts.push([nParts, name]);
    }
    if (subparts.length > 0) {
      if (strand === -1) subparts = subparts.map(([i, name]): [number, string] => [nParts - i + 1, name]).reverse();
      quals.set("parts", [subparts.map(([i, name]) => `${i}:${name}`).join(";")]);
    }
    // A zero-length location is falsy in Python, so it counts as missing.
    if (location === null || location.length === 0) throw new ValueError("Missing feature location");
    for (const qualifier of feature.getElementsByTagName("Q")) {
      const qname = attr(qualifier, "name", null, "Missing qualifier name")!;
      const qvalues: (string | number)[] = [];
      for (const value of qualifier.getElementsByTagName("V")) {
        if (value.hasAttribute("text")) qvalues.push(decode(value.attributes.get("text")!));
        else if (value.hasAttribute("predef")) qvalues.push(decode(value.attributes.get("predef")!));
        else if (value.hasAttribute("int")) qvalues.push(pyInt(value.attributes.get("int")!));
      }
      quals.set(qname, qvalues.map((v) => (typeof v === "string" ? pyStrip(v.replace(/\r\n|\r|\n/g, " ")) : v)));
    }
    const name = attr(feature, "name");
    if (name) {
      if (!quals.has("label")) quals.set("label", [name]);
      else if (!(quals.get("label") as string[]).includes(name)) quals.set("name", [name]);
    }
    record.features.push(new SeqFeature(location, type, undefined, quals));
  }
}

/** Packet 5: primers and where they bind. */
function parsePrimersPacket(_length: number, data: Uint8Array, record: SeqRecord): void {
  const xml = parseString(decodeUtf8(data));
  let minMatchLength = 0;
  let minMeltingTemp = 0;
  for (const param of xml.getElementsByTagName("HybridizationParams")) {
    minMatchLength = pyInt(attr(param, "minContinuousMatchLen", "0")!);
    minMeltingTemp = pyInt(attr(param, "minMeltingTemperature", "0")!);
  }
  for (const primer of xml.getElementsByTagName("Primer")) {
    const quals = new Map<string, unknown>();
    const name = attr(primer, "name");
    if (name) quals.set("label", [name]);
    const locations: Loc[] = [];
    for (const site of primer.getElementsByTagName("BindingSite")) {
      const rng = attr(site, "location", null, "Missing binding site location")!;
      const strand: 1 | -1 = pyInt(attr(site, "boundStrand", "0")!) === 1 ? -1 : 1;
      const location = parseLocation(rng, strand, record, true);
      const simplified = pyInt(attr(site, "simplified", "0")!) === 1;
      if (simplified && locations.some((l) => l.equals(location))) continue;
      const annealed = attr(site, "annealedBases");
      if (annealed !== null && annealed.length < minMatchLength) continue;
      const meltingTemp = attr(site, "meltingTemperature");
      if (meltingTemp !== null && pyInt(meltingTemp) < minMeltingTemp) continue;
      locations.push(location);
      record.features.push(new SeqFeature(location, "primer_bind", undefined, quals));
    }
  }
}

/** Handlers by packet type; other packet types are skipped. */
export const PACKET_HANDLERS: Record<number, (length: number, data: Uint8Array, record: SeqRecord) => void> = {
  0: parseDnaPacket, 5: parsePrimersPacket, 6: parseNotesPacket, 10: parseFeaturesPacket,
};

