/** Reading bigMaf files: a MAF alignment block stored as the one extra column of a bigBed file (`Bio.Align.bigmaf`). */

import { AssertionError, IndexError, ValueError, pyFloat, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../../alignment/alignment.js";
import type { ByteStream } from "../byte-stream.js";
import { BigBedIterator, type BigBedRow } from "./iterator.js";

/** The statuses an `i` line may give for the sequence either side of a block. */
const STATUS = ["C", "I", "N", "n", "M", "T"];
/** The statuses an `e` line may give for a sequence that does not align here. */
const EMPTY_STATUS = ["C", "I", "M", "n"];

/**
 * Reads the alignment blocks of a bigMaf file.
 *
 * A bigMaf file is a bigBed file with one extra column holding a whole MAF block, its lines separated by `;`
 * rather than newlines. Reading one is therefore bigBed's indexes and blocks with MAF's block parser on top, and
 * the alignments come out as `Bio.Align.maf` would give them: one record per `s` line, the sequences placed
 * inside their source by their start, the `e` lines under the `"empty"` annotation and the per-line statuses and
 * qualities on the records.
 */
export class BigMafIterator extends BigBedIterator {
  static override fmt: string | null = "bigMaf";
  /** The reference species, read from the first block and prefixed to the first target's name. */
  private declare reference: string | null;

  /**
   * Read the header, then find the reference species and name the first target after it.
   *
   * @param stream - The file.
   */
  protected override readHeader(stream: ByteStream): void {
    super.readHeader(stream);
    // `self.reference` survives a rewind in Biopython, so the first block is only read once.
    if (this.reference === undefined || this.reference === null) this.reference = this.readReference(stream);
    const first = this.targets[0];
    if (first !== undefined) first.id = `${this.reference}.${String(first.id)}`;
  }

  /**
   * The reference species, taken from the first `s` line of the first block.
   *
   * MAF names a sequence `species.chromosome`, and a bigMaf file stores only the chromosome in its B+ tree, so
   * the species has to come from the data itself.
   *
   * @param stream - The file; its position is restored.
   * @returns The species name.
   * @throws ValueError when the first block holds no `s` line.
   */
  private readReference(stream: ByteStream): string {
    let node = this.tree;
    while (node.children !== undefined) {
      const child = node.children[0];
      if (child === undefined) throw new IndexError("list index out of range");
      node = child;
    }
    const filepos = stream.tell();
    const rows = this.blockRows(stream, node);
    stream.seek(filepos);
    const row = rows[0];
    if (row === undefined) throw new ValueError("no alignment in the first block");
    const text = new TextDecoder().decode(row.rest);
    // Biopython looks for the first `;s` after the twelve bytes of position that precede the block's text.
    const i = text.indexOf(";s");
    if (i === -1) throw new ValueError("no 's' line in the first alignment");
    const words = text.slice(i + 1).split(/\s+/).filter((w) => w !== "");
    const name = words[1];
    if (name === undefined) throw new IndexError("list index out of range");
    return name.split(".")[0]!;
  }

  /**
   * Build one alignment from the MAF block in a row's single column.
   *
   * @param row - The item.
   * @returns The alignment.
   * @throws ValueError for a line the MAF format does not have, a malformed `s` line, a sequence whose length
   *   disagrees with its line, or a `pass` that is not positive; AssertionError for the malformed `i`, `e` and
   *   `q` lines Biopython asserts on.
   */
  protected override createAlignment(row: BigBedRow): Alignment {
    const { rest, dataStart, dataEnd } = row;
    if (rest[dataEnd - 1] !== 0) throw new ValueError("expected a NUL-terminated row");
    const whole = new TextDecoder().decode(rest.subarray(dataStart, dataEnd - 1));
    const records: SeqRecord[] = [], strands: string[] = [], starts: number[] = [], sizes: number[] = [];
    const aligned: Uint8Array[] = [];
    const annotations = new Map<string, unknown>();
    let score: number | null = null;
    let src: string | undefined, record: SeqRecord | undefined;

    // The block's lines, which a bigMaf file separates with `;` instead of newlines.
    for (const line of whole.split(";")) {
      const prefix = line.slice(0, 1);
      if (prefix === "#" || prefix === "") continue;
      if (prefix === "a") {
        for (const word of line.slice(1).split(/\s+/).filter((w) => w !== "")) {
          const eq = word.indexOf("=");
          const key = word.slice(0, eq), value = word.slice(eq + 1);
          if (key === "score") score = pyFloat(value);
          else if (key === "pass") {
            const v = pyInt(value);
            if (v <= 0) throw new ValueError(`pass value must be positive (found ${v})`);
            annotations.set("pass", v);
          } else throw new ValueError(`Unknown annotation variable '${key}'`);
        }
      } else if (prefix === "s") {
        const words = line.split(/\s+/).filter((w) => w !== "");
        if (words.length !== 7) throw new ValueError("Error parsing alignment - 's' line must have 7 fields");
        src = words[1]!;
        starts.push(pyInt(words[2]!));
        sizes.push(pyInt(words[3]!));
        strands.push(words[4]!);
        // No gap-character translation here, unlike `maf.ts`: `bigmaf.py` feeds the stored text straight to
        // its printed-alignment parser, and a bigMaf file is written by Biopython, which only writes `-`.
        aligned.push(new TextEncoder().encode(words[6]!));
        record = new SeqRecord(new Seq(null, pyInt(words[5]!)), src, "", "");
        records.push(record);
      } else if (prefix === "i") {
        const words = line.split(/\s+/).filter((w) => w !== "");
        if (words.length !== 6) throw new AssertionError("");
        if (words[1] !== src) throw new AssertionError("");
        const leftStatus = words[2]!, rightStatus = words[4]!;
        if (!STATUS.includes(leftStatus) || !STATUS.includes(rightStatus)) throw new AssertionError("");
        const r = record!;
        r.annotations.set("leftStatus", leftStatus);
        r.annotations.set("leftCount", pyInt(words[3]!));
        r.annotations.set("rightStatus", rightStatus);
        r.annotations.set("rightCount", pyInt(words[5]!));
      } else if (prefix === "e") {
        const words = line.split(/\s+/).filter((w) => w !== "");
        if (words.length !== 7) throw new AssertionError("");
        src = words[1]!;
        const start = pyInt(words[2]!), size = pyInt(words[3]!), strand = words[4]!;
        const srcSize = pyInt(words[5]!), status = words[6]!;
        if (!EMPTY_STATUS.includes(status)) throw new AssertionError("");
        const empty = new SeqRecord(new Seq(null, srcSize), src, "", "");
        const end = start + size;
        const segment: [number, number] = strand === "+" ? [start, end] : [srcSize - start, srcSize - end];
        if (!annotations.has("empty")) annotations.set("empty", []);
        (annotations.get("empty") as unknown[]).push([empty, segment, status]);
      } else if (prefix === "q") {
        const words = line.split(/\s+/).filter((w) => w !== "");
        if (words.length !== 3) throw new AssertionError("");
        if (words[1] !== src) throw new AssertionError("");
        record!.annotations.set("quality", words[2]!.replaceAll("-", ""));
      } else {
        throw new ValueError(`Error parsing alignment - unexpected line:\n${line}`);
      }
    }

    const parsed = Alignment.parsePrintedAlignment(aligned);
    const coordinates = parsed.coordinates;
    records.forEach((rec, i) => {
      const sequence = parsed.sequences[i]!;
      if (sequence.length !== sizes[i]) throw new ValueError(`sequence size is incorrect (found ${sequence.length}, expected ${sizes[i]})`);
      rec.seq = new Seq(new Map([[starts[i]!, sequence]]), rec.seq!.length);
    });
    records.forEach((rec, i) => {
      // Each row counts from where the sequence sits inside its source, and from the other end for `-`.
      const row2 = coordinates[i]!;
      if (strands[i] === "+") {
        const start = (rec.seq as Seq).definedRanges[0]![0];
        coordinates[i] = row2.map((c) => c + start);
      } else {
        rec.seq = (rec.seq as Seq).reverseComplement() as Seq;
        const end = (rec.seq as Seq).definedRanges[0]![1];
        coordinates[i] = row2.map((c) => end - c);
      }
    });
    const alignment = new Alignment(records, coordinates);
    alignment.annotations = annotations;
    if (score !== null) alignment.score = score;
    return alignment;
  }
}
