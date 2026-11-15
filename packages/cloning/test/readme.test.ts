/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here. The plasmid is the one the README
 * defines in its own block, and every later block reads it, exactly as the text says.
 */
import { Seq } from "@biolibs/seq";
import { SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { residuesOf } from "@biolibs/seqedit";
import { assembleGibson, canSelfClose, canonicalCircular, checkTailedPrimer, cloneProducts, compatible,
  cutCounts, cutsIn, cuttersUpTo, describeEnd, describePiece, designGibson, endAt, flipEnd, joinPieces,
  lookupEnzymes, overlapLength, parseEnzymeNames, piecesOf, religate } from "@biolibs/cloning";
import { describe, expect, it } from "vitest";

/** The README's plasmid block, verbatim. */
const BACKBONE_A = "ACGTTAGCCATGGCTAGCTAGGCATCGATCGTGAGCAATCGGTGAGTACGCCTTTAGGTCTGAT";
const BACKBONE_B = "AAAATCGACACATTAATGCTCTTCAAGCAACAACCGGCGATTAACCCGTAACCTTAAGACACAT";
const VECTOR = `GAATTC${BACKBONE_A}GGATCC${BACKBONE_B}`;
const GENE = "ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTTAATGGG";
const INSERT = `CCGAATTC${GENE}GGATCCCC`;
const CIRCLE = BACKBONE_A + BACKBONE_B;

/** The vector record the README builds, marker feature included. */
const vectorRecord = (): SeqRecord => new SeqRecord(new Seq(VECTOR), "pVEC", "pVEC", "", [],
  [new SeqFeature(new SimpleLocation(10, 40, 1), "gene", "m", new Map([["gene", ["marker"]]]))],
  new Map<string, unknown>([["molecule_type", "DNA"], ["topology", "circular"]]));

/** The insert record, linear. */
const insertRecord = (): SeqRecord => new SeqRecord(new Seq(INSERT), "myGene", "myGene", "", [], [],
  new Map<string, unknown>([["molecule_type", "DNA"], ["topology", "linear"]]));

const digest = (record: SeqRecord, names: string[]) => piecesOf(record, lookupEnzymes(names).enzymes);

describe("README: ends", () => {
  it("reads the three kinds of end and describes them", () => {
    expect(endAt(1, 5, "GAATTC", "EcoRI")).toEqual({ kind: "5'", overhang: "AATT", enzyme: "EcoRI" });
    expect(endAt(5, 1, "CTGCAG", "PstI")).toEqual({ kind: "3'", overhang: "TGCA", enzyme: "PstI" });
    expect(endAt(3, 3, "CCCGGG", "SmaI")).toEqual({ kind: "blunt", overhang: "", enzyme: "SmaI" });

    expect(describeEnd(endAt(1, 5, "GAATTC", "EcoRI"))).toBe("EcoRI (5' AATT)");
    expect(describeEnd(endAt(3, 3, "CCCGGG", "SmaI"))).toBe("SmaI (blunt)");
    expect(describeEnd({ kind: "blunt", overhang: "", enzyme: null })).toBe("blunt");
  });

  it("pairs ends by kind and overhang, whatever enzyme made them", () => {
    const bamHI = { kind: "5'", overhang: "GATC", enzyme: "BamHI" } as const;
    const bglII = { kind: "5'", overhang: "GATC", enzyme: "BglII" } as const;
    const ecoRI = { kind: "5'", overhang: "AATT", enzyme: "EcoRI" } as const;
    expect(compatible(bamHI, bglII)).toBe(true);
    expect(compatible(bamHI, ecoRI)).toBe(false);
    expect(compatible({ kind: "blunt", overhang: "", enzyme: "SmaI" },
      { kind: "blunt", overhang: "", enzyme: null })).toBe(true);
  });

  it("reverse-complements an overhang on flipping, keeping the kind", () => {
    expect(flipEnd({ kind: "5'", overhang: "GATG", enzyme: "X" }))
      .toEqual({ kind: "5'", overhang: "CATC", enzyme: "X" });
  });
});

describe("README: the plasmid", () => {
  it("is 140 bp of vector and 88 of insert", () => {
    expect(VECTOR).toHaveLength(140);
    expect(INSERT).toHaveLength(88);
  });
});

describe("README: finding the cuts", () => {
  it("reports the cuts in this package's coordinates", () => {
    expect(lookupEnzymes(["EcoRI", "NotAnEnzyme"]).unknown).toEqual(["NotAnEnzyme"]);
    expect(parseEnzymeNames("EcoRI, BamHI + HindIII")).toEqual(["EcoRI", "BamHI", "HindIII"]);

    const { enzymes } = lookupEnzymes(["EcoRI", "BamHI"]);
    expect(cutsIn(VECTOR, "circular", enzymes)).toEqual([
      { topCut: 1, bottomCut: 5, enzyme: "EcoRI" },
      { topCut: 71, bottomCut: 75, enzyme: "BamHI" },
    ]);
  });

  it("counts cuts and names the unique cutters", () => {
    const withHindIII = lookupEnzymes(["EcoRI", "BamHI", "HindIII"]).enzymes;
    expect([...cutCounts(cutsIn(VECTOR, "circular", withHindIII))])
      .toEqual([["EcoRI", 1], ["BamHI", 1]]);
    expect(cuttersUpTo(cutsIn(VECTOR, "circular", withHindIII))).toEqual(["BamHI", "EcoRI"]);
  });

  it("refuses an enzyme whose cut position is not known", () => {
    expect(() => cutsIn("AAAGAATTCAAA", "linear", lookupEnzymes(["Aba6411II"]).enzymes))
      .toThrowError("where Aba6411II cuts is not known, so it cannot be simulated");
  });
});

describe("README: cutting a record into pieces", () => {
  it("cuts the vector in two, carrying the marker with the piece it falls in", () => {
    const pieces = digest(vectorRecord(), ["EcoRI", "BamHI"]);
    expect(pieces.map(describePiece)).toEqual(["70 bp (EcoRI to BamHI)", "70 bp (BamHI to EcoRI)"]);
    expect(pieces.map((p) => p.start)).toEqual([1, 71]);
    expect(pieces.map((p) => p.wraps)).toEqual([false, true]);
    expect(describeEnd(pieces[0]!.left)).toBe("EcoRI (5' AATT)");
    expect(pieces[0]!.record.features.map((f) => String(f.location))).toEqual(["[9:39](+)"]);
    expect(pieces[1]!.record.features).toHaveLength(0);
  });

  it("gives n + 1 pieces from a line, and none from an uncut circle", () => {
    const insert = insertRecord();
    expect(digest(insert, ["EcoRI", "BamHI"]).map((p) => p.length)).toEqual([3, 78, 7]);
    expect(digest(insert, ["EcoRI", "BamHI"]).map((p) => p.left.enzyme))
      .toEqual([null, "EcoRI", "BamHI"]);

    expect(digest(vectorRecord(), ["HindIII"])).toHaveLength(0);
    expect(digest(insert, ["HindIII"]).map((p) => p.length)).toEqual([88]);
  });
});

describe("README: ligating", () => {
  it("cannot close either half of a two-enzyme digest, but re-ligates the plasmid", () => {
    const pieces = digest(vectorRecord(), ["EcoRI", "BamHI"]);
    expect(pieces.map(canSelfClose)).toEqual([false, false]);
    expect(canonicalCircular(residuesOf(religate(pieces, "pVEC")))).toBe(canonicalCircular(VECTOR));
  });

  it("names both ends when a junction does not pair", () => {
    const pieces = digest(vectorRecord(), ["EcoRI", "BamHI"]);
    expect(() => joinPieces(pieces[0]!, pieces[0]!))
      .toThrowError("a BamHI (5' GATC) end does not pair with a EcoRI (5' AATT) end");
  });
});

describe("README: restriction cloning", () => {
  it("makes the same circle with the insert either way round", () => {
    const result = cloneProducts(vectorRecord(), insertRecord(), ["EcoRI", "BamHI"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products).toHaveLength(2);
    expect(result.products[0]!.description).toBe(
      "148 bp: vector 70 bp (BamHI to EcoRI) + myGene 78 bp (EcoRI to BamHI), as written");
    expect(result.products.map((p) => p.orientation)).toEqual(["as written", "turned over"]);
    expect(result.products[0]!.record.annotations.get("topology")).toBe("circular");
    expect(result.products[0]!.length).toBe(148);
  });

  it("explains every failure", () => {
    const linearVector = new SeqRecord(new Seq(VECTOR), "lin", "lin", "", [], [],
      new Map<string, unknown>([["topology", "linear"]]));
    expect(cloneProducts(vectorRecord(), insertRecord(), ["NopeI"]))
      .toEqual({ ok: false, error: "these are not known enzymes: NopeI" });
    expect(cloneProducts(linearVector, insertRecord(), ["EcoRI", "BamHI"]))
      .toEqual({ ok: false, error: "the vector must be circular" });
    expect(cloneProducts(vectorRecord(), insertRecord(), ["HindIII"]))
      .toEqual({ ok: false, error: "HindIII do not cut the vector" });
    expect(cloneProducts(vectorRecord(), insertRecord(), ["EcoRI"], ["BamHI"])).toEqual({
      ok: false, error: "the insert is cut, but no fragment has an enzyme-made end at both sides" });
  });
});

describe("README: Gibson assembly", () => {
  it("finds an overlap only where one end genuinely matches the other's start", () => {
    expect(overlapLength("AAAGGTACC", "GGTACCTTT", 6, 60)).toBe(6);
    expect(overlapLength("CCCGGG", "AAACCC", 3, 60)).toBe(0);
    expect(overlapLength("ACGT", "ACGT", 4, 60)).toBe(0);
    // A tandem repeat has a genuine proper self-overlap; only the whole sequence is forbidden.
    expect(overlapLength("ACGTACGT", "ACGTACGT", 3, 60)).toBe(4);
  });

  it("assembles two fragments back into the circle they came from", () => {
    const a = CIRCLE.slice(0, 80);
    const b = CIRCLE.slice(60) + CIRCLE.slice(0, 20);
    const result = assembleGibson([{ name: "a", residues: a }, { name: "b", residues: b }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products).toHaveLength(1);
    expect(result.products[0]!.length).toBe(128);
    expect(result.products[0]!.description).toBe("128 bp: a + b");
    expect(result.products[0]!.junctions.map((j) => j.length)).toEqual([20, 20]);
    expect(result.products[0]!.junctions.map((j) => j.tm.toFixed(2))).toEqual(["45.42", "55.93"]);
    expect(canonicalCircular(residuesOf(result.products[0]!.record))).toBe(canonicalCircular(CIRCLE));
  });

  it("treats a ring as the same molecule however it is written", () => {
    expect(canonicalCircular("GCA")).toBe("AGC");
    expect(canonicalCircular("GCA")).toBe(canonicalCircular("AGC"));
  });

  it("says which fragment is the problem", () => {
    const a = CIRCLE.slice(0, 80);
    const b = CIRCLE.slice(60) + CIRCLE.slice(0, 20);
    expect(assembleGibson([{ name: "a", residues: a }, { name: "z", residues: GENE }])).toEqual({
      ok: false, error: "no overlap of at least 15 bases joins 'a', 'z' to any other fragment" });
    expect(assembleGibson([{ name: "solo", residues: a }])).toEqual({
      ok: false,
      error: "the ends of 'solo' do not overlap by at least 15 bases, so it cannot close into a circle" });
    expect(assembleGibson([{ name: "a", residues: "ACGTACGTACGT" }, { name: "b", residues: b }]))
      .toEqual({ ok: false, error: "fragment 'a' is 12 bases, too short to carry an overlap of 15" });
  });
});

describe("README: designing a Gibson assembly", () => {
  it("designs the insert's primers when the backbone is fixed", () => {
    const result = designGibson([
      { name: "backbone", residues: CIRCLE, amplify: false },
      { name: "insert", residues: GENE },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.length).toBe(150);
    expect(result.design.primers.map((p) => p.name)).toEqual(["insert-F", "insert-R"]);
    expect(result.design.primers[0]!.tail).toBe("ATTAACCCGTAACCTTAAGACACAT");
    expect(result.design.primers[0]!.binding).toBe("ATGAGTAAAGGAGAAGAACTTTTCACTGG");
    expect(result.design.primers[0]!.sequence).toHaveLength(54);
  });

  it("shares the overlap when both neighbours are amplified", () => {
    const fixed = designGibson([
      { name: "backbone", residues: CIRCLE, amplify: false }, { name: "insert", residues: GENE }]);
    expect(fixed.ok && fixed.design.junctions.map((j) => j.carried)).toEqual([
      { fromReverse: 0, toForward: 25 }, { fromReverse: 25, toForward: 0 }]);

    const shared = designGibson([
      { name: "backbone", residues: CIRCLE }, { name: "insert", residues: GENE }]);
    expect(shared.ok && shared.design.junctions.map((j) => j.carried)).toEqual([
      { fromReverse: 13, toForward: 12 }, { fromReverse: 13, toForward: 12 }]);
    expect(shared.ok && shared.design.primers.map((p) => p.tail.length)).toEqual([12, 13, 12, 13]);
  });

  it("refuses a design with nowhere to put an overlap", () => {
    expect(designGibson([{ name: "a", residues: CIRCLE, amplify: false },
      { name: "b", residues: GENE, amplify: false }])).toEqual({
      ok: false,
      error: "at least one fragment must be amplified, or there is nowhere to put an overlap" });
    expect(designGibson([{ name: "a", residues: CIRCLE }, { name: "b", residues: GENE }],
      { overlap: 5 })).toEqual({
      ok: false, error: "the overlap must be between 15 and 60 bases, not 5" });
  });

  it("carries the primers' own warnings, named", () => {
    const result = designGibson([
      { name: "backbone", residues: CIRCLE, amplify: false }, { name: "insert", residues: GENE }]);
    expect(result.ok && result.design.warnings).toEqual([
      "insert-F: the GC content is 38%, below 40%",
      "insert-R: the GC content is 37%, below 40%",
    ]);
  });

  it("reports a tailed primer's two parts separately", () => {
    const { whole, bindingPart } = checkTailedPrimer(
      "ATTAACCCGTAACCTTAAGACACAT", "ATGAGTAAAGGAGAAGAACTTTTCACTGG");
    expect(bindingPart.length).toBe(29);
    expect(bindingPart.tm.toFixed(2)).toBe("57.72");
    expect(whole.length).toBe(54);
    expect(whole.tm).toBeGreaterThan(bindingPart.tm);
  });
});
