/**
 * Counting cells under a microscope.
 *
 * What is checked is the two things the eyepiece cannot say: whether enough cells were counted for
 * the figure to mean anything, and whether the chamber was loaded at a density that can be counted
 * at all. The arithmetic that turns a count into cells a millilitre is checked too, in both
 * directions, because it is a factor of ten thousand and a factor of ten thousand is easy to drop.
 */
import { CHAMBERS, ENOUGH, OBJECTIVES, PER_SQUARE, alive, counting, dilutionFor, howSure,
         perMillilitre, squareVolume } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const neubauer = CHAMBERS[0]!;

describe("the chamber", () => {
  it("holds a ten-thousandth of a millilitre over a large square", () => {
    // A millimetre square, a tenth of a millimetre deep: 0.1 mm³, and a millilitre is 1000 mm³.
    expect(squareVolume(neubauer)).toBeCloseTo(1e-4, 12);
    for (const one of CHAMBERS) expect(squareVolume(one)).toBeGreaterThan(0);
  });

  it("has an objective for counting at, between finding the grid and looking at one cell", () => {
    expect(OBJECTIVES.map((one) => one.times)).toEqual([4, 10, 40]);
  });
});

describe("what a count comes to", () => {
  it("is the count a square, times ten thousand, times the dilution", () => {
    // 120 cells over 4 squares is 30 a square; 30 in a ten-thousandth of a millilitre is 3×10⁵;
    // one part sample to one part trypan blue doubles it to 6×10⁵.
    expect(perMillilitre(120, 4, 1)).toBeCloseTo(3e5, 6);
    expect(perMillilitre(120, 4, 2)).toBeCloseTo(6e5, 6);
  });

  it("is nothing when nothing was counted, rather than dividing by no squares", () => {
    expect(perMillilitre(100, 0)).toBe(0);
  });

  it("carries the stain's dilution, which is the factor most often dropped", () => {
    // Trypan blue is mixed one to one and then forgotten, and the culture reads half what it is.
    const neat = perMillilitre(120, 4, 1);
    expect(perMillilitre(120, 4, 2)).toBeCloseTo(neat * 2, 6);
  });
});

describe("whether the count means anything", () => {
  it("is the square root of it, which is a fifth of the answer at twenty-five cells", () => {
    expect(howSure(25)).toBeCloseTo(0.2, 9);
    expect(howSure(100)).toBeCloseTo(0.1, 9);
    expect(howSure(400)).toBeCloseTo(0.05, 9);
    expect(howSure(0)).toBe(Infinity);
  });

  it("says so when too few were counted, however tidy the figure looks", () => {
    const thin = counting(25, 4, 2);
    expect(thin.enough).toBe(false);
    expect(thin.says).toContain("20%");
    // And the figure it would have written down is still there, which is the point: it looks fine.
    expect(thin.perMl).toBeGreaterThan(0);
  });

  it("says so when the squares were too crowded to count honestly", () => {
    // Eighty a square: they overlap, two touching are counted as one, and the answer comes out low.
    const crowded = counting(320, 4, 1);
    expect(crowded.counted).toBeGreaterThanOrEqual(ENOUGH);
    expect(crowded.loaded).toBe("too many");
    expect(crowded.says).toContain("Dilute");
  });

  it("is content with a hundred cells at thirty a square", () => {
    const good = counting(120, 4, 2);
    expect(good.enough).toBe(true);
    expect(good.loaded).toBe("about right");
    expect(good.perSquare).toBeCloseTo(30, 9);
  });
});

describe("how much to dilute it first", () => {
  it("aims for a square somebody can count", () => {
    const times = dilutionFor(1e8);
    const perSquare = (1e8 / times) * squareVolume(neubauer);
    expect(perSquare).toBeGreaterThanOrEqual(PER_SQUARE.fewest);
    expect(perSquare).toBeLessThanOrEqual(PER_SQUARE.most);
  });

  it("is a dilution somebody can actually pipette", () => {
    for (const guess of [1e6, 5e6, 1e7, 3e7, 1e8, 1e9]) {
      const times = dilutionFor(guess);
      const within = times / 10 ** Math.floor(Math.log10(times));
      expect([1, 2, 5, 10], `${guess} gave ${times}`).toContain(within);
    }
  });

  it("does not dilute what is already thin enough", () => {
    expect(dilutionFor(1e5)).toBe(1);
    expect(dilutionFor(0)).toBe(1);
  });
});

describe("how much of it is alive", () => {
  it("is what took no stain, over everything counted", () => {
    expect(alive(90, 10).fraction).toBeCloseTo(0.9, 9);
    expect(alive(90, 10).counted).toBe(100);
    expect(alive(0, 0).fraction).toBe(0);
  });

  it("needs as many cells as any other count before it means anything", () => {
    expect(alive(18, 2).enough, "twenty cells").toBe(false);
    expect(alive(90, 10).enough).toBe(true);
  });
});
