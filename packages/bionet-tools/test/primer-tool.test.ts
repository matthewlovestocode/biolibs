/**
 * The primer design tool, drawn on a real lab.
 *
 * The sums are checked in `primer-design.test.ts`. Here it is the tool as somebody meets it: what it
 * offers, that what it draws says what it shows to somebody who cannot see it, and what it hands a
 * scene to picture.
 */
import { Lab, memoryKeys, memoryStore, sourceOf } from "@biolibs/bionet-client";
import { LabProvider } from "@biolibs/bionet-react";
import { PairPicture, PairedBases, PrimerTool, StretchStrip, Tools, designPair, designedMolecule, pairedStrands, usePrimerBench, type PrimerDesk } from "@biolibs/bionet-tools";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const made = (seed: number, many: number): string => {
  let at = seed;
  const next = (): number => (at = (at * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: many }, () => "ACGT"[Math.floor(next() * 4)]).join("");
};
const PLASMID = made(11, 1200);
const FEATURES = [{ type: "CDS", label: "geneA", strand: 1 as const, parts: [{ start: 100, end: 600 }] }];
const draw = (lab: Lab, what: ReactElement): string => renderToStaticMarkup(h(LabProvider, { source: sourceOf(lab), children: what })).replace(/&#x27;/g, "'");

async function wren(): Promise<{ lab: Lab; part: string; tube: string; box: string }> {
  const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
  await lab.setPerson("Ada");
  await lab.found({ name: "The Wren Lab" });
  await lab.addPart({ name: "pTest", sequence: PLASMID, circular: true, features: FEATURES });
  await lab.addPart({ name: "an oligo", sequence: "ACGTACGTACGTACGTACGT" });
  const part = lab.snapshot().lab!.parts.find((one) => one.name === "pTest")!.checksum;
  const tube = await lab.addItem({ part, amount: 20, unit: "µL" });
  const freezer = await lab.addPlace({ kind: "freezer", name: "−80" });
  const box = await lab.addPlace({ kind: "box", name: "Box 1", parent: freezer, grid: { rows: 9, columns: 9 } });
  await lab.putItem({ item: tube, place: box, slot: { row: 0, column: 0 } });
  return { lab, part, tube, box };
}

describe("the primer design tool", () => {
  it("is in the list of tools, and opens on a part long enough to design on", async () => {
    const { lab } = await wren();
    const tools = draw(lab, h(Tools, { tool: "primers" }));
    expect(tools).toContain('aria-selected="true" class="">Primers</button>');
    expect(tools).toContain("<h2>Design primers</h2>");
    expect(tools).toContain("pTest · 1,200 bp · circular");
    expect(tools).not.toContain("an oligo ·");                 // too short to hold a pair
    expect(tools).toContain("geneA · CDS · 101..600 · 500 bp");
    expect(tools).not.toContain("<h2>The pair</h2>");          // nothing is designed until a stretch is chosen
  });

  it("designs the pair for a stretch, lays out every candidate, and shows the working", async () => {
    const { lab, part } = await wren();
    const design = designPair({ sequence: PLASMID, circular: true }, { start: 100, end: 600 })!;
    const tool = draw(lab, h(PrimerTool, { start: { part, stretch: { start: 100, end: 600 }, name: "geneA" } }));
    for (const title of ["The pair", "What was considered", "The working", "Order them, and keep them"]) expect(tool).toContain(`<h2>${title}</h2>`);
    expect(tool).toContain(`<code class="oligo">${design.forward.chosen.report.sequence}</code>`);
    expect(tool).toContain(`<code class="oligo">${design.reverse.chosen.report.sequence}</code>`);
    // One row for each length tried at each end, and exactly one marked at each.
    expect(tool.match(/aria-label="Use \d+ bases for the (forward|reverse) primer"/g)).toHaveLength(24);
    expect(tool.match(/aria-current="true"/g)).toHaveLength(2);
    expect(tool.match(/scored best/g)).toHaveLength(2);
    expect(tool).toContain(design.forward.why);
    expect(tool).toContain("the PCR engine makes one product of 500 bp from this pair");
    expect(tool).toContain("geneA-F's melting temperature");
    expect(tool).toContain("how much the two primers pair with each other");
    expect(tool).toContain(`geneA-F   ${design.forward.chosen.report.sequence}`);
    // Terms are explained where they are first met, with their pictures.
    expect(tool).toContain('role="tooltip"');
    expect(tool).toContain("No run is recorded");
  });

  it("says what its pictures show", () => {
    const design = designPair({ sequence: PLASMID, circular: true }, { start: 100, end: 600 })!;
    const picture = renderToStaticMarkup(h(PairPicture, { design, names: { forward: "F", reverse: "R" } }));
    expect(picture).toContain("F, 24 bases, lies on the bottom strand at the left end, from base 101, and points right.".replace("24", String(design.forward.chosen.report.length)));
    expect(picture).toContain("up to base 600, and points left");
    const strip = renderToStaticMarkup(h(StretchStrip, { part: { name: "pTest", length: 1200, features: FEATURES }, stretch: { start: 100, end: 600 }, onStretch: () => {} }));
    expect(strip).toContain("The stretch chosen is 101 to 600. Drag across it to choose another.");
    const paired = pairedStrands("GGGATCCATTTTTATGGATCC", "GGGATCCATTTTTATGGATCC");
    const bases = renderToStaticMarkup(h(PairedBases, { paired, upper: "hp", lower: "hp again" }));
    expect(bases).toContain(`${paired.length} bases in a row pair, ${paired.upper.slice(paired.from, paired.from + paired.length)} with`);
    expect(bases.match(/class="bond">\|/g)!.length).toBeGreaterThanOrEqual(paired.length);
  });

  it("hands a scene the template's tube to look at, and the pair marked on its molecule", async () => {
    const { lab, part, tube, box } = await wren();
    let desk: PrimerDesk | null = null;
    const Probe = (): null => { desk = usePrimerBench({ start: { part, stretch: { start: 100, end: 600 }, name: "geneA" } }).desk; return null; };
    draw(lab, h(Probe));
    expect(desk!.focus).toEqual({ place: box, item: tube });
    expect(desk!.ready).toBeNull();                              // no tubes of the primers yet
    const marks = desk!.molecule!.features.map((one) => [one.label, one.start, one.end, one.strand]);
    const design = designPair({ sequence: PLASMID, circular: true }, { start: 100, end: 600 })!;
    expect(marks).toEqual([["geneA", 100, 600, 1], ["500 bp", 100, 600, 0], ["geneA-F", 100, design.forward.end, 1], ["geneA-R", design.reverse.start, 600, -1]]);
    // Through the origin, each mark is drawn as the pieces either side of it.
    const through = designPair({ sequence: PLASMID, circular: true }, { start: 1190, end: 300 })!;
    const drawn = designedMolecule({ name: "pTest", length: 1200, circular: true, features: [] }, through, { forward: "F", reverse: "R" });
    expect(drawn.features.filter((one) => one.label === "F" || (one.label === "" && one.strand === 1)).map((one) => [one.start, one.end]))
      .toEqual([[1190, 1200], [0, through.forward.end - 1200]]);
  });
});
