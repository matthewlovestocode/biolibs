/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { TAU, angleAt, blockPath, fractionAt, laneCount, normalizeAngle, packLanes, polar, positionAt,
  ringPath, splitAtOrigin, spreadApart, spreadAround, tickLabel, tickPositions, tickStep }
  from "@biolibs/seqmap";
import { describe, expect, it } from "vitest";

describe("README: coordinates", () => {
  it("puts position 0 at the top and runs clockwise", () => {
    expect(angleAt(0, 1000)).toBe(0);
    expect(angleAt(250, 1000)).toBe(Math.PI / 2);
    expect(angleAt(1000, 1000)).toBe(TAU);

    expect(polar(0, 0, 10, 0)).toEqual({ x: 0, y: -10 });
    expect(polar(150, 150, 100, 0)).toEqual({ x: 150, y: 50 });
    expect(positionAt(Math.PI, 1000)).toBe(500);

    expect(fractionAt(500, 1000)).toBe(0.5);
  });

  it("does not wrap a position past the end", () => {
    expect(angleAt(1200, 1000) > TAU).toBe(true);
    expect(normalizeAngle(angleAt(1200, 1000))).toBeCloseTo(TAU * 0.2, 12);
    expect(normalizeAngle(TAU)).toBe(0);
  });
});

describe("README: feature shapes", () => {
  it("draws a ring band and a block", () => {
    expect(ringPath(0, 0, 90, 100, 0, Math.PI / 2))
      .toBe("M0,-100 A100,100 0 0 1 100,0 L90,0 A90,90 0 0 0 0,-90 Z");
    expect(blockPath(10, 110, 20, 40)).toBe("M10,20 L110,20 L110,40 L10,40 Z");
    expect(blockPath(10, 110, 20, 40, "end")).toBe("M10,20 L104,20 L110,30 L104,40 L10,40 Z");
    expect(blockPath(10, 110, 20, 40, "start")).toBe("M16,20 L110,20 L110,40 L16,40 L10,30 Z");
  });

  it("takes the arrowhead out of the feature's own span", () => {
    expect(blockPath(10, 110, 20, 40, "end").includes("L110,30")).toBe(true);
    expect(ringPath(0, 0, 90, 100, 0, 0.02, "end")).toBe("M0,-100 L1.9,-94.981 L0,-90 Z");
    expect(blockPath(10, 14, 20, 40, "end")).toBe("M10,20 L14,30 L10,40 Z");
  });

  it("draws a whole-circle feature as a closed annulus", () => {
    expect(ringPath(0, 0, 90, 100, 0, TAU)).toBe(
      "M0,-100 A100,100 0 0 1 0,100 A100,100 0 0 1 0,-100 "
      + "M0,-90 A90,90 0 0 0 0,90 A90,90 0 0 0 0,-90 Z");
    expect(ringPath(0, 0, 90, 100, 0, TAU * 1.2)).toBe(ringPath(0, 0, 90, 100, 0, TAU));
    expect(ringPath(0, 0, 90, 100, 0, TAU, "end")).toBe(ringPath(0, 0, 90, 100, 0, TAU));
  });

  it("refuses bad geometry", () => {
    expect(() => ringPath(0, 0, 100, 90, 0, 1))
      .toThrowError("inner radius 100 is outside outer radius 90");
    expect(() => ringPath(0, 0, 90, 100, 2, 1))
      .toThrowError("end angle 1 is before start angle 2");
  });
});

describe("README: the scale", () => {
  it("picks a round interval", () => {
    expect(tickStep(2686)).toBe(200);
    expect(tickStep(2686, 5)).toBe(500);
    expect(tickStep(1000)).toBe(100);
    expect(tickStep(45000)).toBe(5000);
    expect(tickStep(150000)).toBe(20000);
    expect(tickStep(5)).toBe(1);
  });

  it("places the ticks and labels them", () => {
    expect(tickPositions(1000, 250, true)).toEqual([0, 250, 500, 750]);
    expect(tickPositions(1000, 250, false)).toEqual([0, 250, 500, 750, 1000]);
    expect(tickPositions(1000, 300, false)).toEqual([0, 300, 600, 900, 1000]);

    expect(tickLabel(1200, 200)).toBe("1,200");
    expect(tickLabel(1200, 1000)).toBe("1.2 kb");
    expect(tickLabel(2000, 1000)).toBe("2 kb");
    expect(tickLabel(0, 1000)).toBe("0 kb");
  });
});

describe("README: lanes", () => {
  it("gives each span the lowest free lane", () => {
    expect(packLanes([{ start: 0, end: 100 }, { start: 50, end: 150 }, { start: 200, end: 300 }]))
      .toEqual([0, 1, 0]);
    expect(packLanes([{ start: 0, end: 100 }, { start: 100, end: 200 }])).toEqual([0, 0]);
    expect(packLanes([{ start: 0, end: 100 }, { start: 100, end: 200 }], 10)).toEqual([0, 1]);
    expect(laneCount([{ start: 0, end: 100 }, { start: 50, end: 150 }])).toBe(2);
  });

  it("puts the longest feature in the inner lane", () => {
    expect(packLanes([{ start: 0, end: 100 }, { start: 0, end: 1000 }])).toEqual([1, 0]);
    expect(packLanes([{ start: 0, end: 1000 }, { start: 100, end: 200 }, { start: 300, end: 400 }]))
      .toEqual([0, 1, 1]);
  });

  it("splits a feature that crosses the origin", () => {
    expect(splitAtOrigin({ start: 2600, end: 2800 }, 2686))
      .toEqual([{ start: 2600, end: 2686 }, { start: 0, end: 114 }]);
    expect(splitAtOrigin({ start: 100, end: 200 }, 2686)).toEqual([{ start: 100, end: 200 }]);

    expect(splitAtOrigin({ start: 2600, end: 2800 }, 2686)
      .map((p) => ringPath(150, 150, 100, 110, angleAt(p.start, 2686), angleAt(p.end, 2686))))
      .toHaveLength(2);

    expect(() => splitAtOrigin({ start: 0, end: 3000 }, 2686))
      .toThrowError("span of 3000 bases is longer than the 2686-base sequence");
  });
});

describe("README: labels that would collide", () => {
  it("spreads a cluster symmetrically about its centre", () => {
    expect(spreadApart([10, 11, 12], 5, 0, 100)).toEqual([6, 11, 16]);
    expect(spreadApart([50, 50, 50], 10, 0, 100)).toEqual([40, 50, 60]);
    expect(spreadApart([10, 30, 50], 5, 0, 100)).toEqual([10, 30, 50]);
    expect(spreadApart([12, 10, 11], 5, 0, 100)).toEqual([16, 6, 11]);
    expect(spreadApart([99, 100], 5, 0, 100)).toEqual([95, 100]);
    expect(spreadApart([10, 11, 12], 50, 0, 100)).toEqual([0, 50, 100]);
  });

  it("uses the widest gap as the seam on a circle", () => {
    expect(spreadAround([1, 1.05, 1.1, 4], 0.3).map((a) => Number(a.toFixed(4))))
      .toEqual([0.75, 1.05, 1.35, 4]);
    expect(spreadAround([0, 2, 4], 0.2)).toEqual([0, 2, 4]);
    expect(spreadAround([0, 0, 0, 0], 2).map((a) => Number(a.toFixed(4))))
      .toEqual([0, 1.5708, 3.1416, 4.7124]);
    // Every angle comes back inside one turn.
    expect(spreadAround([1, 1.05, 1.1, 4], 0.3).every((a) => a >= 0 && a < TAU)).toBe(true);
  });
});

describe("README: a whole pUC19 map", () => {
  it("lays the map out end to end", () => {
    const length = 2686;
    const features = [
      { start: 145, end: 1006 },
      { start: 1625, end: 2486 },
      { start: 400, end: 500 },
    ];

    const lanes = packLanes(features);
    expect(lanes).toEqual([0, 0, 1]);

    const paths = features.map((f, i) => ringPath(
      150, 150,
      100 - lanes[i]! * 12, 110 - lanes[i]! * 12,
      angleAt(f.start, length), angleAt(f.end, length),
      "end",
    ));
    expect(paths[0]!.startsWith("M186.599,46.267")).toBe(true);

    const step = tickStep(length);
    expect(step).toBe(200);
    const ticks = tickPositions(length, step, true);
    expect(ticks).toHaveLength(14);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(2600);

    const labels = ticks.map((t) => tickLabel(t, step));
    expect(labels[0]).toBe("0");
    expect(labels.at(-1)).toBe("2,600");

    const labelAngles = spreadAround(ticks.map((t) => angleAt(t, length)), 0.12);
    expect(labelAngles).toHaveLength(14);
    // Already 0.468 radians apart, so nothing needed moving. Not bit-for-bit equal, though: the method
    // subtracts `rank * gap` from each position and adds it back, which does not round-trip exactly.
    const moved = labelAngles.map((a, i) => Math.abs(a - angleAt(ticks[i]!, length)));
    expect(Math.max(...moved)).toBeLessThan(1e-9);
  });
});
