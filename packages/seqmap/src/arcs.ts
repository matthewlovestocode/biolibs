/**
 * SVG path strings for the shapes a sequence map is built from: the annular band a circular feature occupies, and
 * the rectangle a linear one occupies, each optionally drawn as an arrow to show which strand it is on.
 *
 * The paths use only `M`, `L`, `A` and `Z`, so they work in SVG, in a canvas `Path2D`, and anywhere else that reads
 * SVG path syntax. Numbers are rounded to a few decimal places to keep the strings short; the rounding is well below
 * one device pixel at any sensible map size.
 */

import { ValueError } from "@biolibs/core";
import { TAU, polar } from "./polar.js";

/** Which end of a feature carries the arrowhead, or `null` for a plain block. */
export type ArrowEnd = "start" | "end" | null;

/** Decimal places kept in path coordinates. */
const PRECISION = 3;

/** Trim a number for a path string, dropping a trailing `.000`. */
const n = (value: number): string => {
  const rounded = Number(value.toFixed(PRECISION));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

/** `x,y` for a path command. */
const pt = (x: number, y: number): string => `${n(x)},${n(y)}`;

/**
 * The path of a feature on a circular map: the part of a ring between two angles, from `inner` to `outer` radius.
 *
 * An arrowhead is taken out of the feature's own span rather than added beyond it, so the shape never runs past the
 * angles given. A feature shorter than the head becomes a plain triangle.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param inner - Inner radius.
 * @param outer - Outer radius.
 * @param from - Start angle in radians (from the top, clockwise).
 * @param to - End angle in radians. Must not be less than `from`. A span of a full {@link TAU} or more covers the
 *   whole circle, and is drawn as a closed annulus — SVG cannot express an arc of a full turn or more in one
 *   command, so it takes two per edge — with any arrowhead left off, there being no end for it to point at.
 * @param arrow - Which end carries the arrowhead.
 * @param head - The arrowhead's angular length in radians, clamped to the feature's own span. Defaults to 0.06.
 * @returns A closed SVG path.
 * @throws {@link ValueError} for a non-finite argument, a negative radius, `inner` above `outer`, `to` below `from`,
 *   or a negative `head`.
 * @example
 * ```ts
 * ringPath(0, 0, 90, 100, 0, Math.PI / 2, "end");
 * ```
 */
export function ringPath(
  cx: number, cy: number, inner: number, outer: number, from: number, to: number, arrow: ArrowEnd = null, head = 0.06,
): string {
  for (const [name, value] of [["cx", cx], ["cy", cy], ["inner", inner], ["outer", outer], ["from", from], ["to", to], ["head", head]] as const) {
    if (!Number.isFinite(value)) throw new ValueError(`${name} must be a finite number, got ${value}`);
  }
  if (inner < 0 || outer < 0) throw new ValueError(`radii must be zero or more, got inner ${inner} and outer ${outer}`);
  if (inner > outer) throw new ValueError(`inner radius ${inner} is outside outer radius ${outer}`);
  if (to < from) throw new ValueError(`end angle ${to} is before start angle ${from}`);
  if (head < 0) throw new ValueError(`head must be zero or more, got ${head}`);

  const span = to - from;
  const middle = (inner + outer) / 2;

  // A feature covering the whole circle — a GenBank `source` feature, most often — has no ends, so it is a closed
  // ring. An SVG arc cannot turn a full circle in one command (its start and end points would coincide and nothing
  // would be drawn), so each edge is drawn as two half turns, and an arrowhead has nowhere to point.
  if (span >= TAU) return fullRing(cx, cy, inner, outer, from);
  // The head cannot be longer than the feature: a very short feature is all arrowhead.
  const headAngle = arrow ? Math.min(head, span) : 0;
  const bodyFrom = arrow === "start" ? from + headAngle : from;
  const bodyTo = arrow === "end" ? to - headAngle : to;

  // An all-head feature has no body left to draw, so it is a single triangle from the base angle to the tip.
  if (arrow && headAngle >= span) {
    const base = arrow === "end" ? from : to;
    const tip = arrow === "end" ? to : from;
    const o = polar(cx, cy, outer, base);
    const i = polar(cx, cy, inner, base);
    const t = polar(cx, cy, middle, tip);
    return `M${pt(o.x, o.y)} L${pt(t.x, t.y)} L${pt(i.x, i.y)} Z`;
  }

  const bodySpan = bodyTo - bodyFrom;
  const largeArc = bodySpan > Math.PI ? 1 : 0;
  // Increasing angle runs clockwise on screen, which is SVG's positive sweep direction.
  const outerStart = polar(cx, cy, outer, bodyFrom);
  const outerEnd = polar(cx, cy, outer, bodyTo);
  const innerStart = polar(cx, cy, inner, bodyFrom);
  const innerEnd = polar(cx, cy, inner, bodyTo);

  const parts = [`M${pt(outerStart.x, outerStart.y)}`];
  parts.push(`A${n(outer)},${n(outer)} 0 ${largeArc} 1 ${pt(outerEnd.x, outerEnd.y)}`);
  if (arrow === "end") {
    const tip = polar(cx, cy, middle, to);
    parts.push(`L${pt(tip.x, tip.y)}`);
  }
  parts.push(`L${pt(innerEnd.x, innerEnd.y)}`);
  parts.push(`A${n(inner)},${n(inner)} 0 ${largeArc} 0 ${pt(innerStart.x, innerStart.y)}`);
  if (arrow === "start") {
    const tip = polar(cx, cy, middle, from);
    parts.push(`L${pt(tip.x, tip.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * The closed annulus a feature covering the whole circle occupies.
 *
 * Each edge is two half turns, because a single SVG arc command whose start and end coincide draws nothing. The
 * inner edge is swept the other way so the ring is filled as a band rather than a disc under the usual fill rule.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param inner - Inner radius.
 * @param outer - Outer radius.
 * @param from - Where to start and finish the ring; only its direction shows, in where the seam falls.
 * @returns A closed SVG path of four arcs.
 */
function fullRing(cx: number, cy: number, inner: number, outer: number, from: number): string {
  const half = TAU / 2;
  const outerStart = polar(cx, cy, outer, from);
  const outerMid = polar(cx, cy, outer, from + half);
  const innerStart = polar(cx, cy, inner, from);
  const innerMid = polar(cx, cy, inner, from + half);
  return [
    `M${pt(outerStart.x, outerStart.y)}`,
    `A${n(outer)},${n(outer)} 0 0 1 ${pt(outerMid.x, outerMid.y)}`,
    `A${n(outer)},${n(outer)} 0 0 1 ${pt(outerStart.x, outerStart.y)}`,
    `M${pt(innerStart.x, innerStart.y)}`,
    `A${n(inner)},${n(inner)} 0 0 0 ${pt(innerMid.x, innerMid.y)}`,
    `A${n(inner)},${n(inner)} 0 0 0 ${pt(innerStart.x, innerStart.y)}`,
    "Z",
  ].join(" ");
}

/**
 * The path of a feature on a linear map: a rectangle, optionally with one end drawn as an arrowhead.
 *
 * As with {@link ringPath}, the head is taken out of the feature's own width, so the shape stays between `left` and
 * `right`.
 *
 * @param left - Left edge x.
 * @param right - Right edge x. Must not be less than `left`.
 * @param top - Top edge y.
 * @param bottom - Bottom edge y. Must not be less than `top`.
 * @param arrow - `"end"` points right, `"start"` points left, `null` draws a plain block.
 * @param head - The arrowhead's width in the same units as x, clamped to the feature's own width. Defaults to 6.
 * @returns A closed SVG path.
 * @throws {@link ValueError} for a non-finite argument, `right` below `left`, `bottom` above `top`, or a negative `head`.
 */
export function blockPath(
  left: number, right: number, top: number, bottom: number, arrow: ArrowEnd = null, head = 6,
): string {
  for (const [name, value] of [["left", left], ["right", right], ["top", top], ["bottom", bottom], ["head", head]] as const) {
    if (!Number.isFinite(value)) throw new ValueError(`${name} must be a finite number, got ${value}`);
  }
  if (right < left) throw new ValueError(`right edge ${right} is before left edge ${left}`);
  if (bottom < top) throw new ValueError(`bottom edge ${bottom} is above top edge ${top}`);
  if (head < 0) throw new ValueError(`head must be zero or more, got ${head}`);

  const width = right - left;
  const middle = (top + bottom) / 2;
  const headWidth = arrow ? Math.min(head, width) : 0;

  if (arrow && headWidth >= width && width > 0) {
    // All head: a triangle from the base edge to the tip.
    const base = arrow === "end" ? left : right;
    const tip = arrow === "end" ? right : left;
    return `M${pt(base, top)} L${pt(tip, middle)} L${pt(base, bottom)} Z`;
  }

  const bodyLeft = arrow === "start" ? left + headWidth : left;
  const bodyRight = arrow === "end" ? right - headWidth : right;

  if (arrow === "end") {
    return `M${pt(bodyLeft, top)} L${pt(bodyRight, top)} L${pt(right, middle)} L${pt(bodyRight, bottom)} L${pt(bodyLeft, bottom)} Z`;
  }
  if (arrow === "start") {
    return `M${pt(bodyLeft, top)} L${pt(bodyRight, top)} L${pt(bodyRight, bottom)} L${pt(bodyLeft, bottom)} L${pt(left, middle)} Z`;
  }
  return `M${pt(left, top)} L${pt(right, top)} L${pt(right, bottom)} L${pt(left, bottom)} Z`;
}

/**
 * The path of a line from the centre out, used for the tick marks of a circular scale.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param inner - Where the tick starts.
 * @param outer - Where the tick ends.
 * @param angle - Radians from the top, clockwise.
 * @returns A two-point SVG path.
 * @throws {@link ValueError} for a non-finite argument.
 */
export function tickPath(cx: number, cy: number, inner: number, outer: number, angle: number): string {
  for (const [name, value] of [["cx", cx], ["cy", cy], ["inner", inner], ["outer", outer], ["angle", angle]] as const) {
    if (!Number.isFinite(value)) throw new ValueError(`${name} must be a finite number, got ${value}`);
  }
  const a = polar(cx, cy, inner, angle);
  const b = polar(cx, cy, outer, angle);
  return `M${pt(a.x, a.y)} L${pt(b.x, b.y)}`;
}

/**
 * Whether a span of angles needs the SVG large-arc flag, exposed for callers drawing their own arcs.
 *
 * @param span - The angle covered, in radians.
 * @returns 1 when the span is more than half a turn, otherwise 0.
 */
export const largeArcFlag = (span: number): 0 | 1 => (span > TAU / 2 ? 1 : 0);
