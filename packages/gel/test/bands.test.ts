/**
 * A gel read backwards: where a band landed, into the size that landed there.
 *
 * The forward model is checked elsewhere. What is checked here is that the inverse is the inverse —
 * round-tripping every size through both gives it back — and that reading against a ladder says so
 * when it had to extrapolate, which is the one case where the number it gives means very little.
 */
import { ValueError } from "@biolibs/core";
import { describe, expect, it } from "vitest";
import { bandPosition, gelById, ladderBands, ladderById, sizeAt, sizeFromLadder } from "@biolibs/gel";

describe("reading a gel backwards", () => {
  const gel = gelById("1.0");

  it("undoes bandPosition exactly, over the range the gel separates", () => {
    for (const size of [10_000, 5_000, 1_581, 800, 250]) {
      expect(sizeAt(bandPosition(size, gel), gel)).toBeCloseTo(size, 6);
    }
  });

  it("refuses a position that is not on the gel", () => {
    for (const position of [-0.1, 1.1, Number.NaN]) expect(() => sizeAt(position, gel)).toThrow(ValueError);
  });

  it("reads a size off the ladder that ran beside it, not off the model", () => {
    const ladder = ladderBands(ladderById("1kb").sizes, gel);
    // A band that ran exactly where a marker did reads as that marker.
    for (const marker of ladder.filter((one) => !one.unresolved)) {
      expect(sizeFromLadder(marker.position, ladder).size).toBeCloseTo(marker.size, 4);
    }
  });

  it("names the two markers it read between", () => {
    const ladder = ladderBands([3_000, 1_000], gel);
    const between = sizeFromLadder((ladder[0]!.position + ladder[1]!.position) / 2, ladder);
    expect(between.between).toEqual([3_000, 1_000]);
    // Half way between in the logarithm is the geometric mean, not the arithmetic one.
    expect(between.size).toBeCloseTo(Math.sqrt(3_000 * 1_000), 3);
    expect(between.extrapolated).toBe(false);
  });

  it("says when it had to extrapolate rather than interpolate", () => {
    const ladder = ladderBands([3_000, 1_000], gel);
    expect(sizeFromLadder(ladder[0]!.position - 0.05, ladder).extrapolated).toBe(true);
    expect(sizeFromLadder(ladder[1]!.position + 0.05, ladder).extrapolated).toBe(true);
    expect(sizeFromLadder(ladder[0]!.position, ladder).extrapolated).toBe(false);
  });

  it("refuses a ladder too short to read anything between", () => {
    expect(() => sizeFromLadder(0.5, ladderBands([1_000], gel))).toThrow(ValueError);
    expect(() => sizeFromLadder(0.5, [])).toThrow(ValueError);
  });

  it("says something rather than dividing by zero for two markers at the same place", () => {
    const stuck = [{ size: 20_000, position: 0 }, { size: 30_000, position: 0 }];
    expect(sizeFromLadder(0, stuck).size).toBe(20_000);
  });
});
