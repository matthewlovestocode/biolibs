/** Reader for `nib` files. */

import { ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { intFromBytes } from "../binary/struct.js";
import { SequenceIterator } from "../interfaces.js";

/** Hex digit of a nibble to nucleotide: 0 T, 1 C, 2 A, 3 G, 4 N and lower case with the high bit (8 t, 9 c, a a, b g, c n). */
const NIBBLE_TO_BASE: Record<string, string> = { "0": "T", "1": "C", "2": "A", "3": "G", "4": "N", "8": "t", "9": "c", a: "a", b: "g", c: "n" };

/**
 * Reads a UCSC nib file: a four-byte signature that fixes the byte order, a length, and two bases per byte.
 * The file holds a single sequence with no name, so the record keeps the default id.
 *
 * @throws {@link ValueError} for an empty file, an unknown signature, a size that does not match the length, or an invalid nibble.
 */
export class NibIterator extends SequenceIterator {
  get modes(): string { return "b"; }
  private readonly little: boolean;

  /** @param source - The file's bytes. */
  constructor(source: unknown) {
    super(source, null, "Nib");
    const word = this.bytes!.read(4);
    if (word.length === 0) throw new ValueError("Empty file.");
    const signature = [...word].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (signature === "3a3de96b") this.little = true;
    else if (signature === "6be93d3a") this.little = false;
    else throw new ValueError("unexpected signature in nib header");
  }

  protected nextRecord(): SeqRecord | null {
    const stream = this.bytes!;
    const number = stream.read(4);
    if (number.length === 0) return null;
    const length = intFromBytes(number, this.little);
    const data = stream.read();
    let indices = [...data].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (length % 2 === 0) {
      if (indices.length !== length) throw new ValueError("Unexpected file size");
    } else {
      if (indices.length !== length + 1) throw new ValueError("Unexpected file size");
      indices = indices.slice(0, length);
    }
    if (![...indices].every((c) => Object.hasOwn(NIBBLE_TO_BASE, c))) throw new ValueError("Unexpected sequence data found in file");
    return new SeqRecord(new Seq([...indices].map((c) => NIBBLE_TO_BASE[c]!).join("")));
  }
}
