/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here. The template is the one the README
 * defines in its first block, and every later block reads it, exactly as the text says.
 */
import { bestCandidate, checkPrimer, cleanPrimer, DEFAULT_CONDITIONS, designPrimers, findBindingSites,
  isPrimer, predictProducts, PRIMER_LIMITS, primerCandidates, primerProblem, primerTm, productSequence,
  productWithTails, tmDifference, withTail } from "@biolibs/pcr";
import { describe, expect, it } from "vitest";

/** The README's template, in the three lines it is written on. */
const TEMPLATE =
  "AAAGCTATCGGCGGAGAACAAGATATGACCGATGCTGAGCGTTAGATACCTCAATGCGATCCGTGAGCAATCGG" +
  "TGAGTACGCCTTTAGGTCTGATAAAATCGACACATTAATGCTCTTCAAGCAACAACCGGCGATTAACCCGGGTA" +
  "ACCTTAAGACACATGAGTCCTGATTCATGCCTCAATACAACACGAGTTTAAT";

/** The pair the README's design section produces, and quotes in every section after it. */
const FORWARD = "AGATATGACCGATGCTGAGCGTTAGATAC";
const REVERSE = "AGGCATGAATCAGGACTCATGTGTC";
const PRIMERS = [{ name: "F", sequence: FORWARD }, { name: "R", sequence: REVERSE }];

/** The M13 forward primer, the README's example of a real primer that trips the limits. */
const M13 = "GTAAAACGACGGCCAGT";

describe("README: the template", () => {
  it("is 200 bases", () => {
    expect(TEMPLATE).toHaveLength(200);
  });
});

describe("README: checking a primer", () => {
  it("measures the M13 forward primer and warns about three things", () => {
    const report = checkPrimer(M13);
    expect(report.length).toBe(17);
    expect(report.tm).toBeCloseTo(52.765, 2);
    expect(report.gc).toBeCloseTo(0.529, 3);
    expect(report.longestRun).toBe(4);
    expect(report.selfComplement).toBe(4);
    expect(report.endSelfComplement).toBe(2);
    expect(report.gcClamp).toBe(false);
    expect(report.warnings).toEqual([
      "the primer is 17 bases, shorter than 18",
      "the melting temperature is 52.8 °C, below 55 °C",
      "the 3' end is not G or C, so the polymerase has less to grip",
    ]);
  });

  it("takes the limits as an argument", () => {
    expect(PRIMER_LIMITS.minLength).toBe(18);
    expect(PRIMER_LIMITS.maxRun).toBe(4);
    const relaxed = checkPrimer(M13, {}, { ...PRIMER_LIMITS, minLength: 10, minTm: 45 });
    expect(relaxed.warnings).toEqual(["the 3' end is not G or C, so the polymerase has less to grip"]);
  });

  it("passes the reaction conditions through to seqtools", () => {
    expect(DEFAULT_CONDITIONS.sodium).toBe(50);
    expect(DEFAULT_CONDITIONS.primer).toBe(250);
    expect(DEFAULT_CONDITIONS.saltCorrection).toBe(5);
    expect(primerTm(M13).toFixed(1)).toBe("52.8");
    expect(primerTm(M13, { sodium: 100 }).toFixed(1)).toBe("56.0");
    expect(primerTm(M13, { magnesium: 2, dntps: 0.8 }).toFixed(1)).toBe("58.9");
    expect(tmDifference(60, 55)).toBe(5);
  });

  it("says what counts as a primer", () => {
    expect(cleanPrimer("  1 gtaaa acgac ggccagt  ")).toBe("GTAAAACGACGGCCAGT");
    expect(cleanPrimer("acguacgu")).toBe("ACGTACGT");
    expect(isPrimer(M13)).toBe(true);
    expect(primerProblem("ACGTNACGTN")).toBe("a primer may only contain A, C, G and T; found N");
    expect(primerProblem("ACGT")).toBe("a primer must be at least 8 bases long, and this one is 4");
    expect(primerProblem(M13)).toBeNull();
  });
});

describe("README: where a primer binds", () => {
  it("finds one site for each of the designed primers", () => {
    const pair = designPrimers(TEMPLATE, 20, 180)!;
    expect(pair.forward.sequence).toBe(FORWARD);
    expect(pair.reverse.sequence).toBe(REVERSE);

    expect(findBindingSites(TEMPLATE, "linear", FORWARD)).toEqual([
      { start: 20, end: 49, strand: "forward", mismatches: 0, endMismatches: 0, extendsFrom: 49 }]);
    expect(findBindingSites(TEMPLATE, "linear", REVERSE)).toEqual([
      { start: 155, end: 180, strand: "reverse", mismatches: 0, endMismatches: 0, extendsFrom: 154 }]);
  });

  it("refuses a 3'-end mismatch even when mismatches are allowed", () => {
    const changedAt5 = `C${FORWARD.slice(1)}`;
    const changedAt3 = `${FORWARD.slice(0, -1)}A`;
    expect(findBindingSites(TEMPLATE, "linear", changedAt5)).toHaveLength(0);
    expect(findBindingSites(TEMPLATE, "linear", changedAt5, { maxMismatches: 1 })).toHaveLength(1);
    expect(findBindingSites(TEMPLATE, "linear", changedAt3, { maxMismatches: 1 })).toHaveLength(0);
    expect(findBindingSites(TEMPLATE, "linear", changedAt3, { maxMismatches: 1, maxEndMismatches: 1 }))
      .toHaveLength(1);
  });
});

describe("README: what a pair would amplify", () => {
  it("gives one product from the forward 5' end to the reverse 5' end", () => {
    const products = predictProducts(TEMPLATE, "linear", PRIMERS);
    expect(products).toHaveLength(1);
    expect(products[0]!.start).toBe(20);
    expect(products[0]!.end).toBe(180);
    expect(products[0]!.length).toBe(160);
    expect(products[0]!.wraps).toBe(false);
    expect(productSequence(TEMPLATE, products[0]!).slice(0, 29)).toBe(FORWARD);
  });

  it("puts a 5' tail into the product but not into the template reading", () => {
    const product = predictProducts(TEMPLATE, "linear", PRIMERS)[0]!;
    const withSites = productWithTails(
      TEMPLATE, product, withTail("GGAATTC", FORWARD), withTail("GGGGATCC", REVERSE));
    expect(productSequence(TEMPLATE, product)).toHaveLength(160);
    expect(withSites).toHaveLength(175);
    expect(withSites.startsWith("GGAATTC")).toBe(true);
    expect(withSites.endsWith("GGATCCCC")).toBe(true);
  });

  it("amplifies the same product across a circular origin, and nothing if called linear", () => {
    const rotated = TEMPLATE.slice(100) + TEMPLATE.slice(0, 100);
    const circular = predictProducts(rotated, "circular", PRIMERS);
    expect(circular).toHaveLength(1);
    expect(circular[0]!.start).toBe(120);
    expect(circular[0]!.end).toBe(280);
    expect(circular[0]!.length).toBe(160);
    expect(circular[0]!.wraps).toBe(true);

    expect(productSequence(rotated, circular[0]!))
      .toBe(productSequence(TEMPLATE, predictProducts(TEMPLATE, "linear", PRIMERS)[0]!));
    expect(predictProducts(rotated, "linear", PRIMERS)).toHaveLength(0);
  });
});

describe("README: designing a pair", () => {
  it("anchors both ends and picks the lengths", () => {
    const pair = designPrimers(TEMPLATE, 20, 180)!;
    expect(pair.forward.sequence).toBe(FORWARD);
    expect(pair.forward.tm.toFixed(2)).toBe("60.45");
    expect(pair.reverse.sequence).toBe(REVERSE);
    expect(pair.reverse.tm.toFixed(2)).toBe("59.47");
    expect([pair.start, pair.end, pair.length]).toEqual([20, 180, 160]);
    expect(pair.forward.warnings).toEqual([]);
    expect(pair.reverse.warnings).toEqual([]);
    expect(tmDifference(pair.forward, pair.reverse).toFixed(2)).toBe("0.98");
  });

  it("returns null when no length in range fits", () => {
    expect(designPrimers("ACGTACGTAC", 0, 10)).toBeNull();
  });

  it("exposes the search in two pieces", () => {
    const candidates = primerCandidates(TEMPLATE.slice(20));
    expect(candidates).toHaveLength(13);
    expect(candidates[0]!.length).toBe(18);
    expect(candidates[0]!.tm.toFixed(2)).toBe("50.02");
    expect(candidates.at(-1)!.tm.toFixed(2)).toBe("61.86");

    expect(bestCandidate(candidates)!.tm.toFixed(2)).toBe("60.45");
    expect(bestCandidate(candidates, { targetTm: 55 })!.length).toBe(20);
    expect(bestCandidate([])).toBeNull();
  });
});
