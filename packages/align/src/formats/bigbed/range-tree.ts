/**
 * The coverage-depth tree a bigBed file's zoom levels are built from.
 *
 * Each alignment covers a stretch of its chromosome, and the zoom levels summarise how many alignments cover
 * each base. Biopython keeps that as a red-black tree of non-overlapping ranges, each with the depth over it,
 * and splits ranges as alignments arrive; this is that tree, kept in the same shape so that the summaries come
 * out in the same order with the same figures.
 */

import { AssertionError } from "@biolibs/core";
import type { Alignment } from "../../alignment/alignment.js";
import { RegionSummary, type Summary } from "./summaries.js";

/** One stretch of a chromosome and how many alignments cover it. */
export class Range {
  /** @param start - Where it starts. @param end - Where it ends. @param val - The coverage depth over it. */
  constructor(public start: number, public end: number, public val: number) {}
}

/** A node of the red-black tree, holding one range. */
class Node {
  /** The subtree of ranges before this one. */
  left: Node | null = null;
  /** The subtree of ranges after it. */
  right: Node | null = null;
  /** Red is true, black is false. */
  color = false;
  /** The range itself. */
  declare item: Range;

  /** @returns Every range below and including this node, in order. */
  *traverse(): Generator<Range> {
    if (this.left !== null) yield* this.left.traverse();
    yield this.item;
    if (this.right !== null) yield* this.right.traverse();
  }

  /**
   * @param start - Where the region of interest starts. @param end - Where it ends.
   * @returns The ranges that overlap it, in order.
   */
  *traverseRange(start: number, end: number): Generator<Range> {
    if (this.item.end <= start) {
      if (this.right !== null) yield* this.right.traverseRange(start, end);
    } else if (end <= this.item.start) {
      if (this.left !== null) yield* this.left.traverseRange(start, end);
    } else {
      if (this.left !== null) yield* this.left.traverseRange(start, end);
      yield this.item;
      if (this.right !== null) yield* this.right.traverseRange(start, end);
    }
  }
}

/** The coverage depth of one chromosome, as a red-black tree of non-overlapping ranges. */
export class RangeTree {
  private root: Node | null = null;
  private stack: Node[] = [];

  /** @param chromId - Which chromosome this covers. @param chromSize - How long it is. */
  constructor(readonly chromId: number, readonly chromSize: number) {}

  /**
   * One tree per chromosome, filled from the alignments in the order they are written.
   *
   * @param chromUsage - The chromosomes, in file order, with their ids and sizes.
   * @param alignments - The alignments, sorted by chromosome and start as the writer requires.
   * @returns A tree for each chromosome.
   */
  static *generate(chromUsage: readonly { name: string; id: number; size: number }[],
    alignments: Iterable<Alignment>): Generator<RangeTree> {
    const it = alignments[Symbol.iterator]();
    let alignment: Alignment | null = null;
    for (const { name, id, size } of chromUsage) {
      const tree = new RangeTree(id, size);
      // The alignment that ended the previous chromosome belongs to this one.
      if (alignment !== null) tree.addToCoverageDepth(alignment);
      for (;;) {
        const next = it.next();
        if (next.done === true) { alignment = null; break; }
        alignment = next.value;
        if ((alignment.sequences[0] as { id?: string | null }).id !== name) break;
        tree.addToCoverageDepth(alignment);
      }
      yield tree;
    }
  }

  /**
   * @param start - Where to look from. @param end - Where to look to.
   * @returns A range overlapping that region, or null when none does.
   */
  find(start: number, end: number): Range | null {
    let p = this.root;
    while (p !== null) {
      if (end <= p.item.start) p = p.left;
      else if (p.item.end <= start) p = p.right;
      else return p.item;
    }
    return null;
  }

  /** The three-node rotation a red-black insertion needs; `x`, `y` and `z` are grandparent, parent and child. */
  private restructure(x: Node, y: Node, z: Node): Node {
    const tos = this.stack.length;
    let midNode: Node;
    if (y === x.left) {
      if (z === y.left) {
        midNode = y;
        y.left = z;
        x.left = y.right;
        y.right = x;
      } else {
        midNode = z;
        y.right = z.left;
        z.left = y;
        x.left = z.right;
        z.right = x;
      }
    } else if (z === y.left) {
      midNode = z;
      x.right = z.left;
      z.left = x;
      y.left = z.right;
      z.right = y;
    } else {
      midNode = y;
      x.right = y.left;
      y.left = x;
      y.right = z;
    }
    if (tos !== 0) {
      const parent = this.stack[tos - 1]!;
      if (x === parent.left) parent.left = midNode;
      else parent.right = midNode;
    } else {
      this.root = midNode;
    }
    return midNode;
  }

  /**
   * Insert a range, unless one already overlaps it.
   *
   * @param item - The range to add.
   */
  add(item: Range): void {
    this.stack = [];
    const x = new Node();
    x.item = item;
    let p = this.root;
    let col: boolean;
    if (p !== null) {
      for (;;) {
        this.stack.push(p);
        if (item.end <= p.item.start) {
          const next: Node | null = p.left;
          if (next === null) { p = this.stack.pop()!; p.left = x; break; }
          p = next;
        } else if (p.item.end <= item.start) {
          const next: Node | null = p.right;
          if (next === null) { p = this.stack.pop()!; p.right = x; break; }
          p = next;
        } else {
          return;                                  // something already covers this stretch
        }
      }
      col = true;
    } else {
      this.root = x;
      col = false;
    }
    x.color = col;
    if (this.stack.length > 0) {
      let node = x;
      while (p!.color) {
        let m = this.stack.pop()!;
        const q = p === m.left ? m.right : m.left;
        if (q === null || !q.color) {
          m = this.restructure(m, p!, node);
          m.color = false;
          m.left!.color = true;
          m.right!.color = true;
          break;
        }
        p!.color = false;
        q.color = false;
        if (this.stack.length === 0) break;
        m.color = true;
        node = m;
        p = this.stack.pop()!;
      }
    }
  }

  /**
   * Add one alignment's stretch to the coverage depth, splitting the ranges it partly overlaps.
   *
   * @param alignment - The alignment.
   */
  addToCoverageDepth(alignment: Alignment): void {
    const coords = alignment.coordinates!;
    let start = coords[0]![0]!, end = coords[0]![coords[0]!.length - 1]!;
    if (start > end) [start, end] = [end, start];
    const existing = this.find(start, end);
    if (existing === null) {
      this.add(new Range(start, end, 1));
      return;
    }
    if (existing.start <= start && existing.end >= end) {
      // Wholly inside one range: cut off the parts outside this alignment and deepen the rest.
      if (existing.start < start) {
        const r = new Range(existing.start, start, existing.val);
        existing.start = start;
        this.add(r);
      }
      if (existing.end > end) {
        const r = new Range(end, existing.end, existing.val);
        existing.end = end;
        this.add(r);
      }
      existing.val += 1;
      return;
    }
    const items = [...this.root!.traverseRange(start, end)];
    let s = start;
    for (const item of items) {
      if (s < item.start) {
        this.add(new Range(s, item.start, 1));
        s = item.start;
      } else if (s > item.start) {
        const r = new Range(item.start, s, item.val);
        item.start = s;
        this.add(r);
      }
      if (item.start < end && item.end > end) {
        const r = new Range(end, item.end, item.val);
        item.end = end;
        this.add(r);
      }
      item.val += 1;
      s = item.end;
    }
    if (s < end) this.add(new Range(s, end, 1));
  }

  /**
   * The summaries of this chromosome at one scale, in order, updating the whole-file summary as it goes.
   *
   * @param scale - How many bases a summary covers.
   * @param totalSum - The file's own summary, which every range contributes to.
   * @returns One summary per window that holds anything.
   */
  *generateSummaries(scale: number, totalSum: Summary): Generator<RegionSummary> {
    const ranges = this.root!.traverse();
    let next = ranges.next();
    if (next.done === true) return;
    let { start, end, val } = next.value;
    const window = (from: number): RegionSummary =>
      new RegionSummary(this.chromId, from, Math.min(from + scale, this.chromSize), val);
    let summary = window(start);
    for (;;) {
      let size = Math.max(end - start, 1);
      totalSum.update(size, val);
      if (summary.end <= start) summary = window(start);
      while (end > summary.end) {
        const overlap = Math.min(end, summary.end) - Math.max(start, summary.start);
        if (overlap <= 0) throw new AssertionError("");
        summary.update(overlap, val);
        size -= overlap;
        start = summary.end;
        yield summary;
        summary = window(start);
      }
      summary.update(size, val);
      next = ranges.next();
      if (next.done === true) break;
      ({ start, end, val } = next.value);
      if (summary.end <= start) yield summary;
    }
    yield summary;
  }
}
