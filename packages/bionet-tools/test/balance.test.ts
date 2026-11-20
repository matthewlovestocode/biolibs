/**
 * Weighing something out.
 *
 * What is checked is the two things the balance itself cannot say: whether the mass belongs to the
 * bottle in your hand, and whether this balance can mean anything about a mass that size. The
 * arithmetic in between is checked too, but it is the easy half.
 */
import { BALANCES, BY_PERCENT, REAGENTS, WITHIN, balanceFor, byDryMass, fromStock, leastWeighable,
         massFor, molarityOf, percentMass, said, shown, waterIn, weighing } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const bench = BALANCES[0]!;
const analytical = BALANCES[1]!;

describe("what to weigh out", () => {
  it("is the concentration times the volume times what a mole weighs", () => {
    expect(massFor(0.5, 1, 58.44)).toBeCloseTo(29.22, 6);
    expect(massFor(0.05, 0.5, 121.14)).toBeCloseTo(3.0285, 6);
  });

  it("reads back the other way, so a weighing can be checked against its label", () => {
    expect(molarityOf(massFor(0.2, 0.25, 372.24), 0.25, 372.24)).toBeCloseTo(0.2, 9);
    expect(molarityOf(5, 0, 58.44)).toBe(0);
  });

  it("is grams in a hundred millilitres where a thing has no molecular weight worth using", () => {
    // Agarose is a polymer of no fixed length and yeast extract is a mixture, so both are weighed
    // as a fraction of the volume. A one per cent gel in fifty millilitres is half a gram.
    expect(percentMass(1, 50)).toBeCloseTo(0.5, 9);
    expect(percentMass(1.5, 400)).toBeCloseTo(6, 9);
    for (const one of BY_PERCENT) expect(one.percent).toBeGreaterThan(0);
  });
});

describe("a bottle that is mostly water", () => {
  const hydrates = REAGENTS.filter((one) => one.dry !== undefined);

  it("is half the reagents on the shelf, which is why this is the mistake it is", () => {
    expect(hydrates.length).toBeGreaterThanOrEqual(5);
    for (const one of hydrates) expect(one.formula, `${one.name} says what it carries`).toContain("H₂O");
  });

  it("makes a solution weak by the water it carries, and nothing about the weighing goes wrong", () => {
    const magnesium = REAGENTS.find((one) => one.name.startsWith("Magnesium sulfate"))!;
    // 120.37 of dry salt against 246.47 in the bottle: a 1 M stock comes out at 0.49 M.
    expect(byDryMass(magnesium)).toBeCloseTo(0.4883, 3);
    expect(waterIn(magnesium)).toBeCloseTo(0.5117, 3);
    // Which is the whole point: it is not a small error, it is a factor of two.
    expect(byDryMass(magnesium)).toBeLessThan(0.55);
  });

  it("says nothing where the bottle holds no water", () => {
    const salt = REAGENTS.find((one) => one.name === "Sodium chloride")!;
    expect(salt.dry).toBeUndefined();
    expect(byDryMass(salt)).toBe(null);
    expect(waterIn(salt)).toBe(null);
  });

  it("carries the heavier mass as the bottle's own, so the arithmetic is right by default", () => {
    // The mistake is using the dry mass. Every hydrate here is written with the hydrate's mass as
    // `mass`, so somebody who reads nothing and weighs what it says is right.
    for (const one of hydrates) expect(one.mass, one.name).toBeGreaterThan(one.dry!);
  });
});

describe("whether this balance can mean it", () => {
  it("cannot say anything about twenty milligrams on two decimal places", () => {
    // The last digit is ten milligrams, so the reading is twenty give or take five: a quarter of
    // the mass, shown as a confident 0.02 g.
    const said = weighing(bench, 0.02);
    expect(said.enough).toBe(false);
    expect(said.error).toBeGreaterThan(0.2);
  });

  it("cannot either, on four decimal places, which is the answer people do not expect", () => {
    // Half of a tenth of a milligram against twenty milligrams is a quarter of a per cent, and the
    // tolerance here is a tenth of one. The finer balance is better and still not good enough, so
    // the answer to a mass this small is not a better balance: it is a stock, weighed large and
    // taken small. That is what the section below is for.
    const said = weighing(analytical, 0.02);
    expect(said.enough).toBe(false);
    expect(said.error).toBeGreaterThan(WITHIN);
    // It does mean a hundred milligrams, which is where this balance starts being worth having.
    expect(weighing(analytical, 0.1).enough).toBe(true);
    expect(weighing(analytical, 0.1).error).toBeLessThan(WITHIN);
  });

  it("is a half-digit over the error you will carry, and nothing cleverer", () => {
    expect(leastWeighable(bench)).toBeCloseTo(5, 9);
    expect(leastWeighable(analytical)).toBeCloseTo(0.05, 9);
    expect(leastWeighable(bench, 0.01)).toBeCloseTo(0.5, 9);
  });

  it("picks the coarser balance where it will do, and the finer where it will not", () => {
    expect(balanceFor(29.22)).toBe(bench);
    expect(balanceFor(0.1)).toBe(analytical);
    // And says so plainly when neither will, which is a mass small enough to want a stock.
    expect(balanceFor(0.02)).toBe(null);
    expect(balanceFor(0.001)).toBe(null);
    // Nor will it send three kilos to the analytical balance, which tops out at 220 g.
    expect(balanceFor(3000)).toBe(null);
  });

  it("rounds to what the display can actually show", () => {
    expect(weighing(bench, 29.224).reads).toBeCloseTo(29.22, 9);
    expect(weighing(analytical, 0.02004).reads).toBeCloseTo(0.02, 9);
  });
});

describe("taking it from a stock instead", () => {
  it("is what you do when the mass is too small to weigh", () => {
    // 50 mM of magnesium in 10 mL is 0.1 g of the hexahydrate — fine. In 1 mL it is 10 mg, which
    // the bench balance cannot say anything about, and the stock is the way round it.
    const take = fromStock(50, 500, 1000)!;
    expect(take.stock).toBeCloseTo(25, 9);
    expect(take.diluent).toBeCloseTo(475, 9);
    expect(take.fold).toBeCloseTo(20, 9);
  });

  it("refuses what cannot be done by dilution", () => {
    expect(fromStock(2000, 10, 1000), "stronger than the stock").toBe(null);
    expect(fromStock(0, 10, 1000)).toBe(null);
    expect(fromStock(50, 0, 1000)).toBe(null);
  });

  it("gives back the whole volume as stock where the two are the same", () => {
    const take = fromStock(1000, 10, 1000)!;
    expect(take.stock).toBeCloseTo(10, 9);
    expect(take.diluent).toBeCloseTo(0, 9);
    expect(take.fold).toBe(1);
  });
});

describe("saying a mass the way somebody would say it", () => {
  it("drops the noughts nobody would read out", () => {
    // Reported as the tool not making sense, and this was most of it: a balance that reads to a
    // hundredth of a gram was described as reading to "10.00 mg", and five grams as "5.000 g".
    expect(said(5)).toBe("5 g");
    expect(said(14.61)).toBe("14.61 g");
    expect(said(0.05)).toBe("50 mg");
    expect(said(0.0205)).toBe("20.5 mg");
    expect(said(61.617)).toBe("61.617 g");
  });

  it("says a balance's last digit in grams, which is how a balance is described", () => {
    // Nobody calls a two-place balance a ten-milligram balance; they call it 0.01 g.
    expect(shown(bench.readability, bench)).toBe("0.01 g");
    expect(shown(analytical.readability, analytical)).toBe("0.0001 g");
    // And a reading is shown to the places the display actually has.
    expect(shown(14.61, bench)).toBe("14.61 g");
    expect(shown(14.61, analytical)).toBe("14.6100 g");
  });
});
