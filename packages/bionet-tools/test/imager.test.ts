/**
 * A photograph of a gel, read.
 *
 * The forward model is tested in the gel package, so what is checked here is the reading: that a
 * lane of known sizes read back gives those sizes, and that each of the three ways a picture of a
 * gel misleads is caught — an exposure that has run into the top of the camera, a band read past
 * the end of the ladder, and a band that looks fainter because it is shorter.
 */
import { gelById, ladderBands, ladderById, bandPosition } from "@biolibs/gel";
import { COMPRESSED, SATURATED, exposure, laneAgainst, readLane, whyFainter } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const gel = gelById("1.0");
const ladder = ladderBands(ladderById("1kb").sizes, gel);
/** A band measured where a fragment of this size really ran, at a given brightness. */
const at = (size: number, brightness = 0.6) => ({ position: bandPosition(size, gel), brightness });

describe("reading a lane", () => {
  it("gives back the sizes that ran there", () => {
    const read = readLane([at(3_000), at(1_000), at(500)], ladder);
    expect(read.map((one) => one.size)).toEqual([3_000, 1_000, 500]);
  });

  it("says which markers each was read between", () => {
    // 1,250 is between the ladder's 1,500 and 1,000, and is neither.
    const [one] = readLane([at(1_250)], ladder);
    expect(one!.between[0]).toBeGreaterThan(1_250);
    expect(one!.between[1]).toBeLessThan(1_250);
    // A band that ran exactly where a marker did is read against that marker and the next.
    expect(readLane([at(1_500)], ladder)[0]!.between).toContain(1_500);
  });

  it("says when a band ran past the end of the ladder, where the number is arithmetic and not a measurement", () => {
    // A short ladder, so there is room on the gel either side of it to run past.
    const short = ladderBands([3_000, 1_000], gel);
    expect(readLane([at(5_000)], short)[0]!.extrapolated).toBe(true);
    expect(readLane([at(600)], short)[0]!.extrapolated).toBe(true);
    expect(readLane([at(2_000)], short)[0]!.extrapolated).toBe(false);
  });

  it("says when a band is up where the gel has stopped separating", () => {
    expect(readLane([{ position: COMPRESSED / 2, brightness: 0.5 }], ladder)[0]!.compressed).toBe(true);
    expect(readLane([{ position: 0.5, brightness: 0.5 }], ladder)[0]!.compressed).toBe(false);
  });

  it("counts molecules rather than brightness, since the stain binds along the DNA", () => {
    // Two bands, one three times the length at three times the brightness: the same molar amount,
    // so the same share. Reading brightness alone would say one holds three times the other.
    const [big, small] = readLane([at(3_000, 0.9), at(1_000, 0.3)], ladder);
    expect(big!.share).toBeCloseTo(0.5, 2);
    expect(small!.share).toBeCloseTo(0.5, 2);
  });

  it("says nothing about shares when there is nothing to divide", () => {
    expect(readLane([], ladder)).toEqual([]);
    // A band with no brightness in it is not a band holding no molecules; it is nothing measured.
    expect(readLane([at(1_000, 0)], ladder)[0]!.share).toBeNull();
  });

  it("reads nothing off a ladder too short to read between", () => {
    const [one] = readLane([at(1_000)], [{ size: 1_000, position: 0.5 }]);
    expect(one!.size).toBe(0);
    expect(one!.extrapolated).toBe(true);
  });
});

describe("what the exposure did", () => {
  it("passes a picture with nothing at either end of what the camera records", () => {
    expect(exposure([at(3_000, 0.8), at(1_000, 0.5)]).ok).toBe(true);
  });

  it("fails one where more than one band has run into the top", () => {
    const burnt = exposure([at(3_000, 1), at(1_000, SATURATED)]);
    expect(burnt.ok).toBe(false);
    expect(burnt.saturated).toBe(2);
    // The thing worth saying: it is the better-looking picture.
    expect(burnt.says).toContain("look worse and say more");
  });

  it("lets one saturated band through, saying what can and cannot be read off it", () => {
    const one = exposure([at(3_000, 1), at(1_000, 0.4)]);
    expect(one.ok).toBe(true);
    expect(one.says).toContain("size can still be read");
  });

  it("warns about a band barely above nothing, and says absence is not absence", () => {
    const thin = exposure([at(3_000, 0.5), at(1_000, 0.03)]);
    expect(thin.faint).toBe(1);
    expect(thin.says).toContain("not in the tube");
  });

  it("says so when nothing has been measured at all", () => {
    expect(exposure([]).ok).toBe(false);
  });
});

describe("a lane against what was expected of it", () => {
  it("matches every band and says so when the gel shows what it should", () => {
    const read = readLane([at(2_806), at(2_206)], ladder);
    const how = laneAgainst(read, [2_806, 2_206]);
    expect(how.missing).toEqual([]);
    expect(how.extra).toEqual([]);
    expect(how.says[0]).toContain("Every band expected is there");
  });

  it("names what is missing, and the three reasons it might be", () => {
    const how = laneAgainst(readLane([at(2_806)], ladder), [2_806, 2_206]);
    expect(how.missing).toEqual([2_206]);
    expect(how.says[0]).toContain("not in the tube");
  });

  it("names what is there that nothing expected, and what leaves such a band", () => {
    const how = laneAgainst(readLane([at(2_806), at(5_012)], ladder), [2_806]);
    expect(how.extra).toHaveLength(1);
    expect(how.says.join(" ")).toContain("partial cut");
  });

  it("never claims one band as two expected sizes", () => {
    // Two expectations close enough that one band is within tolerance of both.
    const how = laneAgainst(readLane([at(2_000)], ladder), [2_000, 2_050]);
    expect(how.expected.filter((one) => one.seen !== null)).toHaveLength(1);
    expect(how.missing).toHaveLength(1);
  });
});

describe("why one band looks fainter than another", () => {
  it("says it holds more, when it is shorter by more than it is fainter", () => {
    const said = whyFainter({ size: 500, brightness: 0.3 }, { size: 3_000, brightness: 0.9 })!;
    expect(said).toContain("not fewer");
  });

  it("says it really holds less, when it is fainter by more than it is short", () => {
    const said = whyFainter({ size: 2_500, brightness: 0.1 }, { size: 3_000, brightness: 0.9 })!;
    expect(said).toContain("really is less of it");
  });

  it("says they hold about the same, when the two cancel", () => {
    const said = whyFainter({ size: 1_000, brightness: 0.3 }, { size: 3_000, brightness: 0.9 })!;
    expect(said).toContain("roughly the same");
  });

  it("says nothing when the fainter one is not fainter", () => {
    expect(whyFainter({ size: 500, brightness: 0.9 }, { size: 3_000, brightness: 0.3 })).toBeNull();
  });
});
