/**
 * Where two stretches of a molecule sit relative to one another.
 *
 * An overlap between two fragments is recorded as a location on each, and the engine asks of those
 * locations: do they meet, by how much, and at which end? On a circle a stretch may run through the
 * origin, so none of these questions is plain arithmetic.
 */

import { locationBoundaries, shiftLocation } from "@biolibs/dseqrecord";
import { type Location, SimpleLocation, type Strand } from "@biolibs/seqfeature";
import { connectedComponents } from "./traverse.js";

/** Python's `%`, which for a positive divisor always gives a non-negative answer. @param value - The number. @param by - The divisor. @returns The remainder. */
const mod = (value: number, by: number): number => ((value % by) + by) % by;

/** How far two stretches of a molecule reach into one another. */
export interface LocationOverlap {
  /** How much of the first stretch's right-hand end is shared. */
  rightOverlap: number;
  /** How much of its left-hand end is shared. */
  leftOverlap: number;
  /** Whether one lies wholly inside the other. */
  contained: boolean;
}

/**
 * A location from a start and an end, wrapping round the origin if the end comes first.
 *
 * @param start - Where it starts. A negative number counts back from the end.
 * @param end - Where it ends. A negative number counts back from the end.
 * @param lim - The molecule's length.
 * @param strand - Which strand, if it matters.
 * @returns The location: a plain one, or a two-part one where it runs through the origin.
 * @example
 * ```ts
 * String(createLocation(2, 5, 10));   // "[2:5]"
 * String(createLocation(8, 2, 10));   // "join{[8:10], [0:2]}"
 * ```
 */
export function createLocation(start: number, end: number, lim: number, strand: Strand = null): Location {
  let from = start;
  let to = end;
  while (from < 0) from += lim;
  while (to < 0) to += lim;
  if (to > from) return new SimpleLocation(from, to, strand);
  return shiftLocation(new SimpleLocation(from, to + lim, strand), 0, lim);
}

/** What `directedIntervalOverlap` works out, before the two kinds of containment are rolled into one. */
interface IntervalOverlap {
  /** How much of the first interval's right-hand end is shared. */
  rightOverlap: number;
  /** How much of its left-hand end is shared. */
  leftOverlap: number;
  /** Whether the first lies wholly inside the second. */
  firstInSecond: boolean;
  /** Whether the second lies wholly inside the first. */
  secondInFirst: boolean;
}

/**
 * How two directed arcs of a circle meet.
 *
 * Each arc is measured from its own start, so the question becomes how far the second's span reaches into
 * the first's, once and possibly again a turn later.
 *
 * @param start1 - Where the first starts. @param end1 - Where it ends.
 * @param start2 - Where the second starts. @param end2 - Where it ends.
 * @param length - The molecule's length.
 * @returns What they share.
 */
function directedIntervalOverlap(start1: number, end1: number, start2: number, end2: number, length: number): IntervalOverlap {
  const none: IntervalOverlap = { rightOverlap: 0, leftOverlap: 0, firstInSecond: false, secondInFirst: false };
  const span1 = mod(end1 - start1, length);
  const span2 = mod(end2 - start2, length);
  if (span1 === 0 || span2 === 0) return none;
  const offset = mod(start2 - start1, length);
  const pieces: [number, number][] = [];
  for (const base of [offset, offset - length]) {
    const low = Math.max(0, base);
    const high = Math.min(span1, base + span2);
    if (low < high) pieces.push([low, high]);
  }
  const shared = pieces.reduce((total, [low, high]) => total + (high - low), 0);
  if (shared === 0) return none;
  if (shared === span1 || shared === span2) {
    return { rightOverlap: 0, leftOverlap: 0, firstInSecond: shared === span1, secondInFirst: shared === span2 };
  }
  const left = pieces.filter(([low]) => low === 0).reduce((total, [low, high]) => total + (high - low), 0);
  const right = pieces.filter(([, high]) => high === span1).reduce((total, [low, high]) => total + (high - low), 0);
  return { rightOverlap: right, leftOverlap: left, firstInSecond: false, secondInFirst: false };
}

/**
 * How two locations on a molecule meet.
 *
 * @param first - One location. @param second - The other.
 * @param length - The molecule's length.
 * @returns What they share, measured from the first.
 */
export function locationOverlap(first: Location, second: Location, length: number): LocationOverlap {
  const [start1, end1] = locationBoundaries(first);
  const [start2, end2] = locationBoundaries(second);
  const found = directedIntervalOverlap(start1, end1, start2, end2, length);
  return { rightOverlap: found.rightOverlap, leftOverlap: found.leftOverlap, contained: found.firstInSecond || found.secondInFirst };
}

/**
 * Whether two locations meet at all.
 *
 * @param first - One location. @param second - The other.
 * @param length - The molecule's length.
 * @returns Whether they share anything.
 */
export function locationsOverlap(first: Location, second: Location, length: number): boolean {
  const found = locationOverlap(first, second, length);
  return found.rightOverlap > 0 || found.leftOverlap > 0 || found.contained;
}

/** A cut, as the engine passes one about: where the upper strand breaks, and how far the lower one is from it. */
export interface CutPosition {
  /** Where the upper strand is cut. */
  watson: number;
  /** How far the lower strand's cut is from it; negative for a 5' overhang. */
  ovhg: number | null;
}

/**
 * Whether two cuts of a circular molecule overlap, which would mean neither fragment can be made.
 *
 * @param left - One cut, or null for the end of a linear molecule.
 * @param right - The other, or null.
 * @param length - The molecule's length.
 * @returns Whether the stretches they take up meet.
 */
export function cutsOverlap(left: CutPosition | null, right: CutPosition | null, length: number): boolean {
  if (left === null || right === null) return false;
  if (left.watson === right.watson && left.ovhg === right.ovhg) return false;
  const leftOvhg = left.ovhg ?? 0;
  const rightOvhg = right.ovhg ?? 0;
  const leftCrick = mod(left.watson - leftOvhg, length);
  const rightCrick = mod(right.watson - rightOvhg, length);
  const leftWatson = mod(left.watson, length);
  const rightWatson = mod(right.watson, length);
  /** @param watson - The upper cut. @param crick - The lower one. @param ovhg - The overhang. @returns The stretch between them. */
  const bounds = (watson: number, crick: number, ovhg: number): [number, number] => (ovhg > 0 ? [crick, watson] : [watson, crick]);
  /** @param start - Where a stretch starts. @param end - Where it ends. @returns It, cut into pieces that do not wrap. */
  const segments = (start: number, end: number): [number, number][] =>
    start <= end ? [[start, end]] : [[start, end + length], [start - length, end]];
  const [leftStart, leftEnd] = bounds(leftWatson, leftCrick, leftOvhg);
  const [rightStart, rightEnd] = bounds(rightWatson, rightCrick, rightOvhg);
  for (const one of segments(leftStart, leftEnd)) {
    for (const other of segments(rightStart, rightEnd)) {
      if (one[0] < other[1] && one[1] > other[0]) return true;
    }
  }
  return false;
}

/**
 * The stretch a cut takes up: between the two strands' breaks, which is the overhang.
 *
 * @param cut - The cut, or null.
 * @param length - The molecule's length.
 * @returns The location, or null.
 */
export function cutsiteToLocation(cut: CutPosition | null, length: number): Location | null {
  if (cut === null) return null;
  const { watson } = cut;
  const ovhg = cut.ovhg ?? 0;
  return ovhg < 0
    ? shiftLocation(new SimpleLocation(watson, watson - ovhg, null), 0, length)
    : shiftLocation(new SimpleLocation(watson - ovhg, watson, null), 0, length);
}

/**
 * Group locations that touch one another, so that each group is one region of the molecule.
 *
 * @param locations - The locations.
 * @param length - The molecule's length.
 * @returns The groups, ordered by where each begins.
 */
export function gatherOverlappingLocations(locations: readonly Location[], length: number): Location[][] {
  const nodes = locations.map((_, index) => index);
  const adjacency = new Map<number, number[]>(nodes.map((index) => [index, []]));
  for (let i = 0; i < locations.length; i++) {
    for (let j = i + 1; j < locations.length; j++) {
      if (locationsOverlap(locations[i]!, locations[j]!, length)) {
        adjacency.get(i)!.push(j);
        adjacency.get(j)!.push(i);
      }
    }
  }
  const groups: Location[][] = [];
  for (const component of connectedComponents(nodes, adjacency)) {
    groups.push([...component].map((index) => locations[index]!));
  }
  // Which member is looked at does not matter, since they all meet.
  return stableSort(groups, (group) => locationBoundaries(group[0]!)[0]);
}

/**
 * Sort by a number, keeping the order of ties, as Python's `sort` does.
 *
 * @param items - What to sort.
 * @param key - What to sort each by.
 * @returns A new, sorted array.
 */
export function stableSort<T>(items: readonly T[], key: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => key(a.item) - key(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/** @param location - A location. @returns How many bases it covers. */
export function locationLength(location: Location): number {
  return location.parts.reduce((total, part) => total + (Number(part.end) - Number(part.start)), 0);
}

/**
 * The text a location picks out of a molecule.
 *
 * The engine's locations carry no strand, so this is the stretch itself, joined up where it runs through
 * the origin.
 *
 * @param location - The location. @param text - The molecule's upper strand.
 * @returns The bases.
 */
export function locationText(location: Location, text: string): string {
  return location.parts.map((part) => text.slice(Number(part.start), Number(part.end))).join("");
}
