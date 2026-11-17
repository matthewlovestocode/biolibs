/**
 * Which residues would be phosphorylated, and whether the host would do it.
 *
 * The test that matters is the last one in the first block: the rule, applied to bovine beta-casein,
 * has to give back exactly the five phosphoserines a curator recorded in UniProt. That is the only
 * reason to believe it anywhere else, and if it ever stops being true the rule has been broken.
 */
import { HOST_KINASES, PHOSPHO_MOTIFS, comparedWithKnown, hostPhosphorylation, phosphoSites, phosphoWorking } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

/** Bovine beta-casein, P02666, as UniProt holds it: the precursor, signal peptide and all. */
const CASEIN = "MKVLILACLVALALARELEELNVPGEIVESLSSSEESITRINKKIEKFQSEEQQQTEDELQDKIHPFAQTQSLVYPFPGPIPNSLPQNIPPLTQTPVVVPPFLQPEVMGVSKVK"
             + "EAMAPKHKEMPFPKYPVEPFTESQSLTLTDVENLHLPLPLLQSWMHQPHQPLPPTVMFPPQSVLSLSQSKVLPVPQKAVPYPQRDMPIQAFLLYQEPVLGPVRGPFPIIV";
/** The five phosphoserines UniProt records for it, counted on that sequence. */
const RECORDED = [30, 32, 33, 34, 50];
/** The rule for the kinase of the secretory pathway, on its own. */
const SECRETORY = PHOSPHO_MOTIFS.filter((one) => one.name === "S-x-E");

describe("the sites a sequence carries", () => {
  it("reads the motif off the sequence, and says which rule found each", () => {
    const found = phosphoSites("AAASQEAAA", { motifs: SECRETORY });
    expect(found.problem).toBeNull();
    expect(found.sites).toHaveLength(1);
    expect(found.sites[0]).toMatchObject({ at: 4, residue: "S", by: "S-x-E", round: 1 });
    expect(found.sites[0]!.because).toContain("S-x-[E/D]");
  });

  it("builds backwards along a cluster, because a phosphoserine carries the charge a glutamate does", () => {
    // The serines have to be two apart, as casein's are, since that is the reach of the rule:
    // S5 sees the E at 7, then S3 sees the phosphoserine at 5.
    const found = phosphoSites("AASASAEAA", { motifs: SECRETORY });
    expect(found.sites.map((one) => [one.at, one.round])).toEqual([[3, 2], [5, 1]]);
    expect(found.rounds).toBe(2);
    // Turned off, only what the bare sequence says is found.
    expect(phosphoSites("AASASAEAA", { motifs: SECRETORY, prime: false }).sites.map((one) => one.at)).toEqual([5]);
    // Serines in a row are not a cluster: a run of them primes nothing, because the reach is two.
    expect(phosphoSites("AASSSEAA", { motifs: SECRETORY }).sites.map((one) => one.at)).toEqual([4]);
  });

  it("counts only the rounds that found something", () => {
    expect(phosphoSites("AAASQEAAA", { motifs: SECRETORY }).rounds).toBe(1);
    expect(phosphoSites("AAAAAAAA", { motifs: SECRETORY }).rounds).toBe(1);
  });

  it("acts on what each rule acts on: the secretory kinase on serine, CK2 on serine and threonine", () => {
    expect(phosphoSites("AATQEAA", { motifs: SECRETORY }).sites).toEqual([]);
    const both = phosphoSites("AATQQEAA");
    expect(both.sites.map((one) => [one.at, one.by])).toEqual([[3, "S/T-x-x-E"]]);
  });

  it("says when there is nothing to look at", () => {
    expect(phosphoSites("").problem).toMatch(/no protein here/);
    expect(phosphoSites("MKVL*X").problem).toMatch(/not the twenty standard amino acids/);
  });

  it("gives back exactly the sites a curator recorded for bovine beta-casein", () => {
    // The one test that says whether the rule is worth anything. UniProt P02666 records
    // phosphoserines at 30, 32, 33, 34 and 50; the secretory kinase's rule, applied in rounds,
    // finds those five and nothing else.
    const found = phosphoSites(CASEIN, { motifs: SECRETORY });
    expect(found.sites.map((one) => one.at)).toEqual(RECORDED);
    const against = comparedWithKnown(found.sites.map((one) => one.at), RECORDED);
    expect(against).toEqual({ confirmed: RECORDED, missed: [], onlyPredicted: [], caught: 1 });
    // And the hierarchy is visible: three read straight off, two reached by priming.
    expect(found.sites.filter((one) => one.round === 1).map((one) => one.at)).toEqual([33, 34, 50]);
    expect(found.sites.filter((one) => one.round > 1).map((one) => one.at)).toEqual([30, 32]);
  });

  it("names every rule a residue matches, not just whichever was tried first", () => {
    // S32 of the precursor carries both: E at +3 for CK2, and a phosphoserine at +2 for the
    // secretory kinase once S34 is found. Reporting one of them would be an accident of rule order.
    const found = phosphoSites(CASEIN);
    const both = found.sites.find((one) => one.at === 32)!;
    expect([both.by, ...both.alsoBy.map((one) => one.name)].sort()).toEqual(["S-x-E", "S/T-x-x-E"]);
    // A site only one rule matches says so.
    expect(found.sites.find((one) => one.at === 50)!.alsoBy).toEqual([]);
  });

  it("predicts more than is recorded once CK2's rule is in too, and says which rule said what", () => {
    const found = phosphoSites(CASEIN);
    const against = comparedWithKnown(found.sites.map((one) => one.at), RECORDED);
    expect(against.missed).toEqual([]);
    // CK2's motif is acidophilic and common, so it adds threonines nobody has recorded.
    expect(against.onlyPredicted.length).toBeGreaterThan(0);
    for (const at of against.onlyPredicted) expect(found.sites.find((one) => one.at === at)!.by).toBe("S/T-x-x-E");
  });
});

describe("a prediction against a record", () => {
  it("says what agrees, what the rule missed, and what it alone says", () => {
    expect(comparedWithKnown([1, 2, 3], [2, 3, 4])).toEqual({ confirmed: [2, 3], missed: [4], onlyPredicted: [1], caught: 2 / 3 });
    expect(comparedWithKnown([], [])).toEqual({ confirmed: [], missed: [], onlyPredicted: [], caught: 0 });
    expect(comparedWithKnown([5], [])).toMatchObject({ onlyPredicted: [5], caught: 0 });
  });
});

describe("whether the host would do it", () => {
  it("finds a host under the name a lab is likely to have written", () => {
    expect(hostPhosphorylation("Saccharomyces cerevisiae W303")?.host).toBe("Saccharomyces cerevisiae");
    // The name a lab's records are most likely to use is the old one.
    expect(hostPhosphorylation("Pichia pastoris GS115")?.host).toBe("Komagataella phaffii");
    expect(hostPhosphorylation("E. coli BL21(DE3)")?.host).toBe("Escherichia coli");
    expect(hostPhosphorylation("CHO-K1")?.host).toBe("Cricetulus griseus");
    expect(hostPhosphorylation("Dictyostelium discoideum")).toBeNull();
    expect(hostPhosphorylation("  ")).toBeNull();
  });

  it("says a bacterium has no such kinase, and a mammalian cell has", () => {
    expect(hostPhosphorylation("E. coli")).toMatchObject({ secretoryKinase: "no", casein2: false, standing: "well established" });
    expect(hostPhosphorylation("CHO")).toMatchObject({ secretoryKinase: "yes", casein2: true });
    // A yeast is the awkward case, and is said to be awkward rather than said to be a no.
    expect(hostPhosphorylation("Komagataella phaffii")).toMatchObject({ secretoryKinase: "not known", casein2: true, standing: "reported" });
  });

  it("never claims to have computed any of it", () => {
    for (const host of HOST_KINASES) expect(["well established", "reported", "check"]).toContain(host.standing);
    const working = phosphoWorking(phosphoSites(CASEIN, { motifs: SECRETORY }), hostPhosphorylation("Komagataella phaffii"));
    const host = working.at(-1)!;
    expect(host.kind).toBe("estimate");
    expect(host.steps.join(" ")).toMatch(/not worked out from anything/);
    expect(host.rests).toMatch(/Search the literature/);
  });
});

describe("the working", () => {
  it("shows the rules, each round, and that a motif is not a measurement", () => {
    const working = phosphoWorking(phosphoSites(CASEIN, { motifs: SECRETORY }));
    expect(working).toHaveLength(1);
    expect(working[0]!.kind).toBe("estimate");
    expect(working[0]!.steps.join(" ")).toContain("Round 1 reads the sequence as it stands: S33, S34, S50.");
    expect(working[0]!.steps.join(" ")).toMatch(/Round 2 adds S32, which only became a site/);
    expect(working[0]!.steps.join(" ")).toMatch(/Round 3 adds S30, which only became a site/);
    expect(working[0]!.rests).toMatch(/says a residue could be phosphorylated, not that it is/);
  });

  it("has nothing to show when there was nothing to look at", () => {
    expect(phosphoWorking(phosphoSites(""))).toEqual([]);
  });
});
