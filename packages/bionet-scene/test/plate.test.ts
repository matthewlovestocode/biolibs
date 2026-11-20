/**
 * A plate seen from above.
 *
 * Two things a plate does not announce, and this picture has to: a satellite is a small colony
 * beside a real one that took nothing up, and a colony touching another is not one colony. The
 * second is worked out from where they are rather than passed in, so it is the one to check.
 */
import { placePlate } from "@biolibs/bionet-scene";
import { describe, expect, it } from "vitest";

const centre = [0, 1, 0] as const;
const camera = [0, 1, 2] as const;
const plate = (colonies: { at: readonly [number, number]; size: number; satellite: boolean }[], overgrown = false) =>
  placePlate({ what: "on ampicillin", colonies, overgrown }, centre, camera, 0.2);

const one = (x: number, y: number, size = 0.06, satellite = false) => ({ at: [x, y] as const, size, satellite });

describe("a plate drawn from above", () => {
  it("draws one outline for each colony", () => {
    expect(plate([one(0, 0), one(0.5, 0.5)]).colonies).toHaveLength(2);
    expect(plate([]).colonies).toEqual([]);
  });

  it("keeps every colony inside the dish", () => {
    const placed = plate([one(-1, -1), one(1, 1), one(0, 1), one(-1, 0)]);
    const middle = placed.rim[0]!.map((_, axis) => placed.rim.reduce((sum, point) => sum + point[axis]!, 0) / placed.rim.length);
    const out = Math.max(...placed.rim.map((point) => Math.hypot(...point.map((value, axis) => value - middle[axis]!))));
    for (const colony of placed.colonies) {
      for (const point of colony.ring) {
        expect(Math.hypot(...point.map((value, axis) => value - middle[axis]!))).toBeLessThanOrEqual(out + 1e-6);
      }
    }
  });

  it("works out which colonies are touching, rather than being told", () => {
    // Far apart: neither touches. Right on top of each other: both do.
    expect(plate([one(-0.8, 0), one(0.8, 0)]).colonies.map((c) => c.touching)).toEqual([false, false]);
    expect(plate([one(0, 0), one(0.02, 0)]).colonies.every((c) => c.touching)).toBe(true);
  });

  it("does not call a colony touching itself", () => {
    expect(plate([one(0, 0)]).colonies[0]!.touching).toBe(false);
  });

  it("marks a satellite as one, and draws it smaller", () => {
    const placed = plate([one(0, 0, 0.1), one(0.3, 0, 0.02, true)]);
    expect(placed.colonies.map((c) => c.satellite)).toEqual([false, true]);
    const across = (ring: readonly (readonly number[])[]): number =>
      Math.max(...ring.map((a) => Math.max(...ring.map((b) => Math.hypot(...a.map((v, i) => v - b[i]!))))));
    expect(across(placed.colonies[1]!.ring)).toBeLessThan(across(placed.colonies[0]!.ring));
  });

  it("gives a colony of no size something to draw, rather than nothing", () => {
    const [only] = plate([one(0, 0, 0)]).colonies;
    const spread = Math.max(...only!.ring.map((a) => Math.hypot(...a.map((v, i) => v - only!.ring[0]![i]!))));
    expect(spread).toBeGreaterThan(0);
  });

  it("says it has run together when it has, and nothing when it has not", () => {
    expect(plate([one(0, 0)], true).labels.map((l) => l.key)).toContain("overgrown");
    expect(plate([one(0, 0)], false).labels.map((l) => l.key)).not.toContain("overgrown");
  });

  it("draws a plate somebody has covered in colonies without drawing all night", () => {
    const many = Array.from({ length: 2_000 }, (_, at) => one(Math.cos(at) * 0.9, Math.sin(at) * 0.9, 0.02));
    expect(plate(many).colonies.length).toBeLessThanOrEqual(200);
  });
});
