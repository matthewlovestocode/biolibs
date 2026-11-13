# @biolibs/seqmap

The geometry behind a plasmid or linear sequence map: pure numbers and SVG path strings, with no DOM and no drawing. Biopython's nearest counterpart is `Bio.Graphics.GenomeDiagram`, which renders through ReportLab and cannot be ported; this package supplies the measurements and leaves the drawing to the caller, so the same figures serve SVG, canvas and React.

```ts
import { angleAt, packLanes, ringPath, spreadAround, tickPositions, tickStep } from "@biolibs/seqmap";

const length = 2686; // pUC19
const features = [{ start: 145, end: 1006 }, { start: 1625, end: 2486 }];
const lanes = packLanes(features);

const paths = features.map((f, i) => ringPath(
  150, 150, 100 - lanes[i]! * 12, 110 - lanes[i]! * 12,
  angleAt(f.start, length), angleAt(f.end, length), "end",
));

const step = tickStep(length);                 // 200
const ticks = tickPositions(length, step, true);
const labelAngles = spreadAround(ticks.map((t) => angleAt(t, length)), 0.12);
```

## Coordinates

Positions are **0-based base boundaries**: position 0 lies before the first base and `length` after the last, so a feature covering bases `[start, end)` spans the angles of `start` and `end`. A circular map puts position 0 at the top and runs clockwise, as every plasmid map does; angles are radians from 12 o'clock, growing clockwise, and `polar` returns points with `y` growing downwards as in SVG and canvas.

`angleAt` does not wrap a position past the end, which is what a feature crossing the origin needs — use `splitAtOrigin` to turn such a span into the one or two pieces a map can draw.

## Paths

`ringPath` is the annular band a circular feature occupies and `blockPath` the rectangle a linear one occupies, each optionally drawn as an arrow to show its strand. An arrowhead is **taken out of the feature's own span** rather than added beyond it, so the shape never runs past the bounds given; a feature shorter than the head becomes a plain triangle. Paths use only `M`, `L`, `A` and `Z`, and coordinates are rounded to three decimals — well under one device pixel at any sensible size.

## Ticks

`tickStep` picks a round interval from 1, 2 and 5 times a power of ten, the rule chart axes use, rounding to the *nearest* on the log scale so the tick count lands near the target rather than always below it. `tickPositions` leaves the far end off a circle, where it would sit on top of position 0, and keeps it on a line. `tickLabel` switches from `"1,200"` to `"1.2 kb"` once ticks are 1000 bases apart.

## Lanes and labels

`packLanes` gives each feature the lowest lane where it does not overlap something already there, taking longer features first within a starting position so a long feature takes the inner lane and the short ones inside it stack outwards. Spans are half-open, so a feature ending where another begins shares its lane.

`spreadApart` moves crowded labels the **least total distance** that separates them by a gap, by isotonic regression (pool-adjacent-violators) on the positions less `rank * gap` — so a cluster of three labels spreads symmetrically about its centre rather than all pushing one way. Order is always preserved, and when the bounds are too tight to fit everything the labels are spread evenly instead. `spreadAround` is the circular version: it uses the widest existing gap as the seam, so the unavoidable movement happens where there is most room.
