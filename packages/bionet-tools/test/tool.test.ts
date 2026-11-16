/**
 * A PCR run from a real lab's freezer.
 *
 * The lab is made by `@biolibs/bionet-client`. What is checked is the whole loop the tool exists
 * for: tubes are offered, a choice becomes a run, and recording it leaves the freezer as the bench
 * would — the template and primers lower, a new tube that knows where it came from.
 */
import { Lab, memoryKeys, memoryStore, sourceOf } from "@biolibs/bionet-client";
import { LabProvider } from "@biolibs/bionet-react";
import { InstrumentTool, PcrTool, pcrRun, pcrTubes, toolFor } from "@biolibs/bionet-tools";
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
