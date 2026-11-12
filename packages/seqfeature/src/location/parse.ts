/** Parsing GenBank/EMBL location strings into `SimpleLocation` / `CompoundLocation`. */

import { ValueError, warn } from "@biolibs/core";
import { AssertionError, LocationParserError } from "../errors.js";
import { ExactPosition, Position } from "../position/index.js";
import { pyInt } from "../py/int.js";
import { Location } from "./base.js";
import { CompoundLocation } from "./compound.js";
import { CATEGORY_ORDER, LOCATION_CATEGORY, SPLIT } from "./patterns.js";
import { SimpleLocation } from "./simple.js";

const PARSER_WARNING = "BiopythonParserWarning";

/** Split "a,b,c" into its parts: the captured (odd-indexed) pieces of `SPLIT`. */
function splitParts(text: string): string[] {
  return text.split(SPLIT).filter((_, i) => i % 2 === 1);
}

/** Python `int(text)` or null if it is not an integer (used where Biopython swallows `ValueError`). */
function tryInt(text: string): number | null {
  try {
    return pyInt(text);
  } catch {
    return null;
  }
}

/**
 * Parse one range (no `join`/`order`). See {@link SimpleLocation.fromstring}.
 *
 * Returns a `CompoundLocation` only when it repairs a location that wraps around a circular origin.
 *
 * @param text - e.g. `"5..10"`, `"<5..>10"`, `"complement(5..10)"`, `"(3.5)..9"`, `"one-of(3,4)..9"`, `"5^6"`, `"bond(5)"`, `"7"`, `"NC_1.1:5..10"`.
 * @param length - Sequence length (for origin-wrapping repair and `^` checks).
 * @param circular - Whether the sequence is circular.
 * @throws {@link LocationParserError} on malformed locations.
 */
export function simpleLocationFromString(text: string, length: number | null = null, circular = false): SimpleLocation | CompoundLocation {
  let strand: 1 | -1 | null = null;
  if (text.startsWith("complement(")) {
    text = text.slice(11, -1);
    strand = -1;
  }
  // Fast path: plain "start..end" with integer bounds.
  const bounds = text.split("..");
  if (bounds.length === 2) {
    const s0 = tryInt(bounds[0]!);
    const e = tryInt(bounds[1]!);
    if (s0 !== null && e !== null) {
      const s = s0 - 1;
      if (0 <= s && s < e) return new SimpleLocation(s, e, strand);
    }
  }
  let ref: string | null = null;
  const refSplit = text.split(":");
  if (refSplit.length === 2) {
    ref = refSplit[0]!;
    text = refSplit[1]!;
  }
  const m = LOCATION_CATEGORY.exec(text);
  if (m === null) throw new LocationParserError(`Could not parse feature location '${text}'`);
  const key = CATEGORY_ORDER.find((k) => m.groups![k] !== undefined)!;
  if (m.groups![key] !== text) throw new AssertionError(); // only part of the text matched
  let sPos: Position;
  let ePos: Position;
  if (key === "bond") {
    warn("Dropping bond qualifier in feature location", PARSER_WARNING);
    text = text.slice(5, -1);
    sPos = Position.fromstring(text, -1);
    ePos = Position.fromstring(text);
  } else if (key === "solo") {
    sPos = Position.fromstring(text, -1);
    ePos = Position.fromstring(text);
  } else if (key === "pair" || key === "within" || key === "oneof") {
    const [s, e] = text.split("..") as [string, string];
    sPos = Position.fromstring(s, -1);
    ePos = Position.fromstring(e);
    if (ePos.valueOf() <= sPos.valueOf() && length && sPos.valueOf() < length) {
      if (!circular) {
        throw new LocationParserError(`it appears that '${text}' is a feature that spans the origin, but the sequence topology is undefined`);
      }
      warn(`Attempting to fix invalid location '${text}' as it looks like incorrect origin wrapping. Please fix input file, this could have unintended behavior.`, PARSER_WARNING);
      const f1 = new SimpleLocation(sPos, length, strand);
      const f2 = new SimpleLocation(0, ePos, strand);
      return strand === -1 ? (f2.add(f1) as CompoundLocation) : (f1.add(f2) as CompoundLocation);
    }
  } else {
    // "between": "5^6" means the site between bases 5 and 6.
    const [s, e] = text.split("^").map(pyInt) as [number, number];
    if (s + 1 === e || (length !== null && s === length && e === 1)) {
      sPos = new ExactPosition(s);
      ePos = sPos;
    } else {
      throw new LocationParserError(`invalid feature location '${text}'`);
    }
  }
  if (sPos.valueOf() < 0) throw new LocationParserError(`negative starting position in feature location '${text}'`);
  return new SimpleLocation(sPos, ePos, strand, ref);
}

/**
 * Parse a full location string. See {@link Location.fromstring}.
 *
 * @param text - e.g. `"1..10"`, `"complement(1..10)"`, `"join(1..10,20..30)"`, `"complement(join(1..10,20..30))"`, `"order(...)"`.
 * @param length - Sequence length.
 * @param circular - Whether the sequence is circular.
 * @param stranded - If false, plain locations get strand `null` instead of +1.
 * @throws {@link LocationParserError} when the text is malformed (including `join(` with a double complement).
 */
export function locationFromString(text: string, length: number | null = null, circular = false, stranded = true): Location {
  let strand: 1 | -1 | null;
  if (text.startsWith("complement(")) {
    if (text[text.length - 1] !== ")") throw new ValueError(`closing bracket missing in '${text}'`);
    text = text.slice(11, -1);
    strand = -1;
  } else {
    strand = stranded ? 1 : null;
  }
  let operator: string;
  let parts: string[];
  if (text.startsWith("join(")) {
    operator = "join";
    parts = splitParts(text.slice(5, -1));
  } else if (text.startsWith("order(")) {
    operator = "order";
    parts = splitParts(text.slice(6, -1));
  } else if (text.startsWith("bond(")) {
    operator = "bond";
    parts = splitParts(text.slice(5, -1));
  } else {
    const loc = simpleLocationFromString(text, length, circular);
    loc.strand = strand;
    if (strand === -1) loc.parts.reverse();
    return loc;
  }
  // (Biopython's fallbacks for 'order' mixed with 'join' and for a trailing comma are unreachable: they sit in a for/else that cannot `break`.)
  const locs: SimpleLocation[] = [];
  let loc: SimpleLocation | CompoundLocation | undefined;
  for (const part of parts) {
    loc = simpleLocationFromString(part, length, circular);
    if (loc.strand === -1) {
      if (strand === -1) throw new LocationParserError("double complement in '{text}'?");
    } else {
      loc.strand = strand;
    }
    locs.push(...loc.parts);
  }
  if (locs.length === 1) return loc!;
  if (strand === -1) locs.reverse();
  return new CompoundLocation(locs, operator);
}
