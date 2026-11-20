/**
 * The demo lab, and that everything the tour does on it really works.
 *
 * A demo that quietly stopped working would be the worst thing in the repository: it is the first
 * thing anybody sees. So the molecules are checked against the engines that the tour's own tools
 * use — the enzymes cut where it says, the primers make one product, and the pieces join into one
 * circle — and the lab is checked for having really been founded and filled.
 */
import { cutsOf, cutSites, designPair, digestPieces, planLigation, planPcr, primerTm } from "@biolibs/bionet-tools";
import { demoLab, demoMolecules, demoTour, otherStrand } from "@biolibs/bionet-demo";
import { describe, expect, it } from "vitest";

const molecules = demoMolecules();

describe("the demo lab's molecules", () => {
  it("are the same every time", () => {
    expect(demoMolecules().pGene.sequence).toBe(molecules.pGene.sequence);
    expect(molecules.pGene.sequence.length).toBe(1712);
    // Every base either strand has: the piece runs 2,706 on a gel, and carries four unpaired at each end.
    expect(molecules.backbone.sequence.length).toBe(2710);
  });

  it("carry only the sites the demo planted", () => {
    const cut = (name: string): number[] => cutsOf(molecules.pGene, name)?.positions ?? [];
    expect(cut("EcoRI")).toHaveLength(1);
    expect(cut("BamHI")).toHaveLength(1);
    for (const name of ["HindIII", "XhoI", "NotI", "KpnI", "SalI", "PstI", "NcoI", "SmaI", "BglII"]) expect(cut(name)).toHaveLength(0);
  });

  it("let the primers make one product, of a size the tour can say", () => {
    const plan = planPcr(molecules.pGene, molecules.forward.sequence, molecules.reverse.sequence);
    expect(plan.problem).toBeNull();
    expect(plan.products[0]!.length).toBe(780);
    // Near enough each other that one annealing temperature suits both.
    const [one, other] = [primerTm(molecules.forward.sequence)!, primerTm(molecules.reverse.sequence)!];
    expect(Math.abs(one - other)).toBeLessThanOrEqual(6);
  });

  it("cut into a gene the gel can tell from the rest of the plasmid", () => {
    const sites = ["EcoRI", "BamHI"].flatMap((name) => cutSites(molecules.pGene, cutsOf(molecules.pGene, name)!));
    const pieces = digestPieces(molecules.pGene, sites);
    expect(pieces.map((one) => one.length)).toEqual([926, 786]);
    // Far enough apart in size to be two bands and not one.
    expect(926 - 786).toBeGreaterThan(786 * 0.03);
  });

  it("join the gene to the waiting backbone, one way only", () => {
    const sites = ["EcoRI", "BamHI"].flatMap((name) => cutSites(molecules.pGene, cutsOf(molecules.pGene, name)!));
    const gene = digestPieces(molecules.pGene, sites).find((one) => one.length === 786)!;
    const plan = planLigation([
      { id: "b", name: "backbone", sequence: molecules.backbone.sequence, ends: molecules.backbone.ends! },
      { id: "g", name: "the gene", sequence: gene.sequence, ends: gene.ends },
    ]);
    expect(plan.problem).toBeNull();
    // One circle, because the two ends differ: no question of which way round the gene went in.
    expect(plan.products).toHaveLength(1);
    expect(plan.products[0]).toMatchObject({ circular: true, length: 3492 });
  });

  it("read the same from either strand", () => {
    expect(otherStrand("GAATTC")).toBe("GAATTC");
    expect(otherStrand(molecules.forward.sequence)).toBe(otherStrand(molecules.forward.sequence));
    expect(otherStrand(otherStrand(molecules.reverse.sequence))).toBe(molecules.reverse.sequence);
  });
});

describe("the demo lab", () => {
  it("is a real lab, founded and filled", async () => {
    const demo = await demoLab();
    const lab = demo.lab.snapshot().lab!;
    expect(lab.name).toBe("The Wren Lab");
    expect(lab.member).toBe(true);
    // No primers: the tour designs them, and they arrive.
    expect(lab.parts.map((one) => one.name)).toEqual(["pGene", "pWren backbone"]);
    // The kit a lab is founded with, and nothing of the demo's own: a lab shown to somebody is the
    // lab they would get. The four machines the tools are used at are the first four instruments.
    expect(lab.places.map((one) => one.name)).toEqual([
      "Main lab", "Bench 1", "Bench 2", "−80 freezer", "4 °C fridge",
      "Thermocycler", "Gel station", "Heat block", "Shaking incubator",
      "Centrifuge", "Microscope", "Computer", "Box 1", "Box F1"]);
    // Two tubes and one culture: the lab keeps something alive, so there is something to induce.
    expect(lab.items).toHaveLength(3);
    expect(lab.items.filter((one) => one.part !== null).every((one) => one.where?.place === demo.places.box)).toBe(true);
    // The culture is on the bench and not in the −80, because it is growing.
    const culture = lab.items.find((one) => one.part === null)!;
    expect(culture).toMatchObject({ item: demo.tubes.culture, strain: demo.strain, where: { place: demo.places.bench } });
    expect(lab.strains.map((one) => one.name)).toEqual(["W303 pGene-1"]);
    expect(lab.strains[0]!.carries).toEqual([lab.parts.find((one) => one.name === "pGene")!.checksum]);
    expect(lab.crowded).toEqual([]);
  });

  it("holds the backbone as a cut piece with its ends, and the gene's plasmid as a circle", async () => {
    const demo = await demoLab();
    const lab = demo.lab.snapshot().lab!;
    const part = (name: string) => lab.parts.find((one) => one.name === name)!;
    expect(part("pWren backbone")).toMatchObject({ circular: false, ends: { left: 4, right: 4 } });
    expect(part("pGene")).toMatchObject({ circular: true, ends: { left: 0, right: 0 } });
    expect(part("pGene").features.map((one) => one.label)).toEqual(["wrenA", "wrenA signal", "lac promoter", "ori"]);
  });

  it("gives two labs that do not share anything", async () => {
    const [one, other] = await Promise.all([demoLab(), demoLab({ person: "Bob", name: "Another lab" })]);
    expect(one.lab.snapshot().lab!.id).not.toBe(other.lab.snapshot().lab!.id);
    expect(other.lab.snapshot().lab!.name).toBe("Another lab");
  });
});

describe("the primers", () => {
  it("are the pair the design tool gives for the gene, so the tour designs what it then uses", () => {
    const design = designPair(molecules.pGene, molecules.gene)!;
    expect(molecules.forward).toMatchObject({ name: "wrenA-F", sequence: design.forward.chosen.report.sequence });
    expect(molecules.reverse).toMatchObject({ name: "wrenA-R", sequence: design.reverse.chosen.report.sequence });
    expect(design.length).toBe(780);
    // What the tour says about the design: nothing to warn of at all, out of thirteen candidates each way.
    expect(design.warnings).toEqual([]);
    expect(design.forward.candidates).toHaveLength(13);
    expect(design.reverse.candidates).toHaveLength(13);
  });

  it("are not in the lab until the tour's stop has them arrive, and then the PCR is recorded with them", async () => {
    const demo = await demoLab();
    const steps = demoTour(demo);
    const state = () => demo.lab.snapshot().lab!;
    const arrive = steps.find((one) => one.title === "Ordered, and arrived")!;
    const came = steps.find((one) => one.title === "What came out")!;
    // Before they arrive the PCR has no primers to be opened on, and recording it does nothing.
    expect(steps.find((one) => one.title === "The programme")!.show(state())).toEqual({ at: "pcr", start: { view: "screen", template: demo.tubes.pGene } });
    await came.does!(demo, state());
    expect(state().runs).toHaveLength(0);

    await arrive.does!(demo, state());
    await arrive.does!(demo, state());                       // going back over the stop adds nothing more
    expect(state().parts.map((one) => one.name)).toEqual(["pGene", "pWren backbone", "wrenA-F", "wrenA-R"]);
    const primers = state().items.filter((one) => one.part !== null && one.item !== demo.tubes.pGene && one.item !== demo.tubes.backbone);
    expect(primers).toHaveLength(2);
    // A tube that arrived is not the output of a run, and the record does not say it was.
    expect(primers.every((one) => one.from === null && one.where?.place === demo.places.box)).toBe(true);
    expect(state().runs).toHaveLength(0);

    const stop = arrive.show(state());
    expect(stop).toMatchObject({ at: "primers", start: { feature: "wrenA", name: "wrenA", section: "order" } });
    await came.does!(demo, state());
    expect(state().runs.map((one) => one.kind)).toEqual(["pcr"]);
    expect(state().parts.find((one) => one.name === "wrenA check")?.length).toBe(780);
  });
});

describe("where to stand to see what was done", () => {
  it("looks at a part's tube where the lab has put one, and counts a stretch the way the tools do", async () => {
    const { stopFor } = await import("@biolibs/bionet-demo");
    const lab = {
      parts: [{ checksum: "p", length: 900 }],
      items: [{ item: "retired", part: "p", retired: true, where: { place: "box" } }, { item: "loose", part: "p", retired: false, where: null },
              { item: "t", part: "p", retired: false, where: { place: "box" } }],
    };
    expect(stopFor({ at: "sequences", part: "p" }, lab)).toEqual({ at: "sequences", part: "p", focus: { place: "box", item: "t" } });
    expect(stopFor({ at: "sequences", part: "other" }, lab)).toEqual({ at: "sequences", part: "other" });
    // People count from 1 and include both ends: 101 to 600 is 500 bases, with 100 before it.
    expect(stopFor({ at: "primers", part: "p", from: 101, to: 600 }, lab)).toEqual({ at: "primers", start: { part: "p", stretch: { start: 100, end: 600 } } });
    // A stretch that runs through a circle's origin ends past the part's length.
    expect(stopFor({ at: "primers", part: "p", from: 851, to: 50 }, lab)).toEqual({ at: "primers", start: { part: "p", stretch: { start: 850, end: 950 } } });
    const digest = { at: "digest" as const, start: { view: "tube" as const, tube: "t", enzymes: ["EcoRI"] } };
    expect(stopFor(digest, lab)).toBe(digest);
  });
});
