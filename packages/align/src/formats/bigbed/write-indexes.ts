/**
 * Building a bigBed file's two indexes: the R tree over its data and the B+ tree over its chromosome names.
 *
 * Both are laid out level by level, parents before children, with every node padded to the block size — the
 * layout `bedToBigBed` writes and Biopython copies, oddities included.
 */

import { BioError } from "@biolibs/core";

/** Mirrors Python's `RuntimeError`, which Biopython raises when its own offsets do not add up. */
class RuntimeError_ extends BioError {
  override name = "RuntimeError";
}
import type { ByteWriter } from "../byte-writer.js";
import { RecordWriter, zeros } from "./pack.js";

/** The magic number of an R tree index. */
const RTREE_SIGNATURE = 0x2468ace0;
/** The magic number of a chromosome B+ tree. */
const BPLUS_SIGNATURE = 0x78ca8c91;
/** `"?xH"`: the two-byte flag and count every node of either tree starts with. */
const NODE_SIZE = 4;
/** `"IIIIQ"`: a branch of the R tree. */
const NONLEAF_SIZE = 24;
/** `"IIIIQQ"`: a leaf of the R tree. */
const LEAF_SIZE = 32;

/** What the R tree indexes: an item's place on its chromosome and the offset of the block holding it. */
export interface Indexed {
  /** Which chromosome. */
  chromId: number;
  /** Where the item starts. */
  start: number;
  /** Where it ends. */
  end: number;
  /** Where in the file its block starts. */
  offset: number;
}

/** A node of the R tree while it is being built. */
class RTreeNode {
  /** The nodes below. */
  children: RTreeNode[] = [];
  /** The node above. */
  parent: RTreeNode | null = null;
  /** The first chromosome covered. */
  startChromId = 0;
  /** Where on it the node starts. */
  startBase = 0;
  /** The last chromosome covered. */
  endChromId = 0;
  /** Where on it the node ends. */
  endBase = 0;
  /** Where the node's data starts. */
  startFileOffset = 0;
  /** Where it ends. */
  endFileOffset = 0;

  /** @param levelSizes - How many nodes there are at each level, which this adds itself to. @param level - This node's level. */
  calcLevelSizes(levelSizes: number[], level: number): void {
    levelSizes[level] = levelSizes[level]! + 1;
    const next = level + 1;
    if (next === levelSizes.length) return;
    for (const child of this.children) child.calcLevelSizes(levelSizes, next);
  }
}

/**
 * Gather the items into leaves, one leaf per block of the file, then into levels of branches.
 *
 * @param blockSize - How many children a node may have.
 * @param items - The items, in file order.
 * @param endFileOffset - Where the data ends, which closes the last leaf.
 * @returns The root and how many levels the tree has, or null when there is nothing to index.
 */
function buildRTree(blockSize: number, items: readonly Indexed[], endFileOffset: number): { root: RTreeNode; levelCount: number } | null {
  const itemCount = items.length;
  if (itemCount === 0) return null;
  let children: RTreeNode[] = [];
  let nextOffset = items[0]!.offset;
  let i = 0;
  while (i < itemCount) {
    const child = new RTreeNode();
    children.push(child);
    const startItem = items[i]!;
    child.startChromId = child.endChromId = startItem.chromId;
    child.startBase = startItem.start;
    child.endBase = startItem.end;
    child.startFileOffset = nextOffset;
    let oneSize = 1;
    let broke = false;
    for (let j = i + 1; j < itemCount; j++) {
      nextOffset = items[j]!.offset;
      if (nextOffset !== child.startFileOffset) { broke = true; break; }
      oneSize += 1;
    }
    if (!broke) nextOffset = endFileOffset;
    child.endFileOffset = nextOffset;
    for (const item of items.slice(i + 1, i + oneSize)) {
      if (item.chromId < child.startChromId) { child.startChromId = item.chromId; child.startBase = item.start; }
      else if (item.chromId === child.startChromId && item.start < child.startBase) child.startBase = item.start;
      if (item.chromId > child.endChromId) { child.endChromId = item.chromId; child.endBase = item.end; }
      else if (item.chromId === child.endChromId && item.end > child.endBase) child.endBase = item.end;
    }
    i += oneSize;
  }
  let levelCount = 1;
  let parent = children[0]!;
  for (;;) {
    const parents: RTreeNode[] = [];
    let slotsUsed = blockSize;
    for (const child of children) {
      if (slotsUsed >= blockSize) {
        slotsUsed = 1;
        parent = new RTreeNode();
        parent.parent = child.parent;
        parent.startChromId = child.startChromId;
        parent.startBase = child.startBase;
        parent.endChromId = child.endChromId;
        parent.endBase = child.endBase;
        parent.startFileOffset = child.startFileOffset;
        parent.endFileOffset = child.endFileOffset;
        parents.push(parent);
      } else {
        slotsUsed += 1;
        if (child.startChromId < parent.startChromId) { parent.startChromId = child.startChromId; parent.startBase = child.startBase; }
        else if (child.startChromId === parent.startChromId && child.startBase < parent.startBase) parent.startBase = child.startBase;
        if (child.endChromId > parent.endChromId) { parent.endChromId = child.endChromId; parent.endBase = child.endBase; }
        else if (child.endChromId === parent.endChromId && child.endBase > parent.endBase) parent.endBase = child.endBase;
      }
      parent.children.push(child);
      child.parent = parent;
    }
    levelCount += 1;
    if (parents.length === 1) break;
    children = parents;
  }
  return { root: parent, levelCount };
}

/** Write the leaves of the tree, which point at the file's data blocks. */
function writeLeaves(itemsPerSlot: number, tree: RTreeNode, curLevel: number, leafLevel: number, output: ByteWriter): void {
  if (curLevel === leafLevel) {
    output.write(new RecordWriter(NODE_SIZE).u8(1).skip(1).u16(tree.children.length).done());
    for (const child of tree.children) {
      output.write(new RecordWriter(LEAF_SIZE).u32(child.startChromId).u32(child.startBase)
        .u32(child.endChromId).u32(child.endBase).u64(child.startFileOffset)
        .u64(child.endFileOffset - child.startFileOffset).done());
    }
    // Padded with the size of a *branch*, not a leaf: what `bedToBigBed` does, and Biopython keeps.
    output.write(zeros((itemsPerSlot - tree.children.length) * NONLEAF_SIZE));
  } else {
    for (const child of tree.children) writeLeaves(itemsPerSlot, child, curLevel + 1, leafLevel, output);
  }
}

/** Write one level of branches, each pointing at where its children will be. */
function writeIndexLevel(parent: RTreeNode, blockSize: number, childNodeSize: number, curLevel: number,
  destLevel: number, offset: number, output: ByteWriter): number {
  const previous = offset;
  let at = offset;
  if (curLevel === destLevel) {
    output.write(new RecordWriter(NODE_SIZE).u8(0).skip(1).u16(parent.children.length).done());
    for (const child of parent.children) {
      output.write(new RecordWriter(NONLEAF_SIZE).u32(child.startChromId).u32(child.startBase)
        .u32(child.endChromId).u32(child.endBase).u64(at).done());
      at += childNodeSize;
    }
    output.write(zeros((blockSize - parent.children.length) * NONLEAF_SIZE));
  } else {
    for (const child of parent.children) {
      at = writeIndexLevel(child, blockSize, childNodeSize, curLevel + 1, destLevel, at, output);
    }
  }
  const position = output.tell();
  if (position !== previous) throw new RuntimeError_(`Internal error: offset mismatch (${position} vs ${previous})`);
  return at;
}

/**
 * Write an R tree index over a file's items.
 *
 * @param items - The items, in file order, each knowing where its block is.
 * @param blockSize - How many children a node may have.
 * @param itemsPerSlot - How many items a data block holds, which the header records.
 * @param endFileOffset - Where the data ends.
 * @param output - Where to write.
 */
export function writeRTree(items: readonly Indexed[], blockSize: number, itemsPerSlot: number,
  endFileOffset: number, output: ByteWriter): void {
  const built = buildRTree(blockSize, items, endFileOffset);
  const root = built === null ? null : built.root;
  output.write(new RecordWriter(48).u32(RTREE_SIGNATURE).u32(blockSize).u64(items.length)
    .u32(root === null ? 0 : root.startChromId).u32(root === null ? 0 : root.startBase)
    .u32(root === null ? 0 : root.endChromId).u32(root === null ? 0 : root.endBase)
    .u64(endFileOffset).u32(itemsPerSlot).skip(4).done());
  if (built === null) return;
  const { levelCount } = built;
  const levelSizes = new Array<number>(levelCount).fill(0);
  built.root.calcLevelSizes(levelSizes, 0);
  let size = NODE_SIZE + NONLEAF_SIZE * blockSize;
  let levelOffset = output.tell();
  for (let i = 0; i < levelCount - 2; i++) {
    levelOffset += levelSizes[i]! * size;
    if (i === levelCount - 3) size = NODE_SIZE + LEAF_SIZE * blockSize;
    writeIndexLevel(built.root, blockSize, size, 0, i, levelOffset, output);
  }
  writeLeaves(blockSize, built.root, 0, levelCount - 2, output);
}

/** One entry of a B+ tree: a fixed-size name and the fixed-size value that follows it. */
export interface BPlusItem {
  /** The key. */
  name: string;
  /** Its value's bytes, all entries the same length. */
  value: Uint8Array;
}

/**
 * Write a B+ tree over fixed-size keys, level by level.
 *
 * @param items - The entries, already sorted by key.
 * @param keySize - How many bytes a key occupies.
 * @param blockSize - How many children a node may have.
 * @param output - Where to write.
 */
export function writeBPlusTree(items: readonly BPlusItem[], keySize: number, blockSize: number, output: ByteWriter): void {
  const valSize = items.length === 0 ? 8 : items[0]!.value.length;
  const itemSize = keySize + valSize;
  output.write(new RecordWriter(32).u32(BPLUS_SIGNATURE).u32(blockSize).u32(keySize).u32(valSize)
    .u64(items.length).skip(8).done());

  let levels = 1;
  let counted = items.length;
  while (counted > blockSize) {
    counted = Math.ceil(counted / blockSize);
    levels += 1;
  }
  const itemCount = items.length;
  const nonleafSize = keySize + 8;
  const bytesInIndexBlock = NODE_SIZE + blockSize * nonleafSize;
  const bytesInLeafBlock = NODE_SIZE + blockSize * itemSize;
  let indexOffset = output.tell();
  for (let level = levels - 1; level > 0; level--) {
    const slotSizePer = blockSize ** level;
    const nodeSizePer = slotSizePer * blockSize;
    const indices: number[] = [];
    for (let i = 0; i < itemCount; i += nodeSizePer) indices.push(i);
    const bytesInNextLevelBlock = level === 1 ? bytesInLeafBlock : bytesInIndexBlock;
    const endLevel = indexOffset + indices.length * bytesInIndexBlock;
    let nextChild = endLevel;
    for (const index of indices) {
      const block: BPlusItem[] = [];
      for (let i = index; i < Math.min(index + nodeSizePer, itemCount); i += slotSizePer) block.push(items[i]!);
      output.write(new RecordWriter(NODE_SIZE).u8(0).skip(1).u16(block.length).done());
      for (const item of block) {
        output.write(new RecordWriter(nonleafSize).fixed(item.name, keySize).u64(nextChild).done());
        nextChild += bytesInNextLevelBlock;
      }
      output.write(zeros((blockSize - block.length) * nonleafSize));
    }
    indexOffset = endLevel;
  }
  for (let index = 0; ; index += blockSize) {
    const block = items.slice(index, index + blockSize);
    if (block.length === 0) break;
    output.write(new RecordWriter(NODE_SIZE).u8(1).skip(1).u16(block.length).done());
    for (const item of block) {
      const rec = new RecordWriter(itemSize).fixed(item.name, keySize);
      output.write(rec.done().subarray(0, keySize));
      output.write(item.value);
    }
    output.write(zeros((blockSize - block.length) * itemSize));
  }
}
