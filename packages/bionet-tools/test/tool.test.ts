/**
 * A PCR run from a real lab's freezer.
 *
 * The lab is made by `@biolibs/bionet-client`. What is checked is the whole loop the tool exists
 * for: tubes are offered, a choice becomes a run, and recording it leaves the freezer as the bench
 * would — the template and primers lower, a new tube that knows where it came from.
 */
import { Lab, memoryKeys, memoryStore, sourceOf } from "@biolibs/bionet-client";
import { LabProvider } from "@biolibs/bionet-react";
import { DigestTool, Gel, InstrumentTool, PcrTool, Tools, digestRun, digestTubes, instrumentFor, pcrRun, pcrTubes, planDigest, strandCounts, suggestProgramme, toolFor, usePcrBench, StrandBars, TemperatureTrace, type BenchStage } from "@biolibs/bionet-tools";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const FORWARD = "GGATCACAGTCTACACTG";
const REVERSE = "GGTATACATACTCTGAAG";

const draw = (lab: Lab, what: ReactElement): string => renderToStaticMarkup(h(LabProvider, { source: sourceOf(lab), children: what })).replace(/&#x27;/g, "'");

/** A lab with a template and two primers in tubes, a thermocycler on a bench, and a centrifuge. */
async function wren(): Promise<{ lab: Lab; tubes: { template: string; forward: string; reverse: string }; cycler: string; centrifuge: string }> {
  const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
  await lab.setPerson("Ada");
  await lab.found({ name: "The Wren Lab" });
  const tube = async (name: string, sequence: string): Promise<string> => {
    await lab.addPart({ name, sequence });
    return lab.addItem({ part: lab.snapshot().lab!.parts.at(-1)!.checksum, amount: 20, unit: "µL" });
  };
  const tubes = { template: await tube("pWren-402", TEMPLATE), forward: await tube("fwd-1", FORWARD), reverse: await tube("rev-1", REVERSE) };
  const bench = await lab.addPlace({ kind: "bench", name: "Bench 1" });
  const cycler = await lab.addPlace({ kind: "instrument", name: "Thermocycler", parent: bench, model: "thermocycler" });
  const centrifuge = await lab.addPlace({ kind: "instrument", name: "Centrifuge", parent: bench, model: "centrifuge" });
  return { lab, tubes, cycler, centrifuge };
}

describe("the tubes a PCR is offered", () => {
  it("are primers if they are short and templates if they are not, and never empty or retired ones", async () => {
    const { lab, tubes } = await wren();
    const offered = pcrTubes(lab.snapshot().lab!);
    expect(offered.primers.map((one) => one.part.name)).toEqual(["fwd-1", "rev-1"]);
    expect(offered.templates.map((one) => one.part.name)).toEqual(["pWren-402", "fwd-1", "rev-1"]);
    expect(offered.templates[0]!.label).toBe("pWren-402 · 20 µL · nowhere recorded");

    await lab.adjust({ item: tubes.forward, by: -20 });
    await lab.retire({ item: tubes.reverse });
    const left = pcrTubes(lab.snapshot().lab!);
    // With nothing short left, everything is offered as a primer: the lab knows better than a length.
    expect(left.primers.map((one) => one.part.name)).toEqual(["pWren-402"]);
    expect(left.templates.map((one) => one.part.name)).toEqual(["pWren-402"]);
  });
});

describe("a choice of tubes", () => {
  it("becomes a run that, recorded, leaves the freezer as the bench would", async () => {
    const { lab, tubes, cycler } = await wren();
    const run = pcrRun(lab.snapshot().lab!, { ...tubes, instrument: cycler, used: { template: 1, forward: 2, reverse: 2 } });
    expect(run.plan).toMatchObject({ problem: null, products: [{ length: 75 }] });
    expect(run.name).toBe("pWren-402 × fwd-1 + rev-1");
    expect(run.worked).toMatchObject({ kind: "pcr", instrument: cycler, outcome: "worked", settings: { anneal_at_least: 18 },
                                       outputs: [{ sequence: TEMPLATE, circular: false, amount: 50, unit: "µL" }] });

    const done = await lab.recordRun(run.worked as Parameters<Lab["recordRun"]>[0]);
    const seen = lab.snapshot().lab!;
    expect(seen.items.slice(0, 3).map((item) => item.amount)).toEqual([19, 18, 18]);
    expect(seen.items.find((item) => item.item === done.items[0])).toMatchObject({ amount: 50, from: done.run, where: null });
    expect(seen.runs[0]).toMatchObject({ kind: "pcr", instrument: cycler, outcome: "worked" });

    // The same choice, recorded as having given nothing: the tubes are used, and nothing is made.
    await lab.recordRun(run.failed as Parameters<Lab["recordRun"]>[0]);
    expect(lab.snapshot().lab!.items.slice(0, 3).map((item) => item.amount)).toEqual([18, 16, 16]);
    expect(lab.snapshot().lab!.runs[1]).toMatchObject({ outcome: "failed", outputs: [] });
  });

  it("takes a name, an amount and a note, and falls back when what was typed is not a whole number", async () => {
    const { lab, tubes } = await wren();
    const run = pcrRun(lab.snapshot().lab!, { ...tubes, name: " insert ", amount: 25, unit: null, note: "gel looked clean",
                                              used: { template: 1.5, forward: -1 }, annealAtLeast: 14 });
    expect(run.name).toBe("insert");
    expect(run.worked).toMatchObject({ instrument: null, note: "gel looked clean", settings: { anneal_at_least: 14 },
                                       inputs: [{ amount: 1 }, { amount: 1 }, { amount: 1 }], outputs: [{ name: "insert", amount: 25, unit: null }] });
  });

  it("cannot be recorded as working when the primers do not make one product, but can as giving nothing", async () => {
    const { lab, tubes } = await wren();
    const run = pcrRun(lab.snapshot().lab!, { template: tubes.forward, forward: tubes.forward, reverse: tubes.reverse });
    expect(run.plan!.problem).toMatch(/do not both bind/);
    expect(run.worked).toBeNull();
    expect(run.failed).toMatchObject({ outcome: "failed", outputs: [] });
    expect(pcrRun(lab.snapshot().lab!, { ...tubes, template: "no-such-tube" })).toEqual({ plan: null, name: "", worked: null, failed: null });
  });
});

describe("the tool an instrument opens", () => {
  it("is the PCR tool for a thermocycler, and says so when there is none", async () => {
    const { lab, cycler, centrifuge } = await wren();
    const places = lab.snapshot().lab!.places;
    expect(toolFor(places.find((one) => one.place === cycler))).toBe("pcr");
    expect(toolFor(places.find((one) => one.place === centrifuge))).toBeNull();
    expect(toolFor(undefined)).toBeNull();

    const tool = draw(lab, h(InstrumentTool, { place: cycler, onDone: () => {} }));
    expect(tool).toContain("PCR · Thermocycler");
    expect(tool).toContain("pWren-402 · 20 µL · nowhere recorded");
    expect(tool).toContain("Back to the lab");
    expect(tool).not.toContain("What it makes");            // nothing has been chosen yet
    expect(draw(lab, h(InstrumentTool, { place: centrifuge }))).toContain("There is no tool for this yet");
    expect(draw(lab, h(InstrumentTool, { place: "no such place" }))).toContain("This place");
    expect(draw(lab, h(PcrTool))).toContain("<h2>PCR</h2>");
  });

  it("lists the runs done there, and says when the freezer has nothing to run", async () => {
    const { lab, tubes, cycler } = await wren();
    await lab.recordRun(pcrRun(lab.snapshot().lab!, { ...tubes, instrument: cycler, name: "insert", note: "first try" }).worked as Parameters<Lab["recordRun"]>[0]);
    await lab.recordRun(pcrRun(lab.snapshot().lab!, { ...tubes, instrument: cycler }).failed as Parameters<Lab["recordRun"]>[0]);
    const tool = draw(lab, h(PcrTool, { instrument: { id: cycler, name: "Thermocycler" } }));
    expect(tool).toContain("Recent runs here");
    expect(tool).toContain("first try");
    expect(tool).toContain("gave nothing");

    const empty = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await empty.setPerson("Ada");
    await empty.found({ name: "Empty" });
    expect(draw(empty, h(PcrTool))).toContain("There are no tubes to run a PCR from");
  });
});

const PLASMID = `${"ACGT".repeat(300)}GAATTC${"ACGT".repeat(700)}GGATCC${"ACGT".repeat(250)}`;

describe("a check digest", () => {
  it("uses some of the tube, makes nothing, and records what was expected and whether the gel showed it", async () => {
    const { lab } = await wren();
    await lab.addPart({ name: "pBig", sequence: PLASMID, circular: true });
    const tube = await lab.addItem({ part: lab.snapshot().lab!.parts.at(-1)!.checksum, amount: 10, unit: "µL" });
    const bench = lab.snapshot().lab!.places[0]!.place;
    const station = await lab.addPlace({ kind: "instrument", name: "Gel station", parent: bench, model: "gel-station" });
    expect(digestTubes(lab.snapshot().lab!)[0]!.part.name).toBe("pWren-402");
    expect(instrumentFor(lab.snapshot().lab!, "digest")).toEqual({ id: station, name: "Gel station" });
    expect(toolFor(lab.snapshot().lab!.places.find((one) => one.place === station))).toBe("digest");

    const run = digestRun(lab.snapshot().lab!, { tube, enzymes: ["EcoRI", "BamHI"], used: 2, instrument: station, note: "clean" });
    expect(run.plan).toMatchObject({ problem: null, fragments: [2806, 2206] });
    expect(run.matched).toMatchObject({ kind: "digest", instrument: station, outcome: "worked", outputs: [], note: "clean",
                                        inputs: [{ item: tube, amount: 2, role: "cut" }], settings: { enzymes: "EcoRI+BamHI", expected: "2806,2206", gel: "1.0" } });
    expect(run.differed).toMatchObject({ outcome: "failed", outputs: [] });

    const before = lab.snapshot().lab!.items.length;
    await lab.recordRun(run.matched as Parameters<Lab["recordRun"]>[0]);
    await lab.recordRun(run.differed as Parameters<Lab["recordRun"]>[0]);
    const seen = lab.snapshot().lab!;
    expect(seen.items.find((one) => one.item === tube)!.amount).toBe(6);
    expect(seen.items).toHaveLength(before);
    expect(seen.runs.map((one) => [one.kind, one.outcome])).toEqual([["digest", "worked"], ["digest", "failed"]]);

    const tool = draw(lab, h(DigestTool, { instrument: { id: station, name: "Gel station" } }));
    expect(tool).toContain("Digest and gel · Gel station");
    expect(tool).toContain("Recent digests here");
    expect(tool).toContain("EcoRI + BamHI");
    expect(tool).toContain("did not match");
    expect(draw(lab, h(InstrumentTool, { place: station }))).toContain("Digest and gel · Gel station");
  });

  it("has nothing to record when the enzymes do not cut, the tube is unknown, or nothing is chosen", async () => {
    const { lab, tubes } = await wren();
    const seen = lab.snapshot().lab!;
    expect(digestRun(seen, { tube: tubes.template, enzymes: ["NotI"] })).toMatchObject({ plan: { problem: "NotI does not cut this." }, matched: null, differed: null });
    expect(digestRun(seen, { tube: tubes.template, enzymes: [] }).matched).toBeNull();
    expect(digestRun(seen, { tube: "no-such-tube", enzymes: ["EcoRI"] })).toEqual({ plan: null, matched: null, differed: null });
    expect(instrumentFor(seen, "digest")).toBeNull();
  });

  it("is drawn as a gel that says what is on it", () => {
    const plan = planDigest({ sequence: PLASMID, circular: true }, ["EcoRI", "BamHI"]);
    const gel = renderToStaticMarkup(h(Gel, { ladder: plan.ladder, bands: plan.bands, name: "pBig" }));
    expect(gel).toContain('aria-label="A gel: a ladder beside pBig, cut into pieces of 2806, 2206 base pairs"');
    expect(gel).toContain(">2806<");
    expect(gel).toContain(">ladder<");
    expect(gel.match(/<rect /g)!.length).toBe(3 + plan.ladder.length + plan.bands.length);
  });
});

describe("every tool, without walking to an instrument", () => {
  it("opens on PCR, offers digest, and records at the lab's instrument if it has one", async () => {
    const { lab } = await wren();
    const tools = draw(lab, h(Tools));
    expect(tools).toContain('aria-selected="true" class="">PCR</button>');
    expect(tools).toContain(">Digest and gel</button>");
    expect(tools).toContain("PCR · Thermocycler");
    const digest = draw(lab, h(Tools, { tool: "digest" }));
    expect(digest).toContain("<h2>Digest and gel</h2>");      // no gel station has been placed
    expect(digest).not.toContain("Back to the lab");
  });
});

describe("a PCR at the machine", () => {
  /** Draws the bench's panel, and hands back what the scene would be told. */
  const bench = (lab: Lab): { panel: string; stage: BenchStage } => {
    let stage: BenchStage | undefined;
    const Show = (): ReactElement => { const made = usePcrBench({ instrument: { id: "cycler", name: "Thermocycler" } }); stage = made.stage; return h("div", null, made.panel); };
    const panel = draw(lab, h(Show));
    return { panel, stage: stage! };
  };

  it("starts at the machine with nothing chosen, and says what the machine does and does not show", async () => {
    const { lab } = await wren();
    const { panel, stage } = bench(lab);
    expect(stage).toMatchObject({ model: "thermocycler", name: "Thermocycler", view: "machine", screen: [{ text: "No programme" }] });
    expect(stage.well).toBeUndefined();
    expect(stage.tube).toBeUndefined();
    expect(panel).toContain("It shows nothing of the DNA");
    expect(panel).toContain("pWren-402 · 20 µL · nowhere recorded");
    expect(panel).toContain('role="tooltip"');                         // its terms explain themselves
    expect(Object.keys(stage.legend)).toEqual(["template", "primer", "long", "product"]);
  });

  it("keeps the programme a run was set to with the run", async () => {
    const { lab, tubes } = await wren();
    const programme = { initial: { celsius: 95, seconds: 120 }, cycles: 28, final: { celsius: 72, seconds: 300 },
                        steps: [{ name: "denature", celsius: 95, seconds: 30 }, { name: "anneal", celsius: 48, seconds: 30 }, { name: "extend", celsius: 72, seconds: 20 }] } as const;
    const run = pcrRun(lab.snapshot().lab!, { ...tubes, programme: structuredClone(programme) as never });
    expect(run.worked).toMatchObject({ settings: { anneal_at_least: 18, denature_c: 95, anneal_c: 48, anneal_s: 30, extend_c: 72, extend_s: 20, cycles: 28 } });
    await lab.recordRun(run.worked as Parameters<Lab["recordRun"]>[0]);
    expect(lab.snapshot().lab!.runs[0]!.settings).toMatchObject({ anneal_c: 48, cycles: 28 });
  });

  it("draws a cycle's temperatures with the step it is on, and the strands as bars on a doubling scale", () => {
    const programme = suggestProgramme({ length: 1500, primers: [{ name: "f", tm: 60 }, { name: "r", tm: 58 }] });
    const trace = renderToStaticMarkup(h(TemperatureTrace, { programme, step: "anneal" }));
    expect(trace).toContain("It is on anneal.");
    expect(trace).toContain('class="on">53°<');
    expect(trace.match(/°</g)).toHaveLength(3);

    const bars = renderToStaticMarkup(h(StrandBars, { counts: strandCounts(3), cycles: 30 }));
    expect(bars).toContain('aria-label="Template: 2 strands. Too long: 6 strands. Product: 8 strands"');
    const width = (kind: string, cycles: number): number => Number(new RegExp(`fill ${kind}" style="width:([0-9.]+)%`).exec(renderToStaticMarkup(h(StrandBars, { counts: strandCounts(cycles), cycles: 30 })))![1]);
    // Each cycle the product's bar moves on by the same step, since it doubles; the over-long strands barely move.
    expect(width("product", 20) - width("product", 10)).toBeCloseTo(width("product", 30) - width("product", 20), 0);
    expect(width("long", 30)).toBeLessThan(width("product", 30) / 4);
    expect(width("product", 30)).toBeLessThanOrEqual(100);
  });
});
