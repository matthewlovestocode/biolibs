/**
 * A map of a sequence: a circle for a plasmid, a line for anything else, with what is marked on it.
 *
 * This is the picture a lab reads a construct by. Features are drawn as arrows in lanes so that
 * ones that overlap can both be seen, places where something happens (an enzyme cuts, a primer's 3′
 * end sits) are marked and named, and stretches worth pointing at, such as where a primer binds, are
 * drawn on the backbone. The geometry is `@biolibs/seqmap`'s; this draws it.
 */
import type { PartFeature } from "@biolibs/bionet";
import { angleAt, blockPath, fractionAt, packLanes, polar, ringPath, splitAtOrigin, spreadApart, spreadAround, tickLabel, tickPositions, tickStep } from "@biolibs/seqmap";
import { featureTone } from "./sequence-file.js";

/** A place on a sequence where something happens, with what to call it. */
export interface MapMark {
  /** Where: the number of bases before it. */
  at: number;
  /** What to write beside it. */
  label: string;
}

/** A stretch of a sequence to point at, such as where a primer binds. */
export interface MapSpan {
  start: number;
  end: number;
  /** What to call it. */
  label: string;
  /** Which way it points, if it points: 1 rightwards or clockwise, -1 the other way. */
  strand?: -1 | 0 | 1;
}

/** One drawable piece of a feature, with the lane it sits in. */
export interface MapPiece {
  /** Which feature it is a piece of, by its place in the list. */
  index: number;
  feature: PartFeature;
  start: number;
  end: number;
  /** Which end carries the arrowhead, if this piece is the feature's leading end. */
  arrow: "start" | "end" | undefined;
  /** The lane it is drawn in, 0 nearest the backbone. */
  lane: number;
}

/**
 * Every drawable piece of every feature, each in a lane where it overlaps nothing.
 *
 * @param features - What is marked on the sequence.
 * @param length - How long the sequence is.
 * @param circular - Whether it is a circle, in which case a piece that crosses the origin is drawn as two.
 * @returns The pieces. At most five lanes are used; anything deeper shares the fifth.
 */
export function mapPieces(features: readonly PartFeature[], length: number, circular: boolean): MapPiece[] {
  const pieces = features.flatMap((feature, index) => feature.parts
    .filter((part) => part.end > part.start && part.end <= length)
    .flatMap((part) => (circular ? splitAtOrigin(part, length) : [part]))
    .map((part, at, all) => ({
      index, feature, start: part.start, end: part.end,
      // Only the piece at the feature's leading end carries the arrowhead.
      arrow: feature.strand === 1 && at === all.length - 1 ? ("end" as const) : feature.strand === -1 && at === 0 ? ("start" as const) : undefined,
    })));
  const lanes = packLanes(pieces, Math.max(1, Math.round(length / 300)));
  return pieces.map((piece, at) => ({ ...piece, lane: Math.min(lanes[at]!, 4) }));
}

const count = (value: number): string => value.toLocaleString("en-US");

/**
 * A sequence's map.
 *
 * @param props - `name`, `length` and `circular` say what it is a map of; `features` is what is
 *   marked on it; `marks` are places to name, such as where an enzyme cuts; `spans` are stretches to
 *   point at, such as where a primer binds.
 *
 * @example
 * ```tsx
 * import { SequenceMap } from "@biolibs/bionet-tools";
 *
 * <SequenceMap name="pUC19" length={2686} circular features={part.features} marks={[{ at: 396, label: "EcoRI" }]} />
 * ```
 */
export function SequenceMap({ name, length, circular, features, marks = [], spans = [] }: {
  name: string; length: number; circular: boolean; features: readonly PartFeature[]; marks?: readonly MapMark[]; spans?: readonly MapSpan[];
}) {
  const pieces = mapPieces(features, length, circular);
  const says = `${circular ? "Circular" : "Linear"} map of ${name}, ${count(length)} base pairs. ${features.length === 0 ? "Nothing is marked on it." : `Marked on it: ${features.map((one) => one.label).join(", ")}.`}`
    + `${marks.length === 0 ? "" : ` Marked places: ${marks.map((one) => `${one.label} at ${count(one.at)}`).join(", ")}.`}${spans.length === 0 ? "" : ` ${spans.map((one) => `${one.label} at ${count(one.start + 1)} to ${count(one.end)}`).join("; ")}.`}`;
  const title = (piece: MapPiece): string => `${piece.feature.label} (${piece.feature.type}), ${piece.feature.parts.map((part) => `${count(part.start + 1)}..${count(part.end)}`).join(", ")}`;

  if (circular) {
    const [size, radius] = [360, 118];
    const c = size / 2;
    const step = tickStep(length, 12);
    // Names are pushed apart round the circle so that neighbouring places stay readable.
    const angles = spreadAround(marks.map((mark) => angleAt(mark.at, length)), 0.14);
    return (
      <svg className="seqmap" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={says}>
        <circle cx={c} cy={c} r={radius} className="backbone" />
        {tickPositions(length, step, true).map((position) => {
          const [inner, outer] = [polar(c, c, radius - 4, angleAt(position, length)), polar(c, c, radius, angleAt(position, length))];
          return <line key={position} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="tick" />;
        })}
        {pieces.map((piece, at) => {
          const outer = radius - 8 - piece.lane * 13;
          return <path key={at} d={ringPath(c, c, outer - 10, outer, angleAt(piece.start, length), angleAt(piece.end, length), piece.arrow ?? null)} className={`feature tone-${featureTone(piece.feature.type)}`}><title>{title(piece)}</title></path>;
        })}
        {spans.map((span, at) => {
          const wide = span.end - span.start > length / 40;
          const label = polar(c, c, radius + (wide ? 21 : 19), angleAt((span.start + span.end) / 2, length));
          const side = Math.sin(angleAt((span.start + span.end) / 2, length));
          return (
            <g key={at}>
              <path d={ringPath(c, c, radius + 3, radius + (wide ? 6 : 10), angleAt(span.start, length), angleAt(span.end, length), span.strand === 1 ? "end" : span.strand === -1 ? "start" : null)} className={wide ? "span wide" : "span"}><title>{span.label}</title></path>
              <text x={label.x} y={label.y + 3.5} textAnchor={side > 0.25 ? "start" : side < -0.25 ? "end" : "middle"} className="spanned">{span.label}</text>
            </g>
          );
        })}
        {marks.map((mark, at) => {
          const angle = angleAt(mark.at, length);
          const [from, to, elbow, label] = [polar(c, c, radius - 3, angle), polar(c, c, radius + 12, angle), polar(c, c, radius + 22, angles[at]!), polar(c, c, radius + 27, angles[at]!)];
          const side = Math.sin(angles[at]!);
          return (
            <g key={at}>
              <polyline points={`${from.x},${from.y} ${to.x},${to.y} ${elbow.x},${elbow.y}`} className="mark" />
              <text x={label.x} y={label.y + 3.5} textAnchor={side > 0.25 ? "start" : side < -0.25 ? "end" : "middle"} className="marked">{mark.label}</text>
            </g>
          );
        })}
        <text x={c} y={c - 3} textAnchor="middle" className="name">{name.length > 22 ? `${name.slice(0, 21)}…` : name}</text>
        <text x={c} y={c + 14} textAnchor="middle" className="length">{count(length)} bp</text>
      </svg>
    );
  }

  const [width, left] = [640, 24];
  const across = width - 2 * left;
  const lanes = Math.max(1, ...pieces.map((piece) => piece.lane + 1));
  const axis = 30 + lanes * 16;
  const x = (position: number): number => left + fractionAt(position, length) * across;
  const step = tickStep(length, 8);
  const named = spreadApart(marks.map((mark) => x(mark.at)), 34, left, left + across);
  return (
    <svg className="seqmap linear" viewBox={`0 0 ${width} ${axis + 46}`} role="img" aria-label={says}>
      {pieces.map((piece, at) => {
        const bottom = axis - 8 - piece.lane * 16;
        return <path key={at} d={blockPath(x(piece.start), x(piece.end), bottom - 11, bottom, piece.arrow ?? null)} className={`feature tone-${featureTone(piece.feature.type)}`}><title>{title(piece)}</title></path>;
      })}
      <line x1={left} x2={left + across} y1={axis} y2={axis} className="backbone" />
      {spans.map((span, at) => (
        <g key={at}>
          <path d={blockPath(x(span.start), x(span.end), axis - 4, axis + 4, span.strand === 1 ? "end" : span.strand === -1 ? "start" : null)} className="span"><title>{span.label}</title></path>
          <text x={(x(span.start) + x(span.end)) / 2} y={axis + 30} textAnchor="middle" className="spanned">{span.label}</text>
        </g>
      ))}
      {tickPositions(length, step, false).map((position) => (
        <g key={position}>
          <line x1={x(position)} x2={x(position)} y1={axis} y2={axis + 5} className="tick" />
          <text x={x(position)} y={axis + 17} textAnchor="middle" className="length">{tickLabel(position, step)}</text>
        </g>
      ))}
      {marks.map((mark, at) => (
        <g key={at}>
          <polyline points={`${x(mark.at)},${axis - 2} ${x(mark.at)},${axis + 22} ${named[at]},${axis + 30}`} className="mark" />
          <text x={named[at]!} y={axis + 41} textAnchor="middle" className="marked">{mark.label}</text>
        </g>
      ))}
      <text x={left} y={12} className="name">{name}</text>
      <text x={left + across} y={12} textAnchor="end" className="length">{count(length)} bp</text>
    </svg>
  );
}
