/** Reader for SnapGene `.dna` files. */

import { ValueError } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { PACKET_HANDLERS, iteratePackets, parseCookiePacket } from "./packets.js";

/**
 * Reads SnapGene files: a cookie packet, then packets for the DNA, notes, features and primers.
 * One record per file.
 *
 * @throws {@link ValueError} for an empty file, a missing cookie, truncated packets, or no DNA packet.
 */
export class SnapGeneIterator extends SequenceIterator {
  get modes(): string { return "b"; }
  private packets: Generator<[number, number, Uint8Array]> | null;

  /** @param source - The file's bytes. */
  constructor(source: unknown) {
    super(source, null, "SnapGene");
    this.packets = iteratePackets(this.bytes!);
    const first = this.packets.next();
    if (first.done) throw new ValueError("Empty file.");
    const [packetType, length, data] = first.value;
    if (packetType !== 9) throw new ValueError("The file does not start with a SnapGene cookie packet");
    parseCookiePacket(length, data);
  }

  protected nextRecord(): SeqRecord | null {
    const packets = this.packets;
    if (packets === null) return null;
    const record = new SeqRecord(null);
    for (const [packetType, length, data] of packets) {
      const handler = PACKET_HANDLERS[packetType];
      if (handler !== undefined) handler(length, data, record);
    }
    if (!record.seq || record.seq.length === 0) throw new ValueError("No DNA packet in file");
    this.packets = null;
    return record;
  }
}
