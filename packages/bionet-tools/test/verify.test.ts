/**
 * Checking a read against the design it was meant to be.
 *
 * Everything else in this package proposes; this is the one that confirms, so what is checked
 * hardest is that it does not confirm something it should not. A read of the other strand is not a
 * construct that is wrong. A read that covers a third of the design must not be reported as if it
 * had checked the whole. And a difference has to be told apart by what it costs: a base that leaves
 * the amino acid alone, one that makes a stop codon, and one base missing are three different
 * findings, and the third means everything after it is wrong.
 */
import { checkRead, saysDifference, verifyRun, verifyWorking } from "@biolibs/bionet-tools";
import type { PartFeature } from "@biolibs/bionet";
import { translate } from "@biolibs/seq";
import { describe, expect, it } from "vitest";

const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G", N: "N" };
const flip = (bases: string): string => [...bases].reverse().map((one) => PAIR[one] ?? "N").join("");

/** A design with one coding sequence in it, and room either side. */
const CDS = "ATGAAAGTTTTAATTTTAGCTTGTTTAGTTGCTTTAGCTTTAGCTAGAGAATTAGAAGAATTAAATGTTCCAGGTGAATAA";
const BEFORE = "GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA";
const AFTER = "TTGACATTGACATTGACATTGACATTGACATT";
const DESIGN = BEFORE + CDS + AFTER;
const coding: PartFeature[] = [{ type: "CDS", label: "casein", strand: 1, parts: [{ start: BEFORE.length, end: BEFORE.length + CDS.length }] }];
const design = { sequence: DESIGN, features: coding };

/** The design with one base swapped, counting from 1. */
const swap = (at: number, to: string): string => `${DESIGN.slice(0, at - 1)}${to}${DESIGN.slice(at)}`;
/** Where codon `n` of the coding sequence starts on the design, counting from 1. */
const codonAt = (n: number): number => BEFORE.length + (n - 1) * 3 + 1;

describe("a read that is the design", () => {
  it("matches, and says how much of the design it covered", () => {
    const whole = checkRead(design, DESIGN);
    expect(whole.problem).toBeNull();
    expect(whole.matches).toBe(true);
    expect(whole.differences).toEqual([]);
    expect(whole.identity).toBe(1);
    expect(whole.covers).toEqual({ from: 1, to: DESIGN.length, bases: DESIGN.length });
    expect(whole.covered).toBe(1);
    expect(whole.reversed).toBe(false);
    expect(whole.changesProtein).toBe(false);
  });

  it("matches when it is the other strand, and says it was turned round", () => {
    const backwards = checkRead(design, flip(DESIGN));
    expect(backwards.reversed).toBe(true);
    expect(backwards.matches).toBe(true);
    expect(backwards.differences).toEqual([]);
  });

  it("says what it did not cover, rather than passing the whole design", () => {
    // One read off one primer: the middle of the design and nothing else.
    const part = checkRead(design, DESIGN.slice(20, 90));
    expect(part.matches).toBe(true);
    expect(part.covers).toEqual({ from: 21, to: 90, bases: 70 });
    expect(part.covered).toBeLessThan(0.7);
    expect(part.warnings.some((one) => /The rest of the design is unchecked/.test(one))).toBe(true);
  });

  it("says when hardly any of the read belongs to this design at all", () => {
    const stranger = checkRead(design, "GGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGC");
    expect(stranger.warnings.some((one) => /may be a read of something else/.test(one))).toBe(true);
  });
});

describe("what a difference costs", () => {
  it("tells a silent change from one that changes the protein", () => {
    // The third base of a leucine codon: TTA and TTG are both leucine.
    const at = codonAt(6) + 2;
    expect(DESIGN.slice(at - 3, at)).toBe("TTA");
    const silent = checkRead(design, swap(at, "G"));
    expect(silent.differences).toHaveLength(1);
    expect(silent.differences[0]).toMatchObject({ at, kind: "substitution", was: "A", now: "G" });
    expect(silent.differences[0]!.protein).toEqual({ kind: "silent", codon: 6, aminoAcid: "L" });
    expect(silent.changesProtein).toBe(false);
    expect(silent.matches).toBe(false);
    expect(silent.differences[0]!.inside).toEqual([{ label: "casein", type: "CDS" }]);
  });

  it("names the amino acid a missense change makes", () => {
    // The first base of codon 2, AAA (lysine) to GAA (glutamate).
    const at = codonAt(2);
    expect(DESIGN.slice(at - 1, at + 2)).toBe("AAA");
    const missense = checkRead(design, swap(at, "G"));
    expect(missense.differences[0]!.protein).toEqual({ kind: "missense", codon: 2, from: "K", to: "E" });
    expect(missense.changesProtein).toBe(true);
    expect(saysDifference(missense.differences[0]!)).toMatch(/makes codon 2 K into E/);
  });

  it("says when a change makes a stop codon, and what it costs", () => {
    // Codon 3 is GTT, valine. GTT -> TAA would take two changes, so use codon 2: AAA -> TAA.
    const at = codonAt(2);
    const nonsense = checkRead(design, swap(at, "T"));
    expect(DESIGN.slice(at - 1, at + 2)).toBe("AAA");
    expect(nonsense.differences[0]!.protein).toEqual({ kind: "nonsense", codon: 2, from: "K" });
    expect(nonsense.changesProtein).toBe(true);
    expect(saysDifference(nonsense.differences[0]!)).toMatch(/a stop, so everything after it is lost/);
  });

  it("calls one missing base a frameshift, and three a change in frame", () => {
    // Codon 7 starts with a G between an A and a C, so there is only one base that could have gone.
    // A base missing from a run of the same base has no single place, which is checked below.
    const at = codonAt(7);
    expect(DESIGN.slice(at - 2, at + 1)).toBe("AGC");
    const one = `${DESIGN.slice(0, at - 1)}${DESIGN.slice(at)}`;
    const shifted = checkRead(design, one);
    expect(shifted.differences).toHaveLength(1);
    expect(shifted.differences[0]).toMatchObject({ kind: "deletion", was: DESIGN[at - 1] });
    expect(shifted.differences[0]!.protein).toMatchObject({ kind: "frameshift", codon: 7, by: -1 });
    expect(saysDifference(shifted.differences[0]!)).toMatch(/shifts the frame from codon 7 on/);

    const three = `${DESIGN.slice(0, at - 1)}${DESIGN.slice(at + 2)}`;
    const inFrame = checkRead(design, three);
    expect(inFrame.differences[0]!.protein).toMatchObject({ kind: "in frame", codon: 7, by: -3 });
    expect(inFrame.changesProtein).toBe(true);
  });

  it("gathers a run of missing bases into one finding rather than many", () => {
    const at = codonAt(9);
    const gone = `${DESIGN.slice(0, at - 1)}${DESIGN.slice(at + 5)}`;
    const checked = checkRead(design, gone);
    expect(checked.differences).toHaveLength(1);
    expect(checked.differences[0]!.was).toHaveLength(6);
    expect(checked.differences[0]!.protein).toMatchObject({ kind: "in frame", by: -6 });
  });

  it("puts a base missing from a run of the same base at the earliest place it could be", () => {
    // Codon 5 begins with an A that follows another A, so deleting either gives the same read and
    // there is no telling which went. The earliest is reported, which is what the alignment settles on.
    const at = codonAt(5);
    expect(DESIGN.slice(at - 2, at)).toBe("AA");
    const checked = checkRead(design, `${DESIGN.slice(0, at - 1)}${DESIGN.slice(at)}`);
    expect(checked.differences).toHaveLength(1);
    expect(checked.differences[0]!.at).toBeLessThanOrEqual(at);
    expect(checked.differences[0]!.protein).toMatchObject({ kind: "frameshift", by: -1 });
  });

  it("leaves the protein out of it for a difference outside any coding sequence", () => {
    const outside = checkRead(design, swap(5, DESIGN[4] === "A" ? "C" : "A"));
    expect(outside.differences).toHaveLength(1);
    expect(outside.differences[0]!.protein).toBeNull();
    expect(outside.differences[0]!.inside).toEqual([]);
    expect(outside.changesProtein).toBe(false);
    expect(saysDifference(outside.differences[0]!)).not.toMatch(/codon/);
  });

  it("reads a coding sequence on the other strand the other way round", () => {
    // The same bases, marked as coding on the bottom strand: its codons run from the far end.
    const reverse = { sequence: DESIGN, features: [{ ...coding[0]!, strand: -1 as const }] };
    const at = BEFORE.length + CDS.length;
    const checked = checkRead(reverse, swap(at, DESIGN[at - 1] === "A" ? "C" : "A"));
    expect(checked.differences).toHaveLength(1);
    // The last base of the stretch is the first base of codon 1 when it is read backwards.
    expect(checked.differences[0]!.protein).toMatchObject({ codon: 1 });
  });

  it("says it has not worked out a coding sequence marked in pieces", () => {
    const spliced = { sequence: DESIGN, features: [{ type: "CDS", label: "spliced", strand: 1 as const,
      parts: [{ start: BEFORE.length, end: BEFORE.length + 30 }, { start: BEFORE.length + 40, end: BEFORE.length + CDS.length }] }] };
    const checked = checkRead(spliced, swap(codonAt(2), "G"));
    expect(checked.differences[0]!.protein).toMatchObject({ kind: "not worked out" });
    expect(saysDifference(checked.differences[0]!)).toMatch(/marked in 2 pieces/);
  });
});

describe("what it refuses", () => {
  it.each([
    ["an empty design", { sequence: "" }, "ACGT", /nothing to check against/],
    ["an empty read", { sequence: "ACGTACGT" }, "", /no read to check/],
    ["a read with letters that are not bases", { sequence: "ACGTACGT" }, "ACGTXYZ", /not A, C, G, T or N/],
    ["a design with letters that are not bases", { sequence: "ACGTXYZ" }, "ACGT", /The design has bases that are not/],
  ])("refuses %s rather than guessing", (_what, given, read, problem) => {
    const checked = checkRead(given, read);
    expect(checked.problem).toMatch(problem);
    expect(checked.matches).toBe(false);
    expect(verifyWorking(checked, given)).toEqual([]);
    expect(verifyRun(checked, { tube: "t" })).toBeNull();
  });

  it("counts a base that could not be called as neither a match nor a difference, and says how many", () => {
    const at = codonAt(4);
    const unsure = checkRead(design, swap(at, "N"));
    expect(unsure.warnings.some((one) => /could not be called/.test(one))).toBe(true);
  });
});

describe("the working and the record", () => {
  it("says what was compared and what it costs, and does not claim the uncovered part", () => {
    const checked = checkRead(design, DESIGN.slice(10, 100));
    const working = verifyWorking(checked, design);
    const compared = working.find((one) => one.of === "the comparison")!;
    expect(compared.kind).toBe("exact");
    expect(compared.steps).toContain("what is outside that stretch was not read and is not checked");
    expect(compared.steps.some((one) => one.includes("the read lines up as it was given"))).toBe(true);
    const cost = working.find((one) => one.of === "what it costs")!;
    expect(cost.comes).toMatch(/^nothing/);
    expect(cost.steps).toEqual(["every base the read covers is the base the design has"]);
  });

  it("records a check as a run that uses the tube and makes nothing", () => {
    const checked = checkRead(design, DESIGN);
    const run = verifyRun(checked, { tube: "t1", used: 2, primer: "  M13-F  " })!;
    expect(run).toMatchObject({ kind: "sequencing", instrument: null, outcome: "worked", outputs: [] });
    expect(run["inputs"]).toEqual([{ item: "t1", amount: 2, role: "sequenced" }]);
    expect(run["settings"]).toMatchObject({ identity: 100, differences: 0, primer: "M13-F" });
  });

  it("records one that did not match as a run that did not work, saying why", () => {
    const checked = checkRead(design, swap(codonAt(2), "T"));
    const run = verifyRun(checked, { tube: "t1" })!;
    expect(run["outcome"]).toBe("failed");
    expect(String(run["note"])).toMatch(/a stop, so everything after it is lost/);
    expect(run["outputs"]).toEqual([]);
  });

  it("the protein it talks about is the protein the design makes", () => {
    // Whatever the tool says about codons, it has to agree with translating the stretch itself.
    const piece = coding[0]!.parts[0]!;
    expect(String(translate(DESIGN.slice(piece.start, piece.end)))).toMatch(/^MKVLILACLVALALARELEELNVPGE\*?$/);
  });
});
