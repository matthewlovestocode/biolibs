/**
 * @packageDocumentation
 * `@biolibs/seqmap`: the geometry behind a plasmid or linear sequence map — pure numbers and SVG path strings, with
 * no DOM and no drawing.
 *
 * Biopython's nearest counterpart is `Bio.Graphics.GenomeDiagram`, which renders through ReportLab and cannot be
 * ported; this package provides the measurements instead and leaves the drawing to the caller, so the same figures
 * serve SVG, canvas and React.
 *
 * Positions are 0-based base boundaries, as elsewhere in biolibs: position 0 lies before the first base and
 * `length` after the last. Circular maps put position 0 at the top and run clockwise.
 *
 * - `polar.ts`: `TAU`, `Point`, `angleAt`, `positionAt`, `polar`, `fractionAt`, `normalizeAngle`
 * - `arcs.ts`: `ArrowEnd`, `ringPath`, `blockPath`, `tickPath`, `largeArcFlag`
 * - `ticks.ts`: `tickStep`, `tickPositions`, `tickLabel`
 * - `lanes.ts`: `Span`, `packLanes`, `laneCount`, `splitAtOrigin`
 * - `spread.ts`: `spreadApart`, `spreadAround`
 *
 * @example
 * ```ts
 * import { angleAt, packLanes, ringPath, tickPositions, tickStep } from "@biolibs/seqmap";
 *
 * const length = 2686; // pUC19
 * const features = [{ start: 145, end: 1006 }, { start: 1625, end: 2486 }];
 * const lanes = packLanes(features);
 *
 * const paths = features.map((f, i) => ringPath(
 *   150, 150, 100 - lanes[i]! * 12, 110 - lanes[i]! * 12,
 *   angleAt(f.start, length), angleAt(f.end, length), "end",
 * ));
 *
 * const step = tickStep(length);          // 200
 * const ticks = tickPositions(length, step, true);
 * ```
 */

export * from "./polar.js";
export * from "./arcs.js";
export * from "./ticks.js";
export * from "./lanes.js";
export * from "./spread.js";
