/**
 * A pulse, checked as arithmetic.
 *
 * The field and the time constant are both exact — a division and a multiplication — so they are
 * checked by doing them by hand. Everything else is a judgement about a number, and each case here
 * is one somebody could get wrong at the bench: the same voltage in the wrong cuvette, a time
 * constant that came back short, DNA put in at a volume that carries salt with it.
 */
import { GAPS, PUBLISHED, against, decay, efficiency, fieldStrength, loading, publishedFor, timeConstant, voltsFor } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const pulse = (volts: number, gap: 1 | 2 | 4 = 2, ohms = 200, microfarads = 25) => ({ volts, microfarads, ohms, gap });

describe("the field across the gap", () => {
  it("is the voltage divided by the gap, in kilovolts per centimetre", () => {
    // 1.5 kV across 0.2 cm.
    expect(fieldStrength(pulse(1_500, 2))).toBe(7.5);
    expect(fieldStrength(pulse(1_800, 1))).toBe(18);
    expect(fieldStrength(pulse(2_500, 2))).toBe(12.5);
  });

  it("halves when the same voltage goes in a cuvette twice as wide, which is the whole point of it", () => {
    expect(fieldStrength(pulse(1_800, 2))).toBe(fieldStrength(pulse(1_800, 1)) / 2);
  });

  it("says what voltage would give a field in a given cuvette, which is the way back", () => {
    for (const gap of GAPS) expect(fieldStrength({ volts: voltsFor(12.5, gap), gap })).toBeCloseTo(12.5, 2);
  });
});

describe("the time constant", () => {
  it("is the resistance times the capacitance", () => {
    expect(timeConstant({ ohms: 200, microfarads: 25 })).toBe(5);
    expect(timeConstant({ ohms: 100, microfarads: 25 })).toBe(2.5);
  });
});

describe("the settings against the ones a host is usually given", () => {
  it("knows the hosts this lab puts things into", () => {
    for (const host of ["E. coli", "Escherichia coli DH10B", "Pichia pastoris GS115", "Komagataella phaffii", "Saccharomyces cerevisiae W303"]) {
      expect(publishedFor(host), host).not.toBeNull();
    }
    expect(publishedFor("Chinese hamster ovary")).toBeNull();
    expect(against(pulse(1_500), "Chinese hamster ovary")).toBeNull();
  });

  it("calls the published settings right", () => {
    for (const published of PUBLISHED) {
      const same = against(published.pulse, published.name)!;
      expect(same.of, published.name).toBe(1);
      expect(same.says, published.name).toContain("usually given");
    }
  });

  it("catches the voltage copied out of a protocol written for another cuvette", () => {
    // 1.8 kV is right for E. coli in a 1 mm cuvette. In a 2 mm one it is 9 kV/cm, not 12.5.
    const wrong = against(pulse(1_800, 2), "E. coli")!;
    expect(wrong.strength).toBe(9);
    expect(wrong.of).toBeLessThan(0.9);
    expect(wrong.says).toContain("nothing goes in");
    // And it says what voltage would give the right field in the cuvette that is actually in there.
    expect(wrong.says).toContain("2500 V gives the 12.5 kV/cm in the 2 mm cuvette");
  });

  it("names the gap the published settings were written for, when it is not the one in the machine", () => {
    // Pichia is published for a 2 mm cuvette; put its voltage in a 1 mm one and the field doubles.
    const narrow = against(pulse(1_500, 1), "Pichia pastoris")!;
    expect(narrow.strength).toBe(15);
    expect(narrow.says).toContain("written for a 2 mm cuvette");
    expect(narrow.says).toContain("750 V gives the 7.5 kV/cm in the 1 mm cuvette");
  });

  it("catches a field strong enough to kill what it opens", () => {
    const hard = against(pulse(3_000, 2), "Pichia pastoris")!;
    expect(hard.of).toBeGreaterThan(1.1);
    expect(hard.says).toContain("kills");
  });
});

describe("what the time constant that came back says", () => {
  it("takes one near the setting as a sample with the salt washed out", () => {
    const good = decay(pulse(1_500), 4.8);
    expect(good.ok).toBe(true);
    expect(good.set).toBe(5);
  });

  it("calls a slightly short one salt, and says it worked anyway", () => {
    const bit = decay(pulse(1_500), 3.9);
    expect(bit.ok).toBe(true);
    expect(bit.says).toContain("A little short");
  });

  it("calls a far short one a sample that is conducting", () => {
    const salty = decay(pulse(1_500), 2.1);
    expect(salty.ok).toBe(false);
    expect(salty.says).toContain("Wash the cells again");
  });

  it("calls a very short one an arc, and says what is in the cuvette is dead", () => {
    const arc = decay(pulse(1_500), 0.4);
    expect(arc.ok).toBe(false);
    expect(arc.says).toContain("arc");
    expect(arc.says).toContain("dead");
  });
});

describe("how much DNA went in", () => {
  it("is fine at a twentieth of the cuvette and at a tenth", () => {
    expect(loading(2, 40).ok).toBe(true);
    expect(loading(5, 45).ok).toBe(true);
  });

  it("is too much past a tenth, and says why that matters", () => {
    const lots = loading(10, 40);
    expect(lots.ok).toBe(false);
    expect(lots.says).toContain("arc");
  });

  it("answers for nothing at all rather than dividing by zero", () => {
    expect(loading(0, 0).share).toBe(0);
  });
});

describe("how well it went, off the plate", () => {
  it("counts colonies against the DNA that reached the plate, not the DNA that went in", () => {
    // 100 ng into the cuvette, a tenth of the recovery plated: 10 ng on the plate, 0.00001 µg… no:
    // 100 ng × 0.1 = 10 ng = 0.01 µg. 120 colonies on 0.01 µg is 12,000 per µg.
    const counted = efficiency({ colonies: 120, nanograms: 100, recovered: 1_000, plated: 100 }, "Pichia pastoris");
    expect(counted.onThePlate).toBe(0.01);
    expect(counted.perMicrogram).toBe(12_000);
  });

  it("says when it is far under what the host usually gives", () => {
    const poor = efficiency({ colonies: 2, nanograms: 100, recovered: 1_000, plated: 1_000 }, "E. coli");
    expect(poor.says).toContain("well under");
  });

  it("says nothing about what to expect for a host it knows nothing about", () => {
    expect(efficiency({ colonies: 50, nanograms: 10, recovered: 100, plated: 100 }, "something else").expected).toBeNull();
  });

  it("never plates more than was recovered, however the numbers are typed", () => {
    const all = efficiency({ colonies: 10, nanograms: 100, recovered: 100, plated: 10_000 }, "E. coli");
    expect(all.onThePlate).toBe(0.1);
  });
});
