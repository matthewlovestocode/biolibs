/**
 * The working behind what the PCR tool says.
 *
 * The point of showing working is that it can be checked, so each piece is checked here against
 * the thing it claims to explain: the count against the melting temperature the tool uses, the
 * subtraction against the product the engine builds, the bases against the sequences themselves.
 */
import { bindingWorking, carriedWorking, countsWorking, lengthWorking, planPcr, primerBinding, primerTm, programmeChecks, programmeWorking,
         strandCounts, suggestProgramme, tmWorking } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const TEMPLATE = (() => {
  let seed = 11;
  const next = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: 600 }, () => "ACGT"[Math.floor(next() * 4)]).join("");
})();
const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
const flipped = (bases: string): string => [...bases].reverse().map((base) => PAIR[base]).join("");
const forward = { name: "fwd", sequence: TEMPLATE.slice(100, 122) };
const reverse = { name: "rvs", sequence: flipped(TEMPLATE.slice(380, 402)) };

describe("a melting temperature's working", () => {
  it("counts to the figure the tool uses", () => {
    const working = tmWorking("fwd", "GGATCACAGTCTACACTG")!;
    expect(working.steps).toEqual(["9 of its 18 bases are A or T, and 9 are G or C.", "2 × 9 + 4 × 9 = 54 °C."]);
    expect(working.comes).toBe(`about ${primerTm("GGATCACAGTCTACACTG")} °C`);
    expect(working.kind).toBe("estimate");
    expect(working.rests).toMatch(/Wallace/);
  });

  it("agrees with the tool for any primer", () => {
    for (const primer of [forward.sequence, reverse.sequence, "ATATATATATATATATAT", "GCGCGCGCGCGCGCGCGC"]) {
      const said = tmWorking("p", primer)!.steps[1]!;
      expect(Number(said.match(/= (\d+) °C/)![1])).toBe(primerTm(primer));
    }
  });

  it("has nothing to say of what is not a sequence", () => {
    expect(tmWorking("p", "not dna")).toBeNull();
  });
});

describe("a primer laid against the strand it binds", () => {
  it("pairs every base of a primer that reads as the top strand, with the bottom strand", () => {
    const binding = primerBinding(TEMPLATE, forward.sequence)!;
    const working = bindingWorking(TEMPLATE, forward, binding, 18);
    expect(working.strand).toBe("bottom");
    expect(working.faced.every((one) => one.pairs)).toBe(true);
    expect(working.faced.map((one) => one.faces).join("")).toBe([...forward.sequence].map((base) => PAIR[base]).join(""));
    expect([working.from, working.to]).toEqual([101, 122]);
    expect(working.faced.filter((one) => one.needed).length).toBe(18);
  });

  it("pairs every base of a primer that reads as the bottom strand, with the top strand", () => {
    const binding = primerBinding(TEMPLATE, reverse.sequence)!;
    const working = bindingWorking(TEMPLATE, reverse, binding, 18);
    expect(working.strand).toBe("top");
    expect(working.faced.every((one) => one.pairs)).toBe(true);
    // Read 5′ to 3′ along the primer, the top strand's bases come in reverse.
    expect(working.faced.map((one) => one.faces).join("")).toBe([...TEMPLATE.slice(380, 402)].reverse().join(""));
  });

  it("shows a tail as bases that face nothing they pair with", () => {
    const tailed = { name: "fwd", sequence: `GGATCC${forward.sequence}` };
    const working = bindingWorking(TEMPLATE, tailed, primerBinding(TEMPLATE, tailed.sequence)!, 18);
    expect(working.faced.slice(6).every((one) => one.pairs)).toBe(true);
    expect(working.faced.slice(0, 6).some((one) => one.pairs)).toBe(false);
    expect(working.steps[1]).toMatch(/first 6 at its 5′ end do not/);
  });

  it("says the 3′ end is found in one place only", () => {
    const working = bindingWorking(TEMPLATE, forward, primerBinding(TEMPLATE, forward.sequence)!, 18);
    expect(working.steps[2]).toMatch(/one place only/);
  });
});

describe("a product's length, worked out apart from the engine", () => {
  const [top, bottom] = [primerBinding(TEMPLATE, forward.sequence)!, primerBinding(TEMPLATE, reverse.sequence)!];
  const made = planPcr({ sequence: TEMPLATE, circular: false }, forward.sequence, reverse.sequence).products[0]!.length;

  it("comes to what the engine builds", () => {
    const working = lengthWorking(top, bottom, { length: 600, circular: false }, made);
    expect(working.comes).toBe(`${made} bp`);
    expect(working.steps[0]).toMatch(/402 − 101 \+ 1 = 302/);
    expect(working.steps.at(-1)).toMatch(/also gives 302/);
  });

  it("adds the tails", () => {
    const tailed = `GGATCC${forward.sequence}`;
    const working = lengthWorking(primerBinding(TEMPLATE, tailed)!, bottom, { length: 600, circular: false });
    expect(working.comes).toBe("308 bp");
    expect(working.steps[1]).toMatch(/302 \+ 6 \+ 0 = 308/);
  });

  it("says so when the engine disagrees", () => {
    expect(lengthWorking(top, bottom, { length: 600, circular: false }, 999).steps.at(-1)).toMatch(/does not agree/);
  });

  it("goes through the origin of a circle", () => {
    const working = lengthWorking({ ...top, start: 500, end: 522 }, { ...bottom, start: 78, end: 100 }, { length: 600, circular: true });
    expect(working.comes).toBe("200 bp");
  });
});

describe("where a programme's figures come from", () => {
  const reaction = { length: 1500, primers: [{ name: "fwd", tm: 60 }, { name: "rvs", tm: 58 }] };

  it("comes to what is suggested", () => {
    const programme = suggestProgramme(reaction);
    const [anneal, extend] = programmeWorking(reaction, programme);
    expect(anneal!.comes).toBe(`${programme.steps[1].celsius} °C`);
    expect(anneal!.steps[1]).toMatch(/58 − 5 = 53 °C\./);
    expect(extend!.comes).toBe(`${programme.steps[2].seconds} s`);
    expect(extend!.steps[0]).toMatch(/1,500 ÷ 1,000 × 60 = 90 s/);
  });

  it("gives every check the comparison that raised it", () => {
    const programme = suggestProgramme(reaction);
    programme.steps[1].celsius = 65;
    programme.steps[2].seconds = 20;
    programme.cycles = 45;
    const checks = programmeChecks(programme, reaction);
    expect(checks.map((check) => check.because)).toEqual(["65 °C > 58 °C", "20 s < half of 1,500 ÷ 1,000 × 60 = 90 s", "45 > 40"]);
  });
});

describe("how many strands there are", () => {
  it("has rows that add up, and that double", () => {
    const working = countsWorking(30);
    expect(working.rows.map((row) => row.cycle)).toEqual([0, 1, 2, 3, 4, 5, 30]);
    for (const row of working.rows) {
      expect(row.template + row.long + row.product).toBe(row.total);
      expect(row.total).toBe(2 * 2 ** row.cycle);
      expect(row.product).toBe(strandCounts(row.cycle).product);
    }
    expect(working.steps.at(-1)).toMatch(/2,147,483,648 − 60 − 2 = 2,147,483,586/);
  });

  it("does not show cycles a short programme never reaches", () => {
    expect(countsWorking(3).rows.map((row) => row.cycle)).toEqual([0, 1, 2, 3]);
  });
});

describe("how a feature was carried", () => {
  it("shows the subtraction for one wholly copied and one cut by the end", () => {
    const lines = carriedWorking([
      { type: "CDS", label: "inside", strand: 1, parts: [{ start: 150, end: 300 }] },
      { type: "promoter", label: "half", strand: 1, parts: [{ start: 50, end: 140 }] },
      { type: "CDS", label: "outside", strand: 1, parts: [{ start: 450, end: 500 }] },
    ], 100, 402, 6);
    expect(lines).toEqual([
      "inside: 151..300 on the template. Less the 100 bases before the copy and plus the tail's 6: 57..206 on the product.",
      "half: 51..140 on the template, of which 101..140 is copied. Less the 100 bases before the copy and plus the tail's 6: 7..46 on the product.",
    ]);
  });
});
