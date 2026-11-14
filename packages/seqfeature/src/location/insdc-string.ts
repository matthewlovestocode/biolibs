/**
 * Turning feature locations back into INSDC location text (`join(1..5,complement(8..9))`).
 *
 * It lives here, with the locations themselves, rather than in `@biolibs/seqio` where INSDC files are written,
 * because `Bio.Align.bigpsl` writes a location this way too and `@biolibs/align` cannot reach `@biolibs/seqio`.
 */

import { AssertionError, NotImplementedError, ValueError } from "@biolibs/core";
import { AfterPosition, BeforePosition, BetweenPosition, ExactPosition, OneOfPosition, Position, UnknownPosition, WithinPosition } from "../position/index.js";
import { CompoundLocation } from "./compound.js";
import type { SimpleLocation } from "./simple.js";

/**
 * A position as INSDC text, shifted by `offset` (use +1 for start positions to go from zero-based to one-based).
 *
 * @throws {@link NotImplementedError} for a position kind that cannot be written (including `UnknownPosition`).
 * @throws {@link ValueError} if `pos` is not a position.
 */
export function insdcFeaturePositionString(pos: Position, offset = 0): string {
  if (pos instanceof ExactPosition) return String(pos.valueOf() + offset);
  if (pos instanceof WithinPosition) return `(${pos.left + offset}.${pos.right + offset})`;
  if (pos instanceof BetweenPosition) return `(${pos.left + offset}^${pos.right + offset})`;
  if (pos instanceof BeforePosition) return `<${pos.valueOf() + offset}`;
  if (pos instanceof AfterPosition) return `>${pos.valueOf() + offset}`;
  if (pos instanceof OneOfPosition) return `one-of(${pos.positionChoices.map((p) => insdcFeaturePositionString(p, offset)).join(",")})`;
  if (pos instanceof Position) throw new NotImplementedError("Please report this as a bug in Biopython.");
  throw new ValueError("Expected a SeqFeature position object.");
}

/** The `start..end` text of one simple location, without strand or operators. */
export function insdcLocationStringIgnoringStrandAndSubfeatures(location: SimpleLocation, recLength: number): string {
  const ref = location.ref ? `${location.ref}:` : "";
  if (location.refDb) throw new AssertionError();
  const start = location.start;
  const end = location.end;
  if (start instanceof ExactPosition && end instanceof ExactPosition && start.valueOf() === end.valueOf()) {
    // A zero-length location is a site between two bases.
    return end.valueOf() === recLength ? `${ref}${recLength}^1` : `${ref}${end.valueOf()}^${end.valueOf() + 1}`;
  }
  if (start instanceof ExactPosition && end instanceof ExactPosition && start.valueOf() + 1 === end.valueOf()) return `${ref}${end.valueOf()}`;
  if (start instanceof UnknownPosition || end instanceof UnknownPosition) {
    if (start instanceof UnknownPosition && end instanceof UnknownPosition) throw new ValueError("Feature with unknown location");
    if (start instanceof UnknownPosition) return `${ref}<${end.valueOf()}..${insdcFeaturePositionString(end)}`;
    return `${ref}${insdcFeaturePositionString(start, +1)}..>${start.valueOf() + 1}`;
  }
  return ref + insdcFeaturePositionString(start, +1) + ".." + insdcFeaturePositionString(end);
}

/**
 * A location as INSDC text. Compound locations use their operator (`join`, `order`, `bond`); on the minus strand they are written
 * as `complement(join(...))` with the parts reversed.
 */
export function insdcLocationString(location: SimpleLocation | CompoundLocation, recLength: number): string {
  if (location instanceof CompoundLocation) {
    const parts = location.parts;
    if (location.strand === -1) {
      return `complement(${location.operator}(${[...parts].reverse().map((p) => insdcLocationStringIgnoringStrandAndSubfeatures(p, recLength)).join(",")}))`;
    }
    return `${location.operator}(${parts.map((p) => insdcLocationString(p, recLength)).join(",")})`;
  }
  const loc = insdcLocationStringIgnoringStrandAndSubfeatures(location, recLength);
  return location.strand === -1 ? `complement(${loc})` : loc;
}
