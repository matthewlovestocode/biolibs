/**
 * A rotor seen from above.
 *
 * The one thing this picture has to get right is the line from the axis to where the load pulls: a
 * balanced rotor has none and an unbalanced one has one pointing at the problem. Everything else is
 * geometry, and the geometry has to hold for a rotor of six positions and one of forty-eight.
 */
import { placeRotor } from "@biolibs/bionet-scene";
import { describe, expect, it } from "vitest";

const centre = [0, 1, 0] as const;
const camera = [0, 1, 2] as const;
const rotor = (positions: number, loaded: number[], put: number[] = [], offset = 0) =>
  placeRotor({ positions, loaded, put, offset, what: `${positions} positions` }, centre, camera, 0.2);

describe("a rotor drawn from above", () => {
  it("draws one position for each the rotor has", () => {
    for (const many of [6, 8, 24, 48]) expect(rotor(many, []).holes).toHaveLength(many);
  });

  it("marks the positions that hold a tube, and only those", () => {
    const placed = rotor(24, [0, 12]);
    expect(placed.holes.filter((one) => one.loaded).map((one) => one.label)).toEqual(["1", "13"]);
  });

  it("marks where a tube should go, apart from where one is", () => {
    const placed = rotor(24, [0], [12]);
    expect(placed.holes.filter((one) => one.suggested).map((one) => one.label)).toEqual(["13"]);
    expect(placed.holes[12]!.loaded).toBe(false);
  });

  it("draws no line for a balanced rotor, which is the whole of the answer", () => {
    expect(rotor(24, []).pull).toBeNull();
    expect(rotor(24, [0, 12]).pull).toBeNull();
    expect(rotor(24, [0, 8, 16]).pull).toBeNull();
  });

  it("draws a line for an unbalanced one, pointing the way the load sits", () => {
    const alone = rotor(24, [0]);
    expect(alone.pull).not.toBeNull();
    // Position 0 is to the right, so the line goes to the right of the axis.
    expect(alone.pull![1]![0]).toBeGreaterThan(alone.pull![0]![0]);
    const other = rotor(24, [12]);
    expect(other.pull![1]![0]).toBeLessThan(other.pull![0]![0]);
  });

  it("draws a shorter line for a load that is less far out", () => {
    const far = rotor(24, [0]);
    const near = rotor(24, [0, 10]);
    const length = (one: ReturnType<typeof rotor>): number =>
      Math.hypot(...one.pull![1]!.map((value, at) => value - one.pull![0]![at]!));
    expect(length(near)).toBeLessThan(length(far));
  });

  it("keeps every position inside the rim", () => {
    const placed = rotor(24, []);
    const middle = placed.rim[0]!.map((_, at) => placed.rim.reduce((sum, point) => sum + point[at]!, 0) / placed.rim.length);
    const out = Math.max(...placed.rim.map((point) => Math.hypot(...point.map((value, at) => value - middle[at]!))));
    for (const hole of placed.holes) {
      for (const point of hole.ring) {
        expect(Math.hypot(...point.map((value, at) => value - middle[at]!))).toBeLessThanOrEqual(out + 1e-6);
      }
    }
  });

  it("survives a rotor with no positions, and one with more than anybody has", () => {
    expect(rotor(0, []).holes.length).toBeGreaterThanOrEqual(1);
    expect(rotor(500, []).holes.length).toBeLessThanOrEqual(48);
  });

  it("says whether it is balanced, in words, over the picture", () => {
    expect(rotor(24, [0, 12], [], 0).labels.find((one) => one.key === "offset")!.text).toBe("balanced");
    expect(rotor(24, [0], [12], 1).labels.find((one) => one.key === "offset")!.text).toBe("100% off the axis");
  });
});
