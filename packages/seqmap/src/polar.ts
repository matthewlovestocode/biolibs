/**
 * Mapping sequence positions onto a circle, and polar to Cartesian conversion.
 *
 * A circular map is drawn the way every plasmid map is drawn: position 0 at the top, running clockwise. Angles are
 * in radians, measured from 12 o'clock and growing clockwise, which is what {@link polar} assumes.
 *
 * Positions are boundaries between bases, as elsewhere in biolibs: 0 lies before the first base and `length` after
 * the last, so a feature covering bases `[start, end)` spans the angles of `start` and `end`.
 */

import { ValueError } from "@biolibs/core";

/** A full turn in radians. */
export const TAU = Math.PI * 2;

/** A point in the drawing's coordinate system, with `y` growing downwards as in SVG and canvas. */
export interface Point {
  /** Horizontal coordinate. */
  x: number;
  /** Vertical coordinate, growing downwards. */
  y: number;
}

/**
 * The angle of a sequence position on a circular map.
 *
 * @param position - A base boundary from 0 to `length`. Values outside that range are not wrapped; they simply give
 *   angles outside one turn, which is what a feature crossing the origin needs.
 * @param length - The sequence length in bases.
 * @returns The angle in radians: 0 at the top, growing clockwise, a full {@link TAU} for `position === length`.
 *   A sequence of zero length has no circle, so every position is at 0.
 * @example
 * ```ts
 * angleAt(0, 1000);   // 0
 * angleAt(250, 1000); // Math.PI / 2 — three o'clock
 * ```
 */
export const angleAt = (position: number, length: number): number => (length > 0 ? (position / length) * TAU : 0);

/**
 * The sequence position an angle points at, the inverse of {@link angleAt}.
 *
 * @param angle - Radians from the top, clockwise.
 * @param length - The sequence length in bases.
 * @returns The base boundary, which may be fractional. Angles beyond one turn are not wrapped.
 */
export const positionAt = (angle: number, length: number): number => (angle / TAU) * length;

/**
 * The point at a distance and angle from a centre.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param radius - Distance from the centre.
 * @param angle - Radians from the top, clockwise.
 * @returns The point, with `y` growing downwards.
 * @example
 * ```ts
 * polar(0, 0, 10, 0);            // { x: 0, y: -10 } — straight up
 * polar(0, 0, 10, Math.PI / 2);  // { x: 10, y: 0 }  — to the right
 * ```
 */
export function polar(cx: number, cy: number, radius: number, angle: number): Point {
  return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
}

/**
 * Where a sequence position falls along a linear map, as a fraction of its width.
 *
 * @param position - A base boundary from 0 to `length`.
 * @param length - The sequence length in bases.
 * @returns 0 at the left edge, 1 at the right. A sequence of zero length gives 0.
 */
export const fractionAt = (position: number, length: number): number => (length > 0 ? position / length : 0);

/**
 * Reduce an angle to one turn, so a feature's angle can be compared with another's.
 *
 * @param angle - Any angle in radians.
 * @returns The same direction, in `[0, TAU)`.
 */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) throw new ValueError(`angle must be a finite number, got ${angle}`);
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}
