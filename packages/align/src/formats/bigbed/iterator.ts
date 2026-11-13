/** Reading bigBed files (`Bio.Align.bigbed.AlignmentIterator`). */

import { UnboundLocalError, ValueError, inflate, pyFloat, pyInt } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Alignment } from "../../alignment/alignment.js";
import type { ByteStream } from "../byte-stream.js";
import { AlignmentIterator } from "../interfaces.js";
import { registerFormat } from "../registry.js";
import { AutoSQLTable } from "./autosql.js";
import { readBPlusTree, readHeader, readRTree, readRTreeHeader, readZoomLevels, type Header, type RTreeNode } from "./indexes.js";

/** The names the standard BED columns must have, in order. */
const BED_NAMES = ["chrom", "chromStart", "chromEnd", "name", "score", "strand", "thickStart", "thickEnd",
  "reserved", "blockCount", "blockSizes", "chromStarts"];

/** One item of a data block: where it is on the target, and the tab-separated rest of its columns. */
interface Row {
  /** Which chromosome, as an index into the targets. */
  chromId: number;
  /** Where the item starts. */
  chromStart: number;
  /** Where it ends. */
  chromEnd: number;
  /** The remaining columns, NUL-terminated as the file holds them. */
  rest: Uint8Array;
  /** Where in `rest` the columns begin. */
  dataStart: number;
  /** Where they end, the NUL included. */
  dataEnd: number;
}

/** Turns one custom column's text into its value, as its autoSql type says. */
type Converter = (data: string) => unknown;

/**
 * Reads the pairwise alignments of a bigBed file, with the extra columns as annotations.
 *
 * The file is an index over compressed blocks of BED-like rows, so iterating walks the R tree to the leftmost
 * leaf and then across the leaves, decompressing each block in turn. {@link BigBedIterator.search} walks the
 * same tree but prunes the nodes that cannot overlap the region asked for.
 */
export class BigBedIterator extends AlignmentIterator<ByteStream> {
  static override fmt: string | null = "bigBed";
  static override mode: "t" | "b" = "b";

  /** The autoSql declaration of the file's columns. */
  declare declaration: AutoSQLTable;
  /** The target sequences, from the chromosome B+ tree. */
  declare targets: SeqRecord[];
  /** How many of the columns are standard BED columns. */
  declare bedN: number;
  /** The root of the R tree over the data. */
  declare tree: RTreeNode;
  /** How many items a data block holds. */
  declare itemsPerSlot: number;
  private declare header: Header;
  private declare compressed: boolean;
  private declare customFields: [string, Converter][];
  private declare rows: Iterator<Row>;
  private declare declaredLength: number;

  /**
   * Read the header, the declaration and both indexes.
   *
   * @param stream - The file.
   * @throws ValueError for a file that is not a bigBed file, or whose columns are not the BED columns.
   */
  protected override readHeader(stream: ByteStream): void {
    // Every field of this class is `declare`d: a subclass field declaration would be defined *after* the base
    // constructor has run, and so would wipe what reading the header puts there.
    this.customFields = [];
    const header = readHeader(stream);
    this.header = header;
    // Each zoom level has an R tree of its own; Biopython reads their headers only to pick up `itemsPerSlot`,
    // which the search needs and which is the same at every level.
    for (const zoom of readZoomLevels(stream)) {
      stream.seek(zoom.indexOffset);
      this.itemsPerSlot = readRTreeHeader(stream).itemsPerSlot;
    }
    this.declaration = this.readAutosql(stream, header);
    stream.seek(header.fullDataOffset);
    this.declaredLength = stream.u64();
    this.compressed = header.uncompressBufSize > 0;
    stream.seek(header.chromosomeTreeOffset);
    this.targets = readBPlusTree(stream);
    stream.seek(header.fullIndexOffset);
    this.tree = readRTree(stream);
    this.rows = this.iterateIndex(stream);
  }

  /** Read the autoSql declaration, which sits between its own offset and the file's summary. */
  private readAutosql(stream: ByteStream, header: Header): AutoSQLTable {
    const size = header.totalSummaryOffset - header.autoSqlOffset;
    this.bedN = header.definedFieldCount;
    stream.seek(header.autoSqlOffset);
    const declaration = AutoSQLTable.fromBytes(stream.readExact(size));
    this.analyzeFields(declaration, header.fieldCount, this.bedN);
    return declaration;
  }

  /**
   * Check the standard columns and prepare a converter for each extra one.
   *
   * @param fields - The declaration. @param fieldCount - How many columns there are.
   * @param definedFieldCount - How many of them are standard BED columns.
   * @throws ValueError for a standard column with the wrong name, or an extra one of an unknown type.
   */
  private analyzeFields(fields: AutoSQLTable, fieldCount: number, definedFieldCount: number): void {
    for (let i = 0; i < this.bedN; i++) {
      const name = fields.fields[i]!.name;
      if (name !== BED_NAMES[i]) throw new ValueError(`Expected field name '${BED_NAMES[i]}'; found '${name}'`);
    }
    if (fieldCount > definedFieldCount) this.customFields = [];
    for (let i = definedFieldCount; i < fieldCount; i++) {
      const field = fields.fields[i]!;
      let fieldType = field.asType;
      const makeArray = fieldType.includes("[") && fieldType.includes("]");
      if (makeArray) fieldType = fieldType.slice(0, fieldType.indexOf("[")).trim();
      let converter: Converter;
      if (["int", "uint", "short", "ushort"].includes(fieldType)) converter = (d) => pyInt(d);
      else if (["byte", "ubyte"].includes(fieldType)) converter = (d) => new TextEncoder().encode(d);
      else if (fieldType === "float") converter = (d) => pyFloat(d);
      else if (["char", "string", "lstring"].includes(fieldType)) converter = (d) => d;
      else throw new ValueError(`Unknown field type ${fieldType}`);
      const item = converter;
      if (makeArray) converter = (d) => d.replace(/,+$/, "").split(",").map(item);
      this.customFields.push([field.name, converter]);
    }
  }

  /** The items of one data block, decompressed if the file says they are compressed. */
  private blockRows(stream: ByteStream, node: RTreeNode): Row[] {
    stream.seek(node.dataOffset!);
    let data = stream.read(node.dataSize!);
    if (this.compressed) data = inflate(data);
    const out: Row[] = [];
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let i = 0;
    while (i < data.length) {
      const chromId = view.getUint32(i, this.header.little);
      const chromStart = view.getUint32(i + 4, this.header.little);
      const chromEnd = view.getUint32(i + 8, this.header.little);
      let j = i + 12;
      while (j < data.length && data[j] !== 0) j += 1;
      j += 1;
      const rest = data.subarray(i + 12, j);
      out.push({ chromId, chromStart, chromEnd, rest, dataStart: 0, dataEnd: rest.length });
      i = j;
    }
    return out;
  }

  /** Walk the leaves of the R tree from left to right, yielding every item. */
  private *iterateIndex(stream: ByteStream): Generator<Row> {
    for (const leaf of leaves(this.tree)) yield* this.blockRows(stream, leaf);
  }

  /** @returns The next alignment, or null at the end of the file. @param _stream - The file. */
  protected readNextAlignment(_stream: ByteStream): Alignment | null {
    const next = this.rows.next();
    if (next.done === true) return null;
    return this.createAlignment(next.value);
  }

  /**
   * Build one alignment from an item of a data block.
   *
   * @param row - The item.
   * @returns The alignment, with the target from the B+ tree and the query named by the item.
   * @throws ValueError when the block counts or the item's own start and end do not agree with its blocks.
   */
  private createAlignment(row: Row): Alignment {
    const { chromId, chromStart, chromEnd, rest, dataStart, dataEnd } = row;
    if (rest[dataEnd - 1] !== 0) throw new ValueError("expected a NUL-terminated row");
    const text = new TextDecoder().decode(rest.subarray(dataStart, dataEnd - 1));
    const words = text === "" ? [] : text.split("\t");
    const targetRecord = this.targets[chromId]!;
    const name = this.bedN > 3 ? words[0]! : null;
    const strand = this.bedN > 5 ? words[2]! : "+";
    let coordinates: number[][], qSize: number;
    if (this.bedN > 9) {
      const blockCount = pyInt(words[6]!);
      const blockSizes = words[7]!.replace(/,+$/, "").split(",").map(pyInt);
      const blockStarts = words[8]!.replace(/,+$/, "").split(",").map(pyInt);
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
    const queryRecord = new SeqRecord(new Seq(null, qSize), name);
    if (strand === "-") coordinates[1] = coordinates[1]!.map((c) => qSize - c);
    const last = coordinates[0]!.length - 1;
    if (chromStart !== coordinates[0]![0]) throw new ValueError(`Inconsistent chromStart found (${chromStart}, expected ${coordinates[0]![0]})`);
    if (chromEnd !== coordinates[0]![last]) throw new ValueError(`Inconsistent chromEnd found (${chromEnd}, expected ${coordinates[0]![last]})`);
    const alignment = new Alignment([targetRecord, queryRecord], coordinates);
    if (words.length > this.bedN - 3) {
      const annotations = new Map<string, unknown>();
      words.slice(this.bedN - 3).forEach((word, i) => {
        const custom = this.customFields[i];
        if (custom !== undefined) annotations.set(custom[0], custom[1](word));
      });
      alignment.annotations = annotations;
    }
    if (this.bedN <= 4) return alignment;
    let score: number | string = words[1]!;
    // Biopython narrows a whole number to an `int` here, which TypeScript has no separate type for.
    try { score = pyFloat(score); } catch (e) { if (!(e instanceof ValueError)) throw e; }
    alignment.score = score;
    if (this.bedN <= 6) return alignment;
    alignment.thickStart = pyInt(words[3]!);
    if (this.bedN <= 7) return alignment;
    alignment.thickEnd = pyInt(words[4]!);
    if (this.bedN <= 8) return alignment;
    alignment.itemRgb = words[5]!;
    return alignment;
  }

  /** The number of alignments the file's own header declares, without reading them. */
  override get length(): number { return this.declaredLength; }

  /** Start again at the first item. */
  override rewind(): void {
    super.rewind();
    this.rows = this.iterateIndex(this.stream!);
  }

  /**
   * Iterate over the alignments that overlap a region of one chromosome.
   *
   * @param chromosome - Its name, or null for every alignment in the file.
   * @param start - Where the region starts; null means the whole chromosome, or `start` alone means one base.
   * @param end - Where it ends.
   * @returns The alignments that fully or partly overlap the region.
   * @throws ValueError for a chromosome the file does not have, or for a start or end without a chromosome.
   */
  *search(chromosome: string | null = null, start: number | null = null, end: number | null = null): Generator<Alignment> {
    let chromIx: number | null = null, from = start, to = end;
    if (chromosome === null) {
      if (start !== null || end !== null) throw new ValueError("start and end must both be None if chromosome is None");
      // Biopython leaves `chromIx`, `start` and `end` unbound in this branch and then uses them, so searching
      // with no chromosome raises there; the same thing is raised here rather than inventing a meaning for it.
      throw new UnboundLocalError("cannot access local variable 'chromIx' where it is not associated with a value");
    } else {
      const found = this.targets.findIndex((t) => t.id === chromosome);
      if (found === -1) throw new ValueError(`Failed to find ${chromosome} in alignments`);
      chromIx = found;
      const target = this.targets[found]!;
      if (start === null) {
        if (end !== null) throw new ValueError("end must be None if start is None");
        from = 0;
        to = target.length;
      } else if (end === null) {
        to = start + 1;
      }
    }
    for (const row of this.searchIndex(this.stream!, chromIx, from!, to!)) yield this.createAlignment(row);
  }

  /** The items of the blocks that may overlap a region, pruning the nodes that cannot. */
  private *searchIndex(stream: ByteStream, chromIx: number, start: number, end: number): Generator<Row> {
    // The padding is Biopython's: a node is kept when it touches the region at all, even end to end.
    const paddedStart = start - 1, paddedEnd = end + 1;
    const before = (a: [number, number], b: [number, number]): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    for (const leaf of leaves(this.tree, (child) => {
      if (before([child.endChromIx, child.endBase], [chromIx, paddedStart])) return false;
      if (before([chromIx, paddedEnd], [child.startChromIx, child.startBase])) return false;
      return true;
    })) {
      const rows = this.blockRows(stream, leaf);
      if (this.itemsPerSlot === 1) {
        // One item to a block: Biopython hands the whole block over, columns and all.
        const row = rows[0];
        if (row === undefined || row.chromId !== chromIx) continue;
        const touches = (row.chromStart < end && start < row.chromEnd)
          || (row.chromStart === row.chromEnd && (row.chromStart === end || start === row.chromEnd));
        if (touches) yield row;
        continue;
      }
      for (const row of rows) {
        if (row.chromId !== chromIx) continue;
        if (end <= row.chromStart || row.chromEnd <= start) {
          if (row.chromStart !== row.chromEnd) continue;
          if (row.chromStart !== end && row.chromEnd !== start) continue;
        }
        yield row;
      }
    }
  }
}

/**
 * Walk an R tree depth first and yield its leaves, skipping the branches a filter rejects.
 *
 * @param root - The tree. @param keep - Which children to follow; every one by default.
 * @returns The leaves in order.
 */
function* leaves(root: RTreeNode, keep: (node: RTreeNode) => boolean = () => true): Generator<RTreeNode> {
  if (root.children === undefined) { if (keep(root)) yield root; return; }
  for (const child of root.children) {
    if (!keep(child)) continue;
    yield* leaves(child, keep);
  }
}

registerFormat("bigbed", { AlignmentIterator: BigBedIterator as never });
