/** Writing bigMaf files (`Bio.Align.bigmaf.AlignmentWriter`). */

import { AssertionError, ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../../alignment/alignment.js";
import type { ByteWriter } from "../byte-writer.js";
import { BIGMAF_DECLARATION } from "./declarations.js";
import { BigBedWriter } from "./writer.js";

/** What a bigMaf writer may be told; the same as bigBed's, minus what this format fixes itself. */
export interface BigMafOptions {
  /** The chromosomes, in the order the alignments use them, the first named `species.chromosome`. */
  targets?: SeqRecord[] | null;
  /** Compress the data blocks with zlib (the default). */
  compress?: boolean;
  /** Accepted, as Biopython accepts it, but it never reaches the bigBed writer and so changes nothing. */
  blockSize?: number;
  /** Accepted and likewise ignored. */
  itemsPerSlot?: number;
}

/**
 * Writes alignments as a bigMaf file: a bigBed file of three columns plus one holding a whole MAF block.
 *
 * Each alignment is formatted as MAF, its newlines replaced by `;`, and that text becomes the extra column of a
 * three-column bigBed row. The species is stripped from the first target's name, since the chromosome tree holds
 * only the chromosome, and the alignments are sorted as the bigBed writer requires.
 */
export class BigMafWriter {
  /** The format name used in messages. */
  static fmt: string | null = "bigMaf";
  /** Binary, so `write` refuses a text target. */
  static mode: "t" | "b" = "b";
  private readonly options: BigMafOptions;

  /** @param target - Where to write; a {@link ByteWriter}. @param options - As {@link BigMafOptions}. */
  constructor(private readonly target: ByteWriter | null = null, options: BigMafOptions = {}) {
    this.options = options;
  }

  /**
   * @param alignments - The alignments to write.
   * @returns Nothing, as Biopython's writer returns no count.
   * @throws TypeError without a target, or for anything that is not an alignment.
   */
  write(alignments: Iterable<Alignment>): number | undefined {
    if (this.target === null) throw new TypeError("'NoneType' object has no attribute 'write'");
    this.writeFile(this.target, alignments);
    return undefined;
  }

  /**
   * Write the whole file.
   *
   * @param stream - Where to write. @param alignments - The alignments, which this reshapes.
   * @throws TypeError for anything that is not an alignment, or when no targets are given; AssertionError for an
   *   alignment whose target runs backwards; ValueError for a target name with no species in it.
   */
  writeFile(stream: ByteWriter, alignments: Iterable<Alignment>): void {
    const fixed: Alignment[] = [];
    for (const alignment of alignments) {
      if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
      // The MAF text of the whole alignment, with `;` where its newlines were, is the one extra column.
      const mafBlock = alignment.format("maf").slice(0, -1).replaceAll("\n", ";");
      const coordinates = alignment.coordinates!;
      if (coordinates.every((row) => row.length === 0)) continue;
      const pair = alignment.get({ stop: 2 }) as Alignment;
      const target = pair.sequences[0] as SeqRecord;
      const id = String(target.id);
      const dot = id.indexOf(".");
      if (dot === -1) throw new ValueError("not enough values to unpack (expected 2, got 1)");
      target.id = id.slice(dot + 1);
      const row = pair.coordinates![0]!;
      if (!(row[0]! < row[row.length - 1]!)) throw new AssertionError("");
      pair.annotations = new Map([["mafBlock", mafBlock]]);
      fixed.push(pair);
    }
    fixed.sort((a, b) => {
      const ida = String((a.sequences[0] as SeqRecord).id), idb = String((b.sequences[0] as SeqRecord).id);
      if (ida !== idb) return ida < idb ? -1 : 1;
      return a.coordinates![0]![0]! - b.coordinates![0]![0]!;
    });
    const given = this.options.targets ?? (alignments as { targets?: SeqRecord[] }).targets ?? null;
    if (given === null) throw new TypeError("'Array' object has no attribute 'targets'");
    const first = given[0];
    if (first === undefined) throw new TypeError("list index out of range");
    const firstId = String(first.id);
    const firstDot = firstId.indexOf(".");
    if (firstDot === -1) throw new ValueError("not enough values to unpack (expected 2, got 1)");
    const targets = [...given];
    targets[0] = new SeqRecord(first.seq as Seq, firstId.slice(firstDot + 1));
    // Only these four are handed on: Biopython's bigMaf writer accepts `blockSize` and `itemsPerSlot` and then
    // never passes them to the bigBed writer it delegates to, so they make no difference to the file.
    new BigBedWriter(stream, {
      bedN: 3, declaration: BIGMAF_DECLARATION, targets, compress: this.options.compress ?? true,
    }).writeFile(stream, fixed);
  }
}
