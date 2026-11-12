/** Writer for `nib` files. */

import { ValueError } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { pack } from "../binary/struct.js";
import { SequenceWriter } from "../interfaces.js";

/** Nucleotide to nibble. */
const BASE_TO_NIBBLE: Record<string, number> = { T: 0, C: 1, A: 2, G: 3, N: 4, t: 8, c: 9, a: 10, g: 11, n: 12 };

/**
 * Writes one sequence as a nib file (little-endian, matching Biopython on common machines).
 *
 * @throws {@link ValueError} unless exactly one record with only A, C, G, T, N (either case) is given.
 */
export class NibWriter extends SequenceWriter {
  get modes(): string { return "b"; }

  /** Write the four-byte signature. */
  writeHeader(): void {
    this.handle.write(Uint8Array.of(0x3a, 0x3d, 0xe9, 0x6b) as never);
  }

  writeRecord(record: SeqRecord): void {
    const sequence = record.seq;
    if (sequence === null) throw new TypeError("cannot convert 'NoneType' object to bytes");
    let nucleotides = String.fromCharCode(...sequence.toBytes());
    const length = sequence.length;
    // The length goes out before the sequence is checked, so an invalid sequence leaves a partial file, as in Biopython.
    this.handle.write(pack("<i", length) as never);
    if (length % 2 === 1) nucleotides += "T";
    if (![...nucleotides].every((c) => Object.hasOwn(BASE_TO_NIBBLE, c))) throw new ValueError("Sequence should contain A,C,G,T,N,a,c,g,t,n only");
    const out = new Uint8Array(nucleotides.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = (BASE_TO_NIBBLE[nucleotides[2 * i]!]! << 4) | BASE_TO_NIBBLE[nucleotides[2 * i + 1]!]!;
    this.handle.write(out as never);
  }

  writeRecords(records: Iterable<SeqRecord>): number {
    this.writeHeader();
    let count = 0;
    for (const record of records) {
      if (count === 1) throw new ValueError("More than one sequence found");
      this.writeRecord(record);
      count += 1;
    }
    if (count !== 1) throw new ValueError("Must have one sequence");
    return count;
  }
}

