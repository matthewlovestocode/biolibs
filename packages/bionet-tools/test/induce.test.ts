/**
 * Growing a strain to express what was put into it.
 *
 * The protein itself is `protein.test.ts`'s and the band arithmetic is `@biolibs/gel`'s, so neither
 * is restated. What is checked here is what this file adds: that only cultures of strains that
 * carry something are offered, that the mass comes out in kilodaltons and lands where a gel would
 * put it, that the run it records has no outputs and names the protein by the checksum the lab will
 * give it, and that the checks say when the gel chosen cannot answer the question.
 */
import { partChecksum, type ItemState, type PartState, type PlaceState, type StrainState } from "@biolibs/bionet";
import { DA_PER_KDA, INDUCTION, inducedBy, inductionChecks, inductionCultures, inductionGenes, inductionRun, inductionWorking,
         markerFor, planInduction, proteinFacts, translateGene } from "@biolibs/bionet-tools";
import { proteinGelById, proteinLadderById } from "@biolibs/gel";
import { describe, expect, it } from "vitest";

const SIGNAL = "ATGAAAGTTTTAATTTTAGCTTGTTTAGTTGCTTTAGCT";    // 13 codons, cut off on the way out
// Long enough that what is left weighs something a 12% gel separates.
const MATURE = "AGAGAATTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTAAATGTT"
             + "CCAGGTAAAGTTTTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTA"
             + "AATGTTCCAGGTAAAGTTTTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAAGAATTAAATGTTCCAGGTAAAGTTTTAGAA";
const CDS = `${SIGNAL}${MATURE}TAA`;
const BEFORE = "GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA";
const GENE = `${BEFORE}${CDS}TTGACATTGACA`;

const part = (over: Partial<PartState> & Pick<PartState, "checksum" | "sequence">): PartState => ({
  kind: "dna", circular: false, length: over.sequence.length, name: "a part", offered: false, features: [],
  ends: { left: 0, right: 0 }, fields: {}, added: "e1", ...over,
});
const gene = part({
  checksum: partChecksum({ sequence: GENE }), sequence: GENE, name: "pWren casein",
  features: [
    { type: "CDS", label: "casein", strand: 1, parts: [{ start: BEFORE.length, end: BEFORE.length + CDS.length }] },
    { type: "sig_peptide", label: "signal", strand: 1, parts: [{ start: BEFORE.length, end: BEFORE.length + SIGNAL.length }] },
    { type: "rep_origin", label: "ori", strand: 1, parts: [{ start: 0, end: 20 }] },
  ],
});
const protein = part({ checksum: partChecksum({ sequence: "MKVLILA", kind: "protein" }), sequence: "MKVLILA", kind: "protein", name: "a protein the lab holds" });

const strain = (over: Partial<StrainState> & Pick<StrainState, "strain">): StrainState => ({
  name: "W303 pWren-1", host: "Saccharomyces cerevisiae W303", carries: [gene.checksum], parent: null, from: null, fields: {}, added: "e2", ...over,
});
const item = (over: Partial<ItemState> & Pick<ItemState, "item">): ItemState => ({
  part: null, strain: null, amount: 5, unit: "mL", retired: false, needsRecount: false, where: null, from: null, fields: {}, added: "e3", ...over,
});
const places: PlaceState[] = [];
const yeast = strain({ strain: "s1" });
const bare = strain({ strain: "s2", name: "W303", carries: [] });
const culture = item({ item: "c1", strain: "s1" });
const lab = {
  parts: [gene, protein], places,
  strains: [yeast, bare],
  items: [culture, item({ item: "c2", strain: "s2" }), item({ item: "t1", part: gene.checksum, unit: "µL" }),
          item({ item: "c3", strain: "s1", amount: 0 }), item({ item: "c4", strain: "s1", retired: true })],
};
const asked = { culture: "c1", gene: gene.checksum, cds: "casein" };

describe("what there is to induce", () => {
  it("offers cultures and not tubes, and leaves out the empty and the retired", () => {
    const offered = inductionCultures(lab);
    expect(offered.map((one) => one.item)).toEqual(["c1", "c2"]);
  });

  it("puts a culture that carries something before one that carries nothing", () => {
    expect(inductionCultures(lab)[0]!.strain.strain).toBe("s1");
  });

  it("offers what the strain carries, with the coding sequences marked on it", () => {
    expect(inductionGenes(lab, "c1")).toEqual([{ part: gene, coding: ["casein"] }]);
  });

  it("offers nothing for a strain nothing has been put into", () => {
    expect(inductionGenes(lab, "c2")).toEqual([]);
  });

  it("does not offer a protein the strain is somehow said to carry: what is expressed is a gene", () => {
    const odd = { ...lab, strains: [strain({ strain: "s1", carries: [protein.checksum] })] };
    expect(inductionGenes(odd, "c1")).toEqual([]);
  });
});

describe("what an induction would give", () => {
  it("is the protein the gene codes for, by the same translating as everything else", () => {
    const plan = planInduction(lab, asked);
    expect(plan.problem).toBeNull();
    expect(plan.made!.protein).toBe(translateGene(gene, { cds: "casein" }).protein);
    expect(plan.strain).toBe(yeast);
    expect(plan.gene).toBe(gene);
  });

  it("gives the mass in kilodaltons, which is what a protein gel is read in", () => {
    const plan = planInduction(lab, asked);
    expect(plan.kilodaltons).toBeCloseTo(proteinFacts(plan.made!.protein)!.weight / DA_PER_KDA, 10);
    expect(plan.kilodaltons).toBeGreaterThan(proteinGelById("12").smallest);
    expect(plan.kilodaltons).toBeLessThan(proteinGelById("12").largest);
  });

  it("puts the band where the gel would put it", () => {
    const plan = planInduction(lab, asked);
    const [high, low] = [Math.log10(plan.gel.largest), Math.log10(plan.gel.smallest)];
    expect(plan.bands[0]!.position).toBeCloseTo((high - Math.log10(plan.kilodaltons!)) / (high - low), 10);
  });

  it("weighs what the cell lets out when the signal peptide is cut, which is lighter", () => {
    const whole = planInduction(lab, asked);
    const mature = planInduction(lab, { ...asked, cutSignal: true });
    expect(mature.made!.signal!.label).toBe("signal");
    expect(mature.made!.length).toBe(whole.made!.length - SIGNAL.length / 3);
    expect(mature.kilodaltons!).toBeLessThan(whole.kilodaltons!);
  });

  it("names the protein by the checksum the lab will give it, and the lab agrees", () => {
    const plan = planInduction(lab, asked);
    expect(plan.checksum).toBe(partChecksum({ sequence: plan.made!.protein, kind: "protein" }));
    // The same letters as DNA must never be the same part.
    expect(partChecksum({ sequence: "ACGTACGT", kind: "protein" })).not.toBe(partChecksum({ sequence: "ACGTACGT" }));
  });

  it("says why there is nothing to expect, rather than expecting nothing quietly", () => {
    expect(planInduction(lab, { culture: "t1", gene: gene.checksum }).problem).toMatch(/culture of a strain/);
    expect(planInduction(lab, { culture: "c2", gene: gene.checksum }).problem).toMatch(/does not carry/);
    expect(planInduction(lab, { culture: "c2", gene: "" }).problem).toMatch(/nothing in it to express/);
    expect(planInduction(lab, { culture: "c1", gene: "" }).problem).toMatch(/Choose which/);
  });

  it("runs a marker whose bands the gel actually separates, unless one is named", () => {
    // A broad-range marker on a 12% gel puts 250, 150 and 100 kDa all in the well, where they are
    // one smudge and nothing can be read against them.
    expect(markerFor(proteinGelById("12")).id).toBe("low");
    expect(markerFor(proteinGelById("7.5")).id).toBe("broad");
    const chosen = planInduction(lab, asked);
    expect(chosen.ladderName).toBe(proteinLadderById("low").name);
    expect(chosen.ladder.every((one) => !one.unresolved)).toBe(true);
    // Named, the operator's choice stands, even where it crowds.
    expect(planInduction(lab, { ...asked, ladder: "broad" }).ladder.some((one) => one.unresolved)).toBe(true);
  });

  it("falls back to a gel it knows when asked for one it does not", () => {
    expect(planInduction(lab, { ...asked, gel: "99", ladder: "nope" }).gel.id).toBe("12");
  });
});

describe("the checks before it is run", () => {
  it("says when the band would be smaller than the gel separates", () => {
    const stop = inductionChecks(planInduction(lab, { ...asked, gel: "7.5" })).find((one) => one.weight === "stop");
    expect(stop?.says).toMatch(/smaller than 7.5% acrylamide separates/);
  });

  it("says when the band would be larger than the gel separates", () => {
    const long = `ATG${MATURE.repeat(12)}TAA`;
    const heavy = part({ checksum: partChecksum({ sequence: long }), sequence: long, name: "a long gene" });
    const plan = planInduction({ parts: [heavy], places, items: [culture], strains: [strain({ strain: "s1", carries: [heavy.checksum] })] },
                               { culture: "c1", gene: heavy.checksum, gel: "15" });
    expect(plan.problem).toBeNull();
    expect(plan.kilodaltons).toBeGreaterThan(proteinGelById("15").largest);
    expect(inductionChecks(plan).find((one) => one.weight === "stop")?.says).toMatch(/larger than 15% acrylamide separates/);
  });

  it("carries the translation's own warnings through, so a broken gene is not quietly expressed", () => {
    const broken = part({ checksum: partChecksum({ sequence: "ATGAAATAACCCGGGTTT" }), sequence: "ATGAAATAACCCGGGTTT", name: "broken" });
    const plan = planInduction({ ...lab, parts: [broken], strains: [strain({ strain: "s1", carries: [broken.checksum] })] },
                               { culture: "c1", gene: broken.checksum });
    expect(inductionChecks(plan).some((one) => /does not end in a stop codon/.test(one.says))).toBe(true);
  });

  it("says the signal peptide was taken off, since the mass depends on it", () => {
    expect(inductionChecks(planInduction(lab, { ...asked, cutSignal: true })).some((one) => /was taken off/.test(one.says))).toBe(true);
  });

  it("puts what is worth stopping for before what is only worth a glance", () => {
    const checks = inductionChecks(planInduction(lab, { ...asked, cutSignal: true, gel: "7.5" }));
    expect(checks[0]!.weight).toBe("stop");
  });
});

describe("what is recorded", () => {
  it("is a run that used the culture and made no molecule", () => {
    const run = inductionRun(lab, { ...asked, used: 2 });
    expect(run.showed).not.toBeNull();
    expect(run.showed!["kind"]).toBe(INDUCTION);
    expect(run.showed!["outcome"]).toBe("worked");
    expect(run.showed!["outputs"]).toEqual([]);
    expect(run.showed!["inputs"]).toEqual([{ item: "c1", amount: 2, role: "culture" }]);
  });

  it("names the protein it expects in the settings, by its checksum, because the run cannot carry it", () => {
    const run = inductionRun(lab, asked);
    const settings = run.showed!["settings"] as Record<string, string | number>;
    expect(settings["made"]).toBe(run.plan.checksum);
    expect(settings["gene_part"]).toBe(gene.checksum);
    expect(settings["cds"]).toBe("casein");
    // Text, because an entry carries only whole numbers and a gel is read to a tenth of a kilodalton.
    expect(settings["expected_kda"]).toBe((Math.round(run.plan.kilodaltons! * 10) / 10).toFixed(1));
  });

  it("keeps what it set, so that somebody can set it up the same way or deliberately differently", () => {
    const settings = inductionRun(lab, { ...asked, inducer: "galactose", concentration: "2%", celsius: 25, rpm: 200, hours: 16 }).showed!["settings"] as Record<string, unknown>;
    expect(settings).toMatchObject({ inducer: "galactose", at: "2%", celsius: 25, rpm: 200, hours: 16 });
  });

  it("records the run either way, and only keeps a protein when the band was there", () => {
    const run = inductionRun(lab, asked);
    expect(run.nothing!["outcome"]).toBe("failed");
    expect(run.nothing!["inputs"]).toEqual(run.showed!["inputs"]);
    expect(run.keep).toMatchObject({ kind: "protein", sequence: run.plan.made!.protein, checksum: run.plan.checksum });
  });

  it("calls the protein after the coding sequence, and says when it is the mature one", () => {
    expect(inductionRun(lab, asked).keep!.name).toBe("casein");
    expect(inductionRun(lab, { ...asked, cutSignal: true }).keep!.name).toBe("mature casein");
    expect(inductionRun(lab, { ...asked, name: "CSN2" }).keep!.name).toBe("CSN2");
  });

  it("has nothing to record for a culture the lab does not hold", () => {
    expect(inductionRun(lab, { culture: "nope", gene: gene.checksum }).showed).toBeNull();
    expect(inductionRun(lab, { culture: "nope", gene: gene.checksum }).nothing).toBeNull();
  });

  it("ties a protein back to the runs that made it, from the log alone", () => {
    const run = inductionRun(lab, asked);
    const settings = run.showed!["settings"] as Record<string, string | number>;
    const runs = [{ run: "r1", kind: INDUCTION, outcome: "worked", settings },
                  { run: "r2", kind: INDUCTION, outcome: "failed", settings },
                  { run: "r3", kind: "pcr", outcome: "worked", settings }];
    expect(inducedBy({ runs }, run.plan.checksum!)).toEqual(["r1"]);
    expect(inducedBy({ runs }, "something else")).toEqual([]);
  });
});

describe("the working", () => {
  it("shows the band's position as a subtraction of logarithms, and calls it an estimate", () => {
    const working = inductionWorking(planInduction(lab, asked));
    const gel = working.at(-1)!;
    expect(gel.of).toMatch(/12% acrylamide/);
    expect(gel.kind).toBe("estimate");
    expect(gel.steps.some((one) => /log₁₀/.test(one))).toBe(true);
    expect(gel.rests).toMatch(/never off a distance/);
  });

  it("has nothing to show when there is no protein to expect", () => {
    expect(inductionWorking(planInduction(lab, { culture: "c2", gene: gene.checksum }))).toEqual([]);
  });
});
