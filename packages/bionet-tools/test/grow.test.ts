/**
 * A plate left in an incubator.
 *
 * The figure worth checking is the one nobody writes down: that "overnight" and "two days" fall out
 * of the doubling time rather than being conventions. If twenty-seven doublings of twenty minutes
 * does not come to a night, the model is wrong however reasonable it reads.
 */
import { HOSTS, LAG_HOURS, OVERGROWN_AT, SELECTIONS, VISIBLE_CELLS, cellsAfter, doublingAt, hostFor, plateAfter, readyAfter } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const amp = SELECTIONS.find((one) => one.name === "Ampicillin")!;
const kan = SELECTIONS.find((one) => one.name === "Kanamycin")!;

describe("how fast something doubles", () => {
  it("is its own figure at its own best temperature", () => {
    for (const host of HOSTS) expect(doublingAt(host.name, host.best)!.minutes, host.name).toBe(host.doubling);
  });

  it("takes twice as long ten degrees colder, and four times twenty colder", () => {
    expect(doublingAt("E. coli", 27)!.minutes).toBeCloseTo(40, 1);
    expect(doublingAt("E. coli", 17)!.minutes).toBeCloseTo(80, 1);
  });

  it("refuses to say a cell goes faster above its best, because it does not", () => {
    const hot = doublingAt("E. coli", 42)!;
    expect(hot.ok).toBe(false);
    expect(hot.says).toContain("it slows");
  });

  it("says when it is too cold for the rule to be worth applying", () => {
    expect(doublingAt("E. coli", 10)!.ok).toBe(false);
  });

  it("knows the hosts this lab grows, and says nothing about one it does not", () => {
    for (const host of ["E. coli", "Escherichia coli DH10B", "Pichia pastoris GS115", "Komagataella phaffii", "Saccharomyces cerevisiae W303"]) {
      expect(hostFor(host), host).not.toBeNull();
    }
    expect(doublingAt("Chinese hamster ovary", 37)).toBeNull();
    expect(readyAfter("Chinese hamster ovary", 37)).toBeNull();
  });
});

describe("when a plate is worth looking at", () => {
  it("works out overnight for E. coli rather than being told it", () => {
    const when = readyAfter("E. coli", 37)!;
    // Twenty-seven doublings of twenty minutes is nine hours, and a lag on top.
    expect(when.doublings).toBeCloseTo(Math.log2(VISIBLE_CELLS), 1);
    expect(when.hours).toBeCloseTo(LAG_HOURS + (Math.log2(VISIBLE_CELLS) * 20) / 60, 1);
    expect(when.said).toBe("overnight");
  });

  it("works out a bit over two days for Pichia, and says that is the soonest", () => {
    const when = readyAfter("Pichia pastoris", 30)!;
    // Protocols for this host say two to three days. The arithmetic says fifty-four hours, which is
    // the floor: it uses the rate in rich medium carrying nothing. The tool says so rather than
    // having its wording tuned until it agrees with a protocol it is not modelling.
    expect(when.hours).toBeCloseTo(54.2, 1);
    expect(when.hours / 24).toBeGreaterThan(2);
    expect(when.says).toContain("that is the soonest");
    expect(when.says).toContain("On selection, carrying something, it is slower");
  });

  it("works out about two days for brewer's yeast", () => {
    expect(readyAfter("Saccharomyces cerevisiae", 30)!.said).toBe("two days");
  });

  it("takes longer the colder it is", () => {
    expect(readyAfter("E. coli", 30)!.hours).toBeGreaterThan(readyAfter("E. coli", 37)!.hours);
  });

  it("says when they start running together, which is later than when they show", () => {
    const when = readyAfter("E. coli", 37)!;
    expect(when.overgrown).toBeCloseTo(when.hours * OVERGROWN_AT, 0);
    expect(when.overgrown).toBeGreaterThan(when.hours);
  });
});

describe("what is on the plate", () => {
  const when = readyAfter("E. coli", 37)!;

  it("says there is nothing to see yet, and that that is not nothing", () => {
    const early = plateAfter(2, "E. coli", 37, kan)!;
    expect(early.showing).toBe(false);
    expect(early.says.join(" ")).toContain("looked at too early is not a plate with nothing on it");
  });

  it("says when to pick one", () => {
    const ready = plateAfter(when.hours + 1, "E. coli", 37, kan)!;
    expect(ready.showing).toBe(true);
    expect(ready.overgrown).toBe(false);
    expect(ready.says[0]).toContain("when to pick one");
  });

  it("warns that a colony touching another is not one colony", () => {
    const late = plateAfter(when.overgrown + 1, "E. coli", 37, kan)!;
    expect(late.overgrown).toBe(true);
    expect(late.says.join(" ")).toContain("not one colony");
  });

  it("gives satellites on ampicillin and not on kanamycin, however long it is left", () => {
    expect(plateAfter(when.hours * 2, "E. coli", 37, amp)!.satellites).toBe(true);
    expect(plateAfter(when.hours * 4, "E. coli", 37, kan)!.satellites).toBe(false);
    // And not straight away even on ampicillin: the colonies have to clear the drug first.
    expect(plateAfter(when.hours, "E. coli", 37, amp)!.satellites).toBe(false);
  });

  it("says satellites took nothing up, which is the reason for mentioning them", () => {
    expect(plateAfter(when.hours * 2, "E. coli", 37, amp)!.says.join(" ")).toContain("took nothing up");
  });

  it("marks exactly one selection as one that clears the drug around a colony", () => {
    expect(SELECTIONS.filter((one) => one.cleared).map((one) => one.name)).toEqual(["Ampicillin"]);
  });
});

describe("how big a colony is as it grows", () => {
  it("is one cell until it starts", () => {
    expect(cellsAfter(0, "E. coli", 37)).toBe(1);
    expect(cellsAfter(LAG_HOURS, "E. coli", 37)).toBe(1);
  });

  it("passes what the eye can see at about when it is said to", () => {
    const when = readyAfter("E. coli", 37)!;
    expect(cellsAfter(when.hours - 1, "E. coli", 37)).toBeLessThan(VISIBLE_CELLS);
    expect(cellsAfter(when.hours + 1, "E. coli", 37)).toBeGreaterThan(VISIBLE_CELLS);
  });

  it("stops rising, because a colony eats what is under it", () => {
    expect(cellsAfter(10_000, "E. coli", 37)).toBe(cellsAfter(100_000, "E. coli", 37));
    expect(Number.isFinite(cellsAfter(1e6, "E. coli", 37))).toBe(true);
  });

  it("says one cell for a host it knows nothing about, rather than a number it cannot stand behind", () => {
    expect(cellsAfter(48, "Chinese hamster ovary", 37)).toBe(1);
  });
});
