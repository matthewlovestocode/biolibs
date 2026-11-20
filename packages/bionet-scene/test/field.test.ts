/**
 * The inside of a cuvette, as numbers.
 *
 * The one thing this picture exists to keep straight is that the gap and the voltage are different
 * things, so what is checked is that the gap is drawn to scale and the field is drawn against what
 * the host is usually given — and that a cuvette with no cells in it, or more cells than anyone
 * would draw, still comes out as a picture.
 */
import { placeField } from "@biolibs/bionet-scene";
import { describe, expect, it } from "vitest";

const centre = [0, 1, 0] as const;
const camera = [0, 1, 2] as const;
const field = (gap: number, strength: number, usual: number | null = 7.5, cells = 12, taken = 2) =>
  placeField({ gap, strength, usual, cells, taken }, centre, camera, [0.5, 0.3]);

const widthOf = (placed: ReturnType<typeof field>): number => {
  const [left, right] = placed.electrodes;
  return Math.abs(left[0]![0] - right[0]![0]);
};

describe("the field in a cuvette", () => {
  it("draws a wider gap wider, which is the whole point of drawing it", () => {
    expect(widthOf(field(4, 7.5))).toBeGreaterThan(widthOf(field(2, 7.5)));
    expect(widthOf(field(2, 7.5))).toBeGreaterThan(widthOf(field(1, 7.5)));
    expect(widthOf(field(4, 7.5))).toBeCloseTo(widthOf(field(2, 7.5)) * 2, 6);
  });

  it("draws a weak field faintly and a strong one hard", () => {
    const weak = field(2, 3.75).lines[0]!.strength;
    const right = field(2, 7.5).lines[0]!.strength;
    expect(weak).toBeLessThan(right);
    expect(field(2, 11).lines[0]!.strength).toBeGreaterThan(right);
  });

  it("draws something for a host nobody has published settings for", () => {
    const unknown = field(2, 9, null);
    expect(unknown.lines.every((one) => one.strength > 0)).toBe(true);
  });

  it("marks the cells that took something up, and only those", () => {
    const placed = field(2, 7.5, 7.5, 12, 3);
    expect(placed.cells.filter((one) => one.taken)).toHaveLength(3);
    expect(placed.cells.filter((one) => one.dna !== null)).toHaveLength(3);
    expect(placed.cells).toHaveLength(12);
  });

  it("keeps every cell between the electrodes", () => {
    const placed = field(2, 7.5, 7.5, 24, 0);
    const [left, right] = [placed.electrodes[0]![0]![0], placed.electrodes[1]![0]![0]];
    for (const cell of placed.cells) {
      for (const point of cell.ring) {
        expect(point[0]).toBeGreaterThanOrEqual(Math.min(left, right) - 1e-6);
        expect(point[0]).toBeLessThanOrEqual(Math.max(left, right) + 1e-6);
      }
    }
  });

  it("survives a cuvette with nothing in it, and more cells than anyone would draw", () => {
    expect(field(2, 7.5, 7.5, 0, 0).cells).toEqual([]);
    expect(field(2, 7.5, 7.5, 1_000, 900).cells.length).toBeLessThanOrEqual(40);
  });

  it("never says more took it up than are drawn", () => {
    const placed = field(2, 7.5, 7.5, 6, 20);
    expect(placed.cells.filter((one) => one.taken).length).toBeLessThanOrEqual(placed.cells.length);
  });

  it("says the gap and the field, and the gap is not the voltage", () => {
    const said = field(2, 7.5).labels;
    expect(said.find((one) => one.key === "gap")!.text).toBe("2 mm");
    expect(said.find((one) => one.key === "field")!.text).toBe("7.5 kV/cm");
  });
});
