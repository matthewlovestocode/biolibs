/** BED (Browser Extensible Data) files (Biopython's `Bio.Align.bed`). */

import { IndexError, ValueError, pyFloat, pyFormatG, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../alignment/alignment.js";
import { AlignmentIterator, AlignmentWriter, type WriteTarget } from "./interfaces.js";
import { registerFormat } from "./registry.js";
import { words as splitWords } from "./rows.js";
import type { TextStream } from "./stream.js";

/** Python's `sys.maxsize`: the length Biopython gives the (unknown) chromosome sequences. */
const MAXSIZE = 9223372036854775807;

/** Writes alignments as BED lines with between 3 and 12 columns. */
export class BedWriter extends AlignmentWriter {
  static override fmt: string | null = "BED";
  private readonly bedN: number;

  /**
   * @param target - Where to write.
   * @param bedN - Number of columns, from 3 to 12 (default 12).
   * @throws ValueError for any other number.
   */
  constructor(target: WriteTarget | null = null, bedN = 12) {
    if (bedN < 3 || bedN > 12) throw new ValueError("bedN must be between 3 and 12");
    super(target);
    this.bedN = bedN;
  }

  formatAlignment(alignment: Alignment): string {
    if (!(alignment instanceof Alignment)) throw new TypeError("Expected an Alignment object");
    let coordinates = alignment.coordinates!;
    if (coordinates.every((row) => row.length === 0)) return "";
    const { bedN } = this;
    if (alignment.sequences.length !== 2) throw new ValueError(alignment.sequences.length < 2 ? `not enough values to unpack (expected 2, got ${alignment.sequences.length})` : `too many values to unpack (expected 2, got ${alignment.sequences.length})`);
    const [target, query] = alignment.sequences as [unknown, unknown];
    const chrom = target instanceof SeqRecord && target.id !== null ? target.id : "target";
    const n = coordinates[0]!.length;
    if (coordinates[0]![0]! > coordinates[0]![n - 1]!) coordinates = coordinates.map((row) => [...row].reverse());
    const strand = coordinates[1]![0]! > coordinates[1]![n - 1]! ? "-" : "+";
    const blockSizes: number[] = [], blockStarts: number[] = [];
    let tStart = coordinates[0]![0]!, qStart = coordinates[1]![0]!, blockSize = 0;
    for (let c = 1; c < n; c++) {
      const tEnd = coordinates[0]![c]!, qEnd = coordinates[1]![c]!;
      if (tStart === tEnd) qStart = qEnd;
      else if (qStart === qEnd) tStart = tEnd;
      else { blockSize = tEnd - tStart; blockStarts.push(tStart); blockSizes.push(blockSize); tStart = tEnd; qStart = qEnd; }
    }
    let chromStart: number, chromEnd: number;
    if (blockStarts.length > 0) { chromStart = blockStarts[0]!; chromEnd = blockStarts[blockStarts.length - 1]! + blockSize; } else chromStart = chromEnd = tStart;
    const fields = [chrom, String(chromStart), String(chromEnd)];
    const done = (): string => fields.join("\t") + "\n";
    if (bedN === 3) return done();
    fields.push(query instanceof SeqRecord && query.id !== null ? query.id : "query");
    if (bedN === 4) return done();
    const score = alignment.score === undefined ? 0 : alignment.score;
    if (typeof score === "string") throw new ValueError("Unknown format code 'g' for object of type 'str'");
    fields.push(pyFormatG(score));
    if (bedN === 5) return done();
    fields.push(strand);
    if (bedN === 6) return done();
    fields.push(String(alignment.thickStart ?? chromStart));
    if (bedN === 7) return done();
    fields.push(String(alignment.thickEnd ?? chromEnd));
    if (bedN === 8) return done();
    fields.push(String(alignment.itemRgb ?? "0"));
    if (bedN === 9) return done();
    fields.push(String(blockSizes.length));
    if (bedN === 10) return done();
    fields.push(blockSizes.join(",") + ",");
    if (bedN === 11) return done();
    fields.push(blockStarts.map((b) => b - chromStart).join(",") + ",");
    return done();
  }
}

/** Reads BED files, one alignment per line; the columns after the name become attributes of the alignment. */
export class BedIterator extends AlignmentIterator {
  static override fmt: string | null = "BED";

  protected readNextAlignment(stream: TextStream): Alignment | null {
    for (const line of stream) {
      const w = splitWords(line);
      const bedN = w.length;
      if (bedN < 3 || bedN > 12) throw new ValueError(`expected between 3 and 12 columns, found ${bedN}`);
      const chrom = w[0]!, chromStart = pyInt(w[1]!), chromEnd = pyInt(w[2]!);
      const name = bedN > 3 ? w[3]! : null;
      const strand = bedN > 5 ? w[5]! : "+";
      let coordinates: number[][], qSize: number;
      if (bedN > 9) {
        const blockCount = pyInt(w[9]!);
        if (w.length < 12) throw new IndexError("list index out of range");
        const blockSizes = w[10]!.replace(/,+$/, "").split(",").map(pyInt);
        const blockStarts = w[11]!.replace(/,+$/, "").split(",").map(pyInt);
        if (blockSizes.length !== blockCount) throw new ValueError(`Inconsistent number of block sizes (${blockSizes.length} found, expected ${blockCount})`);
        if (blockStarts.length !== blockCount) throw new ValueError(`Inconsistent number of block start positions (${blockStarts.length} found, expected ${blockCount})`);
        let tPosition = 0, qPosition = 0;
        const pairs: [number, number][] = [[0, 0]];
        blockSizes.forEach((size, i) => {
          const start = blockStarts[i]!;
          if (start !== tPosition) { pairs.push([start, qPosition]); tPosition = start; }
          tPosition += size; qPosition += size;
          pairs.push([tPosition, qPosition]);
        });
        coordinates = [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
        qSize = blockSizes.reduce((a, b) => a + b, 0);
      } else {
        const size = chromEnd - chromStart;
        coordinates = [[0, size], [0, size]];
        qSize = size;
      }
      coordinates[0] = coordinates[0]!.map((c) => c + chromStart);
      const query = new SeqRecord(new Seq(null, qSize), name, undefined, "");
      const target = new SeqRecord(new Seq(null, MAXSIZE), chrom, undefined, "");
      if (strand === "-") coordinates[1] = coordinates[1]!.map((c) => qSize - c);
      const last = coordinates[0]!.length - 1;
      if (chromStart !== coordinates[0]![0]) throw new ValueError(`Inconsistent chromStart found (${chromStart}, expected ${coordinates[0]![0]})`);
      if (chromEnd !== coordinates[0]![last]) throw new ValueError(`Inconsistent chromEnd found (${chromEnd}, expected ${coordinates[0]![last]})`);
      const alignment = new Alignment([target, query], coordinates);
      if (bedN <= 4) return alignment;
      let score: number | string = w[4]!;
      try { score = pyFloat(score); } catch (e) { if (!(e instanceof ValueError)) throw e; }
      alignment.score = score;
      if (bedN <= 6) return alignment;
      alignment.thickStart = pyInt(w[6]!);
      if (bedN <= 7) return alignment;
      alignment.thickEnd = pyInt(w[7]!);
      if (bedN <= 8) return alignment;
      alignment.itemRgb = w[8]!;
      return alignment;
    }
    return null;
  }
}

registerFormat("bed", { AlignmentIterator: BedIterator, AlignmentWriter: BedWriter as never });
