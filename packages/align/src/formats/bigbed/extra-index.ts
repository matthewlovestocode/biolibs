/** The optional extra indexes a bigBed file may carry over one of its string columns. */

import { ValueError } from "@biolibs/core";
import type { Alignment } from "../../alignment/alignment.js";
import type { ByteWriter } from "../byte-writer.js";
import type { AutoSQLTable } from "./autosql.js";
import { RecordWriter } from "./pack.js";
import type { BPlusItem } from "./write-indexes.js";

/** `"=HHQ52x"`: the record that says how many extra indexes there are and where they start. */
const HEADER_SIZE = 64;
/** `"=xxHQxxxxHxx"`: one extra index's own record. */
const INDEX_SIZE = 20;

/** One extra index: a B+ tree over the values of one column, pointing at the blocks holding them. */
export class ExtraIndex {
  /** The longest value seen, which fixes the tree's key size. */
  maxFieldSize = 0;
  /** Where the tree was written. */
  fileOffset = 0;
  /** One entry per item, in item order, each gaining its block's offset and size as the blocks are written. */
  chunks: { name: string; offset: number; size: number }[] = [];
  private readonly getValue: (alignment: Alignment) => string;

  /**
   * @param name - The column to index.
   * @param declaration - The file's columns.
   * @throws ValueError for a column the file does not have, or one that is not a string column.
   */
  constructor(name: string, declaration: AutoSQLTable) {
    const index = declaration.fields.findIndex((f) => f.name === name);
    if (index === -1) {
      // Biopython raises `ValueError(msg, name)` with two arguments, so its message is the tuple's own repr.
      throw new ValueError(`("extraIndex field %s not a standard bed field or found in 'as' file.", '${name}')`);
    }
    if (declaration.fields[index]!.asType !== "string") throw new ValueError("Sorry for now can only index string fields.");
    this.indexField = index;
    if (name === "chrom") this.getValue = (a) => String((a.sequences[0] as { id?: string | null }).id);
    else if (name === "name") this.getValue = (a) => String((a.sequences[1] as { id?: string | null }).id);
    else this.getValue = (a) => String(a.annotations!.get(name));
  }

  /** Which column is indexed. */
  readonly indexField: number;

  /** @param alignment - An alignment whose value may be the longest yet. */
  updateMaxFieldSize(alignment: Alignment): void {
    this.maxFieldSize = Math.max(this.maxFieldSize, this.getValue(alignment).length);
  }

  /** @param alignment - The alignment at `recordIx`. @param recordIx - Its position among the items. */
  addKeysFromRow(alignment: Alignment, recordIx: number): void {
    this.chunks[recordIx]!.name = this.getValue(alignment);
  }

  /**
   * @param offset - Where the block starts. @param size - How long it is.
   * @param startIx - The first item in it. @param endIx - One past the last.
   */
  addOffsetSize(offset: number, size: number, startIx: number, endIx: number): void {
    for (let i = startIx; i < endIx; i++) {
      const chunk = this.chunks[i];
      if (chunk === undefined) continue;
      chunk.offset = offset;
      chunk.size = size;
    }
  }

  /** @returns The entries for its B+ tree, sorted by value as Biopython sorts them. */
  treeItems(): BPlusItem[] {
    const sorted = [...this.chunks].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : a.offset - b.offset);
    return sorted.map((c) => ({
      name: c.name,
      value: new RecordWriter(16).u64(c.offset).u64(c.size).done(),
    }));
  }

  /** @returns Its own record in the file's list of extra indexes. */
  toBytes(): Uint8Array {
    return new RecordWriter(INDEX_SIZE).skip(2).u16(1).u64(this.fileOffset).skip(4).u16(this.indexField).skip(2).done();
  }
}

/** The file's extra indexes, and the record that introduces them. */
export class ExtraIndices {
  /** The indexes themselves. */
  readonly list: ExtraIndex[];

  /** @param names - The columns to index. @param declaration - The file's columns. */
  constructor(names: readonly string[], declaration: AutoSQLTable) {
    this.list = names.map((name) => new ExtraIndex(name, declaration));
  }

  /** @returns How many bytes the introduction and the records occupy. */
  get size(): number { return HEADER_SIZE + INDEX_SIZE * this.list.length; }

  /** @param bedCount - How many items the file has, one chunk each. */
  initialize(bedCount: number): void {
    if (bedCount === 0) return;
    for (const index of this.list) {
      index.chunks = Array.from({ length: bedCount }, () => ({ name: "", offset: 0, size: 0 }));
    }
  }

  /** @param output - Where to write the introduction and the records. */
  toFile(output: ByteWriter): void {
    if (this.list.length > 0) {
      const offset = output.tell() + HEADER_SIZE;
      output.write(new RecordWriter(HEADER_SIZE).u16(HEADER_SIZE).u16(this.list.length).u64(offset).skip(52).done());
      for (const index of this.list) output.write(index.toBytes());
    } else {
      output.write(new RecordWriter(HEADER_SIZE).u16(HEADER_SIZE).u16(0).u64(0).skip(52).done());
    }
  }
}
