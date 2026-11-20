/**
 * Working in a biosafety cabinet.
 *
 * What is checked is the air curtain, because the curtain is the machine. The sash decides how
 * fast air comes in and nothing on the cabinet says what that speed is; a grille with something
 * standing on it is a hole in the curtain whatever the sash is doing. Both are silent failures —
 * the cabinet looks and sounds the same — which is why they are arithmetic here instead.
 */
import { CABINETS, HOLDS_ABOVE, PURGE, curtain, inflowAt, onTheDeck, sashFor, type Thing } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const cabinet = CABINETS[0]!;

describe("how fast air comes in", () => {
  it("halves when the sash is opened to twice its mark", () => {
    // The blower moves the same volume; the gap is twice the size, so the speed is half.
    expect(inflowAt(cabinet, cabinet.sash)).toBeCloseTo(cabinet.inflow, 9);
    expect(inflowAt(cabinet, cabinet.sash * 2)).toBeCloseTo(cabinet.inflow / 2, 9);
    expect(inflowAt(cabinet, cabinet.sash / 2)).toBeCloseTo(cabinet.inflow * 2, 9);
  });

  it("reads back the other way, so a velocity gives a height", () => {
    expect(sashFor(cabinet, cabinet.inflow)).toBeCloseTo(cabinet.sash, 9);
    expect(inflowAt(cabinet, sashFor(cabinet, 0.4))).toBeCloseTo(0.4, 9);
  });
});

describe("whether the curtain holds", () => {
  it("does at the height it was certified at", () => {
    const at = curtain(cabinet, cabinet.sash);
    expect(at.holds).toBe(true);
    expect(at.of).toBeCloseTo(1, 9);
  });

  it("does not much above it, and says where to put the sash back to", () => {
    const at = curtain(cabinet, 0.3);
    expect(at.holds).toBe(false);
    expect(at.says).toContain("you are standing in what comes back out");
    // And the height it gives back does hold.
    expect(curtain(cabinet, at.most).holds).toBe(true);
  });

  it("holds down to four fifths of what it was certified at, and not below", () => {
    const edge = sashFor(cabinet, cabinet.inflow * HOLDS_ABOVE);
    expect(curtain(cabinet, edge).holds).toBe(true);
    expect(curtain(cabinet, edge * 1.05).holds).toBe(false);
  });

  it("is fine with the sash lower than the mark, which only moves air faster", () => {
    const low = curtain(cabinet, cabinet.sash / 2);
    expect(low.holds).toBe(true);
    expect(low.says).toContain("certified");
  });
});

describe("what is standing on the deck", () => {
  const rack: Thing = { name: "Tube rack", where: "front grille", open: false };
  const plate: Thing = { name: "Plate", where: "work zone", open: true };

  it("catches anything on the front grille, which is the commonest way to break it", () => {
    const wrong = onTheDeck([rack]);
    expect(wrong[0]!.breaks).toBe(true);
    expect(wrong[0]!.says).toContain("front grille");
  });

  it("catches the rear grille too, where the air leaves", () => {
    const wrong = onTheDeck([{ ...rack, where: "rear grille" }]);
    expect(wrong[0]!.breaks).toBe(true);
    expect(wrong[0]!.says).toContain("rolls forward");
  });

  it("is content with things in the work zone, which is what it is for", () => {
    expect(onTheDeck([plate])).toHaveLength(0);
    expect(onTheDeck([])).toHaveLength(0);
  });

  it("mentions a crowd of open things without calling it broken", () => {
    const wrong = onTheDeck([plate, { ...plate, name: "Flask" }, { ...plate, name: "Bottle" }]);
    expect(wrong).toHaveLength(1);
    expect(wrong[0]!.breaks).toBe(false);
    expect(wrong[0]!.says).toContain("3 open things");
  });

  it("reports the worst thing first, so the first line is the one that matters", () => {
    const wrong = onTheDeck([plate, { ...plate, name: "Flask" }, { ...plate, name: "Bottle" }, rack]);
    expect(wrong[0]!.breaks).toBe(true);
  });
});

describe("the rule that is not arithmetic", () => {
  it("is to let it run before and after, and that is stated rather than computed", () => {
    // The air in a cabinet is changed over in seconds; five minutes is about the blower settling
    // and about what is in the room settling, neither of which this can work out.
    expect(PURGE).toBe(5);
  });
});
