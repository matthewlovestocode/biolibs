/**
 * An assembly designed over a lab's own parts.
 *
 * The designing is `@biolibs/cloning`'s and is tested there. What is checked here is everything
 * that makes it the lab's: that the ring really is the pieces end to end, that what was marked on
 * each piece ends up where that piece now is, that a circle is refused because it has no ends to
 * join, and that the working adds up to the figure it claims — which is the only thing that makes
 * the figures worth showing at all.
 */
import { assemblyParts, assemblyRun, assemblyWorking, designAssembly, LONGEST_RING } from "@biolibs/bionet-tools";
import type { PartState } from "@biolibs/bionet";
import { describe, expect, it } from "vitest";

/** Unambiguous DNA that is not a run of one base, which would make every overlap degenerate. */
const dna = (count: number, seed: number): string => {
  let x = seed;
  let out = "";
  for (let i = 0; i < count; i++) { x = (1103515245 * x + 12345) & 0x7fffffff; out += "ACGT"[(x >> 16) % 4]; }
  return out;
};

const part = (name: string, sequence: string, more: Partial<PartState> = {}): PartState => ({
  checksum: `sum-${name}`, sequence, circular: false, length: sequence.length, name, offered: false,
  features: [], ends: { left: 0, right: 0 }, fields: {}, added: "entry", ...more,
});

/** A lab holding a vector opened with an enzyme, a promoter and a gene. */
const wren = (): { parts: PartState[] } => ({
  parts: [
    part("backbone", dna(900, 42)),
    part("pGAP", dna(300, 7)),
    part("CSN2", dna(630, 991), { features: [
      { type: "CDS", label: "beta-casein", strand: 1, parts: [{ start: 0, end: 600 }] },
      { type: "sig_peptide", label: "signal", strand: 1, parts: [{ start: 0, end: 45 }] },
    ] }),
    part("pCircle", dna(2_000, 3), { circular: true }),
  ],
});

const ordered = (...names: string[]): { part: string; amplify: boolean }[] =>
  names.map((name) => ({ part: `sum-${name}`, amplify: name !== "backbone" }));

describe("designing an assembly", () => {
  it("makes a ring of the pieces end to end, in the order given", () => {
    const lab = wren();
    const design = designAssembly(lab, { pieces: ordered("backbone", "pGAP", "CSN2") });
    expect(design.problem).toBeNull();
    expect(design.length).toBe(900 + 300 + 630);
    expect(design.sequence).toHaveLength(design.length);
    expect(design.pieces.map((one) => [one.part.name, one.start, one.end])).toEqual([
      ["backbone", 0, 900], ["pGAP", 900, 1200], ["CSN2", 1200, 1830],
    ]);
    // The ring really is those bases, in that order.
    expect(design.sequence.slice(0, 900)).toBe(lab.parts[0]!.sequence);
    expect(design.sequence.slice(1200)).toBe(lab.parts[2]!.sequence);
    expect(design.name).toBe("backbone + pGAP + CSN2");
  });

  it("moves what was marked on a piece to where that piece now is", () => {
    const design = designAssembly(wren(), { pieces: ordered("backbone", "pGAP", "CSN2") });
    expect(design.features.map((one) => [one.label, one.parts[0]!.start, one.parts[0]!.end])).toEqual([
      ["beta-casein", 1200, 1800], ["signal", 1200, 1245],
    ]);
    // And the bases under a mark are the bases that were under it before.
    const gene = design.features[0]!.parts[0]!;
    expect(design.sequence.slice(gene.start, gene.end)).toBe(wren().parts[2]!.sequence.slice(0, 600));
  });

  it("gives one primer pair per amplified piece, and none for one used as it is", () => {
    const design = designAssembly(wren(), { pieces: ordered("backbone", "pGAP", "CSN2") });
    expect(design.primers.map((one) => one.name)).toEqual(["pGAP-F", "pGAP-R", "CSN2-F", "CSN2-R"]);
    expect(design.junctions.map((one) => `${one.from}->${one.to}`)).toEqual(["backbone->pGAP", "pGAP->CSN2", "CSN2->backbone"]);
    // The piece used as it is carries no overlap, so its neighbour's primer carries the whole of it.
    const first = design.junctions[0]!;
    expect(first.carried.fromReverse).toBe(0);
    expect(first.carried.toForward).toBe(first.length);
    // Between two amplified pieces it is shared out, which keeps both primers short.
    const middle = design.junctions[1]!;
    expect(middle.carried.fromReverse + middle.carried.toForward).toBe(middle.length);
    expect(middle.carried.fromReverse).toBeGreaterThan(0);
    expect(middle.carried.toForward).toBeGreaterThan(0);
    // A primer is its tail then the part that binds, and that is what is ordered.
    for (const primer of design.primers) expect(primer.sequence).toBe(primer.tail + primer.binding);
  });

  it("takes an overlap from the bases either side of the junction", () => {
    const lab = wren();
    const design = designAssembly(lab, { pieces: ordered("backbone", "pGAP", "CSN2"), overlap: 30 });
    for (const junction of design.junctions) {
      expect(junction.length).toBe(30);
      const before = design.pieces.find((one) => one.part.name === junction.from)!;
      const after = design.pieces.find((one) => one.part.name === junction.to)!;
      // A tail reaches across the junction, so each primer carries its neighbour's bases: what the
      // forward primer of `to` carries is the end of `from`, and the other way about.
      const fromEnd = junction.carried.toForward === 0 ? "" : before.part.sequence.slice(-junction.carried.toForward);
      const toStart = after.part.sequence.slice(0, junction.carried.fromReverse);
      expect(junction.overlap).toBe(fromEnd + toStart);
      expect(junction.carried.fromReverse + junction.carried.toForward).toBe(junction.length);
    }
  });

  it.each([
    ["one piece", ["backbone"], "An assembly is of at least two pieces, in the order they go round the ring."],
    ["a part the lab does not have", ["backbone", "nothing"], "One of the pieces is not a part the lab has."],
  ])("says why it cannot be designed from %s", (_what, names, problem) => {
    const pieces = names.map((name) => ({ part: `sum-${name}`, amplify: false }));
    const design = designAssembly(wren(), { pieces });
    expect(design.problem).toBe(problem);
    expect(design.primers).toEqual([]);
  });

  it("refuses a circle used as it is, since it has no ends to join", () => {
    const design = designAssembly(wren(), { pieces: [{ part: "sum-pCircle", amplify: false }, { part: "sum-CSN2", amplify: true }] });
    expect(design.problem).toMatch(/pCircle is a circle, which has no ends to join. Cut it first, or amplify it./);
    // Amplified, it is a piece like any other: a PCR gives it ends.
    const amplified = designAssembly(wren(), { pieces: [{ part: "sum-pCircle", amplify: true }, { part: "sum-CSN2", amplify: true }] });
    expect(amplified.problem).toBeNull();
    expect(amplified.length).toBe(2_000 + 630);
  });

  it("offers only the parts long enough to carry an overlap and a primer", () => {
    const lab = { parts: [...wren().parts, part("tiny", dna(20, 5))] };
    expect(assemblyParts(lab).map((one) => one.name)).toEqual(["backbone", "pGAP", "CSN2", "pCircle"]);
    expect(assemblyParts(lab, 10, 5).map((one) => one.name)).toContain("tiny");
    expect(LONGEST_RING).toBeGreaterThan(100_000);
  });
});

describe("the working behind it", () => {
  it("adds up to the ring it claims, and says where each overlap came from", () => {
    const design = designAssembly(wren(), { pieces: ordered("backbone", "pGAP", "CSN2") });
    const working = assemblyWorking(design);
    const ring = working.find((one) => one.of === "the ring")!;
    expect(ring.kind).toBe("exact");
    expect(ring.comes).toBe("1,830 bases");
    // The sum written in the working is the sum, and it is the figure claimed.
    const sum = ring.steps.find((one) => one.startsWith("every piece end to end"))!;
    const [added, total] = sum.split(" = ") as [string, string];
    expect(added.split(": ")[1]!.split(" + ").reduce((count, one) => count + Number(one.replace(/,/g, "")), 0)).toBe(1_830);
    expect(total).toBe("1,830");

    const join = working.find((one) => one.of.startsWith("the join between pGAP and CSN2"))!;
    expect(join.kind).toBe("estimate");
    expect(join.rests).toMatch(/Wallace rule/);
    const quoted = join.steps.find((one) => one.startsWith("the overlap the two products share"))!.split(": ")[1]!;
    expect(quoted).toBe(design.junctions[1]!.overlap);

    // Every primer's working quotes the primer that would be ordered.
    for (const primer of design.primers) {
      const one = working.find((each) => each.of === primer.name)!;
      expect(one.steps.some((step) => step === `what is ordered: ${primer.sequence}`)).toBe(true);
    }
    expect(assemblyWorking(designAssembly(wren(), { pieces: ordered("backbone") }))).toEqual([]);
  });
});

describe("recording it", () => {
  it("is one run: the pieces in, the ring out, with what each piece carried", () => {
    const design = designAssembly(wren(), { pieces: ordered("backbone", "pGAP", "CSN2"), name: "pWren1" });
    const tubes = { "sum-backbone": "t1", "sum-pGAP": "t2", "sum-CSN2": "t3" };
    const run = assemblyRun(design, { tubes, used: { t1: 2 }, instrument: "block", note: "overnight at 50 °C" })!;
    expect(run).toMatchObject({ kind: "assembly", instrument: "block", outcome: "worked", note: "overnight at 50 °C" });
    expect(run["inputs"]).toEqual([{ item: "t1", amount: 2, role: "piece" }, { item: "t2", amount: 1, role: "piece" }, { item: "t3", amount: 1, role: "piece" }]);
    const outputs = run["outputs"] as { sequence: string; circular: boolean; name: string; features: unknown[] }[];
    expect(outputs[0]).toMatchObject({ name: "pWren1", circular: true });
    expect(outputs[0]!.sequence).toBe(design.sequence);
    expect(outputs[0]!.features).toHaveLength(2);
    expect(run["settings"]).toEqual({ pieces: 3, joins: 3, overlap: 25 });
    // Without a tube of every piece there is nothing to record.
    expect(assemblyRun(design, { tubes: { "sum-backbone": "t1" } })).toBeNull();
  });
});
