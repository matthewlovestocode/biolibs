/**
 * Insertions: putting one run of fragments inside another.
 *
 * An insertion comes out of the graph as a cycle, because the molecule being inserted into is entered
 * and left again. What makes it an insertion rather than a circle is that exactly one fragment is
 * passed through "backwards" — left at a point before the one it was entered at. These functions find
 * that fragment and turn the cycle so that it comes last, and deal with the case where the two homology
 * arms on one fragment overlap, which means the assembly really describes a single site.
 */

import { locationBoundaries } from "@biolibs/dseqrecord";
import type { Location } from "@biolibs/seqfeature";
import type { AssemblyEdge, EdgeAssembly } from "./assemble.js";
import { type Fragment, isCircularFragment } from "./fragment.js";
import { createLocation, locationLength, locationOverlap, locationsOverlap } from "./locations.js";

/**
 * How much two homology arms on one fragment must share before they are taken to be one site rather
 * than two that need trimming apart. A first approximation, as pydna says of it.
 */
const SINGLE_SITE_COLLAPSE_TOLERANCE = 0.5;

/**
 * Turn a cycle so that the fragment being inserted into comes last.
 *
 * @param assembly - The joins, as a cycle.
 * @param fragments - The fragments.
 * @returns The joins, turned, or null if this is not an insertion after all.
 */
export function formatInsertionAssembly(assembly: EdgeAssembly, fragments: readonly Fragment[]): EdgeAssembly | null {
  const turningPoints: number[] = [];
  for (let at = 0; at < assembly.length; at++) {
    const [, node, , end] = assembly[at]!;
    const [, , start] = assembly[(at + 1) % assembly.length]!;
    const fragment = fragments[Math.abs(node) - 1]!;
    const leftOfInsertion = locationBoundaries(start)[0];
    const rightOfInsertion = locationBoundaries(end)[0];
    if (!isCircularFragment(fragment) && (rightOfInsertion >= leftOfInsertion || locationsOverlap(start, end, fragment.length))) {
      turningPoints.push(at);
    }
  }
  if (turningPoints.length !== 1) return null;
  const shift = (turningPoints[0]! + 1) % assembly.length;
  return [...assembly.slice(shift), ...assembly.slice(0, shift)];
}

/** What two overlapping arms have in common, and how much to take off each to reach it. */
interface CommonCore {
  /** The stretch they share. */
  core: Location;
  /** How much to trim off the first arm's left and right. */
  trims1: [number, number];
  /** How much to trim off the second's. */
  trims2: [number, number];
}

/**
 * The stretch two overlapping arms on one fragment have in common.
 *
 * @param first - One arm. @param second - The other. @param length - The fragment's length.
 * @returns What they share, or null where they do not, or where either runs through the origin.
 */
function commonCoreAndTrims(first: Location, second: Location, length: number): CommonCore | null {
  const [start1, end1] = locationBoundaries(first);
  const [start2, end2] = locationBoundaries(second);
  if (start1 >= end1 || start2 >= end2) return null;
  const coreStart = Math.max(start1, start2);
  const coreEnd = Math.min(end1, end2);
  if (coreStart >= coreEnd) return null;
  return {
    core: createLocation(coreStart, coreEnd, length),
    trims1: [coreStart - start1, end1 - coreEnd],
    trims2: [coreStart - start2, end2 - coreEnd],
  };
}

/**
 * Tidy a two-join insertion whose homology arms overlap on one of the fragments.
 *
 * Two arms that overlap on the genome but not on the insert describe one site, not two, so they are
 * collapsed to what they share; otherwise the arms are trimmed back until they no longer overlap.
 *
 * @param assembly - The joins.
 * @param fragments - The fragments.
 * @returns The joins, tidied where they needed it.
 */
export function formatInsertionEdgeCase(assembly: EdgeAssembly, fragments: readonly Fragment[]): EdgeAssembly {
  const unchanged = [...assembly];
  if (assembly.length !== 2) return unchanged;
  {
    const [[, , locFirstA, locSecondA], [, , , locFirstB]] = assembly as [AssemblyEdge, AssemblyEdge];
    const locSecondB = assembly[1]![2];
    const first = fragments[Math.abs(assembly[0]![0]) - 1]!;
    const second = fragments[Math.abs(assembly[0]![1]) - 1]!;
    if (String(locSecondA) === String(locSecondB) || String(locFirstB) === String(locFirstA)) return unchanged;
    if (!locationsOverlap(locFirstA, locFirstB, first.length) && !locationsOverlap(locSecondB, locSecondA, second.length)) {
      return unchanged;
    }
  }
  // The join whose arm sits further left comes first, so that the trimming below is one case, not two.
  const ordered = locationBoundaries(assembly[0]![2])[0] > locationBoundaries(assembly[1]![3])[0]
    ? [...unchanged].reverse()
    : [...unchanged];
  const [edgeOne, edgeTwo] = ordered as [AssemblyEdge, AssemblyEdge];
  const [nodeFirst, nodeSecond, locFirst1, locSecond1] = edgeOne;
  const [, , locSecond2, locFirst2] = edgeTwo;
  const first = fragments[Math.abs(nodeFirst) - 1]!;
  if (isCircularFragment(first)) return unchanged;
  const second = fragments[Math.abs(nodeSecond) - 1]!;

  const overlapFirst = locationOverlap(locFirst1, locFirst2, first.length);
  const overlapSecond = locationOverlap(locSecond1, locSecond2, second.length);
  /** @param overlap - How two arms meet. @returns Whether they meet at all. */
  const armsOverlap = (overlap: { contained: boolean; rightOverlap: number; leftOverlap: number }): boolean =>
    overlap.contained || overlap.rightOverlap > 0 || overlap.leftOverlap > 0;
  const shared = overlapFirst.rightOverlap + overlapFirst.leftOverlap;
  const collapse = armsOverlap(overlapFirst) && !armsOverlap(overlapSecond)
    && (overlapFirst.contained || shared >= SINGLE_SITE_COLLAPSE_TOLERANCE * Math.min(locationLength(locFirst1), locationLength(locFirst2)));
  const core = collapse ? commonCoreAndTrims(locFirst1, locFirst2, first.length) : null;

  if (core !== null) {
    const [start1, end1] = locationBoundaries(locSecond1);
    const [start2, end2] = locationBoundaries(locSecond2);
    return [
      [nodeFirst, nodeSecond, core.core, createLocation(start1 + core.trims1[0], end1 - core.trims1[1], second.length)],
      [nodeSecond, nodeFirst, createLocation(start2 + core.trims2[0], end2 - core.trims2[1], second.length), core.core],
    ];
  }
  const trimRight = Math.max(overlapFirst.rightOverlap, overlapSecond.rightOverlap);
  const trimLeft = Math.max(overlapFirst.leftOverlap, overlapSecond.leftOverlap);
  const [firstStart, firstEnd] = locationBoundaries(locFirst1);
  const [secondStart, secondEnd] = locationBoundaries(locSecond1);
  return [
    [nodeFirst, nodeSecond, createLocation(firstStart + trimLeft, firstEnd - trimRight, first.length),
     createLocation(secondStart + trimLeft, secondEnd - trimRight, second.length)],
    ordered[1]!,
  ];
}
