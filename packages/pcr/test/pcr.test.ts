import { ValueError } from "@biolibs/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONDITIONS, MAX_PRIMER_LENGTH, MIN_PRIMER_LENGTH, PRIMER_LIMITS, bestCandidate, checkPrimer, cleanPrimer,
  designPrimers, findBindingSites, gcFractionOf, isPrimer, longestRun, predictProducts, primerCandidates,
  primerProblem, primerTm, productSequence, productWithTails, requirePrimer, reverseComplement,
  selfComplementarity, tmDifference, withTail,
} from "@biolibs/pcr";

/** The universal M13 sequencing primers, the most widely quoted pair there is. */
const M13_FORWARD = "GTAAAACGACGGCCAGT";
const M13_REVERSE = "CAGGAAACAGCTATGAC";

/** A primer that trips none of the advisory limits. */
const CLEAN = "GTTCCCATCAGCAAAATGGCACTC";

describe("cleanPrimer", () => {
  it("upper-cases and drops whitespace and position numbers", () => {
    expect(cleanPrimer("  1 gtaaa acgac ggccagt  ")).toBe(M13_FORWARD);
  });

  it("reads U as T, so an RNA-style sequence can be pasted in", () => {
    expect(cleanPrimer("acgu")).toBe("ACGT");
  });

  it("drops line breaks and tabs", () => {
    expect(cleanPrimer("ACG\n\tT")).toBe("ACGT");
  });

  it("leaves other characters alone so they can be reported", () => {
    expect(cleanPrimer("acg-n")).toBe("ACG-N");
  });
});

describe("isPrimer and primerProblem", () => {
  it("accepts unambiguous DNA of a sensible length", () => {
    expect(isPrimer(M13_FORWARD)).toBe(true);
    expect(primerProblem(M13_FORWARD)).toBeNull();
  });

  it("rejects an empty sequence", () => {
    expect(isPrimer("")).toBe(false);
    expect(primerProblem("")).toBe("a primer may not be empty");
  });

  it("rejects ambiguity codes and gaps, naming them", () => {
    expect(isPrimer("ACGTACGTN")).toBe(false);
    expect(primerProblem("ACGTACGTN")).toBe("a primer may only contain A, C, G and T; found N");
    expect(primerProblem("ACGT-ACGT")).toBe("a primer may only contain A, C, G and T; found -");
  });

  it("names every offending character once", () => {
    expect(primerProblem("ACGTNNRYR")).toBe("a primer may only contain A, C, G and T; found N, R, Y");
  });

  it("rejects a sequence that is too short or too long", () => {
    expect(isPrimer("ACGTACG")).toBe(false);
    expect(primerProblem("ACGTACG")).toMatch(/at least 8 bases long, and this one is 7/);
    expect(isPrimer("A".repeat(MAX_PRIMER_LENGTH + 1))).toBe(false);
    expect(primerProblem("A".repeat(MAX_PRIMER_LENGTH + 1))).toMatch(/at most 200 bases long/);
  });

  it("accepts the shortest and longest allowed", () => {
    expect(isPrimer("ACGT".repeat(2))).toBe(true);
    expect("ACGT".repeat(2)).toHaveLength(MIN_PRIMER_LENGTH);
    expect(isPrimer("A".repeat(MAX_PRIMER_LENGTH))).toBe(true);
  });

  it("throws from requirePrimer with the reason and the label", () => {
    expect(() => requirePrimer("ACGTN", "forward primer")).toThrow(ValueError);
    expect(() => requirePrimer("ACGTN", "forward primer")).toThrow(/forward primer: a primer may only contain/);
    expect(() => requirePrimer(M13_FORWARD)).not.toThrow();
  });
});

describe("primerTm", () => {
  it("gives the nearest-neighbour temperature of the M13 primers", () => {
    // Via Bio.SeqUtils.MeltingTemp.Tm_NN at 50 mM Na and 250 nM primer, which @biolibs/seqtools ports.
    expect(primerTm(M13_FORWARD)).toBeCloseTo(52.77, 1);
    expect(primerTm(M13_REVERSE)).toBeCloseTo(47.18, 1);
  });

  it("rises with GC content", () => {
    expect(primerTm("GCGCGCGCGCGCGCGCGCGC")).toBeGreaterThan(primerTm("ATATATATATATATATATAT"));
  });

  it("rises with length", () => {
    expect(primerTm("ACGTACGTACGTACGTACGT")).toBeGreaterThan(primerTm("ACGTACGTACGT"));
  });

  it("rises with salt and with primer concentration", () => {
    const primer = "ATGCGTACGTTAGCCATGGC";
    expect(primerTm(primer, { sodium: 200 })).toBeGreaterThan(primerTm(primer));
    expect(primerTm(primer, { primer: 1000 })).toBeGreaterThan(primerTm(primer));
  });

  it("uses 50 mM sodium and 250 nM primer when nothing is said", () => {
    expect(DEFAULT_CONDITIONS.sodium).toBe(50);
    expect(DEFAULT_CONDITIONS.primer).toBe(250);
    expect(primerTm(M13_FORWARD, {})).toBe(primerTm(M13_FORWARD, DEFAULT_CONDITIONS));
  });

  it("rejects a primer it cannot measure", () => {
    expect(() => primerTm("ACGTN")).toThrow(ValueError);
    expect(() => primerTm("ACG")).toThrow(ValueError);
  });
});

describe("gcFractionOf and reverseComplement", () => {
  it("counts G and C", () => {
    expect(gcFractionOf("GGCC")).toBe(1);
    expect(gcFractionOf("ATAT")).toBe(0);
    expect(gcFractionOf("ACGT")).toBe(0.5);
    expect(gcFractionOf("")).toBe(0);
  });

  it("complements and reverses", () => {
    expect(reverseComplement("ACGT")).toBe("ACGT");
    expect(reverseComplement("AAAA")).toBe("TTTT");
    expect(reverseComplement("GGTACC")).toBe("GGTACC");
  });

  it("is its own inverse", () => {
    expect(reverseComplement(reverseComplement(M13_FORWARD))).toBe(M13_FORWARD);
  });

  it("keeps the length when a character cannot be complemented", () => {
    expect(reverseComplement("ACNGT")).toHaveLength(5);
  });
});

describe("longestRun", () => {
  it("finds the longest run of one base", () => {
    expect(longestRun("AACCCCGT")).toBe(4);
    expect(longestRun("ACGT")).toBe(1);
    expect(longestRun("AAAA")).toBe(4);
    expect(longestRun("")).toBe(0);
  });
});

describe("selfComplementarity", () => {
  it("reports the full length for a sequence that is wholly self-complementary", () => {
    expect(selfComplementarity("AAAAGGGGCCCCTTTT")).toBe(16);
    expect(selfComplementarity("ACGTACGTACGTACGT")).toBe(16);
  });

  it("reports a short stretch for a sequence with little self-pairing", () => {
    expect(selfComplementarity("AAAAAAAAAAAA")).toBe(0);
    expect(selfComplementarity(M13_FORWARD)).toBeLessThanOrEqual(6);
  });

  it("never reports more than the sequence length", () => {
    for (const primer of [M13_FORWARD, M13_REVERSE, CLEAN, "GGGGCCCC"]) {
      expect(selfComplementarity(primer)).toBeLessThanOrEqual(primer.length);
    }
  });

  it("counts only stretches reaching the 3' end when asked", () => {
    // A primer ending in GGGG pairs its last four bases with a CCCC at the 5' end.
    expect(selfComplementarity("CCCCAAAAAAAAGGGG", true)).toBeGreaterThanOrEqual(4);
    // The same self-pairing moved away from the 3' end does not count.
    expect(selfComplementarity("CCCCGGGGAAAAAAAA", true)).toBeLessThan(selfComplementarity("CCCCGGGGAAAAAAAA"));
  });

  it("never reports more for the 3' end than for the whole primer", () => {
    for (const primer of [M13_FORWARD, CLEAN, "CCCCAAAAAAAAGGGG", "GGGGCCCC"]) {
      expect(selfComplementarity(primer, true)).toBeLessThanOrEqual(selfComplementarity(primer));
    }
  });
});

describe("checkPrimer", () => {
  it("measures a primer", () => {
    const report = checkPrimer(M13_FORWARD);
    expect(report.sequence).toBe(M13_FORWARD);
    expect(report.length).toBe(17);
    expect(report.gc).toBeCloseTo(9 / 17, 10);
    expect(report.tm).toBeCloseTo(52.77, 1);
    expect(report.longestRun).toBe(4);
    expect(report.gcClamp).toBe(false);
  });

  it("gives no warnings for a primer inside every limit", () => {
    expect(checkPrimer(CLEAN).warnings).toEqual([]);
  });

  it("warns about a primer that is too short or too long", () => {
    expect(checkPrimer(M13_FORWARD).warnings).toContain("the primer is 17 bases, shorter than 18");
    expect(checkPrimer("ACGTACGTACGTACGTACGTACGTACGTACGTA").warnings.some((w) => w.includes("longer than 30"))).toBe(true);
  });

  it("warns about GC content outside the band", () => {
    expect(checkPrimer("ATATATATATATATATATAT").warnings.some((w) => w.includes("GC content is 0%, below 40%"))).toBe(true);
    expect(checkPrimer("GCGCGCGCGCGCGCGCGCGC").warnings.some((w) => w.includes("GC content is 100%, above 60%"))).toBe(true);
  });

  it("warns about a melting temperature outside the band", () => {
    expect(checkPrimer("ATATATATATATATATATAT").warnings.some((w) => /melting temperature is .*below 55/.test(w))).toBe(true);
    expect(checkPrimer("GCGCGCGCGCGCGCGCGCGC").warnings.some((w) => /melting temperature is .*above 65/.test(w))).toBe(true);
  });

  it("warns about a long run of one base", () => {
    expect(checkPrimer("ACGTAAAAAGCTAGCTAGCTC").warnings.some((w) => w.includes("run of 5 identical bases"))).toBe(true);
  });

  it("warns about self-complementarity, and separately about it at the 3' end", () => {
    const dimer = checkPrimer("AAAAGGGGCCCCTTTTAAAAGGGG");
    expect(dimer.warnings.some((w) => w.includes("self-complementary, so it may form a dimer"))).toBe(true);
    expect(dimer.warnings.some((w) => w.includes("at the 3' end are self-complementary"))).toBe(true);
  });

  it("warns about a missing GC clamp", () => {
    expect(checkPrimer(M13_FORWARD).warnings).toContain("the 3' end is not G or C, so the polymerase has less to grip");
    expect(checkPrimer(CLEAN).warnings.some((w) => w.includes("3' end is not G or C"))).toBe(false);
  });

  it("takes custom limits", () => {
    const strict = { ...PRIMER_LIMITS, maxRun: 3 };
    expect(checkPrimer(M13_FORWARD, {}, strict).warnings.some((w) => w.includes("run of 4"))).toBe(true);
    const loose = { ...PRIMER_LIMITS, minLength: 10, minTm: 40, maxTm: 80 };
    expect(checkPrimer(M13_FORWARD, {}, loose).warnings).toEqual([
      "the 3' end is not G or C, so the polymerase has less to grip",
    ]);
  });

  it("reports the melting temperature under the conditions given", () => {
    expect(checkPrimer(CLEAN, { sodium: 200 }).tm).toBeGreaterThan(checkPrimer(CLEAN).tm);
  });

  it("rejects limits that are the wrong way round", () => {
    expect(() => checkPrimer(CLEAN, {}, { ...PRIMER_LIMITS, minTm: 70, maxTm: 60 })).toThrow(ValueError);
    expect(() => checkPrimer(CLEAN, {}, { ...PRIMER_LIMITS, minGc: 0.9, maxGc: 0.1 })).toThrow(ValueError);
  });

  it("rejects an unusable primer", () => {
    expect(() => checkPrimer("ACGTN")).toThrow(ValueError);
  });
});

describe("tmDifference", () => {
  it("takes reports or plain temperatures", () => {
    expect(tmDifference(60, 55)).toBe(5);
    expect(tmDifference(55, 60)).toBe(5);
    const a = checkPrimer(M13_FORWARD);
    const b = checkPrimer(M13_REVERSE);
    expect(tmDifference(a, b)).toBeCloseTo(Math.abs(a.tm - b.tm), 10);
    expect(tmDifference(a, 50)).toBeCloseTo(Math.abs(a.tm - 50), 10);
  });
});

describe("findBindingSites", () => {
  const template = "AAAGGTACCTTT";

  it("finds an exact match on the top strand", () => {
    const sites = findBindingSites(template, "linear", "GGTACCTT");
    const forward = sites.find((s) => s.strand === "forward")!;
    expect(forward.start).toBe(3);
    expect(forward.end).toBe(11);
    expect(forward.mismatches).toBe(0);
    expect(forward.extendsFrom).toBe(11);
  });

  it("finds a match on the bottom strand, with the primer's 3' end at the left", () => {
    const sites = findBindingSites(template, "linear", "GGTACCTT");
    const reverse = sites.find((s) => s.strand === "reverse")!;
    // reverseComplement("GGTACCTT") is "AAGGTACC", which is template[1..9).
    expect(reverse.start).toBe(1);
    expect(reverse.end).toBe(9);
    expect(reverse.extendsFrom).toBe(0);
  });

  it("finds both strands at once where the primer is its own reverse complement", () => {
    // AAGGTACCTT is palindromic, so it binds the top and bottom strands at the same place.
    const sites = findBindingSites("AAAAAAGGTACCTTAAAA", "linear", "AAGGTACCTT");
    expect(sites.filter((s) => s.strand === "forward")).toHaveLength(1);
    expect(sites.filter((s) => s.strand === "reverse")).toHaveLength(1);
    expect(sites.every((s) => s.start === 4 && s.end === 14)).toBe(true);
  });

  it("returns sites ordered by start, forward before reverse", () => {
    const sites = findBindingSites("GGTACCAAAAAAGGTACCAA", "linear", "GGTACCAA", { maxMismatches: 2 });
    const starts = sites.map((s) => s.start);
    expect([...starts]).toEqual([...starts].sort((a, b) => a - b));
  });

  it("finds nothing when there is no match", () => {
    expect(findBindingSites("AAAAAAAAAAAA", "linear", "GGGGCCCC")).toEqual([]);
  });

  it("demands an exact match by default", () => {
    expect(findBindingSites("AAAGGTACCTTT", "linear", "GGTTCCTT")).toEqual([]);
  });

  it("allows mismatches when asked, and counts them", () => {
    // TGTACCTT against GGTACCTT differs only at the 5' end, well outside the 3' window.
    const sites = findBindingSites("AAAGGTACCTTT", "linear", "TGTACCTT", { maxMismatches: 1 });
    const forward = sites.find((s) => s.strand === "forward")!;
    expect(forward.start).toBe(3);
    expect(forward.mismatches).toBe(1);
    expect(forward.endMismatches).toBe(0);
  });

  it("refuses a mismatch inside the 3' window even when the total is allowed", () => {
    // GGTTCCTT differs from GGTACCTT four bases from the 3' end, inside the five-base window.
    expect(findBindingSites("AAAGGTACCTTT", "linear", "GGTTCCTT", { maxMismatches: 1 })).toEqual([]);
    const allowed = findBindingSites("AAAGGTACCTTT", "linear", "GGTTCCTT", { maxMismatches: 1, maxEndMismatches: 1 });
    expect(allowed.find((s) => s.strand === "forward")!.endMismatches).toBe(1);
  });

  it("counts mismatches near the 3' end separately and refuses them by default", () => {
    // The last base of the primer does not match, so the 3' window holds one mismatch.
    expect(findBindingSites("AAAGGTACCTTT", "linear", "GGTACCTA", { maxMismatches: 2 })).toEqual([]);
    const allowed = findBindingSites("AAAGGTACCTTT", "linear", "GGTACCTA", { maxMismatches: 2, maxEndMismatches: 1 });
    const forward = allowed.find((s) => s.strand === "forward")!;
    expect(forward.endMismatches).toBe(1);
    expect(forward.mismatches).toBe(1);
  });

  it("measures the 3' window from the right end for a forward primer and the left for a reverse one", () => {
    const narrow = findBindingSites("AAAGGTACCTTT", "linear", "AGTACCTT", { maxMismatches: 1, maxEndMismatches: 0, endWindow: 1 });
    // The mismatch is at the primer's 5' end, so a one-base 3' window is clean on both strands.
    expect(narrow.length).toBeGreaterThan(0);
  });

  it("finds a site that wraps the origin of a circular template", () => {
    const sites = findBindingSites("CCAAAAAAAAAAGGTA", "circular", "GGTACC");
    const forward = sites.find((s) => s.strand === "forward")!;
    expect(forward.start).toBe(12);
    expect(forward.end).toBe(18);
  });

  it("does not wrap a linear template", () => {
    expect(findBindingSites("CCAAAAAAAAAAGGTA", "linear", "GGTACC")).toEqual([]);
  });

  it("finds a wrapping site exactly once", () => {
    const forward = findBindingSites("CCAAAAAAAAAAGGTA", "circular", "GGTACC").filter((s) => s.strand === "forward");
    expect(forward).toHaveLength(1);
  });

  it("never treats an ambiguity code in the template as a match", () => {
    expect(findBindingSites("AAANNNNNNNNN", "linear", "NNNNNNNN")).toEqual([]);
    expect(findBindingSites("AAANNNNNNTTT", "linear", "AAAAAAAA", { maxMismatches: 8 })).toEqual([]);
  });

  it("finds nothing for a primer longer than a linear template", () => {
    expect(findBindingSites("ACGT", "linear", "ACGTACGT")).toEqual([]);
  });

  it("rejects a primer longer than a circular template", () => {
    expect(() => findBindingSites("ACGT", "circular", "ACGTACGT")).toThrow(ValueError);
  });

  it("rejects an empty primer or negative options", () => {
    expect(() => findBindingSites("ACGT", "linear", "")).toThrow(ValueError);
    expect(() => findBindingSites("ACGT", "linear", "AC", { maxMismatches: -1 })).toThrow(ValueError);
    expect(() => findBindingSites("ACGT", "linear", "AC", { endWindow: -1 })).toThrow(ValueError);
  });
});

describe("predictProducts", () => {
  // The two M13 primers facing each other across 60 bases of filler.
  const middle = "C".repeat(60);
  const template = "A".repeat(20) + M13_FORWARD + middle + reverseComplement(M13_REVERSE) + "T".repeat(20);
  const primers = [{ name: "F", sequence: M13_FORWARD }, { name: "R", sequence: M13_REVERSE }];

  it("finds the product a facing pair makes", () => {
    const products = predictProducts(template, "linear", primers);
    expect(products).toHaveLength(1);
    expect(products[0]!.forward).toBe("F");
    expect(products[0]!.reverse).toBe("R");
  });

  it("measures the product from one primer's 5' end to the other's, both included", () => {
    const product = predictProducts(template, "linear", primers)[0]!;
    expect(product.start).toBe(20);
    expect(product.end).toBe(20 + M13_FORWARD.length + middle.length + M13_REVERSE.length);
    expect(product.length).toBe(M13_FORWARD.length + middle.length + M13_REVERSE.length);
  });

  it("gives a product sequence starting with the forward primer and ending with the reverse primer's complement", () => {
    const product = predictProducts(template, "linear", primers)[0]!;
    const sequence = productSequence(template, product);
    expect(sequence.startsWith(M13_FORWARD)).toBe(true);
    expect(sequence.endsWith(reverseComplement(M13_REVERSE))).toBe(true);
    expect(sequence).toHaveLength(product.length);
  });

  it("makes nothing from primers that face away from each other", () => {
    const away = "A".repeat(20) + reverseComplement(M13_REVERSE) + middle + M13_FORWARD + "T".repeat(20);
    expect(predictProducts(away, "linear", primers)).toEqual([]);
  });

  it("gives one product per pair of facing sites, however they sit on a circle", () => {
    const circular = M13_FORWARD + middle + reverseComplement(M13_REVERSE) + "T".repeat(40);
    const products = predictProducts(circular, "circular", primers);
    expect(products).toHaveLength(1);
    expect(products[0]!.wraps).toBe(false);
  });

  it("amplifies across the origin when the reverse site comes first", () => {
    // The reverse primer sits at the start of the plasmid and the forward primer near the end, so the only way
    // they face each other is the long way round, through the origin.
    const circular = reverseComplement(M13_REVERSE) + "T".repeat(40) + M13_FORWARD + "C".repeat(20);
    const products = predictProducts(circular, "circular", primers);
    expect(products).toHaveLength(1);
    const product = products[0]!;
    expect(product.wraps).toBe(true);
    expect(product.start).toBe(57);
    expect(product.end).toBe(circular.length + M13_REVERSE.length);
    expect(product.length).toBe(M13_FORWARD.length + 20 + M13_REVERSE.length);
  });

  it("reads a wrapping product's sequence across the origin", () => {
    const circular = reverseComplement(M13_REVERSE) + "T".repeat(40) + M13_FORWARD + "C".repeat(20);
    const wrapping = predictProducts(circular, "circular", primers).find((p) => p.wraps)!;
    const sequence = productSequence(circular, wrapping);
    expect(sequence).toHaveLength(wrapping.length);
    expect(sequence.startsWith(M13_FORWARD)).toBe(true);
    expect(sequence.endsWith(reverseComplement(M13_REVERSE))).toBe(true);
  });

  it("never wraps on a linear template", () => {
    expect(predictProducts(template, "linear", primers).some((p) => p.wraps)).toBe(false);
  });

  it("tries a primer with itself, which a palindromic site makes possible", () => {
    const palindrome = "AAGGTACCTT";
    const self = "AAAA" + palindrome + "AAAA";
    const products = predictProducts(self, "linear", [{ name: "P", sequence: palindrome }]);
    const selfProduct = products.find((p) => p.forward === "P" && p.reverse === "P");
    expect(selfProduct).toBeDefined();
    expect(selfProduct!.length).toBe(palindrome.length);
  });

  it("orders products shortest first", () => {
    // Two forward sites and one reverse site, so two products of different lengths.
    const two = "A".repeat(10) + M13_FORWARD + "G".repeat(30) + M13_FORWARD + middle + reverseComplement(M13_REVERSE);
    const lengths = predictProducts(two, "linear", primers).map((p) => p.length);
    expect(lengths.length).toBeGreaterThan(1);
    expect([...lengths]).toEqual([...lengths].sort((a, b) => a - b));
  });

  it("leaves out products longer than the limit", () => {
    expect(predictProducts(template, "linear", primers, {}, 50)).toEqual([]);
    expect(predictProducts(template, "linear", primers, {}, 1000)).toHaveLength(1);
  });

  it("rejects two primers with the same name or a bad length limit", () => {
    expect(() => predictProducts(template, "linear", [primers[0]!, primers[0]!])).toThrow(ValueError);
    expect(() => predictProducts(template, "linear", [primers[0]!, primers[0]!])).toThrow(/both called 'F'/);
    expect(() => predictProducts(template, "linear", primers, {}, 0)).toThrow(ValueError);
  });

  it("makes nothing from no primers", () => {
    expect(predictProducts(template, "linear", [])).toEqual([]);
  });
});

describe("productWithTails", () => {
  const middle = "C".repeat(60);
  const template = "A".repeat(20) + M13_FORWARD + middle + reverseComplement(M13_REVERSE) + "T".repeat(20);
  const primers = [{ name: "F", sequence: M13_FORWARD }, { name: "R", sequence: M13_REVERSE }];

  it("matches productSequence when the primers carry no tail", () => {
    const product = predictProducts(template, "linear", primers)[0]!;
    expect(productWithTails(template, product, M13_FORWARD, M13_REVERSE)).toBe(productSequence(template, product));
  });

  it("puts a forward tail at the start and a reverse tail at the end, complemented", () => {
    const product = predictProducts(template, "linear", primers)[0]!;
    const tailed = productWithTails(template, product, withTail("GGAATTC", M13_FORWARD), withTail("GGGGTACC", M13_REVERSE));
    expect(tailed.startsWith("GGAATTC" + M13_FORWARD)).toBe(true);
    expect(tailed.endsWith(reverseComplement(withTail("GGGGTACC", M13_REVERSE)))).toBe(true);
    expect(tailed).toHaveLength(product.length + 7 + 8);
  });

  it("works across the origin of a circular template", () => {
    const circular = reverseComplement(M13_REVERSE) + "T".repeat(40) + M13_FORWARD + "C".repeat(20);
    const wrapping = predictProducts(circular, "circular", primers).find((p) => p.wraps)!;
    const tailed = productWithTails(circular, wrapping, withTail("GGAATTC", M13_FORWARD), M13_REVERSE);
    expect(tailed).toHaveLength(wrapping.length + 7);
    expect(tailed.startsWith("GGAATTC" + M13_FORWARD)).toBe(true);
    expect(tailed.endsWith(reverseComplement(M13_REVERSE))).toBe(true);
  });

  it("rejects a primer shorter than its own binding site", () => {
    const product = predictProducts(template, "linear", primers)[0]!;
    expect(() => productWithTails(template, product, "ACGT", M13_REVERSE)).toThrow(ValueError);
    expect(() => productWithTails(template, product, M13_FORWARD, "ACGT")).toThrow(ValueError);
  });
});

describe("primerCandidates and bestCandidate", () => {
  const anchored = CLEAN + "GGCATTAGCATCGATCGGATCCA";

  it("gives one candidate per length in range, shortest first", () => {
    const candidates = primerCandidates(anchored, { minLength: 18, maxLength: 24 });
    expect(candidates.map((c) => c.length)).toEqual([18, 19, 20, 21, 22, 23, 24]);
  });

  it("stops at the end of the sequence", () => {
    expect(primerCandidates("ACGTACGTACGTACGTACGT", { minLength: 18, maxLength: 30 }).map((c) => c.length)).toEqual([18, 19, 20]);
  });

  it("skips lengths covering an ambiguity code rather than failing", () => {
    const candidates = primerCandidates("ACGTACGTACGTACGTACGTN", { minLength: 18, maxLength: 21 });
    expect(candidates.map((c) => c.length)).toEqual([18, 19, 20]);
  });

  it("gives nothing for a sequence shorter than the range", () => {
    expect(primerCandidates("ACGT", { minLength: 18, maxLength: 30 })).toEqual([]);
  });

  it("rejects a length range the wrong way round", () => {
    expect(() => primerCandidates(anchored, { minLength: 30, maxLength: 18 })).toThrow(ValueError);
    expect(() => primerCandidates(anchored, { minLength: 0 })).toThrow(ValueError);
  });

  it("picks the candidate nearest the target temperature", () => {
    const candidates = primerCandidates(anchored, { minLength: 18, maxLength: 30 });
    const best = bestCandidate(candidates, { targetTm: 60 })!;
    for (const candidate of candidates) {
      // Allow the GC clamp and GC content terms a little room; the chosen one should not be far worse on Tm.
      expect(Math.abs(best.tm - 60)).toBeLessThanOrEqual(Math.abs(candidate.tm - 60) + 4);
    }
  });

  it("follows the target it is given", () => {
    const candidates = primerCandidates(anchored, { minLength: 18, maxLength: 30 });
    const cool = bestCandidate(candidates, { targetTm: 50 })!;
    const warm = bestCandidate(candidates, { targetTm: 70 })!;
    expect(cool.tm).toBeLessThan(warm.tm);
  });

  it("gives null for no candidates", () => {
    expect(bestCandidate([])).toBeNull();
  });
});

describe("designPrimers", () => {
  // A template with enough variety at both ends to design against.
  const template = CLEAN + "GGCATTAGCATCGATCGGATCCATTAGCCAGTTAGCATCAGCATCAGCATTT"
    + "ACGATCAGCATCAGCATCAGCAATTGCCGGATCCATTAGCCAGTTAGCATCAGCATCAGCATCAG"
    + reverseComplement(CLEAN);

  it("amplifies exactly the stretch asked for", () => {
    const pair = designPrimers(template, 0, 100)!;
    expect(pair.start).toBe(0);
    expect(pair.end).toBe(100);
    expect(pair.length).toBe(100);
  });

  it("anchors the forward primer at the start of the stretch", () => {
    const pair = designPrimers(template, 10, 120)!;
    expect(template.startsWith(pair.forward.sequence, 10)).toBe(true);
  });

  it("anchors the reverse primer at the end of the stretch, on the bottom strand", () => {
    const pair = designPrimers(template, 10, 120)!;
    const stretch = template.slice(10, 120);
    expect(reverseComplement(stretch).startsWith(pair.reverse.sequence)).toBe(true);
    // Equivalently, the reverse primer's complement sits at the far end of the stretch.
    expect(stretch.endsWith(reverseComplement(pair.reverse.sequence))).toBe(true);
  });

  it("gives primers that actually amplify the stretch", () => {
    const pair = designPrimers(template, 10, 120)!;
    const products = predictProducts(template, "linear", [
      { name: "F", sequence: pair.forward.sequence },
      { name: "R", sequence: pair.reverse.sequence },
    ]);
    const wanted = products.find((p) => p.start === 10 && p.end === 120);
    expect(wanted).toBeDefined();
    expect(wanted!.length).toBe(110);
  });

  it("keeps primers inside the length range", () => {
    const pair = designPrimers(template, 0, 150, { minLength: 20, maxLength: 25 })!;
    for (const report of [pair.forward, pair.reverse]) {
      expect(report.length).toBeGreaterThanOrEqual(20);
      expect(report.length).toBeLessThanOrEqual(25);
    }
  });

  it("aims at the target temperature", () => {
    const cool = designPrimers(template, 0, 150, { targetTm: 52 })!;
    const warm = designPrimers(template, 0, 150, { targetTm: 68 })!;
    expect(cool.forward.tm).toBeLessThanOrEqual(warm.forward.tm);
  });

  it("gives null for a stretch too short for the length range", () => {
    expect(designPrimers(template, 0, 10)).toBeNull();
  });

  it("gives null when an end holds an ambiguity code at every length", () => {
    expect(designPrimers("N".repeat(60), 0, 60)).toBeNull();
  });

  it("rejects a stretch outside the template or the wrong way round", () => {
    expect(() => designPrimers(template, -1, 100)).toThrow(ValueError);
    expect(() => designPrimers(template, 0, template.length + 1)).toThrow(ValueError);
    expect(() => designPrimers(template, 100, 50)).toThrow(ValueError);
    expect(() => designPrimers(template, 0.5, 100)).toThrow(ValueError);
  });
});

describe("withTail", () => {
  it("puts the tail ahead of the binding part", () => {
    expect(withTail("GGAATTC", "ACGTACGT")).toBe("GGAATTCACGTACGT");
  });

  it("accepts an empty tail", () => {
    expect(withTail("", "ACGTACGT")).toBe("ACGTACGT");
  });

  it("rejects anything but A, C, G and T in either part", () => {
    expect(() => withTail("GGAANTC", "ACGTACGT")).toThrow(ValueError);
    expect(() => withTail("GGAATTC", "ACGTNCGT")).toThrow(ValueError);
  });
});
