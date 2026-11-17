/**
 * The protein a gene codes for.
 *
 * The translating has to agree with `translate` itself, and the figures with ProtParam, so neither
 * is restated here: what is checked is the part this file adds — which stretch was read, which
 * strand, what a signal peptide costs, and that a gene with something wrong with it says so rather
 * than handing back a protein that looks fine.
 */
import { proteinFacts, proteinWorking, translateGene } from "@biolibs/bionet-tools";
import type { PartFeature } from "@biolibs/bionet";
import { translate } from "@biolibs/seq";
import { ProteinAnalysis } from "@biolibs/seqtools";
import { describe, expect, it } from "vitest";

const SIGNAL = "ATGAAAGTTTTAATTTTAGCTTGTTTAGTTGCTTTAGCT";          // 13 codons, the signal peptide
const MATURE = "AGAGAATTAGAAGAATTAAATGTTCCAGGTAAAGTTTTA";          // 13 codons, what is let out
const CDS = `${SIGNAL}${MATURE}TAA`;
const BEFORE = "GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA";
const AFTER = "TTGACATTGACATTGACATTGACA";
const GENE = BEFORE + CDS + AFTER;
const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
const flip = (bases: string): string => [...bases].reverse().map((one) => PAIR[one] ?? "N").join("");

const features: PartFeature[] = [
  { type: "CDS", label: "casein", strand: 1, parts: [{ start: BEFORE.length, end: BEFORE.length + CDS.length }] },
  { type: "sig_peptide", label: "signal", strand: 1, parts: [{ start: BEFORE.length, end: BEFORE.length + SIGNAL.length }] },
];
const gene = { sequence: GENE, features, circular: false };

describe("translating a gene", () => {
  it("reads the coding sequence marked on it, and agrees with translating it by hand", () => {
    const made = translateGene(gene, { cds: "casein" });
    expect(made.problem).toBeNull();
    expect(made.protein).toBe(String(translate(CDS)).replace(/\*$/, ""));
    expect(made.length).toBe((CDS.length / 3) - 1);
    expect(made.from).toEqual({ start: BEFORE.length + 1, end: BEFORE.length + CDS.length, strand: 1 });
    expect(made.stopped).toBe(true);
    expect(made.signal).toBeNull();
    expect(made.warnings).toEqual([]);
  });

  it("cuts off the signal peptide when asked, which is what the cell lets out", () => {
    const whole = translateGene(gene, { cds: "casein" });
    const mature = translateGene(gene, { cds: "casein", cutSignal: true });
    expect(mature.signal).toEqual({ peptide: whole.protein.slice(0, SIGNAL.length / 3), label: "signal" });
    expect(mature.protein).toBe(whole.protein.slice(SIGNAL.length / 3));
    expect(mature.length).toBe(whole.length - SIGNAL.length / 3);
    expect(mature.protein).toBe(String(translate(MATURE)));
  });

  it("says so rather than cutting when there is no signal marked, or it is not at the start", () => {
    const none = translateGene({ ...gene, features: [features[0]!] }, { cds: "casein", cutSignal: true });
    expect(none.signal).toBeNull();
    expect(none.warnings).toContain("No signal peptide is marked on this part, so nothing was cut off.");

    const late: PartFeature = { type: "sig_peptide", label: "signal", strand: 1, parts: [{ start: BEFORE.length + 9, end: BEFORE.length + 9 + 12 }] };
    const inside = translateGene({ ...gene, features: [features[0]!, late] }, { cds: "casein", cutSignal: true });
    expect(inside.signal).toBeNull();
    expect(inside.warnings.some((one) => /is marked from amino acid 4, not from the start/.test(one))).toBe(true);
  });

  it("reads a coding sequence on the bottom strand the right way round", () => {
    const backwards = { sequence: flip(GENE), circular: false, features: [
      { type: "CDS", label: "casein", strand: -1 as const, parts: [{ start: AFTER.length, end: AFTER.length + CDS.length }] }] };
    const made = translateGene(backwards, { cds: "casein" });
    expect(made.from.strand).toBe(-1);
    expect(made.protein).toBe(String(translate(CDS)).replace(/\*$/, ""));
  });

  it("translates the whole part when no coding sequence is named", () => {
    const made = translateGene({ sequence: CDS, features: [], circular: false });
    expect(made.protein).toBe(String(translate(CDS)).replace(/\*$/, ""));
    expect(made.from).toEqual({ start: 1, end: CDS.length, strand: 1 });
  });

  it("says what is wrong rather than handing back a protein that looks fine", () => {
    // No stop at the end, and a stop in the middle: both are reasons not to trust it.
    const broken = `${SIGNAL}TAA${MATURE}`;
    const made = translateGene({ sequence: broken, features: [], circular: false });
    expect(made.problem).toBeNull();
    expect(made.stopped).toBe(false);
    expect(made.warnings.some((one) => /does not end in a stop codon/.test(one))).toBe(true);
    expect(made.warnings.some((one) => /There is a stop at amino acid 14, before the end/.test(one))).toBe(true);

    const ragged = translateGene({ sequence: `${CDS}AC`, features: [], circular: false });
    expect(ragged.warnings.some((one) => /not a whole number of codons, so the last 2 were left out/.test(one))).toBe(true);

    const noMet = translateGene({ sequence: "AAAGTTTTATAA", features: [], circular: false });
    expect(noMet.warnings.some((one) => /does not begin with methionine/.test(one))).toBe(true);
  });

  it.each([
    ["uncertain bases", { sequence: "ACGNNNACG", features: [], circular: false }, {}, /written in A, C, G and T/],
    ["a name nothing is marked under", gene, { cds: "nothing" }, /Nothing called "nothing" is marked/],
    ["a stretch shorter than a codon", { sequence: "AC", features: [], circular: false }, {}, /shorter than one codon/],
  ])("refuses %s", (_what, part, options, problem) => {
    const made = translateGene(part, options);
    expect(made.problem).toMatch(problem);
    expect(made.protein).toBe("");
    expect(proteinWorking(made, null)).toEqual([]);
  });

  it("refuses a coding sequence marked in pieces rather than splicing it", () => {
    const spliced = { ...gene, features: [{ type: "CDS", label: "spliced", strand: 1 as const,
      parts: [{ start: BEFORE.length, end: BEFORE.length + 30 }, { start: BEFORE.length + 39, end: BEFORE.length + CDS.length }] }] };
    expect(translateGene(spliced, { cds: "spliced" }).problem).toMatch(/marked in 2 pieces, which this does not translate/);
  });
});

describe("what is known of a protein", () => {
  it("is what ProtParam says, not anything restated here", () => {
    const protein = String(translate(MATURE));
    const facts = proteinFacts(protein)!;
    const analysis = new ProteinAnalysis(protein);
    expect(facts.weight).toBe(analysis.molecularWeight());
    expect(facts.isoelectric).toBe(analysis.isoelectricPoint());
    expect(facts.instability).toBe(analysis.instabilityIndex());
    expect(facts.gravy).toBe(analysis.gravy());
    expect(facts.extinction.reduced).toBe(analysis.molarExtinctionCoefficient()[0]);
    expect(facts.length).toBe(protein.length);
    // The three fractions are fractions.
    for (const one of Object.values(facts.structure)) expect(one).toBeGreaterThanOrEqual(0);
  });

  it("says nothing rather than guessing for what is not a protein of standard amino acids", () => {
    expect(proteinFacts("MKVL*")).toBeNull();
    expect(proteinFacts("MKVLX")).toBeNull();
    expect(proteinFacts("")).toBeNull();
  });
});

describe("the working", () => {
  it("says which bases were read and what the signal cost", () => {
    const made = translateGene(gene, { cds: "casein", cutSignal: true });
    const working = proteinWorking(made, proteinFacts(made.protein));
    const protein = working.find((one) => one.of === "the protein")!;
    expect(protein.kind).toBe("exact");
    expect(protein.steps.some((one) => one.includes(`read from bases ${BEFORE.length + 1}`))).toBe(true);
    expect(protein.steps.some((one) => /signal, the first 13 amino acids, was cut off/.test(one))).toBe(true);
    expect(protein.steps.some((one) => one.includes("the last codon is a stop"))).toBe(true);

    const known = working.find((one) => one.of === "what is known of it")!;
    expect(known.kind).toBe("estimate");
    expect(known.rests).toMatch(/not what anybody has measured of this protein/);
    expect(known.comes).toMatch(/Da, carrying no net charge at pH/);
  });
});
