import { ValueError } from "@biolibs/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOLERANCE, GELS, LADDERS, bandPosition, bandsOf, fragmentSizes, gelById, ladderBands, ladderById, resolves,
} from "@biolibs/gel";

const gel = gelById("1.0");

describe("gels and ladders", () => {
  it("lists four agarose concentrations, lowest percentage first", () => {
    expect(GELS.map((g) => g.percent)).toEqual([0.8, 1.0, 1.5, 2.0]);
  });

  it("resolves a narrower range as the percentage rises", () => {
    for (let i = 1; i < GELS.length; i++) {
      expect(GELS[i]!.largest).toBeLessThan(GELS[i - 1]!.largest);
      expect(GELS[i]!.smallest).toBeLessThan(GELS[i - 1]!.smallest);
    }
  });

  it("gives every gel a range that runs the right way round", () => {
    for (const g of GELS) expect(g.smallest).toBeLessThan(g.largest);
  });

  it("looks a gel up by id and rejects an unknown one", () => {
    expect(gelById("1.5").percent).toBe(1.5);
    expect(() => gelById("3.0")).toThrow(ValueError);
    expect(() => gelById("3.0")).toThrow(/unknown gel '3.0'/);
  });

  it("lists ladder sizes largest first", () => {
    for (const ladder of LADDERS) {
      expect([...ladder.sizes]).toEqual([...ladder.sizes].sort((a, b) => b - a));
    }
  });

  it("looks a ladder up by id and rejects an unknown one", () => {
    expect(ladderById("100bp").sizes).toContain(100);
    expect(() => ladderById("50bp")).toThrow(ValueError);
  });
});

describe("bandPosition", () => {
  it("puts the gel's largest fragment at the wells and its smallest at the front", () => {
    expect(bandPosition(gel.largest, gel)).toBe(0);
    expect(bandPosition(gel.smallest, gel)).toBe(1);
  });

  it("puts the geometric mean of the two ends halfway down", () => {
    const middle = Math.sqrt(gel.largest * gel.smallest);
    expect(bandPosition(middle, gel)).toBeCloseTo(0.5, 10);
  });

  it("is monotonic: a smaller fragment always runs further", () => {
    let previous = -1;
    for (const size of [10000, 5000, 2000, 1000, 500, 250]) {
      const position = bandPosition(size, gel);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
  });

  it("clamps fragments outside the resolving range", () => {
    expect(bandPosition(50000, gel)).toBe(0);
    expect(bandPosition(10, gel)).toBe(1);
  });

  it("is linear in the logarithm of the size", () => {
    // Equal ratios should give equal steps: 8000/4000 and 2000/1000 are both twofold.
    const a = bandPosition(4000, gel) - bandPosition(8000, gel);
    const b = bandPosition(1000, gel) - bandPosition(2000, gel);
    expect(a).toBeCloseTo(b, 10);
  });

  it("rejects a size that is not a positive number", () => {
    expect(() => bandPosition(0, gel)).toThrow(ValueError);
    expect(() => bandPosition(-100, gel)).toThrow(ValueError);
    expect(() => bandPosition(Number.NaN, gel)).toThrow(ValueError);
  });

  it("puts everything at the front for a gel that separates nothing", () => {
    expect(bandPosition(500, { id: "x", percent: 1, largest: 500, smallest: 500 })).toBe(1);
  });
});

describe("resolves", () => {
  it("is true inside the range and false outside it, inclusive at both ends", () => {
    expect(resolves(gel.largest, gel)).toBe(true);
    expect(resolves(gel.smallest, gel)).toBe(true);
    expect(resolves(gel.largest + 1, gel)).toBe(false);
    expect(resolves(gel.smallest - 1, gel)).toBe(false);
  });
});

describe("bandsOf", () => {
  it("gives no bands for an empty lane", () => {
    expect(bandsOf([], gel)).toEqual([]);
  });

  it("keeps well-separated fragments apart, largest first", () => {
    const bands = bandsOf([500, 3000, 1200], gel);
    expect(bands.map((b) => b.size)).toEqual([3000, 1200, 500]);
  });

  it("merges fragments within the tolerance into one band", () => {
    const bands = bandsOf([2000, 2010, 500], gel);
    expect(bands).toHaveLength(2);
    expect(bands[0]!.sizes).toEqual([2010, 2000]);
    expect(bands[0]!.size).toBe(2010);
  });

  it("keeps fragments just outside the tolerance apart", () => {
    // 3% of 2000 is 60, so 1939 is further away than the tolerance allows.
    expect(bandsOf([2000, 1939], gel, DEFAULT_TOLERANCE)).toHaveLength(2);
    expect(bandsOf([2000, 1941], gel, DEFAULT_TOLERANCE)).toHaveLength(1);
  });

  it("keeps every distinct size apart at zero tolerance", () => {
    expect(bandsOf([2000, 2001, 2002], gel, 0)).toHaveLength(3);
  });

  it("still merges exactly equal sizes at zero tolerance", () => {
    const bands = bandsOf([2000, 2000], gel, 0);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.sizes).toEqual([2000, 2000]);
  });

  it("runs everything below the gel's range together at the front", () => {
    const bands = bandsOf([1000, 200, 120, 60], gel);
    expect(bands).toHaveLength(2);
    const front = bands[1]!;
    expect(front.unresolved).toBe(true);
    expect(front.sizes).toEqual([200, 120, 60]);
    expect(front.position).toBe(1);
  });

  it("runs everything above the gel's range together at the wells", () => {
    // The large end is the mirror of the small one: a 1% gel separates nothing over 10 kb, so two such
    // fragments sit at the same place and must not be reported as two resolved bands.
    const bands = bandsOf([30000, 20000, 5000], gel);
    expect(bands).toHaveLength(2);
    const wells = bands[0]!;
    expect(wells.unresolved).toBe(true);
    expect(wells.sizes).toEqual([30000, 20000]);
    expect(wells.position).toBe(0);
    expect(bands[1]!.unresolved).toBe(false);
  });

  it("does not mark a band inside the range as unresolved", () => {
    expect(bandsOf([1000], gel)[0]!.unresolved).toBe(false);
    // The range is inclusive at both ends.
    expect(bandsOf([10000, 250], gel).every((b) => !b.unresolved)).toBe(true);
  });

  it("anchors merging on the band's representative, so near-neighbours cannot chain", () => {
    // 980 is within 3% of 1000, but 960 is not, so a second band starts there and takes 940 with it.
    expect(bandsOf([1000, 980, 960, 940], gel).map((b) => [...b.sizes]))
      .toEqual([[1000, 980], [960, 940]]);
  });

  it("totals the base pairs in each band and scales intensity to the heaviest", () => {
    const bands = bandsOf([3000, 1000, 1010], gel);
    const heavy = bands.find((b) => b.size === 3000)!;
    const light = bands.find((b) => b.size === 1010)!;
    expect(heavy.totalBases).toBe(3000);
    expect(light.totalBases).toBe(2010);
    expect(heavy.intensity).toBe(1);
    expect(light.intensity).toBeCloseTo(2010 / 3000, 10);
  });

  it("accounts for every fragment loaded exactly once", () => {
    const sizes = [5000, 3000, 3010, 1000, 400, 90, 60];
    const bands = bandsOf(sizes, gel);
    const flattened = bands.flatMap((b) => [...b.sizes]).sort((a, b) => a - b);
    expect(flattened).toEqual([...sizes].sort((a, b) => a - b));
  });

  it("rejects a bad size or tolerance", () => {
    expect(() => bandsOf([0], gel)).toThrow(ValueError);
    expect(() => bandsOf([-5], gel)).toThrow(ValueError);
    expect(() => bandsOf([100], gel, -0.1)).toThrow(ValueError);
  });
});

describe("ladderBands", () => {
  it("gives one band per marker, largest first and all of equal intensity", () => {
    const bands = ladderBands(ladderById("1kb").sizes, gel);
    expect(bands).toHaveLength(10);
    expect(bands[0]!.size).toBe(10000);
    expect(bands.every((b) => b.intensity === 1)).toBe(true);
    expect(bands.every((b) => b.sizes.length === 1)).toBe(true);
  });

  it("marks markers below the gel's range as unresolved without merging them", () => {
    const bands = ladderBands([1000, 200, 100], gel);
    expect(bands).toHaveLength(3);
    expect(bands.map((b) => b.unresolved)).toEqual([false, true, true]);
  });
});

describe("fragmentSizes", () => {
  it("gives the whole sequence when nothing cuts", () => {
    expect(fragmentSizes(1000, "linear", [])).toEqual([1000]);
    expect(fragmentSizes(1000, "circular", [])).toEqual([1000]);
  });

  it("splits a line into one more piece than there are cuts", () => {
    expect(fragmentSizes(1000, "linear", [100, 400])).toEqual([600, 300, 100]);
  });

  it("splits a circle into as many pieces as there are cuts, one spanning the origin", () => {
    expect(fragmentSizes(1000, "circular", [100, 400])).toEqual([700, 300]);
  });

  it("leaves a circle cut once whole but linear", () => {
    expect(fragmentSizes(1000, "circular", [250])).toEqual([1000]);
  });

  it("totals the sequence length whatever the topology", () => {
    for (const topology of ["linear", "circular"] as const) {
      const sizes = fragmentSizes(2686, topology, [395, 1230, 2100]);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(2686);
    }
  });

  it("counts a position cut by two enzymes once", () => {
    expect(fragmentSizes(1000, "linear", [400, 400])).toEqual([600, 400]);
  });

  it("ignores cuts at the existing ends of a line", () => {
    expect(fragmentSizes(1000, "linear", [0, 400, 1000])).toEqual([600, 400]);
  });

  it("takes cuts in any order", () => {
    expect(fragmentSizes(1000, "linear", [400, 100])).toEqual(fragmentSizes(1000, "linear", [100, 400]));
  });

  it("returns the sizes largest first", () => {
    const sizes = fragmentSizes(5000, "circular", [100, 900, 1200, 4000]);
    expect([...sizes]).toEqual([...sizes].sort((a, b) => b - a));
  });

  it("gives nothing for an empty sequence", () => {
    expect(fragmentSizes(0, "linear", [])).toEqual([]);
  });

  it("rejects a bad length or an out-of-range cut", () => {
    expect(() => fragmentSizes(-1, "linear", [])).toThrow(ValueError);
    expect(() => fragmentSizes(10.5, "linear", [])).toThrow(ValueError);
    expect(() => fragmentSizes(1000, "linear", [1001])).toThrow(ValueError);
    expect(() => fragmentSizes(1000, "linear", [-1])).toThrow(ValueError);
    expect(() => fragmentSizes(1000, "linear", [1.5])).toThrow(ValueError);
  });
});

describe("a digest on a gel", () => {
  it("shows a pUC19 double digest as two resolved bands", () => {
    // pUC19 is 2686 bp; cutting at two places gives pieces of 835 and 1851 bp.
    const sizes = fragmentSizes(2686, "circular", [395, 1230]);
    expect(sizes).toEqual([1851, 835]);
    const bands = bandsOf(sizes, gelById("1.0"));
    expect(bands).toHaveLength(2);
    expect(bands.every((b) => !b.unresolved)).toBe(true);
    expect(bands[0]!.position).toBeLessThan(bands[1]!.position);
  });
});
