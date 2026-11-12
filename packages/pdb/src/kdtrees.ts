/** `KDTree`, `Point` and `Neighbor`: a port of Biopython's C extension `Bio.PDB.kdtrees` (radius searches in 3D). */

import { ValueError } from "@biolibs/core";

const DIM = 3;
/** Stand-in for infinity in the root region, as in the C source. */
const INF = 1_000_000;

/** C's `%g`: six significant digits, no trailing zeros, exponent form below 1e-4 and from 1e6. */
export function formatG(x: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf";
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  const exp = Number(x.toExponential(5).split("e")[1]);
  if (exp < -4 || exp >= 6) {
    const [m, e] = x.toExponential(5).split("e") as [string, string];
    const mant = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    return `${mant}e${e[0]}${e.slice(1).padStart(2, "0")}`;
  }
  const s = x.toFixed(Math.max(0, 5 - exp));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** A point found by {@link KDTree.search}: its index and its distance from the query center. */
export class Point {
  /** @param index - Index of the point in the array the tree was built from. @param radius - Distance from the center. */
  constructor(public index: number, public radius = 0) {}
  /** @returns Python's repr: `index: radius`. */
  repr(): string { return `${this.index}: ${formatG(this.radius)}`; }
}

/** A pair of points found by {@link KDTree.neighborSearch}, `index1 < index2`. */
export class Neighbor {
  /** @param index1 - Smaller index. @param index2 - Larger index. @param radius - Distance between the two. */
  constructor(public index1: number, public index2: number, public radius = 0) {}
  /** @returns Python's repr: `(index1, index2): radius`. */
  repr(): string { return `(${this.index1}, ${this.index2}): ${formatG(this.radius)}`; }
}

interface DataPoint { index: number; coord: number[] }
interface Node { left: Node | null; right: Node | null; cutValue: number; cutDim: number; start: number; end: number }
interface Region { left: number[]; right: number[] }

const isLeaf = (n: Node): boolean => n.left === null && n.right === null;
const dist2 = (a: readonly number[], b: readonly number[]): number => {
  let sum = 0;
  for (let i = 0; i < DIM; i++) { const d = a[i]! - b[i]!; sum += d * d; }
  return sum;
};
const newRegion = (left?: number[], right?: number[]): Region => (left && right
  ? { left: [...left], right: [...right] }
  : { left: Array<number>(DIM).fill(-INF), right: Array<number>(DIM).fill(INF) });
const encloses = (r: Region, c: number[]): boolean => c.every((x, i) => x >= r.left[i]! && x <= r.right[i]!);
const testIntersectLeft = (r: Region, split: number, dim: number): number => (split < r.left[dim]! ? -1 : split < r.right[dim]! ? 0 : 1);
const testIntersectRight = (r: Region, split: number, dim: number): number => (split <= r.left[dim]! ? -1 : split <= r.right[dim]! ? 0 : 1);
const clipLeft = (r: Region, split: number, dim: number): Region => { const c = newRegion(r.left, r.right); c.right[dim] = split; return c; };
const clipRight = (r: Region, split: number, dim: number): Region => { const c = newRegion(r.left, r.right); c.left[dim] = split; return c; };

/** 2 if `a` lies inside `b` (within the radius), 1 if they overlap, 0 if they are apart. */
function testIntersection(a: Region, q: Region, radius: number): number {
  let status = 2;
  for (let i = 0; i < DIM; i++) {
    const rs = a.right[i]!, ls = a.left[i]!, rq = q.right[i]!, lq = q.left[i]!;
    if (ls - rq > radius) return 0;
    if (lq - rs > radius) return 0;
    if (rs <= rq && ls >= lq) { if (status > 2) status = 2; } else status = 1;
  }
  return status;
}

/** Child regions of a node cut at `cut` in `dim` (null where the region misses that side). */
function split(region: Region, cut: number, dim: number): [Region | null, Region | null] {
  const l = testIntersectLeft(region, cut, dim);
  const left = l === 1 ? newRegion(region.left, region.right) : l === 0 ? clipLeft(region, cut, dim) : null;
  const r = testIntersectRight(region, cut, dim);
  const right = r === -1 ? newRegion(region.left, region.right) : r === 0 ? clipRight(region, cut, dim) : null;
  return [left, right];
}

/**
 * A KD tree over 3D points, for "all points within a radius of a center" and "all pairs within a radius" queries.
 * Results come in the order Biopython's C code produces them (tree traversal order).
 *
 * Points that share a coordinate value can be ordered differently from the C library's `qsort`, whose handling of
 * ties is platform-dependent; distinct coordinates give identical results.
 */
export class KDTree {
  private data: DataPoint[];
  private root: Node;
  private radiusSq = 0;
  private neighborRadius = 0;
  private neighborRadiusSq = 0;
  private center: number[] = [0, 0, 0];

  /**
   * @param coords - N rows of 3 numbers, each strictly between -1e6 and 1e6.
   * @param bucketSize - Maximum points in a leaf (default 1).
   * @throws ValueError for a non-positive bucket size or coordinates outside the range.
   */
  constructor(coords: ArrayLike<ArrayLike<number>>, public bucketSize = 1) {
    if (bucketSize <= 0) throw new ValueError("bucket size should be positive");
    this.data = Array.from(coords, (row, index) => {
      const coord = Array.from(row);
      if (coord.some((v) => v <= -1e6 || v >= 1e6)) throw new ValueError("coordinate values should lie between -1e6 and 1e6");
      return { index, coord };
    });
    this.root = this.build(0, this.data.length, 0);
  }

  private build(begin: number, end: number, depth: number): Node {
    const dim = depth % DIM;
    if (end - begin <= this.bucketSize) return { left: null, right: null, cutValue: -1, cutDim: dim, start: begin, end };
    // Sort this range by the cut dimension, as qsort does; the left half gets the larger half when the count is odd.
    const sorted = this.data.slice(begin, end).sort((p, q) => (p.coord[dim]! < q.coord[dim]! ? -1 : p.coord[dim]! > q.coord[dim]! ? 1 : 0));
    this.data.splice(begin, end - begin, ...sorted);
    const d = end - begin;
    const offset = Math.trunc(d / 2) + (d % 2);
    const cut = this.data[begin + offset - 1]!.coord[dim]!;
    const node: Node = { left: null, right: null, cutValue: cut, cutDim: dim, start: begin, end };
    node.left = this.build(begin, begin + offset, depth + 1);
    node.right = this.build(begin + offset, end, depth + 1);
    return node;
  }

  private report(p: DataPoint, out: Point[]): void {
    const r = dist2(this.center, p.coord);
    if (r <= this.radiusSq) out.push(new Point(p.index, Math.sqrt(r)));
  }

  private reportSubtree(node: Node, out: Point[]): void {
    if (isLeaf(node)) for (let i = node.start; i < node.end; i++) this.report(this.data[i]!, out);
    else { this.reportSubtree(node.left!, out); this.reportSubtree(node.right!, out); }
  }

  private testRegion(node: Node, region: Region, depth: number, query: Region, out: Point[]): void {
    const flag = testIntersection(region, query, 0);
    if (flag === 2) this.reportSubtree(node, out);
    else if (flag === 1) this.searchNode(region, node, depth + 1, query, out);
  }

  private searchNode(region: Region, node: Node, depth: number, query: Region, out: Point[]): void {
    const dim = depth % DIM;
    if (isLeaf(node)) {
      for (let i = node.start; i < node.end; i++) if (encloses(query, this.data[i]!.coord)) this.report(this.data[i]!, out);
      return;
    }
    const [left, right] = split(region, node.cutValue, dim);
    if (left) this.testRegion(node.left!, left, depth, query, out);
    if (right) this.testRegion(node.right!, right, depth, query, out);
  }

  /**
   * All points within `radius` of `center`.
   *
   * @param center - Three numbers.
   * @param radius - A positive distance.
   * @returns The points in traversal order, each with its distance.
   * @throws ValueError unless the radius is positive.
   */
  search(center: ArrayLike<number>, radius: number): Point[] {
    if (radius <= 0) throw new ValueError("Radius must be positive.");
    if (center.length !== DIM) throw Object.assign(new Error("coords array dimension must be 3"), { name: "RuntimeError" });
    this.radiusSq = radius * radius;
    const c = Array.from(center);
    this.center = c;
    const query: Region = { left: c.map((x) => x - radius), right: c.map((x) => x + radius) };
    const out: Point[] = [];
    this.searchNode(newRegion(), this.root, 0, query, out);
    return out;
  }

  private test(p1: DataPoint, p2: DataPoint, out: Neighbor[]): void {
    const r = dist2(p1.coord, p2.coord);
    if (r <= this.neighborRadiusSq) {
      out.push(p1.index < p2.index ? new Neighbor(p1.index, p2.index, Math.sqrt(r)) : new Neighbor(p2.index, p1.index, Math.sqrt(r)));
    }
  }

  private inBucket(node: Node, out: Neighbor[]): void {
    for (let i = node.start; i < node.end; i++) for (let j = i + 1; j < node.end; j++) this.test(this.data[i]!, this.data[j]!, out);
  }

  private betweenBuckets(a: Node, b: Node, out: Neighbor[]): void {
    for (let i = a.start; i < a.end; i++) for (let j = b.start; j < b.end; j++) this.test(this.data[i]!, this.data[j]!, out);
  }

  private pairs(down: Node | null, downRegion: Region | null, up: Node | null, upRegion: Region | null, depth: number, out: Neighbor[]): void {
    if (!down || !up || !downRegion || !upRegion) return;
    if (testIntersection(downRegion, upRegion, this.neighborRadius) === 0) return;
    const dim = depth % DIM;
    const upLeaf = isLeaf(up), downLeaf = isLeaf(down);
    if (upLeaf && downLeaf) { this.betweenBuckets(down, up, out); return; }
    let downLeft: Node | null, downRight: Node | null, downLeftR: Region | null, downRightR: Region | null;
    if (downLeaf) { downLeft = down; downLeftR = newRegion(downRegion.left, downRegion.right); downRight = null; downRightR = null; }
    else { downLeft = down.left; downRight = down.right; [downLeftR, downRightR] = split(downRegion, down.cutValue, dim); }
    let upLeft: Node | null, upRight: Node | null, upLeftR: Region | null, upRightR: Region | null;
    if (upLeaf) { upLeft = up; upLeftR = newRegion(upRegion.left, upRegion.right); upRight = null; upRightR = null; }
    else { upLeft = up.left; upRight = up.right; [upLeftR, upRightR] = split(upRegion, up.cutValue, dim); }
    this.pairs(upLeft, upLeftR, downLeft, downLeftR, depth + 1, out);
    this.pairs(upLeft, upLeftR, downRight, downRightR, depth + 1, out);
    this.pairs(upRight, upRightR, downLeft, downLeftR, depth + 1, out);
    this.pairs(upRight, upRightR, downRight, downRightR, depth + 1, out);
  }

  private neighborNode(node: Node, region: Region, depth: number, out: Neighbor[]): void {
    const dim = depth % DIM;
    const left = node.left!, right = node.right!;
    const [leftR, rightR] = split(region, node.cutValue, dim);
    if (!isLeaf(left)) this.neighborNode(left, leftR!, depth + 1, out); else this.inBucket(left, out);
    if (!isLeaf(right)) this.neighborNode(right, rightR!, depth + 1, out); else this.inBucket(right, out);
    this.pairs(left, leftR, right, rightR, depth + 1, out);
  }

  /**
   * All pairs of points within `radius` of each other.
   *
   * @param radius - A positive distance.
   * @returns The pairs in traversal order.
   * @throws ValueError unless the radius is positive.
   */
  neighborSearch(radius: number): Neighbor[] {
    if (radius <= 0) throw new ValueError("Radius must be positive.");
    this.neighborRadius = radius;
    this.neighborRadiusSq = radius * radius;
    const out: Neighbor[] = [];
    if (isLeaf(this.root)) this.inBucket(this.root, out);
    else this.neighborNode(this.root, newRegion(), 0, out);
    return out;
  }

  /**
   * The same pairs as {@link KDTree.neighborSearch} by a simple sweep along x. Like the C code, it re-sorts the tree's
   * point list in place, which changes the order of later results.
   *
   * @param radius - A positive distance.
   * @throws ValueError unless the radius is positive.
   */
  neighborSimpleSearch(radius: number): Neighbor[] {
    if (radius <= 0) throw new ValueError("Radius must be positive.");
    this.neighborRadius = radius;
    this.neighborRadiusSq = radius * radius;
    this.data.sort((p, q) => (p.coord[0]! < q.coord[0]! ? -1 : p.coord[0]! > q.coord[0]! ? 1 : 0));
    const out: Neighbor[] = [];
    for (let i = 0; i < this.data.length; i++) {
      const p1 = this.data[i]!;
      for (let j = i + 1; j < this.data.length; j++) {
        const p2 = this.data[j]!;
        if (Math.abs(p2.coord[0]! - p1.coord[0]!) <= radius) this.test(p1, p2, out);
        else break;
      }
    }
    return out;
  }
}
