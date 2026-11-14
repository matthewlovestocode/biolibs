/** Writing bigBed files (`Bio.Align.bigbed.AlignmentWriter`). */

import { AssertionError, KeyError, ValueError, deflate, pyInt } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../../alignment/alignment.js";
import { ByteWriter } from "../byte-writer.js";
import { AutoSQLTable, Field } from "./autosql.js";
import { ExtraIndices } from "./extra-index.js";
import { RecordWriter, zeros } from "./pack.js";
import { RangeTree } from "./range-tree.js";
import { MAX_ZOOM_LEVELS, REGION_SUMMARY_SIZE, RES_INCREMENT, Region, RegionSummary, SUMMARY_SIZE, Summary,
  ZOOM_LEVELS_SIZE, ZoomLevel, calculateReductions, type Reduction } from "./summaries.js";
import { writeBPlusTree, writeRTree, type BPlusItem } from "./write-indexes.js";

/** The magic number at the start of a bigBed file. */
const SIGNATURE = 0x8789f2eb;
/** The version Biopython writes. */
const VERSION = 4;
/** `"=IHHQQQHHQQIQ"`: the whole common header, magic number included. */
const HEADER_SIZE = 64;

/** The declaration Biopython uses when none is given: the twelve standard BED columns. */
export const DEFAULT_DECLARATION = new AutoSQLTable("bed", "Browser Extensible Data", [
  new Field("string", "chrom", "Reference sequence chromosome or scaffold"),
  new Field("uint", "chromStart", "Start position in chromosome"),
  new Field("uint", "chromEnd", "End position in chromosome"),
  new Field("string", "name", "Name of item."),
  new Field("uint", "score", "Score (0-1000)"),
  new Field("char[1]", "strand", "+ or - for strand"),
  new Field("uint", "thickStart", "Start of where display should be thick (start codon)"),
  new Field("uint", "thickEnd", "End of where display should be thick (stop codon)"),
  new Field("uint", "reserved", "Used as itemRgb as of 2004-11-22"),
  new Field("int", "blockCount", "Number of blocks"),
  new Field("int[blockCount]", "blockSizes", "Comma separated list of block sizes"),
  new Field("int[blockCount]", "chromStarts", "Start positions relative to chromStart"),
]);

/** What a bigBed writer may be told. */
export interface BigBedOptions {
  /** How many of the twelve standard BED columns to write; 3 to 12, 12 by default. */
  bedN?: number;
  /** The declaration of the columns, needed only when the file has extra ones. */
  declaration?: AutoSQLTable | null;
  /** The chromosomes, in the order the alignments use them. */
  targets?: SeqRecord[] | null;
  /** Compress the data blocks with zlib (the default). */
  compress?: boolean;
  /** How many items a data block holds. */
  itemsPerSlot?: number;
  /** How many children a node of either index may have. */
  blockSize?: number;
  /** The names of extra columns to index. */
  extraIndex?: readonly string[];
}

/** One chromosome as the writer records it while checking the alignments. */
interface ChromUsage {
  /** Its name. */
  name: string;
  /** Its id, which is its position in the file. */
  id: number;
  /** How long it is. */
  size: number;
}

/** Collects items into blocks of a fixed size, writing each block out as it fills. */
class BufferedStream {
  private parts: Uint8Array[] = [];
  private length = 0;

  /** @param output - Where full blocks go. @param size - How many bytes a block holds. @param compress - Whether to compress each block. */
  constructor(readonly output: ByteWriter, private readonly size: number, private readonly compress: boolean) {}

  /** @param item - The item to add, which learns where its block starts. */
  write(item: { offset: number; toBytes(): Uint8Array }): void {
    item.offset = this.output.tell();
    const data = item.toBytes();
    this.parts.push(data);
    this.length += data.length;
    if (this.length === this.size) this.flush();
  }

  /** Write out whatever is buffered, however little. */
  flush(): void {
    const whole = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) { whole.set(part, at); at += part.length; }
    this.output.write(this.compress ? deflate(whole) : whole);
    this.parts = [];
    this.length = 0;
  }
}

/**
 * Writes alignments as a bigBed file.
 *
 * The file is laid out in one pass: room for the header, the declaration, the summary and the extra indexes,
 * then the chromosome tree, the data in blocks, the R tree over them, the zoom levels, and the extra indexes'
 * own trees. Only then are the offsets known, so the writer seeks back and fills the header in.
 */
export class BigBedWriter {
  /** The format name used in messages. */
  static fmt: string | null = "bigBed";
  /** Binary, so `write` refuses a text target. */
  static mode: "t" | "b" = "b";
  /** How many items a data block holds. */
  itemsPerSlot: number;
  private readonly bedN: number;
  private declaration: AutoSQLTable | null;
  private readonly targetList: SeqRecord[] | null;
  private readonly compress: boolean;
  private readonly blockSize: number;
  private readonly extraIndexNames: readonly string[];

  /**
   * @param target - Where to write; a {@link ByteWriter}.
   * @param options - As {@link BigBedOptions}.
   * @throws ValueError for a `bedN` outside 3 to 12.
   */
  constructor(private readonly target: ByteWriter | null = null, options: BigBedOptions = {}) {
    const bedN = options.bedN ?? 12;
    if (bedN < 3 || bedN > 12) throw new ValueError("bedN must be between 3 and 12");
    this.bedN = bedN;
    this.declaration = options.declaration ?? null;
    this.targetList = options.targets ?? null;
    this.compress = options.compress ?? true;
    this.itemsPerSlot = options.itemsPerSlot ?? 512;
    this.blockSize = options.blockSize ?? 256;
    this.extraIndexNames = options.extraIndex ?? [];
  }

  /**
   * @param alignments - The alignments to write.
   * @returns Nothing: Biopython's `write_file` for this format returns no count, so neither does this, and
   *   `Align.write(..., "bigbed")` gives `undefined` where a text format gives a number.
   * @throws TypeError without a target.
   */
  write(alignments: Iterable<Alignment>): number | undefined {
    if (this.target === null) throw new TypeError("'NoneType' object has no attribute 'write'");
    this.writeFile(this.target, alignments);
    return undefined;
  }

  /**
   * Write the whole file.
   *
   * @param stream - Where to write. @param alignments - The alignments, sorted by chromosome and start.
   * @throws ValueError for alignments out of order, off the end of a chromosome, or on a chromosome the target
   *   list does not have.
   */
  writeFile(stream: ByteWriter, alignments: Iterable<Alignment>): void {
    const list = [...alignments];
    const targets = this.targetList ?? (alignments as { targets?: SeqRecord[] }).targets ?? null;
    // Biopython reads `alignments.targets` when none is passed, which raises an AttributeError on a plain list.
    if (targets === null) throw new TypeError("'Array' object has no attribute 'targets'");
    if (this.declaration === null) {
      const own = (alignments as { declaration?: AutoSQLTable }).declaration;
      const source = own ?? DEFAULT_DECLARATION;
      this.declaration = new AutoSQLTable(source.name, source.comment, source.fields.slice(0, this.bedN));
    }
    const declaration = this.declaration;
    const extraIndices = new ExtraIndices(this.extraIndexNames, declaration);
    const { chromUsage, aveSize, keySize } = this.getChromUsage(list, targets, extraIndices);

    stream.zeros(HEADER_SIZE);
    stream.zeros(ZOOM_LEVELS_SIZE);
    const autoSqlOffset = stream.tell();
    stream.write(new TextEncoder().encode(`${declaration.toString()}\0`));
    const totalSummaryOffset = stream.tell();
    stream.zeros(SUMMARY_SIZE);
    const extraIndicesOffset = stream.tell();
    stream.zeros(extraIndices.size);
    const chromosomeTreeOffset = stream.tell();
    const treeItems: BPlusItem[] = chromUsage.map((c) => ({
      name: c.name,
      value: new RecordWriter(8).u32(c.id).u32(c.size).done(),
    }));
    writeBPlusTree(treeItems, keySize, Math.min(this.blockSize, chromUsage.length), stream);
    const fullDataOffset = stream.tell();
    const reductions = calculateReductions(aveSize);
    stream.write(new RecordWriter(8).u64(list.length).done());
    extraIndices.initialize(list.length);
    const { maxBlockSize, regions } = this.writeAlignments(list, stream, reductions, extraIndices);
    const uncompressBufSize = this.compress ? Math.max(maxBlockSize, this.itemsPerSlot * REGION_SUMMARY_SIZE) : 0;
    const fullIndexOffset = stream.tell();
    writeRTree(regions, this.blockSize, 1, fullIndexOffset, stream);
    const { zoomList, totalSum } = this.writeZoomLevels(list, stream, fullIndexOffset - fullDataOffset, chromUsage, reductions);
    for (const extraIndex of extraIndices.list) {
      extraIndex.fileOffset = stream.tell();
      writeBPlusTree(extraIndex.treeItems(), extraIndex.maxFieldSize, this.blockSize, stream);
    }

    stream.seek(0);
    stream.write(new RecordWriter(HEADER_SIZE).u32(SIGNATURE).u16(VERSION).u16(zoomList.length)
      .u64(chromosomeTreeOffset).u64(fullDataOffset).u64(fullIndexOffset)
      .u16(declaration.length).u16(this.bedN).u64(autoSqlOffset).u64(totalSummaryOffset)
      .u32(uncompressBufSize).u64(extraIndicesOffset).done());
    for (const level of zoomList) stream.write(level.toBytes());
    stream.zeros(ZOOM_LEVELS_SIZE - zoomList.length * 24);
    stream.seek(totalSummaryOffset);
    stream.write(totalSum.toBytes());
    if (extraIndicesOffset !== stream.tell()) throw new AssertionError("");
    extraIndices.toFile(stream);
    stream.seekEnd();
    // The magic number again at the end of the file, which is how a reader can tell it is complete.
    stream.write(new RecordWriter(4).u32(SIGNATURE).done());
  }

  /**
   * Check the alignments and work out which chromosomes they use.
   *
   * @param alignments - The alignments. @param targets - The chromosome records.
   * @param extraIndices - The extra indexes, which learn their key sizes here.
   * @returns The chromosomes in file order, the mean alignment length, and the longest chromosome name.
   * @throws ValueError for an alignment ending before it starts, out of order, off the end of its chromosome, or
   *   on a chromosome the target list does not have.
   */
  private getChromUsage(alignments: readonly Alignment[], targets: readonly SeqRecord[], extraIndices: ExtraIndices):
  { chromUsage: ChromUsage[]; aveSize: number; keySize: number } {
    let aveSize = 0, chromId = 0, totalBases = 0, bedCount = 0, name = "", keySize = 0, chromSize = -1;
    let minDiff = 9223372036854775807, lastStart = -1;
    const chromUsage: ChromUsage[] = [];
    for (const alignment of alignments) {
      const chrom = String((alignment.sequences[0] as { id?: string | null }).id);
      const coords = alignment.coordinates!;
      const start = coords[0]![0]!, end = coords[0]![coords[0]!.length - 1]!;
      for (const extraIndex of extraIndices.list) extraIndex.updateMaxFieldSize(alignment);
      if (start > end) throw new ValueError(`end (${end}) before start (${start}) in alignment [${bedCount}]`);
      bedCount += 1;
      totalBases += end - start;
      if (name !== chrom) {
        if (name > chrom) throw new ValueError(`alignments are not sorted by target name at alignment [${bedCount}]`);
        if (name !== "") { chromUsage.push({ name, id: chromId, size: chromSize }); chromId += 1; }
        const target = targets.find((t) => t.id === chrom);
        if (target === undefined) throw new ValueError(`failed to find target '${chrom}' in target list at alignment [${bedCount}]`);
        name = chrom;
        keySize = Math.max(keySize, chrom.length);
        chromSize = target.seq!.length;
        lastStart = -1;
      }
      if (end > chromSize) throw new ValueError(`end coordinate ${end} bigger than ${chrom} size of ${chromSize} at alignment [${bedCount}]'`);
      if (lastStart >= 0) {
        const diff = start - lastStart;
        if (diff < minDiff) {
          if (diff < 0) throw new ValueError(`alignments are not sorted at alignment [${bedCount}]`);
          minDiff = diff;
        }
      }
      lastStart = start;
    }
    if (name !== "") chromUsage.push({ name, id: chromId, size: chromSize });
    if (bedCount > 0) aveSize = totalBases / bedCount;
    return { chromUsage, aveSize, keySize };
  }

  /**
   * Turn one alignment into the columns a BED row holds.
   *
   * @param alignment - The alignment.
   * @returns Its chromosome, start and end, and the rest of its columns as tab-separated bytes.
   * @throws ValueError for a name too long, a score out of range, thick positions out of range, a colour that is
   *   not three bytes, or a chromosome name that is blank or too long.
   */
  private extractFields(alignment: Alignment): { chrom: string; chromStart: number; chromEnd: number; rest: Uint8Array } {
    const { bedN } = this;
    const row: string[] = [];
    const chrom = String((alignment.sequences[0] as { id?: string | null }).id);
    if (chrom.length >= 255) throw new ValueError(`alignment target name '${chrom}' is too long (must not exceed 254 characters)`);
    if (chrom.length < 1) throw new ValueError("alignment target name cannot be blank or empty");
    const coords = alignment.coordinates!;
    const chromStart = coords[0]![0]!, chromEnd = coords[0]![coords[0]!.length - 1]!;
    if (chromEnd < chromStart) throw new ValueError(`chromStart after chromEnd (${chromEnd} > ${chromStart})`);
    let name = ".";
    if (bedN > 3) {
      name = String((alignment.sequences[1] as { id?: string | null }).id ?? "");
      if (name === "") name = ".";
      else if (name.length > 255) throw new ValueError(`alignment query name '${name}' is too long (must not exceed 255 characters`);
      row.push(name);
    }
    if (bedN > 4) {
      const score = alignment.score;
      if (score === undefined) row.push(".");
      else {
        const value = typeof score === "number" ? score : pyInt(String(score));
        if (value < 0 || value > 1000) throw new ValueError(`score (${value}) must be between 0 and 1000`);
        row.push(String(value));
      }
    }
    if (bedN > 5) {
      row.push(coords[1]![0]! <= coords[1]![coords[1]!.length - 1]! ? "+" : "-");
    }
    const thickStart = alignment.thickStart ?? chromStart;
    if (bedN > 6) row.push(String(thickStart));
    if (bedN > 7) {
      const thickEnd = alignment.thickEnd;
      if (thickEnd === undefined) row.push(String(chromEnd));
      else {
        if (thickEnd < thickStart) throw new ValueError(`thickStart (${thickStart}) after thickEnd (${thickEnd})`);
        if (thickStart !== 0 && (thickStart < chromStart || thickStart > chromEnd)) {
          throw new ValueError(`thickStart out of range for ${name}:${chromStart}-${chromEnd}, thick:${thickStart}-${thickEnd}`);
        }
        if (thickEnd !== 0 && (thickEnd < chromStart || thickEnd > chromEnd)) {
          throw new ValueError(`thickEnd out of range for ${name}:${chromStart}-${chromEnd}, thick:${thickStart}-${thickEnd}`);
        }
        row.push(String(thickEnd));
      }
    }
    if (bedN > 8) {
      const itemRgb = alignment.itemRgb;
      if (itemRgb === undefined) row.push(".");
      else {
        const colors = itemRgb.replace(/,+$/, "").split(",");
        const bytesOk = colors.length === 3 && colors.every((c) => { const v = pyInt(c); return v >= 0 && v < 256; });
        if (!bytesOk) {
          const whole = pyInt(itemRgb);
          if (!(whole >= 0 && whole < (2 << 32))) {
            throw new ValueError(`Expecting color to consist of r,g,b values from 0 to 255. Got '${itemRgb}'`);
          }
        }
        row.push(itemRgb);
      }
    }
    // The blocks are the steps where both sequences advance together.
    const blockSizes: number[] = [], blockStarts: number[] = [];
    for (let c = 1; c < coords[0]!.length; c++) {
      const dt = coords[0]![c]! - coords[0]![c - 1]!, dq = coords[1]![c]! - coords[1]![c - 1]!;
      if (dt !== 0 && dq !== 0) {
        blockSizes.push(Math.max(dt, dq));
        blockStarts.push(coords[0]![c - 1]! - chromStart);
      }
    }
    if (bedN > 9) row.push(String(blockSizes.length));
    if (bedN > 10) row.push(`${blockSizes.join(",")},`);
    if (bedN > 11) row.push(`${blockStarts.join(",")},`);
    for (const field of this.declaration!.fields.slice(bedN)) {
      const value = alignment.annotations?.get(field.name);
      if (value === undefined) throw new KeyError(field.name);
      if (typeof value === "string") row.push(value);
      else if (typeof value === "number") row.push(String(value));
      else row.push((value as unknown[]).map(String).join(","));
    }
    return { chrom, chromStart, chromEnd, rest: new TextEncoder().encode(row.join("\t")) };
  }

  /**
   * Write the data blocks, and return what the R tree needs to index them.
   *
   * @param alignments - The alignments. @param output - Where to write.
   * @param reductions - The reduction steps, which count their summaries here.
   * @param extraIndices - The extra indexes, which learn their blocks' offsets here.
   * @returns The largest block written, and one region per item.
   */
  private writeAlignments(alignments: readonly Alignment[], output: ByteWriter, reductions: Reduction[],
    extraIndices: ExtraIndices): { maxBlockSize: number; regions: Region[] } {
    const { itemsPerSlot } = this;
    let chromId = -1, itemIx = 0, sectionStartIx = 0, sectionEndIx = 0;
    let currentChrom: string | null = null;
    const regions: Region[] = [];
    let buffer: Uint8Array[] = [], buffered = 0;
    let maxBlockSize = 0;
    let region: Region | null = null;
    let done = false;
    let i = 0;
    let chrom = "", start = 0, end = 0, rest: Uint8Array = new Uint8Array(0);
    for (;;) {
      if (i < alignments.length) {
        ({ chrom, chromStart: start, chromEnd: end, rest } = this.extractFields(alignments[i]!));
        if (chrom !== currentChrom) {
          if (currentChrom !== null) itemIx = itemsPerSlot;
          currentChrom = chrom;
          chromId += 1;
          for (const row of reductions) row.end = 0;
        }
      } else {
        itemIx = itemsPerSlot;
        done = true;
      }
      if (itemIx === itemsPerSlot) {
        const blockStartOffset = output.tell();
        if (buffered > maxBlockSize) maxBlockSize = buffered;
        const whole = new Uint8Array(buffered);
        let at = 0;
        for (const part of buffer) { whole.set(part, at); at += part.length; }
        output.write(this.compress ? deflate(whole) : whole);
        buffer = [];
        buffered = 0;
        if (extraIndices.list.length > 0) {
          const blockSize = output.tell() - blockStartOffset;
          for (const extraIndex of extraIndices.list) {
            extraIndex.addOffsetSize(blockStartOffset, blockSize, sectionStartIx, sectionEndIx);
          }
          sectionStartIx = sectionEndIx;
        }
        if (region !== null) region.offset = blockStartOffset;
        else if (done) throw new TypeError("'NoneType' object has no attribute 'offset'");
        if (done) break;
        itemIx = 0;
      }
      if (itemIx === 0) { region = new Region(chromId, start, end); regions.push(region); }
      else if (end > region!.end) region!.end = end;
      itemIx += 1;
      for (const row of reductions) {
        if (start >= row.end) { row.size += 1; row.end = start + row.scale; }
        while (end > row.end) { row.size += 1; row.end += row.scale; }
      }
      if (extraIndices.list.length > 0) {
        for (const extraIndex of extraIndices.list) extraIndex.addKeysFromRow(alignments[i]!, sectionEndIx);
        sectionEndIx += 1;
      }
      const item = new Uint8Array(12 + rest.length + 1);
      item.set(new RecordWriter(12).u32(chromId).u32(start).u32(end).done(), 0);
      item.set(rest, 12);
      buffer.push(item);
      buffered += item.length;
      i += 1;
    }
    return { maxBlockSize, regions };
  }

  /**
   * Write the zoom levels: the coverage depth summarised at a series of scales.
   *
   * @param alignments - The alignments. @param output - Where to write.
   * @param dataSize - How many bytes the data occupies, which decides how coarse the first level may be.
   * @param chromUsage - The chromosomes. @param reductions - The reduction steps, with their counts.
   * @returns The levels written and the summary of the whole file.
   */
  private writeZoomLevels(alignments: readonly Alignment[], output: ByteWriter, dataSize: number,
    chromUsage: readonly ChromUsage[], reductions: readonly Reduction[]): { zoomList: ZoomLevel[]; totalSum: Summary } {
    const zoomList = Array.from({ length: MAX_ZOOM_LEVELS }, () => new ZoomLevel());
    const totalSum = new Summary();
    if (alignments.length === 0) {
      totalSum.minVal = 0;
      totalSum.maxVal = 0;
      return { zoomList: [], totalSum };
    }
    const { blockSize, itemsPerSlot } = this;
    const doCompress = this.compress;
    const maxReducedSize = dataSize / 2;
    zoomList[0]!.dataOffset = output.tell();
    let initialReduction = reductions[0]!;
    for (const reduction of reductions) {
      let reducedSize = reduction.size * REGION_SUMMARY_SIZE;
      if (doCompress) reducedSize /= 2;
      if (reducedSize <= maxReducedSize) { initialReduction = reduction; break; }
    }
    output.write(new RecordWriter(4).u32(initialReduction.size).done());
    const size = itemsPerSlot * REGION_SUMMARY_SIZE;
    let buffer = new BufferedStream(output, size, doCompress);
    const regions: RegionSummary[] = [];
    const rezoomedList: RegionSummary[] = [];
    const scale = Math.trunc(initialReduction.scale);
    const doubleReductionSize = scale * RES_INCREMENT;
    for (const tree of RangeTree.generate(chromUsage, alignments)) {
      let start = -9223372036854775807;
      let rezoomed: RegionSummary | null = null;
      for (const summary of tree.generateSummaries(scale, totalSum)) {
        buffer.write(summary);
        regions.push(summary);
        if (start + doubleReductionSize < summary.end) {
          rezoomed = summary.copy();
          start = rezoomed.start;
          rezoomedList.push(rezoomed);
        } else {
          rezoomed!.add(summary);
        }
      }
    }
    buffer.flush();
    if (regions.length !== initialReduction.size) throw new AssertionError("");
    zoomList[0]!.reductionLevel = initialReduction.scale;
    const indexOffset = output.tell();
    zoomList[0]!.indexOffset = indexOffset;
    writeRTree(regions, blockSize, itemsPerSlot, indexOffset, output);
    buffer = new BufferedStream(output, doCompress ? size : REGION_SUMMARY_SIZE, doCompress);
    const used = this.reduceZoomLevels(zoomList, rezoomedList, initialReduction, buffer, blockSize, itemsPerSlot);
    return { zoomList: zoomList.slice(0, used), totalSum };
  }

  /**
   * Write the coarser zoom levels, each four times coarser than the last, until one holds no fewer summaries.
   *
   * @param zoomList - The levels, which this fills in. @param summaries - The summaries of the level before.
   * @param initialReduction - The first level's step. @param buffer - Where the summaries go.
   * @param blockSize - For the indexes. @param itemsPerSlot - Likewise.
   * @returns How many levels ended up being used.
   */
  private reduceZoomLevels(zoomList: ZoomLevel[], summaries: RegionSummary[], initialReduction: Reduction,
    buffer: BufferedStream, blockSize: number, itemsPerSlot: number): number {
    let zoomCount = initialReduction.size;
    let reduction = Math.trunc(initialReduction.scale) * RES_INCREMENT;
    const output = buffer.output;
    let level = 1;
    for (; level < MAX_ZOOM_LEVELS; level++) {
      const rezoomCount = summaries.length;
      if (rezoomCount >= zoomCount) break;
      zoomCount = rezoomCount;
      zoomList[level]!.dataOffset = output.tell();
      output.write(new RecordWriter(4).u32(zoomCount).done());
      for (const summary of summaries) buffer.write(summary);
      buffer.flush();
      const indexOffset = output.tell();
      writeRTree(summaries, blockSize, itemsPerSlot, indexOffset, output);
      zoomList[level]!.indexOffset = indexOffset;
      zoomList[level]!.reductionLevel = reduction;
      reduction *= RES_INCREMENT;
      // Merge the summaries into coarser ones, in place, as Biopython does.
      let i = 0;
      let chromId: number | null = null;
      let end = 0;
      let current: RegionSummary | null = null;
      for (const summary of summaries) {
        if (summary.chromId !== chromId || summary.end > end) {
          end = summary.start + reduction;
          chromId = summary.chromId;
          current = summary;
          summaries[i] = current;
          i += 1;
        } else {
          current!.add(summary);
        }
      }
      summaries.length = i;
    }
    return level;
  }
}
