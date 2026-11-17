/**
 * What to do about a host that will not phosphorylate what you asked it to make.
 *
 * Diagnosing is cheap to be honest about. Proposing a way round is where a tool can do real damage:
 * the routes are not equivalent, the most computable of them is the least likely to work, and a lab
 * that spends a month on the wrong one has spent a month. So what is checked hardest is that the
 * phosphomimetic is never dressed up as a substitute for phosphorylation.
 */
import { hostPhosphorylation, mimeticGene, phosphomimetic, phosphomimeticWorking, REMEDIES, remediesFor } from "@biolibs/bionet-tools";
import { translate } from "@biolibs/seq";
import { describe, expect, it } from "vitest";

/** Bovine beta-casein's mature chain begins here; the phosphoserines fall at 15, 17, 18 and 19 of it. */
const CHAIN = "RELEELNVPGEIVESLSSSEESITRINKKIEKFQSEEQQQTEDELQDKIHPFAQTQSLVYPFPGPIPNSLPQNIPPLTQTPVV";
const SITES = [15, 17, 18, 19];

describe("swapping a phosphoserine for something charged", () => {
  it("changes exactly the residues named, and says what each became", () => {
    const made = phosphomimetic(CHAIN, SITES);
    expect(made.problem).toBeNull();
    expect(made.swapped).toEqual(SITES.map((at) => ({ at, was: "S", now: "E" })));
    expect(made.protein).toHaveLength(CHAIN.length);
    for (const at of SITES) expect(made.protein[at - 1]).toBe("E");
    // And nothing else moved.
    for (let at = 1; at <= CHAIN.length; at += 1) {
      if (!SITES.includes(at)) expect(made.protein[at - 1]).toBe(CHAIN[at - 1]);
    }
  });

  it("takes an aspartate instead when asked", () => {
    expect(phosphomimetic(CHAIN, [15], { instead: "D" }).swapped).toEqual([{ at: 15, was: "S", now: "D" }]);
  });

  it("gives the figure that actually changes, and says the one that does not", () => {
    const made = phosphomimetic(CHAIN, SITES);
    // The charge is the point: the pH it carries no net charge at drops.
    expect(made.isoelectric!.after).toBeLessThan(made.isoelectric!.before);
    // The weight barely moves, which matters because somebody will look for it on a gel.
    expect(Math.abs(made.kilodaltons!.after - made.kilodaltons!.before)).toBeLessThan(0.3);
    expect(phosphomimeticWorking(made)[0]!.steps.join(" ")).toMatch(/not something a gel will show/);
  });

  it("never lets it pass as a substitute for phosphorylation", () => {
    const made = phosphomimetic(CHAIN, SITES);
    expect(made.warnings.join(" ")).toMatch(/about two negative charges.*glutamate: one negative charge/);
    expect(made.warnings.join(" ")).toMatch(/the geometry matters as much as the charge/);
    expect(made.warnings.join(" ")).toMatch(/way of asking whether charge alone is enough/);
    expect(phosphomimeticWorking(made)[0]!.rests).toMatch(/not a question a sequence can answer/);
  });

  it("will not change what was never phosphorylated, and says which", () => {
    const made = phosphomimetic(CHAIN, [1, 15, 999]);
    expect(made.swapped).toEqual([{ at: 15, was: "S", now: "E" }]);
    expect(made.notSwapped.map((one) => one.at)).toEqual([1, 999]);
    expect(made.notSwapped[0]!.why).toMatch(/not a serine, a threonine or a tyrosine/);
    expect(made.notSwapped[1]!.why).toMatch(/there is nothing at 999/);
  });

  it("says when there is nothing it can do", () => {
    expect(phosphomimetic("", [1]).problem).toMatch(/no protein here/);
    expect(phosphomimetic("MKV*", [1]).problem).toMatch(/not the twenty standard amino acids/);
    expect(phosphomimetic(CHAIN, []).problem).toMatch(/nothing to change/);
    expect(phosphomimetic(CHAIN, [1, 2]).problem).toMatch(/None of the sites given is a residue that is phosphorylated/);
    expect(phosphomimeticWorking(phosphomimetic(CHAIN, []))).toEqual([]);
  });
});

describe("rewriting the gene to encode it", () => {
  /** A short coding sequence whose third codon is a serine. */
  const CDS = "ATGAAATCTGGTTCAAAA";

  it("changes the codons named and leaves the rest alone", () => {
    const made = mimeticGene(CDS, [3, 5]);
    expect(made.problem).toBeNull();
    expect(made.changed).toEqual([
      { codon: 3, was: "TCT", now: "GAA", aminoAcid: "E" },
      { codon: 5, was: "TCA", now: "GAA", aminoAcid: "E" },
    ]);
    // What it encodes is the protein with those serines swapped, which is the whole point.
    expect(String(translate(made.sequence))).toBe(String(translate(CDS)).replace(/S/g, "E"));
    expect(made.sequence).toHaveLength(CDS.length);
  });

  it("takes the codon a host actually uses, where one is given", () => {
    expect(mimeticGene(CDS, [3], { codon: "GAG" }).changed[0]!.now).toBe("GAG");
    expect(mimeticGene(CDS, [3], { instead: "D" }).changed[0]!.now).toBe("GAT");
  });

  it("refuses what it cannot count codons through", () => {
    expect(mimeticGene("ATGAAAT", [1]).problem).toMatch(/not a whole number of codons/);
    expect(mimeticGene("ATGNNN", [1]).problem).toMatch(/no uncertain bases/);
    expect(mimeticGene(CDS, [3], { codon: "GAAA" }).problem).toMatch(/three bases/);
  });
});

describe("the routes round it", () => {
  it("lays them out with what each costs, and recommends none", () => {
    const { routes, says } = remediesFor(hostPhosphorylation("Komagataella phaffii"));
    expect(routes.map((one) => one.name)).toEqual(REMEDIES.map((one) => one.name));
    expect(routes.every((one) => one.costs !== "" && one.what !== "")).toBe(true);
    expect(says.join(" ")).toMatch(/None of these is recommended over another/);
    expect(says.join(" ")).toMatch(/depends on what the lab has, which nothing here knows/);
    // Exactly one of them is something this can work out.
    expect(routes.filter((one) => one.computable).map((one) => one.name)).toEqual(["a phosphomimetic"]);
  });

  it("says there may be nothing to work round, for a host that has the enzyme", () => {
    expect(remediesFor(hostPhosphorylation("CHO")).says.join(" ")).toMatch(/there may be nothing to work round/);
  });

  it("does not take an unknown host for one that cannot do it", () => {
    expect(remediesFor(null).says.join(" ")).toMatch(/not the same as its doing nothing/);
  });

  it("marks the computable one as the least firmly held, which it is", () => {
    const mimetic = REMEDIES.find((one) => one.name === "a phosphomimetic")!;
    expect(mimetic.standing).toBe("worth trying");
    expect(mimetic.costs).toMatch(/It is not the same molecule/);
    // And measuring what you get is the one held most firmly, because it is the only one that looks.
    expect(REMEDIES.find((one) => one.name === "measure what you actually get")!.standing).toBe("well established");
  });
});
