/**
 * Holding something at a temperature.
 *
 * What is checked is the thing the bath cannot say: that the tube is not the bath. For a
 * twenty-minute inactivation the lag is nothing and the arithmetic is pointless; for a
 * forty-five-second heat shock it is a third of the step, and that is the case this exists for.
 */
import { SOAKS, VESSELS, arrives, holding, leaveFor, warmth } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const microfuge = VESSELS[0]!;
const conical = VESSELS[3]!;
const shock = SOAKS.find((one) => one.what.startsWith("Heat shock"))!;
const inactivate = SOAKS.find((one) => one.what.includes("restriction enzyme"))!;

describe("a tube coming up to the bath", () => {
  it("closes the same fraction of the gap every time constant", () => {
    // After one constant a bit over a third of the gap is left, after two an eighth or so.
    expect(warmth(42, 0, microfuge.constant, microfuge)).toBeCloseTo(42 - 42 / Math.E, 6);
    expect(warmth(42, 0, 2 * microfuge.constant, microfuge)).toBeCloseTo(42 - 42 / Math.E ** 2, 6);
  });

  it("is still at its own temperature before it goes in", () => {
    expect(warmth(42, 0, 0, microfuge)).toBe(0);
    expect(warmth(42, 4, -5, microfuge)).toBe(4);
  });

  it("takes longer the bigger the vessel, which is the whole point of listing them", () => {
    for (const [at, one] of VESSELS.entries()) {
      if (at === 0) continue;
      expect(one.constant, `${one.name} against ${VESSELS[at - 1]!.name}`).toBeGreaterThan(VESSELS[at - 1]!.constant);
    }
    expect(arrives(42, 0, conical)).toBeGreaterThan(arrives(42, 0, microfuge) * 10);
  });

  it("has arrived when the gap is under a degree", () => {
    // From ice to 42 is a gap of 42, and ln(42) ≈ 3.7 time constants to close it to one degree.
    expect(arrives(42, 0, microfuge)).toBeCloseTo(microfuge.constant * Math.log(42), 6);
    expect(arrives(42, 42, microfuge), "already there").toBe(0);
  });
});

describe("what a heat shock actually gets", () => {
  it("is shorter than the timer says, by the time the tube took to arrive", () => {
    const got = holding(shock, 45, microfuge);
    // Fifteen of the forty-five seconds go on warming up, so the cells see thirty.
    expect(got.arriving).toBeCloseTo(15, 0);
    expect(got.held).toBeCloseTo(30, 0);
    expect(got.warming).toBeGreaterThan(0.3);
  });

  it("never claims the tube got the time the timer was set to", () => {
    // Thirty seconds is inside the window a shock works over, so this is not an error — but the
    // sentence has to say thirty and not forty-five, or the tool is repeating the timer's lie.
    const got = holding(shock, 45, microfuge);
    expect(got.enough, "thirty seconds is inside the window").toBe(true);
    expect(got.says).toContain("30 s");
    expect(got.says).toContain("warming up");
    expect(got.says).not.toContain("which is the 45");
  });

  it("says what to set the timer to, so the cells get the whole shock", () => {
    expect(leaveFor(shock, microfuge)).toBeCloseTo(45 + arrives(42, 0, microfuge), 6);
    expect(holding(shock, leaveFor(shock, microfuge), microfuge).held).toBeCloseTo(45, 6);
    // And a tube left in for only the shock's own length is short by the warming up.
    const short = holding(shock, 20, microfuge);
    expect(short.enough).toBe(false);
    expect(short.says).toContain("longer");
  });

  it("is the whole step in a vessel that takes minutes to warm", () => {
    // Nobody heat shocks in a conical, and this says why: the shock would be over before the tube
    // arrived, and the plate the next morning would be empty with nothing to point at.
    const got = holding(shock, 45, conical);
    expect(got.held).toBe(0);
    expect(got.warming).toBe(1);
    expect(got.enough).toBe(false);
  });

  it("can also be too long, which fails the same way an empty plate does", () => {
    const got = holding(shock, 120, microfuge);
    expect(got.held).toBeGreaterThan(shock.seconds + shock.within!);
    expect(got.enough).toBe(false);
    expect(got.says).toContain("dying");
  });
});

describe("an inactivation, where the lag does not matter", () => {
  it("is long enough that the warming up is noise", () => {
    const got = holding(inactivate, inactivate.seconds + 60, microfuge);
    expect(got.enough).toBe(true);
    expect(got.warming).toBeLessThan(0.02);
  });

  it("is not enough when it is cut short, however little the lag was", () => {
    const got = holding(inactivate, 300, microfuge);
    expect(got.enough).toBe(false);
    expect(got.says).toContain("needs");
  });

  it("has no upper end, because leaving an enzyme dead for longer does nothing", () => {
    expect(inactivate.within).toBe(null);
    expect(holding(inactivate, inactivate.seconds * 3, microfuge).enough).toBe(true);
  });
});

describe("what the bench does in a bath", () => {
  it("includes the one step that must not be done in a bath at all", () => {
    // Competent cells are thawed on ice. It is in the list so that the list is where somebody
    // finds that out, rather than finding it out from a transformation that does not work.
    const thaw = SOAKS.find((one) => one.what.startsWith("Thawing"))!;
    expect(thaw.celsius).toBe(4);
    expect(thaw.why).toContain("not in a bath");
  });
});
