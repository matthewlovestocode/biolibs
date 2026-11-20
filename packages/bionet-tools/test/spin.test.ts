/**
 * A spin, checked as arithmetic.
 *
 * The force is a speed squared times a radius, so it is checked by doing that; the speed for a
 * force is the way back, so it is checked by going both ways. The balance is the interesting one:
 * it is a sum of unit masses round a circle, and what matters is that it calls a rotor balanced
 * only when what is in it really does add up to nothing — including the cases that look wrong and
 * are not, like three tubes in twenty-four positions.
 */
import { OFF_CENTRE, ROTORS, RCF_CONSTANT, SPINS, balance, force, speedFor, spinAgainst } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

describe("the force a spin makes", () => {
  it("is the constant, the radius and the speed squared", () => {
    expect(force(13_000, 8.5)).toBeCloseTo(RCF_CONSTANT * 8.5 * 13_000 ** 2, 6);
    // A microfuge at 13,000 rpm is about 16,000 × g, which is the figure every protocol assumes.
    expect(Math.round(force(13_000, 8.5) / 100) * 100).toBe(16_100);
  });

  it("rises with the square of the speed, so twice as fast is four times as hard", () => {
    expect(force(10_000, 10)).toBeCloseTo(force(5_000, 10) * 4, 6);
  });

  it("differs between rotors at the same speed, which is the reason for working in force at all", () => {
    const [micro, swinging] = ROTORS;
    expect(force(5_000, swinging!.radius)).toBeGreaterThan(force(5_000, micro!.radius));
  });
});

describe("the speed for a force", () => {
  it("is the way back, exactly", () => {
    for (const rotor of ROTORS) {
      for (const rcf of [1_000, 4_000, 16_000]) {
        expect(force(speedFor(rcf, rotor.radius), rotor.radius)).toBeCloseTo(rcf, 4);
      }
    }
  });

  it("is slower in a bigger rotor for the same force, which is what a protocol in rpm hides", () => {
    expect(speedFor(16_000, 17.5)).toBeLessThan(speedFor(16_000, 8.5));
  });

  it("answers with nothing rather than infinity for a rotor of no size", () => {
    expect(speedFor(16_000, 0)).toBe(0);
    expect(speedFor(0, 8.5)).toBe(0);
  });
});

describe("whether a rotor is balanced", () => {
  it("calls an empty rotor balanced, because it is", () => {
    expect(balance([], 24).ok).toBe(true);
  });

  it("refuses one tube on its own, and says where the second goes", () => {
    const alone = balance([0], 24);
    expect(alone.ok).toBe(false);
    expect(alone.offset).toBeCloseTo(1, 6);
    expect(alone.put).toEqual([12]);
    expect(alone.says).toContain("destroy a centrifuge");
  });

  it("takes two tubes opposite each other", () => {
    expect(balance([0, 12], 24).ok).toBe(true);
    expect(balance([5, 17], 24).ok).toBe(true);
  });

  it("refuses two tubes that are not opposite, however near they look", () => {
    expect(balance([0, 11], 24).ok).toBe(false);
    expect(balance([0, 1], 24).ok).toBe(false);
  });

  it("takes three tubes evenly spaced, which looks wrong and is not", () => {
    expect(balance([0, 8, 16], 24).ok).toBe(true);
    expect(balance([0, 6, 12, 18], 24).ok).toBe(true);
  });

  it("ignores a position twice over and one that is not on the rotor", () => {
    expect(balance([0, 0, 12], 24)).toMatchObject({ filled: 2, ok: true });
    expect(balance([0, 12, 99, -1], 24)).toMatchObject({ filled: 2, ok: true });
  });

  it("suggests a tube only where one would really balance it", () => {
    // Twenty-three of twenty-four: the last hole balances it, so that is what it says.
    const nearly = balance(Array.from({ length: 23 }, (_, at) => at), 24);
    expect(nearly.ok).toBe(false);
    expect(nearly.put).toEqual([23]);
    expect(balance([...Array.from({ length: 23 }, (_, at) => at), 23], 24).ok).toBe(true);
    // Two side by side: no third tube anywhere balances that, and it does not pretend one would.
    const together = balance([0, 1], 24);
    expect(together.put).toEqual([]);
    expect(together.says).toContain("No one tube anywhere in it would balance this");
  });

  it("never suggests a tube that would leave the rotor still out", () => {
    for (const loaded of [[0], [0, 1], [0, 1, 2], [3, 4, 5, 6], [0, 2, 5]]) {
      const how = balance(loaded, 24);
      for (const at of how.put) expect(balance([...loaded, at], 24).ok, JSON.stringify(loaded)).toBe(true);
    }
  });

  it("holds its own tolerance: anything it passes really is near enough centred", () => {
    for (const loaded of [[0, 12], [0, 8, 16], [], [1, 7, 13, 19]]) {
      expect(balance(loaded, 24).offset, JSON.stringify(loaded)).toBeLessThanOrEqual(OFF_CENTRE);
    }
  });
});

describe("a spin against what it is usually given", () => {
  it("says which half is kept and what the other one is, every time", () => {
    for (const spin of SPINS) {
      const said = spinAgainst(spin.force, spin.minutes, spin).says;
      expect(said, spin.what).toContain(`kept is the ${spin.keep}`);
    }
  });

  it("warns when it is far under, and says what is lost", () => {
    const soft = spinAgainst(1_000, 5, SPINS[0]!);
    expect(soft.of).toBeLessThan(0.5);
    expect(soft.says).toContain("lost with the liquid");
  });

  it("warns when it is far over, differently for a pellet and for a liquid", () => {
    const pellet = SPINS.find((one) => one.keep === "pellet")!;
    const liquid = SPINS.find((one) => one.keep === "liquid")!;
    expect(spinAgainst(pellet.force * 4, pellet.minutes, pellet).says).toContain("will not go back into solution");
    expect(spinAgainst(liquid.force * 4, liquid.minutes, liquid).says).toContain("tube splits");
  });

  it("says when it is far too short", () => {
    expect(spinAgainst(SPINS[0]!.force, 1, SPINS[0]!).says).toContain("well under the usual");
  });
});
