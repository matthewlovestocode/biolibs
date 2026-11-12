/** Parsing of GenBank-style position text. */

import { ValueError } from "@biolibs/core";
import { pyInt } from "../py/int.js";
import type { Position } from "./base.js";
import { AfterPosition, BeforePosition } from "./before-after.js";
import { ExactPosition, UncertainPosition } from "./exact.js";
import { OneOfPosition } from "./one-of.js";
import { UnknownPosition } from "./unknown.js";
import { WithinPosition } from "./range.js";

// Both patterns are matched at the start of the text only (Python's `re.match`), not required to span it.
const WITHIN = /^\((\d+)\.(\d+)\)/;
const ONE_OF = /^one-of\((\d+[,\d+]+)\)/;

/**
 * Parse a position. See {@link Position.fromstring}.
 *
 * @param text - Position text, one-based, e.g. `"5"`, `"<5"`, `"?5"`, `"(3.9)"`, `"one-of(6,9)"` or `"?"`.
 * @param offset - `0` for end positions, `-1` for start positions (one-based to zero-based).
 * @throws {@link ValueError} for any other offset or unparseable numbers.
 */
export function positionFromString(text: string, offset = 0): Position {
  if (offset !== 0 && offset !== -1) {
    throw new ValueError("To convert one-based indices to zero-based indices, offset must be either 0 (for end positions) or -1 (for start positions).");
  }
  if (text === "?") return new UnknownPosition();
  if (text.startsWith("?")) return new UncertainPosition(pyInt(text.slice(1)) + offset);
  if (text.startsWith("<")) return new BeforePosition(pyInt(text.slice(1)) + offset);
  if (text.startsWith(">")) return new AfterPosition(pyInt(text.slice(1)) + offset);
  const within = WITHIN.exec(text);
  if (within) {
    const s = pyInt(within[1]!) + offset;
    const e = pyInt(within[2]!) + offset;
    // For start positions the left bound represents the position, for end positions the right bound.
    return new WithinPosition(offset === -1 ? s : e, s, e);
  }
  const oneOf = ONE_OF.exec(text);
  if (oneOf) {
    const parts = oneOf[1]!.split(",").map((p) => new ExactPosition(pyInt(p) + offset));
    const values = parts.map((p) => p.valueOf());
    return new OneOfPosition(offset === -1 ? Math.min(...values) : Math.max(...values), parts);
  }
  return new ExactPosition(pyInt(text) + offset);
}
