/**
 * Designing primers, and the working shown for a design.
 *
 * The choosing is `@biolibs/pcr`'s and is tested there. What is checked here is what this package
 * adds to it: that the score shown is the score that chose, that each figure's working really does
 * reach the figure, and that the warnings are raised by the things they say they are raised by.
 */
import { bindingPlaces, crossWorking, designPair, featureStretches, gcWorking, nearestNeighbourTm, pairedStrands, planPcr, primerOrder,
         primerTmWorking, productWorking, scoreCandidate, scoreWorking, selfWorking, stretchBases, stretchLength, tmApartWorking } from "@biolibs/bionet-tools";
import { bestCandidate, checkPrimer, designPrimers, primerCandidates, primerTm, reverseComplement, selfComplementarity } from "@biolibs/pcr";
import { describe, expect, it } from "vitest";

const made = (seed: number, many: number): string => {
  let at = seed;
  const next = (): number => (at = (at * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: many }, () => "ACGT"[Math.floor(next() * 4)]).join("");
};
const TEMPLATE = made(11, 1200);
const plasmid = { sequence: TEMPLATE, circular: true };
/** Every number written in a step, in order, reading a true minus as a minus. */
const numbers = (step: string): number[] => [...step.replace(/−/g, "-").replace(/,(\d{3})/g, "$1").matchAll(/-?\d+(?:\.\d+)?/g)].map((found) => Number(found[0]));

describe("a stretch", () => {
  it("is measured and read, through a circle's origin as well", () => {
    expect(stretchLength({ start: 100, end: 600 }, { length: 1200, circular: true })).toBe(500);
    expect(stretchLength({ start: 1100, end: 200 }, { length: 1200, circular: true })).toBe(300);
    expect(stretchLength({ start: 1100, end: 200 }, { length: 1200, circular: false })).toBe(0);
    expect(stretchLength({ start: 100, end: 1300 }, { length: 1200, circular: true })).toBe(0);
    expect(stretchBases(plasmid, { start: 100, end: 600 })).toBe(TEMPLATE.slice(100, 600));
    expect(stretchBases(plasmid, { start: 1100, end: 200 })).toBe(TEMPLATE.slice(1100) + TEMPLATE.slice(0, 200));
  });

  it("is offered for each feature long enough to hold two primers", () => {
    const part = { length: 1200, circular: true, features: [
      { type: "CDS", label: "geneA", strand: 1 as const, parts: [{ start: 100, end: 400 }, { start: 450, end: 700 }] },
      { type: "primer_bind", label: "old primer", strand: 1 as const, parts: [{ start: 100, end: 120 }] },
      { type: "misc_feature", label: "tiny", strand: 0 as const, parts: [{ start: 10, end: 30 }] },
      { type: "rep_origin", label: "ori", strand: 1 as const, parts: [{ start: 1100, end: 150 }] },
    ] };
    expect(featureStretches(part)).toEqual([
      { start: 100, end: 700, label: "geneA", type: "CDS", length: 600 },
      { start: 1100, end: 150, label: "ori", type: "rep_origin", length: 250 },
    ]);
  });
});

describe("a design", () => {
  const design = designPair(plasmid, { start: 100, end: 600 })!;

  it("is the pair the engine designs, with every length it considered", () => {
    const engine = designPrimers(TEMPLATE, 100, 600)!;
    expect(design.forward.chosen.report.sequence).toBe(engine.forward.sequence);
    expect(design.reverse.chosen.report.sequence).toBe(engine.reverse.sequence);
    expect(design.length).toBe(500);
    expect(design.forward.candidates.map((one) => one.report.length)).toEqual(Array.from({ length: 13 }, (_, at) => 18 + at));
    expect(design.forward.chosen.report.sequence).toBe(TEMPLATE.slice(design.forward.start, design.forward.end));
    expect(design.reverse.chosen.report.sequence).toBe(reverseComplement(TEMPLATE.slice(design.reverse.start, design.reverse.end)));
    expect([design.forward.start, design.reverse.end]).toEqual([100, 600]);
  });

  it("shows the score that chose: the lowest shown is the one the engine picked, on many stretches", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const anchored = made(seed, 60);
      for (const targetTm of [55, 60, 65]) {
        const reports = primerCandidates(anchored, { targetTm });
        const scored = reports.map((report) => scoreCandidate(report, targetTm));
        const lowest = scored.reduce((best, one) => (one.score < best.score ? one : best));
        expect(lowest.report).toBe(bestCandidate(reports, { targetTm }));
        for (const one of scored) expect(one.score).toBeCloseTo(one.offTarget + one.clamp + one.gc, 12);
      }
    }
  });

  it("says why the winner won, and names the runner-up", () => {
    const { best, candidates, why } = design.forward;
    expect(why).toContain(`${best.report.length} bases scores lowest, at ${best.score.toFixed(2)}`);
    const next = candidates.filter((one) => one !== best).sort((a, b) => a.score - b.score)[0]!;
    expect(why).toContain(`${next.report.length} bases`);
  });

  it("uses a length that was asked for in place of the best, and keeps the product the same", () => {
    const other = designPair(plasmid, { start: 100, end: 600 }, { forwardLength: 27, reverseLength: 19 })!;
    expect(other.forward.chosen.report.length).toBe(27);
    expect(other.reverse.chosen.report.length).toBe(19);
    expect(other.forward.best).toEqual(design.forward.best);
    expect([other.forward.start, other.forward.end, other.reverse.start, other.reverse.end]).toEqual([100, 127, 581, 600]);
    expect(other.length).toBe(500);
  });

  it("designs through a circle's origin, and the PCR engine makes that product from the pair", () => {
    const through = designPair(plasmid, { start: 1000, end: 250 })!;
    expect(through.wraps).toBe(true);
    expect(through.length).toBe(450);
    const plan = planPcr(plasmid, through.forward.chosen.report.sequence, through.reverse.chosen.report.sequence);
    expect(plan.problem).toBeNull();
    expect(plan.products[0]!.sequence).toBe(stretchBases(plasmid, { start: 1000, end: 250 }));
  });

  it("makes exactly the stretch, by the engine the PCR tool uses", () => {
    const plan = planPcr(plasmid, design.forward.chosen.report.sequence, design.reverse.chosen.report.sequence);
    expect(plan.problem).toBeNull();
    expect(plan.products[0]!.sequence).toBe(TEMPLATE.slice(100, 600));
  });

  it("is refused for a stretch that is not one, or too short to hold a primer", () => {
    expect(designPair(plasmid, { start: 600, end: 100 }, {})).not.toBeNull();     // through the origin
    expect(designPair({ sequence: TEMPLATE, circular: false }, { start: 600, end: 100 })).toBeNull();
    expect(designPair(plasmid, { start: 100, end: 110 })).toBeNull();
    expect(designPair(plasmid, { start: -1, end: 300 })).toBeNull();
  });

  it("becomes two parts and two lines of an order", () => {
    const order = primerOrder(design, { base: "geneA" });
    expect(order.parts.map((one) => one.name)).toEqual(["geneA-F", "geneA-R"]);
    expect(order.parts[0].sequence).toBe(design.forward.chosen.report.sequence);
    expect(order.lines[1]).toBe(`geneA-R\t${design.reverse.chosen.report.sequence}`);
    expect(primerOrder(design, { base: "x", forward: " mine " }).parts[0].name).toBe("mine");
  });
});

describe("what a careful person would stop at", () => {
  it("is a primer whose 3′ end is found twice", () => {
    // The same 40 bases planted twice: a primer on one binds the other as well.
    const twice = made(3, 300) + made(5, 40) + made(7, 300) + made(5, 40) + made(9, 300);
    const template = { sequence: twice, circular: false };
    const design = designPair(template, { start: 300, end: 700 }, { minLength: 20, maxLength: 20 })!;
    expect(bindingPlaces(template, design.forward.chosen.report.sequence, 18).map((place) => place.start)).toEqual([302, 642]);
    const said = design.warnings.find((one) => one.about === "forward" && one.weight === "stop" && one.says.includes("found in 2 places"));
    expect(said?.says).toContain("at 303 and 643");
    expect(design.warnings[0]!.weight).toBe("stop");
  });

  it("finds a place on the other strand, and one that runs through a circle's origin", () => {
    const template = { sequence: TEMPLATE, circular: true };
    const across = TEMPLATE.slice(-10) + TEMPLATE.slice(0, 10);
    expect(bindingPlaces(template, across, 20)).toEqual([{ start: 1190, end: 1210, reads: "top" }]);
    expect(bindingPlaces({ ...template, circular: false }, across, 20)).toEqual([]);
    expect(bindingPlaces(template, reverseComplement(TEMPLATE.slice(400, 420)), 18)).toEqual([{ start: 400, end: 418, reads: "bottom" }]);
  });

  it("is two melting temperatures too far apart", () => {
    // An AT-rich end and a GC-rich end, with the lengths pinned so neither can be rescued.
    const lopsided = "ATTATAATTTAATATTAAATTATAAT" + made(21, 200) + "GGCGCCGGGCCGCGGCCCGGCGCGCC";
    const design = designPair({ sequence: lopsided, circular: false }, { start: 0, end: lopsided.length }, { minLength: 20, maxLength: 20 })!;
    expect(design.tmApart).toBeGreaterThan(5);
    expect(design.warnings.some((one) => one.about === "pair" && one.weight === "stop" && one.says.includes("apart"))).toBe(true);
    const working = tmApartWorking(design, { forward: "F", reverse: "R" });
    const [high, low, apart] = numbers(working.steps[1]!);
    expect(high! - low!).toBeCloseTo(apart!, 1);
    expect(apart).toBeCloseTo(design.tmApart, 1);
  });

  it("is two primers whose 3′ ends pair with each other", () => {
    // The stretch ends in the reverse complement of how it starts, so the two primers are one sequence
    // and each pairs with the other along its whole length.
    const start = "ACGTTGCAAGCTTGCAACGT";
    const stretch = start + made(31, 200) + reverseComplement(start);
    const design = designPair({ sequence: stretch, circular: false }, { start: 0, end: stretch.length }, { minLength: 20, maxLength: 20 })!;
    expect(design.warnings.some((one) => one.about === "pair" && one.says.includes("primer dimer"))).toBe(true);
  });

  it("is two primers that overlap because the stretch is short", () => {
    const design = designPair(plasmid, { start: 100, end: 130 })!;
    expect(design.warnings.some((one) => one.says.includes("overlap"))).toBe(true);
  });

  it("carries each primer's own warnings from the engine", () => {
    const runny = "ATGAAAAAAGGGGGGCATCAT" + made(41, 200);
    const design = designPair({ sequence: runny, circular: false }, { start: 0, end: runny.length }, { minLength: 21, maxLength: 21 })!;
    expect(design.forward.chosen.report.warnings.length).toBeGreaterThan(0);
    for (const says of design.forward.chosen.report.warnings) {
      expect(design.warnings.some((one) => one.about === "forward" && one.says.includes(says.replace(/3' end/g, "3′ end")))).toBe(true);
    }
    expect(design.warnings.some((one) => one.says.includes("run of 6 identical bases"))).toBe(true);
  });
});

describe("bases that pair with each other", () => {
  it("are counted as the engine counts them, for a primer against itself", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const primer = made(seed, 16 + (seed % 14));
      const paired = pairedStrands(primer, primer);
      expect([primer, paired.length]).toEqual([primer, selfComplementarity(primer)]);
      expect([primer, paired.endLength]).toEqual([primer, selfComplementarity(primer, true)]);
    }
    expect(pairedStrands("AAAAGGGGCCCCTTTT", "AAAAGGGGCCCCTTTT").length).toBe(16);
  });

  it("are laid out so that every base of the run is over its partner", () => {
    const pair: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
    for (let seed = 1; seed <= 60; seed++) {
      const [first, second] = [made(seed, 22), made(seed + 500, 20)];
      const paired = pairedStrands(first, second);
      expect(paired.lower).toBe([...second].reverse().join(""));
      for (const [shift, from, length] of [[paired.shift, paired.from, paired.length], [paired.endShift, paired.endFrom, paired.endLength]] as const) {
        for (let column = from; column < from + length; column++) expect(paired.lower[column - shift]).toBe(pair[paired.upper[column]!]);
      }
      // A run that counts as at a 3′ end takes in the upper strand's last base or the lower strand's first written.
      if (paired.endLength > 0) expect(paired.endFrom + paired.endLength === first.length || paired.endFrom - paired.endShift === 0).toBe(true);
    }
  });

  it("are written out in the working, and the count written is the count found", () => {
    const working = selfWorking("hp", "GGGATCCATTTTTATGGATCC");
    expect(working.longest).toBe(selfComplementarity("GGGATCCATTTTTATGGATCC"));
    expect(working.atEnd).toBe(selfComplementarity("GGGATCCATTTTTATGGATCC", true));
    expect(working.comes).toBe(`${working.longest} in a row, ${working.atEnd} at its 3′ end`);
    // The bases named in the step are that many, and each over its partner.
    const [, over, under] = /The longest run is \d+: ([ACGT]+) over ([ACGT]+)\./.exec(working.steps[1]!)!;
    expect(over!.length).toBe(working.longest);
    expect([...over!].map((base) => ({ A: "T", T: "A", G: "C", C: "G" })[base]).join("")).toBe(under);
    expect(working.steps[2]).toContain("gives the polymerase a paired end to extend");

    const design = designPair(plasmid, { start: 100, end: 600 })!;
    const cross = crossWorking(design, { forward: "F", reverse: "R" });
    expect(cross.longest).toBe(pairedStrands(design.forward.chosen.report.sequence, design.reverse.chosen.report.sequence).length);
    expect(numbers(cross.steps[1]!)[0]).toBe(cross.longest);
  });
});

describe("a melting temperature's working", () => {
  it("sums to the engine's figure, for many primers", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const primer = made(seed, 18 + (seed % 13));
      const terms = nearestNeighbourTm(primer)!;
      expect([primer, terms.tm.toFixed(6)]).toEqual([primer, primerTm(primer).toFixed(6)]);
      expect(terms.pairs.reduce((sum, one) => sum + one.times, 0)).toBe(primer.length - 1);
    }
    expect(nearestNeighbourTm("ACGTN")).toBeNull();
  });

  it("reaches that figure by the arithmetic its steps write down", () => {
    for (const primer of ["GGATCACAGTCTACACTGCT", "ATGAGTAAAGGAGAAGAACTTTTCACTGG", "TTATTTGTATAGTTCATCCATGCC", made(77, 24)]) {
      const working = primerTmWorking("p", primer)!;
      const { terms } = working;
      // Each step's own numbers, put through the sum it states.
      const pairs = numbers(working.steps[0]!).slice(-2);
      expect(pairs[0]).toBeCloseTo(terms.pairs.reduce((sum, one) => sum + one.times * one.dH, 0), 1);
      expect(pairs[1]).toBeCloseTo(terms.pairs.reduce((sum, one) => sum + one.times * one.dS, 0), 1);
      const ends = numbers(working.steps[1]!).slice(-4);
      expect(pairs[0]! + ends[0]!).toBeCloseTo(ends[2]!, 6);
      expect(pairs[1]! + ends[1]!).toBeCloseTo(ends[3]!, 6);
      const salt = numbers(working.steps[2]!);
      const [sodium, saltTerm, withSalt] = [salt.at(-3)!, salt.at(-2)!, salt.at(-1)!];
      expect(0.368 * (primer.length - 1) * Math.log(sodium)).toBeCloseTo(saltTerm, 2);
      expect(ends[3]! + saltTerm).toBeCloseTo(withSalt, 1);
      const strands = numbers(working.steps[3]!).at(-1)!;
      expect(1.987 * Math.log(125e-9)).toBeCloseTo(strands, 2);
      const last = numbers(working.steps[4]!);
      const [dH, dS, k, said] = [last[1]!, last[2]!, last[3]!, last.at(-1)!];
      expect([dH, dS, k]).toEqual([ends[2], withSalt, strands]);
      expect((1000 * dH) / (dS + k) - 273.15).toBeCloseTo(said, 1);
      expect(said).toBeCloseTo(primerTm(primer), 1);
      expect(working.comes).toBe(`${primerTm(primer).toFixed(1)} °C`);
      expect(working.kind).toBe("estimate");
    }
  });
});

describe("the other figures", () => {
  const design = designPair(plasmid, { start: 100, end: 600 })!;

  it("GC content is the count over the length", () => {
    const primer = design.forward.chosen.report;
    const working = gcWorking("F", primer.sequence);
    const [, g, c] = numbers(working.steps[0]!);
    expect(g! + c!).toBe([...primer.sequence].filter((base) => base === "G" || base === "C").length);
    const [sum, length, fraction] = numbers(working.steps[1]!);
    expect(sum! / length!).toBeCloseTo(fraction!, 3);
    expect(fraction).toBeCloseTo(checkPrimer(primer.sequence).gc, 3);
    expect(working.comes).toBe(`${(primer.gc * 100).toFixed(0)}%`);
  });

  it("the product's length is the subtraction of its ends, and agrees with the engine's product", () => {
    const made = planPcr(plasmid, design.forward.chosen.report.sequence, design.reverse.chosen.report.sequence).products[0]!.length;
    const working = productWorking(design, { length: 1200 }, made);
    const [first, end, again, , , length] = numbers(working.steps[0]!);
    expect([first, end, again]).toEqual([101, 600, 600]);
    expect(end! - first! + 1).toBe(length);
    expect(length).toBe(made);
    expect(working.steps[2]).toContain("also makes 500 bp");
    expect(productWorking(design, { length: 1200 }, 499).steps[2]).toContain("does not agree");

    const through = designPair(plasmid, { start: 1000, end: 250 })!;
    const around = numbers(productWorking(through, { length: 1200 }).steps[0]!);
    expect(around.slice(-3)).toEqual([200, 250, 450]);
  });

  it("a candidate's score is the sum its steps write down", () => {
    for (const candidate of design.reverse.candidates) {
      const working = scoreWorking(design.reverse, candidate, design.targetTm);
      const sum = numbers(working.steps[3]!);
      expect(sum[0]! + sum[1]! + sum[2]!).toBeCloseTo(sum[3]!, 1);
      expect(working.comes).toBe(candidate.score.toFixed(2));
      const off = numbers(working.steps[0]!);
      expect(Math.abs(off.at(-3)! - off.at(-2)!)).toBeCloseTo(off.at(-1)!, 1);
    }
  });
});
