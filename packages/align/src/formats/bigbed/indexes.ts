/**
 * The three fixed structures at the front of a bigBed file: its header, its chromosome B+ tree and its R tree.
 *
 * The layouts are the supplemental tables of the bigBed paper, which `Bio.Align.bigbed` quotes in its comments;
 * the field names here are those.
 */

import { AssertionError, ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { ByteStream, trimmedAscii } from "../byte-stream.js";

/** The magic number at the start of a bigBed file. */
const HEADER_SIGNATURE = 0x8789f2eb;
/** The only file version Biopython accepts. */
const CURRENT_VERSION = 4;
/** The magic number of a chromosome B+ tree. */
const BPLUS_SIGNATURE = 0x78ca8c91;
/** The magic number of an R tree index. */
const RTREE_SIGNATURE = 0x2468ace0;
/** How many zoom levels a file may declare. */
const MAX_ZOOM_LEVELS = 10;
/** The sizes of the fixed records, which are the sizes of Biopython's `struct` formats for them. */
const HEADER_SIZE = 60;          // "HHQQQHHQQIQ" after the magic number
const ZOOM_SIZE = 24;            // "IxxxxQQ"
const RTREE_HEADER_SIZE = 48;    // "IIQIIIIQIxxxx"
const NODE_SIZE = 4;             // "?xH", for both trees
const RTREE_LEAF_SIZE = 32;      // "IIIIQQ"
const RTREE_NONLEAF_SIZE = 24;   // "IIIIQ"
const BPLUS_HEADER_SIZE = 32;    // "IIIIQxxxxxxxx"

/** The common header (supplemental table 5), with the byte order its magic number revealed. */
export interface Header {
  /** Whether the file's integers are little-endian. */
  little: boolean;
  /** How many zoom levels follow the header. */
  zoomLevels: number;
  /** Where the chromosome B+ tree starts. */
  chromosomeTreeOffset: number;
  /** Where the data section starts, with the item count first. */
  fullDataOffset: number;
  /** Where the R tree over the data starts. */
  fullIndexOffset: number;
  /** How many columns each item has. */
  fieldCount: number;
  /** How many of those are the standard BED columns. */
  definedFieldCount: number;
  /** Where the autoSql declaration starts. */
  autoSqlOffset: number;
  /** Where the summary of the whole file is, which also ends the declaration. */
  totalSummaryOffset: number;
  /** The size a data block decompresses to, or zero when the blocks are not compressed. */
  uncompressBufSize: number;
  /** Where the extra indexes are, if there are any. */
  extraIndicesOffset: number;
}

/**
 * Read the header, taking the byte order from the magic number.
 *
 * @param stream - The file, positioned at its start; its byte order is set from what is found.
 * @returns The header.
 * @throws ValueError for a file that does not start with the bigBed magic number, or declares an impossible
 *   number of BED columns; AssertionError for a version Biopython does not know.
 */
export function readHeader(stream: ByteStream): Header {
  const magic = stream.readExact(4);
  const le = (magic[0]! | (magic[1]! << 8) | (magic[2]! << 16) | (magic[3]! << 24)) >>> 0;
  const be = (((magic[0]! << 24) | (magic[1]! << 16) | (magic[2]! << 8) | magic[3]!) >>> 0);
  if (le === HEADER_SIGNATURE) stream.little = true;
  else if (be === HEADER_SIGNATURE) stream.little = false;
  else throw new ValueError("not a bigBed file");

  const rec = stream.record(HEADER_SIZE);
  const version = rec.u16();
  const header: Header = {
    little: stream.little,
    zoomLevels: rec.u16(),
    chromosomeTreeOffset: rec.u64(),
    fullDataOffset: rec.u64(),
    fullIndexOffset: rec.u64(),
    fieldCount: rec.u16(),
    definedFieldCount: rec.u16(),
    autoSqlOffset: rec.u64(),
    totalSummaryOffset: rec.u64(),
    uncompressBufSize: rec.u32(),
    extraIndicesOffset: rec.u64(),
  };
  if (version !== CURRENT_VERSION) throw new AssertionError("");
  if (header.definedFieldCount < 3 || header.definedFieldCount > 12) {
    throw new ValueError(`expected between 3 and 12 columns, found ${header.definedFieldCount}`);
  }
  return header;
}

/** One zoom level as a file holds it (supplemental table 6); the writer has a class of its own. */
export interface ZoomLevelRead {
  /** How many bases each summary covers. */
  reductionLevel: number;
  /** Where that level's summaries are. */
  dataOffset: number;
  /** Where the R tree over them is. */
  indexOffset: number;
}

/**
 * Read the zoom headers that follow the file header.
 *
 * Ten slots are always present; a reduction level of zero ends the list, which is how Biopython stops (its
 * `_ZoomLevel.read` raises `StopIteration` there).
 *
 * @param stream - The file, positioned after the header.
 * @returns The levels that are filled in.
 */
export function readZoomLevels(stream: ByteStream): ZoomLevelRead[] {
  const out: ZoomLevelRead[] = [];
  for (let i = 0; i < MAX_ZOOM_LEVELS; i++) {
    const rec = stream.record(ZOOM_SIZE);
    const reductionLevel = rec.u32();
    rec.skip(4);
    const dataOffset = rec.u64(), indexOffset = rec.u64();
    if (reductionLevel === 0) break;
    out.push({ reductionLevel, dataOffset, indexOffset });
  }
  return out;
}

/**
 * Read an R tree index header, which every zoom level has one of as well as the data itself.
 *
 * @param stream - The file, positioned at the header.
 * @returns The two fields anything else needs: how many items the index covers and how many fit in a slot.
 * @throws AssertionError for a block that is not an R tree index.
 */
export function readRTreeHeader(stream: ByteStream): { itemCount: number; itemsPerSlot: number; startChromIx: number; startBase: number; endChromIx: number; endBase: number } {
  const rec = stream.record(RTREE_HEADER_SIZE);
  const magic = rec.u32();
  if (magic !== RTREE_SIGNATURE) throw new AssertionError("");
  rec.u32();                                      // blockSize, which only writing needs
  const itemCount = rec.u64();
  const startChromIx = rec.u32(), startBase = rec.u32();
  const endChromIx = rec.u32(), endBase = rec.u32();
  rec.u64();                                      // endFileOffset
  const itemsPerSlot = rec.u32();
  return { itemCount, itemsPerSlot, startChromIx, startBase, endChromIx, endBase };
}

/** A node of the R tree: a leaf points at a block of data, a branch at more nodes. */
export interface RTreeNode {
  /** The node this hangs from, or null for the root. */
  parent: RTreeNode | null;
  /** The nodes below, or undefined for a leaf. */
  children?: RTreeNode[];
  /** The first chromosome this node covers. */
  startChromIx: number;
  /** Where on it the node starts. */
  startBase: number;
  /** The last chromosome covered. */
  endChromIx: number;
  /** Where on it the node ends. */
  endBase: number;
  /** Where the node's children or data are. */
  dataOffset: number | null;
  /** How long the data block is, for a leaf. */
  dataSize?: number;
}

/**
 * Read the whole R tree over a file's data.
 *
 * The nodes are not laid out in order: each node says where its children are, so this walks depth first,
 * seeking, exactly as Biopython does, and returns the root once as many items as the header promised are in.
 *
 * @param stream - The file, positioned at the index.
 * @returns The root node.
 * @throws AssertionError when the item count does not come out right, as Biopython's assert does.
 */
export function readRTree(stream: ByteStream): RTreeNode {
  const { itemCount, startChromIx, startBase, endChromIx, endBase } = readRTreeHeader(stream);
  const root: RTreeNode = { parent: null, children: [], startChromIx, startBase, endChromIx, endBase, dataOffset: null };
  let node = root;
  let itemsCounted = 0;
  for (;;) {
    const head = stream.record(NODE_SIZE);
    const isLeaf = head.u8() !== 0;
    head.skip(1);
    const count = head.u16();
    if (isLeaf) {
      const children = node.children!;
      for (let i = 0; i < count; i++) {
        const leaf = stream.record(RTREE_LEAF_SIZE);
        children.push({
          parent: node,
          startChromIx: leaf.u32(), startBase: leaf.u32(),
          endChromIx: leaf.u32(), endBase: leaf.u32(),
          dataOffset: leaf.u64(), dataSize: leaf.u64(),
        });
      }
      itemsCounted += count;
      // Climb to the next unread sibling, or finish at the root.
      for (;;) {
        const parent = node.parent;
        if (parent === null) {
          if (itemsCounted !== itemCount) throw new AssertionError("");
          return node;
        }
        const index = parent.children!.indexOf(node);
        if (index === -1) throw new ValueError("Failed to find child node");
        const next = parent.children![index + 1];
        if (next === undefined) node = parent;
        else { node = next; break; }
      }
    } else {
      const children = node.children!;
      for (let i = 0; i < count; i++) {
        const branch = stream.record(RTREE_NONLEAF_SIZE);
        children.push({
          parent: node, children: [],
          startChromIx: branch.u32(), startBase: branch.u32(),
          endChromIx: branch.u32(), endBase: branch.u32(),
          dataOffset: branch.u64(),
        });
      }
      node = children[0]!;
    }
    stream.seek(node.dataOffset!);
  }
}

/**
 * Read the chromosome B+ tree, which names the file's target sequences and gives their lengths.
 *
 * @param stream - The file, positioned at the tree.
 * @returns One record per chromosome, in the order their ids give.
 * @throws AssertionError for a tree whose magic number, value size or item count is not what it should be.
 */
export function readBPlusTree(stream: ByteStream): SeqRecord[] {
  const rec = stream.record(BPLUS_HEADER_SIZE);
  const magic = rec.u32();
  if (magic !== BPLUS_SIGNATURE) throw new AssertionError("");
  rec.u32();                                      // blockSize
  const keySize = rec.u32(), valSize = rec.u32();
  const itemCount = rec.u64();
  if (valSize !== 8) throw new AssertionError("");

  const targets: SeqRecord[] = [];
  /** A branch holds the offsets of its children, which are read one at a time. */
  interface Node { parent: Node | null; children: number[] }
  let node: Node | null = null;
  for (;;) {
    const head = stream.record(NODE_SIZE);
    const isLeaf = head.u8() !== 0;
    head.skip(1);
    const count = head.u16();
    if (isLeaf) {
      for (let i = 0; i < count; i++) {
        const leaf = stream.record(keySize + 8);
        const name = trimmedAscii(leaf.bytes(keySize));
        const chromId = leaf.u32(), chromSize = leaf.u32();
        if (chromId !== targets.length) throw new AssertionError("");
        targets.push(new SeqRecord(new Seq(null, chromSize), name));
      }
    } else {
      const children: number[] = [];
      for (let i = 0; i < count; i++) {
        const branch = stream.record(keySize + 8);
        branch.skip(keySize);                      // the key, which only a search by name would need
        children.push(branch.u64());
      }
      node = { parent: node, children };
    }
    // Follow the next unvisited child offset, climbing out of exhausted branches.
    let pos: number | undefined;
    for (;;) {
      if (node === null) {
        if (targets.length !== itemCount) throw new AssertionError("");
        return targets;
      }
      pos = node.children.shift();
      if (pos === undefined) node = node.parent;
      else break;
    }
    stream.seek(pos);
  }
}
