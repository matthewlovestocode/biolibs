/**
 * A PCR as met at the machine, as data.
 *
 * What the machine shows is checked for being what a thermocycler would show. What the operator has
 * to picture is checked against arithmetic that can be done by hand: where a primer binds, and how
 * many strands of each kind there are after each cycle.
 */
import { primerBinding, programmeChecks, runSeconds, screenOf, strandCounts, suggestProgramme, tubeLens, tubeView,
         type Binding } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const FORWARD = "GGATCACAGTCTACACTG";
const REVERSE = "GGTATACATACTCTGAAG";
const primers = [{ name: "fwd-1", tm: 54 }, { name: "rev-1", tm: 50 }];

describe("the programme the machine shows", () => {
  it("is suggested from the reaction: five under the cooler primer, a minute a thousand bases", () => {
    const programme = suggestProgramme({ length: 1500, primers: [{ name: "f", tm: 60 }, { name: "r", tm: 58 }] });
    expect(programme.steps).toEqual([{ name: "denature", celsius: 95, seconds: 30 }, { name: "anneal", celsius: 53, seconds: 30 }, { name: "extend", celsius: 72, seconds: 90 }]);
    expect(programme.cycles).toBe(30);
    expect(suggestProgramme({ length: 75, primers }).steps[2].seconds).toBe(15);       // never less than fifteen seconds
    expect(suggestProgramme({ length: 5048, primers }).steps[2].seconds).toBe(305);    // rounded up to five
    expect(suggestProgramme({ length: 500, primers: [{ name: "f", tm: 90 }] }).steps[1].celsius).toBe(72);
    expect(suggestProgramme({ length: 500, primers: [{ name: "f", tm: 30 }] }).steps[1].celsius).toBe(45);
    expect(suggestProgramme({ length: 500, primers: [] }).steps[1].celsius).toBe(55);
    expect(programmeChecks(programme, { length: 1500, primers: [{ name: "f", tm: 60 }, { name: "r", tm: 58 }] })).toEqual([]);
  });

  it("is written as a thermocycler writes it, and adds up", () => {
    const programme = suggestProgramme({ length: 1500, primers: [{ name: "f", tm: 60 }, { name: "r", tm: 58 }] });
    const lines = screenOf(programme);
    expect(lines.map((line) => line.text)).toEqual([
      "Start     95 °C   2:00", "30 cycles of", "  Denature 95 °C   0:30", "  Anneal  53 °C   0:30", "  Extend  72 °C   1:30", "Finish    72 °C   5:00", "About 82:00 in all",
    ]);
    expect(lines.map((line) => line.step)).toEqual([undefined, undefined, "denature", "anneal", "extend", undefined, undefined]);
    expect(runSeconds(programme)).toBe(120 + 30 * 150 + 300);
  });
});

describe("what a careful operator would ask", () => {
  const reaction = { length: 3000, primers };
  const base = suggestProgramme(reaction);
  const set = (change: (programme: typeof base) => void): typeof base => { const copy = structuredClone(base); change(copy); return copy; };

  it("is nothing, for a programme that suits the reaction", () => {
    expect(programmeChecks(base, reaction)).toEqual([]);
  });

  it("is said in words about the step it concerns, the likeliest to matter first", () => {
    const hot = programmeChecks(set((p) => { p.steps[1].celsius = 62; }), reaction);
    expect(hot).toEqual([{ about: "anneal", weight: "stop", says: "Annealing at 62 °C is above rev-1's melting temperature, about 50 °C. It may not bind." }]);
    expect(programmeChecks(set((p) => { p.steps[1].celsius = 45; }), { length: 3000, primers: [{ name: "f", tm: 60 }, { name: "r", tm: 60 }] })[0])
      .toMatchObject({ about: "anneal", weight: "look" });
    const apart = programmeChecks(base, { length: 3000, primers: [{ name: "f", tm: 66 }, { name: "r", tm: 50 }] });
    expect(apart.some((check) => /f melts about 16 degrees above r/.test(check.says))).toBe(true);

    expect(programmeChecks(set((p) => { p.steps[2].seconds = 60; }), reaction)[0]).toMatchObject({ about: "extend", weight: "stop" });
    expect(programmeChecks(set((p) => { p.steps[2].seconds = 120; }), reaction)[0]).toMatchObject({ about: "extend", weight: "look" });
    expect(programmeChecks(set((p) => { p.steps[0].celsius = 85; }), reaction)[0]).toMatchObject({ about: "denature", weight: "stop" });
    expect(programmeChecks(set((p) => { p.cycles = 45; }), reaction)[0]).toMatchObject({ about: "cycles", weight: "look" });
    expect(programmeChecks(set((p) => { p.cycles = 10; }), reaction)[0]!.says).toMatch(/10 cycles may not make enough/);

    const several = programmeChecks(set((p) => { p.cycles = 45; p.steps[1].celsius = 70; }), reaction);
    expect(several.map((check) => check.weight)).toEqual(["stop", "look"]);
  });
});

describe("where a primer binds", () => {
  it("is found on either strand by its 3′ end", () => {
    expect(primerBinding(TEMPLATE, FORWARD)).toEqual({ start: 0, end: 18, reads: "top", tail: 0 });
    expect(primerBinding(TEMPLATE, REVERSE)).toEqual({ start: 57, end: 75, reads: "bottom", tail: 0 });
    expect(primerBinding(TEMPLATE, "CAACCCCGGCCCCTGAGTCC")).toEqual({ start: 25, end: 45, reads: "top", tail: 0 });
  });

  it("says how much of a primer is a tail that does not bind", () => {
    expect(primerBinding(TEMPLATE, `GAATTG${"CAACCCCGGCCCCTGAGTCC"}`)).toEqual({ start: 25, end: 45, reads: "top", tail: 6 });
    // A tail whose last bases happen to match the template is that much less of a tail.
    expect(primerBinding(TEMPLATE, `GAATTC${"CAACCCCGGCCCCTGAGTCC"}`)).toEqual({ start: 23, end: 45, reads: "top", tail: 4 });
    expect(primerBinding(TEMPLATE, `GAATTC${REVERSE}`)).toEqual({ start: 57, end: 75, reads: "bottom", tail: 6 });
    // A primer that binds with fewer bases than asked for does not bind.
    expect(primerBinding(TEMPLATE, FORWARD, 14)).toMatchObject({ start: 0, end: 18 });
    expect(primerBinding(TEMPLATE, `TTTT${FORWARD.slice(8)}`, 18)).toBeNull();
    expect(primerBinding(TEMPLATE, `TTTT${FORWARD.slice(8)}`, 10)).toEqual({ start: 8, end: 18, reads: "top", tail: 4 });
  });

  it("is nowhere for a primer that does not bind, is too short, or binds twice", () => {
    expect(primerBinding(TEMPLATE, "TTTTTTTTTTTTTTTTTTTT")).toBeNull();
    expect(primerBinding(TEMPLATE, "GGATC")).toBeNull();
    expect(primerBinding(`${TEMPLATE}AAAA${TEMPLATE}`, FORWARD)).toBeNull();
    expect(primerBinding(TEMPLATE, FORWARD, 0)).toBeNull();
  });
});

describe("what is in the tube", () => {
  const forward: Binding = { start: 100, end: 120, reads: "top", tail: 0 };
  const reverse: Binding = { start: 880, end: 900, reads: "bottom", tail: 0 };

  it("holds two more over-long strands each cycle, and a product that doubles", () => {
    expect(strandCounts(0)).toEqual({ template: 2, long: 0, product: 0 });
    expect(strandCounts(1)).toEqual({ template: 2, long: 2, product: 0 });
    expect(strandCounts(2)).toEqual({ template: 2, long: 4, product: 2 });
    expect(strandCounts(3)).toEqual({ template: 2, long: 6, product: 8 });
    for (let cycles = 0; cycles <= 30; cycles++) {
      const { template, long, product } = strandCounts(cycles);
      expect(template + long + product).toBe(2 ** (cycles + 1));     // every strand is copied once a cycle
    }
    expect(strandCounts(30).product).toBe(2 ** 31 - 62);
    expect(strandCounts(-3)).toEqual(strandCounts(0));
  });

  it("parts the strands, then binds the primers pointing at each other", () => {
    const parted = tubeView(1000, forward, reverse, "denature", 1);
    expect(parted.strands).toEqual([{ from: 0, to: 1000, row: 0, kind: "template", points: "right", moves: "parts" }, { from: 0, to: 1000, row: 3, kind: "template", points: "left", moves: "parts" }]);
    expect(parted.counts).toEqual({ template: 2, long: 0, product: 0 });
    const bound = tubeView(1000, forward, reverse, "anneal", 1);
    expect(bound.strands.filter((one) => one.kind === "primer")).toEqual([
      { from: 880, to: 900, row: 1, kind: "primer", points: "left", moves: "lands" }, { from: 100, to: 120, row: 2, kind: "primer", points: "right", moves: "lands" },
    ]);
    // What was already there stays still while the primers land.
    expect(bound.strands.filter((one) => one.kind === "template").every((one) => one.moves === undefined)).toBe(true);
    expect(bound.says).toMatch(/primers find the one place/);
  });

  it("makes over-long strands first, then strands of exactly the product's length, then the product from the product", () => {
    const first = tubeView(1000, forward, reverse, "extend", 1);
    expect(first.strands.filter((one) => one.kind === "long")).toEqual([
      { from: 0, to: 900, row: 1, kind: "long", points: "left", moves: "grows" }, { from: 100, to: 1000, row: 2, kind: "long", points: "right", moves: "grows" },
    ]);
    expect(first.counts).toEqual({ template: 2, long: 2, product: 0 });
    expect(first.says).toMatch(/run on too far/);

    const second = tubeView(1000, forward, reverse, "extend", 2);
    expect(second.strands.filter((one) => one.kind === "long").map((one) => [one.from, one.to])).toEqual([[100, 1000], [0, 900]]);
    expect(second.strands.filter((one) => one.kind === "product").map((one) => [one.from, one.to])).toEqual([[100, 900], [100, 900]]);
    expect(second.counts.product).toBe(2);
    expect(second.says).toMatch(/first strands of exactly the product's length/);

    const third = tubeView(1000, forward, reverse, "extend", 3);
    expect(third.strands.every((one) => one.kind === "product" && one.from === 100 && one.to === 900)).toBe(true);
    expect(third.strands).toHaveLength(4);
    expect(third.counts).toEqual({ template: 2, long: 6, product: 8 });
    expect(tubeView(1000, forward, reverse, "denature", 3).counts).toEqual(strandCounts(2));
    expect(tubeView(1000, forward, reverse, "extend", 0).counts).toEqual(strandCounts(1));
  });
});

describe("the real bases at a primer's site", () => {
  // 30 bases of nothing in particular, then the forward primer's site, a middle, the reverse primer's site, and 30 more.
  const LEFT = "ACGTTGCAAGGCTTAACCGGTTAAGGCCTA";
  const MIDDLE = "ATGCCGTAGCTAGGATCCGATCGATTACGCTAGCATCGAT";
  const SITE = `${LEFT}${FORWARD}${MIDDLE}CTTCAGAGTATGTATACC${LEFT}`;
  const forward = primerBinding(SITE, FORWARD)!;
  const reverse = primerBinding(SITE, REVERSE)!;
  const letters = (cells: { base: string }[]): string => cells.map((cell) => cell.base || ".").join("");
  const partner = (base: string): string => ({ A: "T", T: "A", G: "C", C: "G" })[base]!;

  it("shows the template's own bases, each over the one it pairs with, unzipping as it is heated", () => {
    const shut = tubeLens(SITE, FORWARD, forward, "denature", 0, { template: "pWren" });
    expect(letters(shut.upper.cells)).toBe(SITE.slice(shut.from, shut.to));
    expect([...letters(shut.lower.cells)].map(partner).join("")).toBe(SITE.slice(shut.from, shut.to));
    expect(shut.joined.every(Boolean)).toBe(true);
    expect(shut.upper.label).toBe("pWren, top strand");
    const half = tubeLens(SITE, FORWARD, forward, "denature", 0.5);
    expect(half.joined.indexOf(true)).toBeGreaterThan(0);                 // open at the left, shut at the right
    expect(half.joined.slice(half.joined.indexOf(true)).every(Boolean)).toBe(true);
    expect(half.upper.cells[0]!.state).toBe("single");
    expect(tubeLens(SITE, FORWARD, forward, "denature", 1).joined.some(Boolean)).toBe(false);
    expect(shut.polymerase).toBeNull();
  });

  it("lands the primer on the bases it matches, pairing along it, and leaves a tail unpaired", () => {
    const tailed = `GAATTG${FORWARD}`;
    const binding = primerBinding(SITE, tailed)!;
    expect(binding.tail).toBe(6);
    const landed = tubeLens(SITE, tailed, binding, "anneal", 1, { primer: "fwd-1" });
    const at = binding.start - landed.from;
    expect(letters(landed.upper.cells).slice(at - 6, at + 18)).toBe(tailed);
    expect(landed.upper.label).toBe("fwd-1");
    // Every base of the primer that binds is over its partner, and paired; the tail is not.
    for (let place = 0; place < 18; place++) {
      expect(landed.lower.cells[at + place]!.base).toBe(partner(landed.upper.cells[at + place]!.base));
      expect(landed.joined[at + place]).toBe(true);
    }
    expect(landed.joined.slice(at - 6, at).some(Boolean)).toBe(false);
    expect(landed.upper.cells[at - 1]).toEqual({ base: "G", state: "single" });
    expect(landed.joined.filter(Boolean)).toHaveLength(18);
    // Arriving, it is not paired yet; half way, it is paired from its 5′ end.
    expect(tubeLens(SITE, tailed, binding, "anneal", 0.3).joined.some(Boolean)).toBe(false);
    const part = tubeLens(SITE, tailed, binding, "anneal", 0.7).joined.slice(at, at + 18);
    expect(part[0]).toBe(true);
    expect(part[17]).toBe(false);
  });

  it("adds the real next bases one at a time, each the partner of the one opposite", () => {
    const counts = [0, 0.25, 0.5, 0.75, 1].map((through) => tubeLens(SITE, FORWARD, forward, "extend", through).upper.cells.filter((cell) => cell.state === "fresh").length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[0]).toBe(0);
    const half = tubeLens(SITE, FORWARD, forward, "extend", 0.5, { primer: "fwd-1" });
    const end = forward.end - half.from;
    const fresh = half.upper.cells.filter((cell) => cell.state === "fresh");
    expect(letters(fresh)).toBe(SITE.slice(forward.end, forward.end + fresh.length));          // the copy has the top strand's bases
    fresh.forEach((cell, index) => expect(half.lower.cells[end + index]!.base).toBe(partner(cell.base)));
    expect(half.polymerase).toBe(end + fresh.length);
    expect(half.beyond).toBe(SITE.length - forward.end - fresh.length);
    expect(half.upper.label).toBe("fwd-1, and the copy");
    const done = tubeLens(SITE, FORWARD, forward, "extend", 1);
    expect(done.polymerase).toBeNull();                                                       // it has gone on past what is shown
    expect(done.joined.slice(forward.start - done.from).every(Boolean)).toBe(true);
  });

  it("does the same for the primer on the other strand, which is copied leftwards", () => {
    const landed = tubeLens(SITE, REVERSE, reverse, "anneal", 1, { primer: "rev-1" });
    const at = reverse.start - landed.from;
    expect(landed.lower.label).toBe("rev-1");
    expect(letters(landed.lower.cells).slice(at, at + 18)).toBe([...REVERSE].reverse().join(""));     // written 3′ to 5′
    for (let place = 0; place < 18; place++) expect(landed.upper.cells[at + place]!.base).toBe(partner(landed.lower.cells[at + place]!.base));
    expect(letters(landed.upper.cells)).toBe(SITE.slice(landed.from, landed.to));
    const half = tubeLens(SITE, REVERSE, reverse, "extend", 0.5);
    const fresh = half.lower.cells.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell.state === "fresh");
    expect(fresh.length).toBeGreaterThan(3);
    expect(fresh.at(-1)!.index).toBe(at - 1);                                                 // growing away from the primer, to the left
    for (const { cell, index } of fresh) expect(cell.base).toBe(partner(half.upper.cells[index]!.base));
    expect(half.polymerase).toBe(fresh[0]!.index - 1);
    expect(half.beyond).toBe(reverse.start - fresh.length);
  });

  it("stays inside the template when a primer binds at its very end", () => {
    const lens = tubeLens(TEMPLATE, FORWARD, primerBinding(TEMPLATE, FORWARD)!, "anneal", 1);
    expect(lens.from).toBe(0);
    expect(lens.upper.cells).toHaveLength(lens.to - lens.from);
    expect(tubeLens(TEMPLATE, REVERSE, primerBinding(TEMPLATE, REVERSE)!, "extend", 1).to).toBe(TEMPLATE.length);
  });
});
