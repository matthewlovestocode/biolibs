/**
 * Stretches of a molecule, as a plan writes them.
 *
 * Inside the engine a stretch is a location object counted from zero; in a plan it is the text GenBank
 * uses, counted from one and inclusive at both ends — `"1..25"`, or `"join(41..50,1..10)"` for one that
 * runs through the origin.
 */

import { ValueError } from "@biolibs/core";
import { createLocation } from "@biolibs/assembly2";
import { Location, type SimpleLocation, insdcLocationString } from "@biolibs/seqfeature";

/**
 * A stretch as a plan writes it.
 *
 * @param location - The stretch.
 * @returns Its GenBank text.
 * @example
 * ```ts
 * locationText(new SimpleLocation(0, 25, null));   // "1..25"
 * ```
 */
export function locationText(location: Location): string {
  return insdcLocationString(location as SimpleLocation, 0);
}

/**
 * A stretch between two positions, as a plan writes it.
 *
 * @param start - Where it starts, counted from zero.
 * @param end - Where it ends. An end at or before the start wraps round the origin.
 * @param length - The molecule's length.
 * @returns Its GenBank text.
 * @example
 * ```ts
 * rangeText(40, 10, 50);   // "join(41..50,1..10)"
 * ```
 */
export function rangeText(start: number, end: number, length: number): string {
  return locationText(createLocation(start, end, length));
}

/**
 * A stretch read back out of a plan.
 *
 * @param text - Its GenBank text.
 * @returns The stretch, counted from zero.
 * @throws `ValueError` for text that is not a location.
 * @example
 * ```ts
 * String(textToLocation("1..25"));   // "[0:25]"
 * ```
 */
export function textToLocation(text: string): Location {
  return parsed(text, true);
}

/**
 * The same, with no strand on it.
 *
 * A step's stretches are read back this way, because that is how the engine makes them, and two
 * stretches that differ only in carrying a strand would not compare equal when a plan is replayed.
 *
 * @param text - A location's GenBank text.
 * @returns The stretch, with no strand.
 * @example
 * ```ts
 * String(textToPlainLocation("1..25"));   // "[0:25]"
 * String(textToLocation("1..25"));        // "[0:25](+)"
 * ```
 */
export function textToPlainLocation(text: string): Location {
  return parsed(text, false);
}

/**
 * Parse a location, complaining the way a plan complains.
 *
 * @param text - The location's text. @param stranded - Whether to put a strand on it.
 * @returns The stretch.
 * @throws `ValueError` naming the text, where the parser's own error says less about where it came from.
 */
function parsed(text: string, stranded: boolean): Location {
  try {
    return Location.fromstring(text, null, false, stranded);
  } catch {
    throw new ValueError(`Location '${text}' is not a valid location`);
  }
}
