/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { bandPosition, bandsOf, DEFAULT_TOLERANCE, fragmentSizes, GELS, gelById, LADDERS, ladderBands,
  ladderById, resolves } from "@biolibs/gel";
import { describe, expect, it } from "vitest";

const gel = gelById("1.0");

describe("README: gels and ladders", () => {
  it("lists the concentrations and the markers", () => {
    expect(GELS.map((g) => [g.percent, g.largest, g.smallest]))
      .toEqual([[0.8, 15000, 500], [1, 10000, 250], [1.5, 4000, 100], [2, 2000, 50]]);
    expect(gelById("1.0")).toEqual({ id: "1.0", percent: 1, largest: 10000, smallest: 250 });
    expect(gelById("2.0").smallest).toBe(50);

    expect(LADDERS.map((l) => [l.id, l.sizes.length])).toEqual([["1kb", 10], ["100bp", 11]]);
    expect(ladderById("1kb").sizes[0]).toBe(10000);

    expect(() => gelById("3.0"))
      .toThrowError("unknown gel '3.0'; known gels are 0.8, 1.0, 1.5, 2.0");
  });
});

describe("README: where a fragment runs", () => {
  it("puts the range's ends at 0 and 1 and its geometric mean at 0.5", () => {
    expect(bandPosition(10000, gel)).toBe(0);
    expect(bandPosition(250, gel)).toBe(1);
    expect(bandPosition(1581, gel)).toBeCloseTo(0.5, 4);
    expect(Math.round(Math.sqrt(10000 * 250))).toBe(1581);

    expect(bandPosition(2000, gel).toFixed(4)).toBe("0.4363");
    expect(bandPosition(1000, gel).toFixed(4)).toBe("0.6242");
    expect(bandPosition(500, gel).toFixed(4)).toBe("0.8121");
  });

  it("clamps outside the range rather than extrapolating", () => {
    expect(bandPosition(50000, gel)).toBe(0);
    expect(bandPosition(10, gel)).toBe(1);

    expect(resolves(1000, gel)).toBe(true);
    expect(resolves(10000, gel)).toBe(true);
    expect(resolves(20000, gel)).toBe(false);
    expect(resolves(100, gel)).toBe(false);
  });
});

describe("README: fragment sizes from cut positions", () => {
  it("cuts a circle and a line", () => {
    expect(fragmentSizes(2686, "circular", [395, 1230])).toEqual([1851, 835]);
    expect(fragmentSizes(2686, "circular", [395])).toEqual([2686]);
    expect(fragmentSizes(2686, "circular", [])).toEqual([2686]);
    expect(fragmentSizes(1000, "linear", [100, 400])).toEqual([600, 300, 100]);
    expect(fragmentSizes(1000, "circular", [100, 400])).toEqual([700, 300]);
  });

  it("ignores the ends of a line, duplicates and order", () => {
    expect(fragmentSizes(1000, "linear", [0, 400, 1000])).toEqual([600, 400]);
    expect(fragmentSizes(1000, "linear", [400, 400])).toEqual([600, 400]);
    expect(fragmentSizes(1000, "linear", [400, 100])).toEqual([600, 300, 100]);
    expect(() => fragmentSizes(1000, "linear", [1001]))
      .toThrowError("cut position 1001 is outside a sequence of 1000 bases");
  });
});

describe("README: reading a lane", () => {
  it("shows a pUC19 double digest as two resolved bands", () => {
    const bands = bandsOf(fragmentSizes(2686, "circular", [395, 1230]), gel);
    expect(bands.map((b) => [b.size, b.position.toFixed(4), b.totalBases, b.intensity.toFixed(4)]))
      .toEqual([[1851, "0.4573", 1851, "1.0000"], [835, "0.6731", 835, "0.4511"]]);
    expect(bands.every((b) => !b.unresolved)).toBe(true);
  });

  it("adds up the DNA in a merged band", () => {
    expect(bandsOf([1000, 1000, 2000], gel).map((b) => [b.size, b.totalBases, b.intensity]))
      .toEqual([[2000, 2000, 1], [1000, 2000, 1]]);
  });

  it("merges what the eye could not separate", () => {
    expect(DEFAULT_TOLERANCE).toBe(0.03);
    expect(bandsOf([2000, 2010, 500], gel).map((b) => [b.size, [...b.sizes]]))
      .toEqual([[2010, [2010, 2000]], [500, [500]]]);
    expect(bandsOf([2000, 2010, 500], gel, 0).map((b) => b.size)).toEqual([2010, 2000, 500]);
  });

  it("anchors merging on the band's largest fragment", () => {
    expect(bandsOf([1000, 980, 960, 940], gel).map((b) => [...b.sizes]))
      .toEqual([[1000, 980], [960, 940]]);
  });

  it("merges both ends of the range, whatever the tolerance", () => {
    const small = bandsOf([3000, 200, 100, 60], gel);
    expect(small.map((b) => [b.size, [...b.sizes], b.unresolved]))
      .toEqual([[3000, [3000], false], [200, [200, 100, 60], true]]);
    expect(small[1]!.position).toBe(1);
    expect(small[0]!.position.toFixed(4)).toBe("0.3264");

    const large = bandsOf([30000, 20000, 5000], gel);
    expect(large.map((b) => [b.size, [...b.sizes], b.unresolved]))
      .toEqual([[30000, [30000, 20000], true], [5000, [5000], false]]);
    expect(large[0]!.position).toBe(0);
    expect(large[1]!.position.toFixed(4)).toBe("0.1879");
  });
});

describe("README: running a ladder", () => {
  it("gives one band per marker, evenly bright", () => {
    const markers = ladderBands(ladderById("1kb").sizes, gel);
    expect(markers.map((b) => [b.size, b.position.toFixed(4)])).toEqual([
      [10000, "0.0000"], [8000, "0.0605"], [6000, "0.1385"], [5000, "0.1879"], [4000, "0.2484"],
      [3000, "0.3264"], [2000, "0.4363"], [1500, "0.5143"], [1000, "0.6242"], [500, "0.8121"],
    ]);
    expect(markers.every((b) => b.intensity === 1)).toBe(true);
  });

  it("flags unresolved markers without merging them", () => {
    expect(ladderBands([1000, 200, 100], gelById("1.0")).map((b) => [b.size, b.unresolved]))
      .toEqual([[1000, false], [200, true], [100, true]]);
  });
});

describe("README: choosing a gel", () => {
  it("separates small fragments on a stiffer gel", () => {
    expect(bandsOf([150, 120], gelById("1.0")).map((b) => [b.size, [...b.sizes], b.unresolved]))
      .toEqual([[150, [150, 120], true]]);
    expect(bandsOf([150, 120], gelById("2.0"))
      .map((b) => [b.size, b.position.toFixed(4), b.unresolved]))
      .toEqual([[150, "0.7022", false], [120, "0.7627", false]]);
  });

  it("separates two in-range sizes by the same amount on both gels", () => {
    // Both gels span a factor of 40, so the same ratio of sizes is the same distance apart.
    const apart = Math.abs(bandPosition(1851, gelById("1.0")) - bandPosition(835, gelById("1.0")));
    const squeezed = Math.abs(bandPosition(1851, gelById("2.0")) - bandPosition(835, gelById("2.0")));
    expect(apart.toFixed(4)).toBe("0.2158");
    expect(squeezed.toFixed(4)).toBe("0.2158");
    expect(gelById("1.0").largest / gelById("1.0").smallest).toBe(40);
    expect(gelById("2.0").largest / gelById("2.0").smallest).toBe(40);
  });
});
