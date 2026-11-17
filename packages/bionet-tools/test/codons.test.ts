/**
 * Writing a gene in a host's codons.
 *
 * Two things are checked harder than the rest. The first is that the protein does not change: that
 * is the whole promise, and it is checked against `translate` rather than against the rewriting's
 * own idea of itself. The second is where the preferences come from — a table is counted from
 * sequences that were handed in, never asserted, and a table counted over too little says so,
 * because a figure nobody can check is worse than no figure.
 */
import { CODON, FEW_CODONS, FEW_GENES, LONGEST_RUN, codonWorking, countCodonUsage, gcOfHost, optimiseCodons, reverseTranslate } from "@biolibs/bionet-tools";
import { CodonTable, translate } from "@biolibs/seq";
import { describe, expect, it } from "vitest";

/** The standard code, read from the same place the engine reads it. */
const standard = CodonTable.unambiguousDnaById.get(1)!;
const forward = new Map<string, string>(standard.forwardTable as unknown as Iterable<[string, string]>);
const familyOf = (aminoAcid: string): string[] => [...forward].filter(([, one]) => one === aminoAcid).map(([codon]) => codon);

/** A gene written in whichever codon of each amino acid is asked for. */
const geneOf = (protein: string, pick: (family: string[]) => string): string =>
  [...protein].map((one) => pick(familyOf(one))).join("");

const PROTEIN = "MKVLILACLVALALARELEELNVPGEIVESLSSSEESITRINKKIEK";

describe("counting how a host uses its codons", () => {
  it("counts over the genes it is given, and says what it counted", () => {
    const genes = [geneOf(PROTEIN, (family) => family[0]!), geneOf(PROTEIN, (family) => family[0]!)];
    const usage = countCodonUsage(genes, { from: "two made-up genes" });
    expect(usage).toMatchObject({ table: 1, genes: 2, from: "two made-up genes" });
    expect(usage.codons).toBe(PROTEIN.length * 2);
    // Every leucine was written as the first leucine codon, so that one takes the whole share.
    const leucine = familyOf("L");
    expect(usage.counts[leucine[0]!]!.share).toBe(1);
    for (const codon of leucine.slice(1)) expect(usage.counts[codon]!.share).toBe(0);
    expect(usage.counts[leucine[0]!]!.aminoAcid).toBe("L");
  });

  it("leaves out what is not a whole number of codons, or not plain DNA, and says so", () => {
    const good = geneOf(PROTEIN, (family) => family[0]!);
    const usage = countCodonUsage([good, "ACGTA", "ACGNNN", ""], {});
    expect(usage.genes).toBe(1);
    expect(usage.warnings.some((one) => one.includes("not a whole number of codons"))).toBe(true);
    expect(usage.warnings.some((one) => one.includes("not A, C, G or T"))).toBe(true);
  });

  it("says when it was counted over too little to lean on", () => {
    const one = countCodonUsage([geneOf(PROTEIN, (family) => family[0]!)], {});
    expect(one.genes).toBeLessThan(FEW_GENES);
    expect(one.warnings.some((each) => each.includes("which is few"))).toBe(true);
    // A rare amino acid says its own preference is thin, whatever the number of genes.
    expect(FEW_CODONS).toBeGreaterThan(0);
    expect(one.warnings.some((each) => /appears only \d+ times/.test(each))).toBe(true);
  });

  it("counts nothing from nothing, and optimising against it is refused rather than guessed", () => {
    const empty = countCodonUsage([], {});
    expect(empty).toMatchObject({ genes: 0, codons: 0 });
    const done = optimiseCodons(geneOf(PROTEIN, (family) => family[0]!), empty);
    expect(done.problem).toBe("The codon usage was counted over nothing, so there is nothing to prefer.");
    expect(done.sequence).toBe("");
  });

  it("does not count stop codons, since nothing chooses between stops", () => {
    const usage = countCodonUsage([`${geneOf("MK", (family) => family[0]!)}TAA`], {});
    expect(usage.codons).toBe(2);
    expect(usage.counts["TAA"]).toBeUndefined();
  });
});

describe("rewriting a gene", () => {
  /** A host that likes the last codon of every family, which is the opposite of the gene below. */
  const host = countCodonUsage(Array.from({ length: 6 }, () => geneOf(PROTEIN, (family) => family.at(-1)!)), { from: "six genes of a made-up host" });
  const gene = geneOf(PROTEIN, (family) => family[0]!);

  it("makes the very same protein, checked by translating both", () => {
    const done = optimiseCodons(gene, host);
    expect(done.problem).toBeNull();
    expect(done.protein).toBe(PROTEIN);
    expect(String(translate(done.sequence))).toBe(String(translate(gene)));
    expect(done.sequence).toHaveLength(gene.length);
    expect(done.codons).toBe(PROTEIN.length);
  });

  it("takes the host's favourite codon where it can, and says what each change was worth", () => {
    const done = optimiseCodons(gene, host);
    // Every amino acid with a choice was written the other way round, so every one of those changed.
    const withChoice = [...PROTEIN].filter((one) => familyOf(one).length > 1).length;
    expect(done.changes).toHaveLength(withChoice);
    for (const change of done.changes) {
      expect(forward.get(change.from)).toBe(change.aminoAcid);
      expect(forward.get(change.to)).toBe(change.aminoAcid);
      expect(change.toShare).toBeGreaterThanOrEqual(change.fromShare);
    }
    // Methionine and tryptophan have one codon each, so they are never touched.
    expect(done.changes.some((one) => one.aminoAcid === "M" || one.aminoAcid === "W")).toBe(false);
  });

  it("will not make a long run of one base, and says which codon it passed over", () => {
    // A host that wants GGG for every glycine would write a run straight through a run of glycines.
    const keen = countCodonUsage(Array.from({ length: 6 }, () => "GGG".repeat(12)), {});
    const done = optimiseCodons("GGAGGAGGAGGAGGAGGA", keen, { longestRun: 4 });
    expect(done.problem).toBeNull();
    expect(String(translate(done.sequence))).toBe("GGGGGG");
    expect(/(.)\1{4}/.test(done.sequence)).toBe(false);
    expect(done.changes.some((one) => one.instead?.includes("would have made a run of"))).toBe(true);
    expect(LONGEST_RUN).toBeGreaterThan(4);
  });

  it("keeps a site out of the sequence when asked, and says it did", () => {
    const done = optimiseCodons(gene, host, { avoid: [{ name: "EcoRI", site: "GAATTC" }, { name: "BamHI", site: "GGATCC" }] });
    expect(done.problem).toBeNull();
    expect(done.sequence).not.toContain("GAATTC");
    expect(done.sequence).not.toContain("GGATCC");
    expect(done.avoided).toEqual(["EcoRI", "BamHI"]);
    expect(String(translate(done.sequence))).toBe(PROTEIN);
  });

  it("leaves a stop codon exactly as it is", () => {
    const done = optimiseCodons(`${gene}TGA`, host);
    expect(done.sequence.endsWith("TGA")).toBe(true);
    expect(done.changes.every((one) => one.at <= PROTEIN.length)).toBe(true);
  });

  it.each([
    ["a sequence that is not whole codons", "ACGTA", /not a whole number of codons/],
    ["uncertain bases", "ACGNNNACG", /written in A, C, G and T/],
    ["nothing at all", "", /not a whole number of codons/],
  ])("refuses %s rather than guessing", (_what, given, problem) => {
    const done = optimiseCodons(given, host);
    expect(done.problem).toMatch(problem);
    expect(done.sequence).toBe("");
  });

  it("says what it did to the GC content", () => {
    const done = optimiseCodons(gene, host);
    const gcOf = (bases: string): number => [...bases].filter((one) => one === "G" || one === "C").length / bases.length;
    expect(done.gcBefore).toBeCloseTo(gcOf(gene), 10);
    expect(done.gcAfter).toBeCloseTo(gcOf(done.sequence), 10);
  });

  it("passes a thin table on as a warning rather than hiding it", () => {
    const thin = countCodonUsage([geneOf(PROTEIN, (family) => family.at(-1)!)], {});
    const done = optimiseCodons(gene, thin);
    expect(done.problem).toBeNull();
    expect(done.warnings.some((one) => one.includes("counted over 1 gene"))).toBe(true);
  });
});

describe("the working behind it", () => {
  const host = countCodonUsage(Array.from({ length: 8 }, () => geneOf(PROTEIN, (family) => family.at(-1)!)), { from: "eight genes of a made-up host" });
  const gene = geneOf(PROTEIN, (family) => family[0]!);

  it("says where the preferences came from, and does not claim more than that", () => {
    const done = optimiseCodons(gene, host);
    const working = codonWorking(done, host);
    const table = working.find((one) => one.of === "the host's preferences")!;
    expect(table.kind).toBe("estimate");
    expect(table.steps).toContain("counted from: eight genes of a made-up host");
    expect(table.steps).toContain("read with NCBI genetic code 1");
    expect(table.rests).toMatch(/Nothing here is a published table/);
    expect(table.comes).toBe(`${(PROTEIN.length * 8).toLocaleString("en-US")} codons counted over 8 genes`);
  });

  it("adds up: the codons changed and unchanged are all the codons", () => {
    const done = optimiseCodons(gene, host);
    const rewrite = codonWorking(done, host).find((one) => one.of === "the rewrite")!;
    expect(rewrite.kind).toBe("exact");
    const already = Number(rewrite.steps[0]!.split(" ")[0]!.replace(/,/g, ""));
    expect(already + done.changes.length).toBe(done.codons);
    expect(rewrite.steps.some((one) => one.startsWith("GC went from"))).toBe(true);
  });

  it("says the protein was compared, not assumed", () => {
    const done = optimiseCodons(gene, host);
    const protein = codonWorking(done, host).find((one) => one.of === "the protein")!;
    expect(protein.comes).toBe(`${PROTEIN.length} amino acids, unchanged`);
    expect(protein.steps.some((one) => one.includes("translated before and after"))).toBe(true);
    expect(codonWorking(optimiseCodons("ACGTA", host), host)).toEqual([]);
  });

  it("uses whole codons throughout", () => {
    expect(CODON).toBe(3);
  });
});

describe("writing a gene for a protein", () => {
  /** A host that uses one codon per amino acid, so what it prefers is never in doubt. */
  const plainly = (): ReturnType<typeof countCodonUsage> => {
    const forward = new Map<string, string>(CodonTable.unambiguousDnaById.get(1)!.forwardTable as unknown as Iterable<[string, string]>);
    const first = new Map<string, string>();
    for (const [codon, aminoAcid] of [...forward].sort(([a], [b]) => (a < b ? -1 : 1))) if (!first.has(aminoAcid)) first.set(aminoAcid, codon);
    // Every gene of this host is written in its one favourite codon each.
    const gene = [...first.values()].join("").repeat(3);
    return countCodonUsage([gene], { from: "a host that has made up its mind" });
  };

  it("writes a gene that really encodes the protein, which is the whole promise", () => {
    const protein = "MKVLILACLVALALARELEELNVPGEIVESLSSSEESITR";
    const made = reverseTranslate(protein, plainly());
    expect(made.problem).toBeNull();
    // Translated back, it is the protein that was asked for, with the stop it was given.
    expect(String(translate(made.sequence))).toBe(`${protein}*`);
    expect(made.sequence).toHaveLength((protein.length + 1) * CODON);
    expect(made.codons).toBe(protein.length + 1);
  });

  it("uses the host's own codons, since that is the point of writing it", () => {
    const usage = plainly();
    const made = reverseTranslate("MKV", usage);
    const codons = made.sequence.match(/.{3}/g)!;
    const forward = new Map<string, string>(CodonTable.unambiguousDnaById.get(1)!.forwardTable as unknown as Iterable<[string, string]>);
    for (const [at, residue] of [..."MKV"].entries()) {
      // The codon chosen reads as the right amino acid, and is one the host actually uses.
      expect(forward.get(codons[at]!)).toBe(residue);
      expect(usage.counts[codons[at]!]!.count).toBeGreaterThan(0);
    }
  });

  it("keeps a site out of a gene it writes, as it would out of one it rewrites", () => {
    const protein = "MEFEFEFEFEFEFMEFEFEF";
    const kept = reverseTranslate(protein, countCodonUsage(["ATGGAATTCGAATTTGAGTTT".repeat(4)], { from: "a host" }),
                                  { avoid: [{ name: "EcoRI", site: "GAATTC" }] });
    expect(kept.problem).toBeNull();
    expect(kept.sequence).not.toContain("GAATTC");
    expect(kept.avoided).toEqual(["EcoRI"]);
    expect(String(translate(kept.sequence))).toBe(`${protein}*`);
  });

  it("leaves the stop off when told to, for something that is part of a fusion", () => {
    const made = reverseTranslate("MKV", plainly(), { stop: false });
    expect(made.sequence).toHaveLength(3 * CODON);
    expect(String(translate(made.sequence))).toBe("MKV");
    // And takes a stop that was written on the end of the protein as meaning the same thing.
    expect(reverseTranslate("MKV*", plainly(), { stop: false }).sequence).toHaveLength(3 * CODON);
  });

  it("claims no changes, because nothing was changed from anything", () => {
    const made = reverseTranslate("MKVLIL", plainly());
    expect(made.changes).toEqual([]);
    expect(made.warnings.join(" ")).toMatch(/Written from the protein, not rewritten from a gene/);
    expect(made.warnings.join(" ")).toMatch(/A stop codon is on the end/);
  });

  it("says why it cannot, rather than writing something wrong", () => {
    expect(reverseTranslate("", plainly()).problem).toMatch(/no protein here/);
    expect(reverseTranslate("MKV1", plainly()).problem).toMatch(/twenty standard amino acids/);
    expect(reverseTranslate("MKV", countCodonUsage([], { from: "nothing" })).problem).toMatch(/counted over nothing/);
  });
});

describe("sitting where the host's own genes sit", () => {
  const gc = (bases: string): number => [...bases].filter((one) => one === "G" || one === "C").length / bases.length;
  const poorest = (family: string[]): string => [...family].sort((a, b) => gc(a) - gc(b) || (a < b ? -1 : 1))[0]!;
  const richest = (family: string[]): string => [...family].sort((a, b) => gc(b) - gc(a) || (a < b ? -1 : 1))[0]!;

  /**
   * A host that *prefers* AT-rich codons without being made only of them: three genes written the
   * poor way against two written the rich way. That is the shape a real host has, and the one that
   * matters — the commonest codon is AT-rich, but the host's own genes sit well above it.
   */
  const atRich = (): ReturnType<typeof countCodonUsage> =>
    countCodonUsage([geneOf(PROTEIN, poorest), geneOf(PROTEIN, poorest), geneOf(PROTEIN, poorest),
                     geneOf(PROTEIN, richest), geneOf(PROTEIN, richest)], { from: "an AT-rich host" });

  it("says where the host sits, counted from what was handed in", () => {
    const counted = geneOf(PROTEIN, poorest);
    expect(gcOfHost(countCodonUsage([counted], { from: "a host" }))).toBeCloseTo(gc(counted), 10);
    // Nothing counted, nothing to say.
    expect(gcOfHost(countCodonUsage([], { from: "nothing" }))).toBe(0);
  });

  it("takes the most-used codon every time unless asked otherwise, which overshoots", () => {
    const usage = atRich();
    const plain = reverseTranslate(PROTEIN, usage, { stop: false });
    // Left alone it lands at the extreme the host's favourites imply, below the host itself.
    expect(plain.gcAfter).toBeLessThan(gcOfHost(usage) - 0.02);
  });

  it("steers to the host's own GC when asked, without touching the protein", () => {
    const usage = atRich();
    const aimed = reverseTranslate(PROTEIN, usage, { stop: false, gc: "host" });
    expect(aimed.problem).toBeNull();
    expect(aimed.protein).toBe(PROTEIN);
    expect(String(translate(aimed.sequence))).toBe(PROTEIN);
    expect(aimed.gcAfter).toBeCloseTo(gcOfHost(usage), 1);
  });

  it("takes a number as readily as the host's own figure, and ignores a nonsense one", () => {
    const usage = atRich();
    const high = reverseTranslate(PROTEIN, usage, { stop: false, gc: 0.6 });
    const low = reverseTranslate(PROTEIN, usage, { stop: false, gc: 0.2 });
    expect(high.gcAfter).toBeGreaterThan(low.gcAfter);
    expect(String(translate(high.sequence))).toBe(PROTEIN);
    expect(String(translate(low.sequence))).toBe(PROTEIN);
    // A target outside the range a gene can have is left alone rather than chased.
    const silly = reverseTranslate(PROTEIN, usage, { stop: false, gc: 2 });
    expect(silly.sequence).toBe(reverseTranslate(PROTEIN, usage, { stop: false }).sequence);
  });

  it("will not make a site or a run while steering", () => {
    const usage = atRich();
    const avoid = [{ name: "BsaI", site: "GGTCTC" }, { name: "NcoI", site: "CCATGG" }, { name: "SacI", site: "GAGCTC" }];
    const aimed = reverseTranslate(PROTEIN, usage, { stop: false, gc: 0.62, avoid, longestRun: 4 });
    expect(aimed.protein).toBe(PROTEIN);
    for (const one of avoid) expect(aimed.sequence).not.toContain(one.site);
    expect(/(.)\1{4}/.test(aimed.sequence)).toBe(false);
  });

  it("keeps the working honest about why a codon moved", () => {
    const usage = atRich();
    const gene = geneOf(PROTEIN, poorest);
    const aimed = optimiseCodons(gene, usage, { gc: 0.6 });
    expect(aimed.changes.length).toBeGreaterThan(0);
    expect(aimed.changes.some((one) => one.instead === "steered toward the host's own GC")).toBe(true);
    for (const one of aimed.changes) expect(forward.get(one.from)).toBe(forward.get(one.to));
  });
});
