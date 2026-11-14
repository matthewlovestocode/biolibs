/**
 * `pyRoundTo` against Python's `round(x, ndigits)`.
 *
 * The answers below are what CPython gives. They are here rather than in a golden file because what is
 * being pinned is a handful of ties, each chosen for a reason, and the reason is easier to read beside the
 * value than in a generated list.
 */
import { pyRoundTo } from "@biolibs/core";
import { describe, expect, it } from "vitest";

describe("pyRoundTo: Python's round(x, ndigits)", () => {
  it("sends an exact tie to the even digit", () => {
    // 0.0625 and 0.1875 are both exactly representable, so each really is a tie at three decimals, and
    // Python breaks it towards the even digit in opposite directions.
    expect(pyRoundTo(0.0625, 3)).toBe(0.062);
    expect(pyRoundTo(0.1875, 3)).toBe(0.188);
    expect(pyRoundTo(-0.0625, 3)).toBe(-0.062);
  });

  it("decides from the exact value, not from the value scaled up", () => {
    // These three only look like ties. As doubles, 0.4165 sits a little below the midpoint and 0.0005 and
    // 123.4565 a little above, so each goes the way its exact value points — which multiplying by 1000
    // first would get wrong.
    expect(pyRoundTo(0.4165, 3)).toBe(0.416);
    expect(pyRoundTo(0.0005, 3)).toBe(0.001);
    expect(pyRoundTo(123.4565, 3)).toBe(123.457);
  });

  it("rounds to whole numbers the same way", () => {
    expect(pyRoundTo(0.5, 0)).toBe(0);
    expect(pyRoundTo(1.5, 0)).toBe(2);
    expect(pyRoundTo(2.5, 0)).toBe(2);
    // Python keeps the sign: round(-0.5) is -0.0.
    expect(Object.is(pyRoundTo(-0.5, 0), -0)).toBe(true);
  });

  it("leaves the ordinary cases alone", () => {
    expect(pyRoundTo(0.1495008295908895, 3)).toBe(0.15);
    expect(pyRoundTo(0.9995, 3)).toBe(1.0);
    expect(pyRoundTo(2.675, 3)).toBe(2.675);
    expect(pyRoundTo(1e-9, 3)).toBe(0.0);
    expect(pyRoundTo(0.0, 3)).toBe(0.0);
  });

  it("passes a non-finite value straight through, as Python does", () => {
    expect(pyRoundTo(Infinity, 3)).toBe(Infinity);
    expect(pyRoundTo(-Infinity, 3)).toBe(-Infinity);
    expect(Number.isNaN(pyRoundTo(NaN, 3))).toBe(true);
  });
});
