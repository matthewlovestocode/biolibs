import { ValueError } from "@biolibs/core";
import { describe, expect, it } from "vitest";
import {
  TAU, angleAt, blockPath, fractionAt, laneCount, largeArcFlag, normalizeAngle, packLanes, polar, positionAt,
  ringPath, spreadApart, spreadAround, splitAtOrigin, tickLabel, tickPath, tickPositions, tickStep,
} from "@biolibs/seqmap";

describe("polar", () => {
  it("puts position 0 at the top and a full turn at the end", () => {
    expect(angleAt(0, 1000)).toBe(0);
    expect(angleAt(1000, 1000)).toBeCloseTo(TAU, 12);
  });

  it("puts a quarter of the way round at three o'clock", () => {
    expect(angleAt(250, 1000)).toBeCloseTo(Math.PI / 2, 12);
  });

  it("does not wrap a position past the end, so a feature can cross the origin", () => {
    expect(angleAt(1200, 1000)).toBeCloseTo(TAU * 1.2, 12);
  });

  it("gives angle 0 for a sequence of no length", () => {
    expect(angleAt(0, 0)).toBe(0);
  });

  it("inverts angleAt", () => {
    for (const position of [0, 1, 250, 999, 1000]) {
      expect(positionAt(angleAt(position, 1000), 1000)).toBeCloseTo(position, 9);
    }
  });

  it("converts polar coordinates with y growing downwards", () => {
    expect(polar(0, 0, 10, 0)).toEqual({ x: 0, y: -10 });
    const right = polar(0, 0, 10, Math.PI / 2);
    expect(right.x).toBeCloseTo(10, 12);
    expect(right.y).toBeCloseTo(0, 12);
    const down = polar(0, 0, 10, Math.PI);
    expect(down.x).toBeCloseTo(0, 12);
    expect(down.y).toBeCloseTo(10, 12);
  });

  it("goes clockwise: a quarter turn moves right, not left", () => {
    expect(polar(0, 0, 10, Math.PI / 2).x).toBeGreaterThan(0);
  });

  it("offsets from the centre given", () => {
    expect(polar(100, 50, 10, 0)).toEqual({ x: 100, y: 40 });
  });

  it("places a position along a line as a fraction of its width", () => {
    expect(fractionAt(0, 1000)).toBe(0);
    expect(fractionAt(500, 1000)).toBe(0.5);
    expect(fractionAt(1000, 1000)).toBe(1);
    expect(fractionAt(0, 0)).toBe(0);
  });

  it("normalizes angles into one turn", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(TAU)).toBe(0);
    expect(normalizeAngle(TAU + 1)).toBeCloseTo(1, 12);
    expect(normalizeAngle(-1)).toBeCloseTo(TAU - 1, 12);
    expect(() => normalizeAngle(Number.POSITIVE_INFINITY)).toThrow(ValueError);
  });
});

describe("ringPath", () => {
  it("draws a closed path with two arcs for a plain block", () => {
    const path = ringPath(0, 0, 90, 100, 0, Math.PI / 2);
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.match(/A/g)).toHaveLength(2);
  });

  it("starts at the outer radius of the start angle", () => {
    // Start angle 0 is straight up, so the first point is (0, -outer).
    expect(ringPath(0, 0, 90, 100, 0, 1).startsWith("M0,-100 ")).toBe(true);
  });

  it("sets the large-arc flag only past half a turn", () => {
    expect(ringPath(0, 0, 90, 100, 0, Math.PI / 2)).toContain("0 1 ");
    expect(ringPath(0, 0, 90, 100, 0, Math.PI * 1.5)).toContain("1 1 ");
  });

  it("sweeps clockwise on the outer arc and back on the inner", () => {
    const path = ringPath(0, 0, 90, 100, 0, 1);
    const arcs = path.match(/A[^A]*/g)!;
    expect(arcs[0]).toContain(" 1 ");
    expect(arcs[1]).toContain(" 0 ");
  });

  it("takes an arrowhead out of the feature's own span, not beyond it", () => {
    const withArrow = ringPath(0, 0, 90, 100, 0, 1, "end", 0.1);
    const plain = ringPath(0, 0, 90, 100, 0, 1);
    expect(withArrow).not.toBe(plain);
    // The tip sits at the midline radius of the end angle.
    const tip = polar(0, 0, 95, 1);
    expect(withArrow).toContain(`${Number(tip.x.toFixed(3))},${Number(tip.y.toFixed(3))}`);
  });

  it("points a start arrow at the start angle instead", () => {
    const tip = polar(0, 0, 95, 0);
    expect(ringPath(0, 0, 90, 100, 0, 1, "start", 0.1)).toContain(`${Number(tip.x.toFixed(3))},${Number(tip.y.toFixed(3))}`);
  });

  it("draws a feature shorter than its head as a plain triangle", () => {
    const path = ringPath(0, 0, 90, 100, 0, 0.02, "end", 0.06);
    expect(path.match(/A/g)).toBeNull();
    expect(path.match(/L/g)).toHaveLength(2);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("draws a zero-length feature without failing", () => {
    expect(() => ringPath(0, 0, 90, 100, 1, 1)).not.toThrow();
    expect(() => ringPath(0, 0, 90, 100, 1, 1, "end")).not.toThrow();
  });

  it("draws a feature covering the whole circle as a closed annulus", () => {
    // An SVG arc whose start and end coincide draws nothing, so a full turn needs two arcs per edge. A
    // GenBank `source` feature covers the whole plasmid, so this is the commonest shape of all.
    const ring = ringPath(0, 0, 90, 100, 0, TAU);
    expect(ring.match(/A/g)).toHaveLength(4);
    expect(ring).toContain("M0,-100 A100,100 0 0 1 0,100 A100,100 0 0 1 0,-100");
    // The inner edge sweeps the other way, so the shape fills as a band and not a disc.
    expect(ring).toContain("M0,-90 A90,90 0 0 0 0,90 A90,90 0 0 0 0,-90");
    expect(ring.endsWith("Z")).toBe(true);
  });

  it("treats a span over a full turn as the whole circle too, rather than its remainder", () => {
    expect(ringPath(0, 0, 90, 100, 0, TAU * 1.2)).toBe(ringPath(0, 0, 90, 100, 0, TAU));
    // An arrowhead has no end to point at on a closed ring, so it is left off.
    expect(ringPath(0, 0, 90, 100, 0, TAU, "end")).toBe(ringPath(0, 0, 90, 100, 0, TAU));
  });

  it("rejects bad geometry", () => {
    expect(() => ringPath(0, 0, 100, 90, 0, 1)).toThrow(ValueError);
    expect(() => ringPath(0, 0, -1, 100, 0, 1)).toThrow(ValueError);
    expect(() => ringPath(0, 0, 90, 100, 1, 0)).toThrow(ValueError);
    expect(() => ringPath(0, 0, 90, 100, 0, 1, "end", -1)).toThrow(ValueError);
    expect(() => ringPath(Number.NaN, 0, 90, 100, 0, 1)).toThrow(ValueError);
  });
});

describe("blockPath", () => {
  it("draws a rectangle for a plain block", () => {
    expect(blockPath(0, 100, 0, 10)).toBe("M0,0 L100,0 L100,10 L0,10 Z");
  });

  it("points an end arrow right and a start arrow left", () => {
    expect(blockPath(0, 100, 0, 10, "end", 6)).toBe("M0,0 L94,0 L100,5 L94,10 L0,10 Z");
    expect(blockPath(0, 100, 0, 10, "start", 6)).toBe("M6,0 L100,0 L100,10 L6,10 L0,5 Z");
  });

  it("keeps the arrowhead inside the block's own width", () => {
    const path = blockPath(0, 100, 0, 10, "end", 6);
    const xs = [...path.matchAll(/(-?[\d.]+),/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBe(100);
    expect(Math.min(...xs)).toBe(0);
  });

  it("draws a block narrower than its head as a triangle", () => {
    expect(blockPath(0, 4, 0, 10, "end", 6)).toBe("M0,0 L4,5 L0,10 Z");
  });

  it("rejects bad geometry", () => {
    expect(() => blockPath(100, 0, 0, 10)).toThrow(ValueError);
    expect(() => blockPath(0, 100, 10, 0)).toThrow(ValueError);
    expect(() => blockPath(0, 100, 0, 10, "end", -1)).toThrow(ValueError);
  });
});

describe("tickPath and largeArcFlag", () => {
  it("draws a tick as a two-point line outwards", () => {
    expect(tickPath(0, 0, 100, 110, 0)).toBe("M0,-100 L0,-110");
  });

  it("rejects a non-finite argument", () => {
    expect(() => tickPath(0, 0, 100, 110, Number.NaN)).toThrow(ValueError);
  });

  it("flags a span of more than half a turn", () => {
    expect(largeArcFlag(Math.PI / 2)).toBe(0);
    expect(largeArcFlag(Math.PI)).toBe(0);
    expect(largeArcFlag(Math.PI * 1.1)).toBe(1);
  });
});

describe("tickStep", () => {
  it("picks a round interval of 1, 2 or 5 times a power of ten", () => {
    for (const length of [37, 250, 2686, 45000, 1_000_000, 7]) {
      const step = tickStep(length);
      const leading = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5]).toContain(Number(leading.toFixed(6)));
    }
  });

  it("lands near the number of ticks asked for", () => {
    for (const length of [500, 2686, 45000, 123456]) {
      for (const target of [5, 10, 20]) {
        const count = length / tickStep(length, target);
        expect(count).toBeGreaterThanOrEqual(target / 2.5);
        expect(count).toBeLessThanOrEqual(target * 2.5);
      }
    }
  });

  it("never goes below one base", () => {
    expect(tickStep(5)).toBe(1);
    expect(tickStep(1)).toBe(1);
    expect(tickStep(0)).toBe(1);
  });

  it("gives a coarser interval for fewer ticks", () => {
    expect(tickStep(2686, 5)).toBeGreaterThan(tickStep(2686, 20));
  });

  it("rejects a bad length or target", () => {
    expect(() => tickStep(-1)).toThrow(ValueError);
    expect(() => tickStep(100, 0)).toThrow(ValueError);
  });
});

describe("tickPositions", () => {
  it("starts at 0 and steps by the interval", () => {
    expect(tickPositions(1000, 250, false)).toEqual([0, 250, 500, 750, 1000]);
  });

  it("leaves off the far end of a circle, where it would sit on top of position 0", () => {
    expect(tickPositions(1000, 250, true)).toEqual([0, 250, 500, 750]);
  });

  it("gives a line a tick at its far end even when the step does not land there", () => {
    expect(tickPositions(1000, 300, false)).toEqual([0, 300, 600, 900, 1000]);
  });

  it("keeps every tick inside the sequence", () => {
    for (const circular of [true, false]) {
      for (const position of tickPositions(2686, 200, circular)) {
        expect(position).toBeGreaterThanOrEqual(0);
        expect(position).toBeLessThanOrEqual(2686);
      }
    }
  });

  it("gives nothing for a sequence of no length", () => {
    expect(tickPositions(0, 100, false)).toEqual([]);
  });

  it("rejects a bad length or step", () => {
    expect(() => tickPositions(-1, 100, false)).toThrow(ValueError);
    expect(() => tickPositions(1000, 0, false)).toThrow(ValueError);
  });
});

describe("tickLabel", () => {
  it("writes bases with thousands separators on a fine scale", () => {
    expect(tickLabel(1200, 200)).toBe("1,200");
    expect(tickLabel(0, 200)).toBe("0");
  });

  it("switches to kb once ticks are 1000 bases apart", () => {
    expect(tickLabel(1200, 1000)).toBe("1.2 kb");
    expect(tickLabel(2000, 1000)).toBe("2 kb");
    expect(tickLabel(0, 1000)).toBe("0 kb");
  });
});

describe("packLanes", () => {
  it("keeps non-overlapping spans in one lane", () => {
    expect(packLanes([{ start: 0, end: 100 }, { start: 200, end: 300 }])).toEqual([0, 0]);
  });

  it("stacks overlapping spans and reuses a lane once it is free", () => {
    expect(packLanes([
      { start: 0, end: 100 },
      { start: 50, end: 150 },
      { start: 200, end: 300 },
    ])).toEqual([0, 1, 0]);
  });

  it("treats touching spans as not overlapping, since spans are half-open", () => {
    expect(packLanes([{ start: 0, end: 100 }, { start: 100, end: 200 }])).toEqual([0, 0]);
  });

  it("gives the inner lane to the longer of two spans starting together", () => {
    const lanes = packLanes([{ start: 0, end: 50 }, { start: 0, end: 500 }]);
    expect(lanes[1]).toBe(0);
    expect(lanes[0]).toBe(1);
  });

  it("returns lanes in input order whatever order the spans come in", () => {
    const spans = [{ start: 200, end: 300 }, { start: 0, end: 100 }, { start: 50, end: 150 }];
    expect(packLanes(spans)).toEqual([0, 0, 1]);
  });

  it("never puts two overlapping spans in the same lane", () => {
    const spans = [
      { start: 0, end: 900 }, { start: 100, end: 200 }, { start: 150, end: 400 },
      { start: 380, end: 420 }, { start: 410, end: 1000 }, { start: 950, end: 1200 },
    ];
    const lanes = packLanes(spans);
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const overlap = spans[i]!.start < spans[j]!.end && spans[j]!.start < spans[i]!.end;
        if (overlap) expect(lanes[i]).not.toBe(lanes[j]);
      }
    }
  });

  it("uses no more lanes than the deepest pile-up", () => {
    // Three spans all covering base 100 need exactly three lanes.
    const lanes = packLanes([{ start: 0, end: 200 }, { start: 50, end: 150 }, { start: 90, end: 110 }]);
    expect(Math.max(...lanes)).toBe(2);
  });

  it("separates spans sharing a lane by the padding", () => {
    expect(packLanes([{ start: 0, end: 100 }, { start: 100, end: 200 }], 10)).toEqual([0, 1]);
    expect(packLanes([{ start: 0, end: 100 }, { start: 110, end: 200 }], 10)).toEqual([0, 0]);
  });

  it("handles no spans and a zero-length span", () => {
    expect(packLanes([])).toEqual([]);
    expect(packLanes([{ start: 50, end: 50 }])).toEqual([0]);
  });

  it("rejects a backwards or non-finite span, or a negative padding", () => {
    expect(() => packLanes([{ start: 100, end: 50 }])).toThrow(ValueError);
    expect(() => packLanes([{ start: Number.NaN, end: 50 }])).toThrow(ValueError);
    expect(() => packLanes([{ start: 0, end: 50 }], -1)).toThrow(ValueError);
  });
});

describe("laneCount", () => {
  it("counts the lanes packLanes used", () => {
    expect(laneCount([])).toBe(0);
    expect(laneCount([{ start: 0, end: 100 }])).toBe(1);
    expect(laneCount([{ start: 0, end: 200 }, { start: 50, end: 150 }, { start: 90, end: 110 }])).toBe(3);
  });
});

describe("splitAtOrigin", () => {
  it("leaves a span inside the sequence whole", () => {
    expect(splitAtOrigin({ start: 100, end: 200 }, 2686)).toEqual([{ start: 100, end: 200 }]);
  });

  it("leaves a span ending exactly at the end whole", () => {
    expect(splitAtOrigin({ start: 2600, end: 2686 }, 2686)).toEqual([{ start: 2600, end: 2686 }]);
  });

  it("splits a span crossing the origin into two pieces in the order they are met", () => {
    expect(splitAtOrigin({ start: 2600, end: 2800 }, 2686)).toEqual([
      { start: 2600, end: 2686 },
      { start: 0, end: 114 },
    ]);
  });

  it("keeps the total length of the pieces equal to the span", () => {
    const pieces = splitAtOrigin({ start: 2600, end: 2800 }, 2686);
    const total = pieces.reduce((sum, p) => sum + (p.end - p.start), 0);
    expect(total).toBe(200);
  });

  it("rejects a span longer than the sequence or a bad length", () => {
    expect(() => splitAtOrigin({ start: 0, end: 3000 }, 2686)).toThrow(ValueError);
    expect(() => splitAtOrigin({ start: 0, end: 100 }, 0)).toThrow(ValueError);
    expect(() => splitAtOrigin({ start: 100, end: 50 }, 2686)).toThrow(ValueError);
  });
});

describe("spreadApart", () => {
  it("leaves values that are already far enough apart where they are", () => {
    expect(spreadApart([0, 50, 100], 10, 0, 100)).toEqual([0, 50, 100]);
  });

  it("separates crowded values by the gap, moving each as little as it can", () => {
    expect(spreadApart([10, 11, 12], 5, 0, 100)).toEqual([6, 11, 16]);
  });

  it("keeps the order of the values", () => {
    const values = [30, 10, 20, 11];
    const spread = spreadApart(values, 8, 0, 100);
    const byValue = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
    const byResult = values.map((_, i) => i).sort((a, b) => spread[a]! - spread[b]!);
    expect(byResult).toEqual(byValue);
  });

  it("stays within the bounds", () => {
    const spread = spreadApart([0, 0, 0, 0], 10, 0, 100);
    expect(Math.min(...spread)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...spread)).toBeLessThanOrEqual(100);
  });

  it("pulls a run back under the high bound", () => {
    expect(spreadApart([98, 99, 100], 10, 0, 100)).toEqual([80, 90, 100]);
  });

  it("pushes a run up off the low bound", () => {
    expect(spreadApart([0, 1, 2], 10, 0, 100)).toEqual([0, 10, 20]);
  });

  it("separates every neighbour by at least the gap when there is room", () => {
    const spread = [...spreadApart([5, 6, 7, 40, 41, 95], 7, 0, 100)].sort((a, b) => a - b);
    for (let i = 1; i < spread.length; i++) expect(spread[i]! - spread[i - 1]!).toBeGreaterThanOrEqual(7 - 1e-9);
  });

  it("shares the space out evenly when there is not enough room", () => {
    expect(spreadApart([0, 0, 0], 100, 0, 100)).toEqual([0, 50, 100]);
  });

  it("centres a single value that cannot fit", () => {
    expect(spreadApart([5], 0, 0, 100)).toEqual([5]);
  });

  it("returns the input order and handles no values", () => {
    expect(spreadApart([], 10, 0, 100)).toEqual([]);
    expect(spreadApart([42], 10, 0, 100)).toEqual([42]);
  });

  it("rejects bad arguments", () => {
    expect(() => spreadApart([1], -1, 0, 100)).toThrow(ValueError);
    expect(() => spreadApart([1], 10, 100, 0)).toThrow(ValueError);
    expect(() => spreadApart([Number.NaN], 10, 0, 100)).toThrow(ValueError);
  });
});

describe("spreadAround", () => {
  it("leaves angles that are already far enough apart alone", () => {
    const angles = [0, TAU / 3, (TAU * 2) / 3];
    const spread = spreadAround(angles, 0.5);
    spread.forEach((a, i) => expect(a).toBeCloseTo(angles[i]!, 9));
  });

  it("separates crowded angles by the gap, going round the circle", () => {
    const spread = spreadAround([0, 0.01, 0.02], 0.5);
    const sorted = [...spread].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  it("keeps the last label clear of the first across the wrap", () => {
    const spread = spreadAround([0.1, 0.2, 0.3, 0.4], 0.5);
    const sorted = [...spread].sort((a, b) => a - b);
    const wrap = sorted[0]! + TAU - sorted[sorted.length - 1]!;
    expect(wrap).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  it("returns every angle inside one turn", () => {
    for (const angle of spreadAround([0, 0.01, 6.28, -1, 7], 0.4)) {
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(TAU);
    }
  });

  it("spaces labels evenly when the circle cannot hold them all", () => {
    const spread = spreadAround([0, 0.1, 0.2, 0.3], TAU / 3);
    const sorted = [...spread].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(TAU / 4, 9);
  });

  it("moves labels out from the widest gap, leaving a lone crowd nearly in place", () => {
    // Two labels at 0 and 0.05 with the rest of the circle empty: each should move about half the shortfall.
    const original = [0, 0.05];
    const spread = spreadAround(original, 0.2);
    const apart = Math.abs(spread[1]! - spread[0]!);
    expect(Math.min(apart, TAU - apart)).toBeCloseTo(0.2, 9);
    spread.forEach((angle, i) => {
      const moved = Math.abs(angle - original[i]!);
      expect(Math.min(moved, TAU - moved)).toBeLessThan(0.1);
    });
  });

  it("handles no angles and one angle", () => {
    expect(spreadAround([], 0.5)).toEqual([]);
    expect(spreadAround([TAU + 1], 0.5)[0]).toBeCloseTo(1, 12);
  });

  it("returns results in input order", () => {
    const spread = spreadAround([3, 0, 1.5], 0.4);
    expect(spread).toHaveLength(3);
    expect(spread[1]).toBeLessThan(spread[2]!);
    expect(spread[2]).toBeLessThan(spread[0]!);
  });

  it("rejects bad arguments", () => {
    expect(() => spreadAround([1], -1)).toThrow(ValueError);
    expect(() => spreadAround([Number.NaN], 0.5)).toThrow(ValueError);
  });
});

describe("a pUC19 map", () => {
  it("places the two main genes in one lane with arcs on opposite sides", () => {
    const length = 2686;
    const lacZ = { start: 145, end: 1006 };
    const ampR = { start: 1625, end: 2486 };
    expect(packLanes([lacZ, ampR])).toEqual([0, 0]);

    const path = ringPath(150, 150, 100, 112, angleAt(lacZ.start, length), angleAt(lacZ.end, length), "end");
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("gives a readable scale", () => {
    const step = tickStep(2686);
    expect(step).toBe(200);
    expect(tickPositions(2686, step, true)).toHaveLength(14);
    expect(tickLabel(2000, step)).toBe("2,000");
  });
});
