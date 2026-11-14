/**
 * The summaries a bigBed file carries beside its data: one for the whole file, and one per region per zoom level.
 *
 * A zoom level is the coverage depth of the alignments, averaged over a window of a fixed number of bases, so
 * that a genome browser can draw a whole chromosome without reading every item. Biopython keeps the per-region
 * figures in 32-bit floats, which is what `Math.fround` is for here: the arithmetic has to round the same way.
 */

import { RecordWriter } from "./pack.js";

/** The size of a whole-file summary record, `"=Qdddd"`. */
export const SUMMARY_SIZE = 40;
/** The size of a per-region summary record, `"=IIIIffff"`. */
export const REGION_SUMMARY_SIZE = 32;
/** How much coarser each zoom level is than the one before. */
export const RES_INCREMENT = 4;
/** How many zoom levels a file may have. */
export const MAX_ZOOM_LEVELS = 10;
/** Python's `sys.maxsize`, which a summary starts its minimum at. */
const MAXSIZE = 9223372036854775807;

/** The summary of every value in the file. */
export class Summary {
  /** How many bases are covered. */
  validCount = 0;
  /** The smallest value seen. */
  minVal: number = MAXSIZE;
  /** The largest. */
  maxVal: number = -MAXSIZE;
  /** The sum of the values, weighted by how many bases each covers. */
  sumData = 0;
  /** The sum of their squares, likewise. */
  sumSquares = 0;

  /** @param size - How many bases. @param val - The value over them. */
  update(size: number, val: number): void {
    this.validCount += size;
    if (val < this.minVal) this.minVal = val;
    if (val > this.maxVal) this.maxVal = val;
    this.sumData += val * size;
    this.sumSquares += val * val * size;
  }

  /** @returns The record as the file holds it. */
  toBytes(): Uint8Array {
    return new RecordWriter(SUMMARY_SIZE).u64(this.validCount).f64(this.minVal).f64(this.maxVal)
      .f64(this.sumData).f64(this.sumSquares).done();
  }
}

/** The summary of one window of one chromosome, which is what a zoom level is made of. */
export class RegionSummary {
  /** How many bases are covered. */
  validCount = 0;
  /** The smallest value in the window, as a 32-bit float. */
  minVal: number;
  /** The largest. */
  maxVal: number;
  /** The weighted sum. */
  sumData = 0;
  /** The weighted sum of squares. */
  sumSquares = 0;
  /** Where in the file this summary was written, which the index needs. */
  offset = 0;

  /**
   * @param chromId - Which chromosome. @param start - Where the window starts. @param end - Where it ends.
   * @param value - The value it starts from.
   */
  constructor(public chromId: number, public start: number, public end: number, value: number) {
    this.minVal = Math.fround(value);
    this.maxVal = Math.fround(value);
  }

  /** @returns A copy, which a coarser level then grows. */
  copy(): RegionSummary {
    const other = new RegionSummary(this.chromId, this.start, this.end, 0);
    other.minVal = this.minVal;
    other.maxVal = this.maxVal;
    other.validCount = this.validCount;
    other.sumData = this.sumData;
    other.sumSquares = this.sumSquares;
    other.offset = this.offset;
    return other;
  }

  /** Take in another summary, as Python's `+=` does. @param other - The summary to absorb. */
  add(other: RegionSummary): void {
    this.end = other.end;
    this.validCount += other.validCount;
    this.minVal = Math.min(this.minVal, other.minVal);
    this.maxVal = Math.max(this.maxVal, other.maxVal);
    this.sumData = Math.fround(this.sumData + other.sumData);
    this.sumSquares = Math.fround(this.sumSquares + other.sumSquares);
  }

  /** @param overlap - How many bases. @param val - Their value. */
  update(overlap: number, val: number): void {
    this.validCount += overlap;
    if (this.minVal > val) this.minVal = Math.fround(val);
    if (this.maxVal < val) this.maxVal = Math.fround(val);
    this.sumData = Math.fround(this.sumData + val * overlap);
    this.sumSquares = Math.fround(this.sumSquares + val * val * overlap);
  }

  /** @returns The record as the file holds it. */
  toBytes(): Uint8Array {
    return new RecordWriter(REGION_SUMMARY_SIZE).u32(this.chromId).u32(this.start).u32(this.end)
      .u32(this.validCount).f32(this.minVal).f32(this.maxVal).f32(this.sumData).f32(this.sumSquares).done();
  }
}

/** One item of a data block, as the writer tracks it: where it is, and where its block landed. */
export class Region {
  /** Where in the file the block holding this item starts. */
  offset = 0;

  /** @param chromId - Which chromosome. @param start - Where the item starts. @param end - Where it ends. */
  constructor(public chromId: number, public start: number, public end: number) {}
}

/** One zoom level's header: how coarse it is, and where its data and index are. */
export class ZoomLevel {
  /** How many bases each summary covers; zero for a level that is not used. */
  reductionLevel = 0;
  /** Where the summaries are. */
  dataOffset = 0;
  /** Where the index over them is. */
  indexOffset = 0;

  /** @returns The record as the file holds it, `"=IxxxxQQ"`. */
  toBytes(): Uint8Array {
    return new RecordWriter(24).u32(this.reductionLevel).skip(4).u64(this.dataOffset).u64(this.indexOffset).done();
  }
}

/** How many bytes the ten zoom headers occupy, used or not. */
export const ZOOM_LEVELS_SIZE = 24 * MAX_ZOOM_LEVELS;

/** One reduction step: how many bases a summary covers, how many summaries that gives, and the running end. */
export interface Reduction {
  /** How many bases each summary covers. */
  scale: number;
  /** How many summaries the alignments need at that scale. */
  size: number;
  /** Where the current summary ends, while they are being counted. */
  end: number;
}

/**
 * The reduction steps to consider, from the average size of an alignment upwards.
 *
 * @param aveSize - The mean length of an alignment.
 * @returns Up to ten steps, each four times coarser than the last, stopping before 32 bits overflow.
 */
export function calculateReductions(aveSize: number): Reduction[] {
  const out: Reduction[] = [];
  let res = Math.max(Math.trunc(aveSize), 10);
  let resTry = MAX_ZOOM_LEVELS - 1;
  for (let i = 0; i < MAX_ZOOM_LEVELS; i++) {
    if (res > 2147483647) { resTry = i; break; }
    out.push({ scale: res, size: 0, end: 0 });
    res *= RES_INCREMENT;
  }
  // Biopython returns `reductions[:resTry]`, and `resTry` is the loop variable: when the loop runs to its end
  // without the scale overflowing, that is nine of the ten steps, not ten.
  return out.slice(0, resTry);
}
