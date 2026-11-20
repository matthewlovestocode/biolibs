/**
 * Sterilising something.
 *
 * What is checked is the thing the gauge cannot say: that the chamber is not the load. A cycle is
 * an amount of killing rather than a length of time, and the arithmetic that turns one into the
 * other is the whole of this. The rest — a liquid on a fast exhaust, medium at 134 °C — is checked
 * because it ruins a cycle without touching the temperature at all.
 */
import { CYCLES, LOADS, REFERENCE, STERILE, Z, killing, middleOf, sterilising, trouble } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const dry = CYCLES[0]!;
const liquids = CYCLES[1]!;
const longer = CYCLES[2]!;
const quick = CYCLES[4]!;
const tips = LOADS[0]!;
const litre = LOADS.find((one) => one.name === "Medium, 1 L bottle")!;
const waste = LOADS.find((one) => one.name.startsWith("Waste"))!;

describe("how fast things die", () => {
  it("is ten times faster for every ten degrees", () => {
    expect(killing(REFERENCE)).toBeCloseTo(1, 9);
    expect(killing(REFERENCE - Z)).toBeCloseTo(0.1, 9);
    expect(killing(REFERENCE + Z)).toBeCloseTo(10, 9);
  });

  it("is why a cycle is an amount of killing and not a length of time", () => {
    // Twenty minutes at 111 °C is two minutes' worth of 121 °C: the same clock, a tenth of the job.
    expect(killing(111.1) * 20).toBeCloseTo(2, 6);
    expect(killing(131.1) * 2).toBeCloseTo(20, 6);
  });
});

describe("the middle of a load", () => {
  it("is a long way behind the chamber while the chamber is at temperature", () => {
    // A litre of medium, one time constant in, has closed about two thirds of the gap.
    expect(middleOf(121, 20, litre.constant, litre)).toBeLessThan(100);
    expect(middleOf(121, 20, litre.constant * 4, litre)).toBeGreaterThan(118);
  });

  it("arrives sooner the smaller it is, which is the only reason to split a load", () => {
    for (const [at, one] of LOADS.entries()) {
      if (at === 0) continue;
      expect(one.constant, one.name).toBeGreaterThanOrEqual(LOADS[at - 1]!.constant);
    }
    expect(middleOf(121, 20, 10, tips)).toBeGreaterThan(middleOf(121, 20, 10, litre));
  });
});

describe("what a cycle actually did", () => {
  it("sterilises tips in the cycle meant for them", () => {
    const done = sterilising(dry, tips);
    expect(done.sterile).toBe(true);
    expect(done.f0).toBeGreaterThan(STERILE);
  });

  it("does not sterilise a litre of medium in twenty minutes, however the tape looks", () => {
    // This is the case the tool exists for: the chamber was at 121 °C for the whole cycle, the
    // tape turned black, and the middle of the bottle never got near it.
    const done = sterilising(liquids, litre);
    expect(done.sterile).toBe(false);
    expect(done.f0).toBeLessThan(STERILE / 2);
    // What is wrong is when it arrived, not where it ended up: it is near 121 °C by the end and
    // has been there for a couple of minutes, which is the shape of the mistake exactly.
    expect(done.reached).toBeGreaterThan(liquids.celsius - 3);
    expect(done.says).toContain("the chamber was at temperature and the load was not");
  });

  it("says how long it would have to be held for instead of only that it failed", () => {
    const done = sterilising(liquids, litre);
    expect(done.needs).toBeGreaterThan(liquids.minutes);
    // And holding it that long does get there.
    const held = sterilising({ ...liquids, minutes: Math.ceil(done.needs) }, litre);
    expect(held.sterile).toBe(true);
  });

  it("counts the warming up as the slower killing it is, rather than ignoring it", () => {
    // If only the time at full temperature counted, a thirty-minute cycle on a litre would score
    // near nothing. It is worth something, and the something is what F₀ measures.
    const done = sterilising(longer, litre);
    expect(done.f0).toBeGreaterThan(0);
    expect(done.f0).toBeLessThan(longer.minutes);
  });

  it("gives a bag of waste a long cycle and still checks it", () => {
    const done = sterilising(CYCLES.find((one) => one.name.startsWith("Waste"))!, waste);
    expect(done.f0).toBeGreaterThan(0);
    expect(typeof done.sterile).toBe("boolean");
  });
});

describe("what else a cycle gets wrong", () => {
  it("catches a liquid on a fast exhaust, which empties the bottle onto the shelf", () => {
    const found = trouble(dry, litre);
    expect(found[0]!.ruins).toBe(true);
    expect(found[0]!.says).toContain("boils");
  });

  it("catches medium at 134 °C, which comes out brown", () => {
    const found = trouble(quick, litre);
    expect(found.some((one) => one.ruins && one.says.includes("caramelise"))).toBe(true);
  });

  it("is quiet about dry goods on a slow exhaust, which is only slow", () => {
    const found = trouble(liquids, tips);
    expect(found).toHaveLength(1);
    expect(found[0]!.ruins).toBe(false);
  });

  it("finds nothing wrong with the pairings the lab actually uses", () => {
    expect(trouble(liquids, litre)).toHaveLength(0);
    expect(trouble(dry, tips)).toHaveLength(0);
  });
});

describe("the cycles the lab actually runs", () => {
  it("passes the ones that are right, so the tool is not crying wolf every day", () => {
    // The first threshold written here marked the standard fifteen-minute cycle as failing,
    // because 121 °C is a tenth of a degree under the reference and fifteen minutes at it comes
    // to 14.7. A tool that fails the cycle a lab runs every day is not read twice.
    expect(sterilising(dry, tips).sterile, "tips, 15 min").toBe(true);
    expect(sterilising(liquids, LOADS.find((one) => one.name.includes("250"))!).sterile, "250 mL, 20 min").toBe(true);
    expect(sterilising(longer, litre).sterile, "a litre, 30 min").toBe(true);
  });

  it("still fails the one that is wrong, which is the whole point", () => {
    expect(sterilising(liquids, litre).sterile, "a litre, 20 min").toBe(false);
  });
});
