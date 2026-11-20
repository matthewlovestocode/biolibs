/**
 * A lane as a profile along it.
 *
 * This picture exists for one reason: a band at the top of what a camera records and a band well
 * past it look the same in a photograph and different in a profile. So what is checked is that the
 * ceiling is drawn where it is said to be, that a band at it is marked as such, and that a profile
 * with almost nothing in it still comes out as a line rather than as a point.
 */
import { placeTrace } from "@biolibs/bionet-scene";
import { describe, expect, it } from "vitest";

const centre = [0, 1, 0] as const;
const camera = [0, 1, 2] as const;
const trace = (along: number[], marks: { at: number; label: string; saturated: boolean }[] = []) =>
  placeTrace({ what: "the cut lane", along, ceiling: 0.9, marks }, centre, camera, [0.6, 0.3]);

describe("a lane drawn as a profile", () => {
  it("draws one point of the curve for each point of the profile", () => {
    expect(trace([0, 0.5, 1, 0.5, 0]).curve).toHaveLength(5);
  });

  it("puts the ceiling where it was said to be, between the floor and the top", () => {
    const placed = trace([0, 1, 0]);
    const floor = placed.axis[0]![1];
    const highest = Math.max(...placed.curve.map((one) => one[1]));
    expect(placed.ceiling[0]![1]).toBeGreaterThan(floor);
    expect(placed.ceiling[0]![1]).toBeLessThan(highest);
    // And it is level: a ceiling that sloped would be saying something it does not mean.
    expect(placed.ceiling[0]![1]).toBeCloseTo(placed.ceiling[1]![1], 9);
  });

  it("rises with the profile, so a peak is a peak", () => {
    const placed = trace([0, 0.3, 1, 0.3, 0]);
    const heights = placed.curve.map((one) => one[1]);
    expect(heights[2]).toBeGreaterThan(heights[1]!);
    expect(heights[1]).toBeGreaterThan(heights[0]!);
  });

  it("marks a band at the ceiling as one, which is the whole reason for drawing this", () => {
    const placed = trace([0, 1, 0], [{ at: 0.5, label: "2,806 bp", saturated: true }, { at: 0.8, label: "500 bp", saturated: false }]);
    expect(placed.marks.map((one) => one.saturated)).toEqual([true, false]);
    expect(placed.marks[0]!.label).toBe("2,806 bp");
  });

  it("keeps everything inside the width it was given", () => {
    const placed = trace([0, 1, 0.2, 0.8, 0], [{ at: -1, label: "left", saturated: false }, { at: 2, label: "right", saturated: false }]);
    for (const point of [...placed.curve, ...placed.marks.flatMap((one) => one.points)]) {
      expect(Math.abs(point[0])).toBeLessThanOrEqual(0.3001);
    }
  });

  it("draws a line for a profile too short to be one", () => {
    expect(trace([]).curve.length).toBeGreaterThanOrEqual(2);
    expect(trace([0.5]).curve.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a profile that goes past 1 inside the picture", () => {
    const placed = trace([0, 5, 0]);
    const ceiling = placed.ceiling[0]![1];
    const highest = Math.max(...placed.curve.map((one) => one[1]));
    expect(highest).toBeGreaterThan(ceiling);
    expect(highest).toBeLessThan(ceiling + 0.3);
  });
});
