/**
 * @packageDocumentation
 * Sequence positions, a port of the `*Position` classes of Biopython's `Bio.SeqFeature`.
 *
 * - `base.ts`: `Position` and the internal `IntPosition`
 * - `exact.ts`, `unknown.ts`, `range.ts` (within/between), `before-after.ts`, `one-of.ts`: the kinds of position
 * - `parse.ts`: `positionFromString`, installed as `Position.fromstring` here
 */

import { Position } from "./base.js";
import { positionFromString } from "./parse.js";

// Installed here because parsing needs every subclass, and the subclasses need `Position`.
Position.fromstring = positionFromString;

export { Position, IntPosition } from "./base.js";
export { ExactPosition, UncertainPosition } from "./exact.js";
export { UnknownPosition } from "./unknown.js";
export { WithinPosition, BetweenPosition } from "./range.js";
export { BeforePosition, AfterPosition } from "./before-after.js";
export { OneOfPosition } from "./one-of.js";
export { positionFromString } from "./parse.js";
