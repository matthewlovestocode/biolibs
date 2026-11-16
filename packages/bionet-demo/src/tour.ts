/**
 * The walk through the lab, as plain data: where to be, what to say, and what to do there.
 *
 * One window at a time is how the app is used and the worst way to be shown it, because what makes
 * Bionet worth anything is that the freezer, the tools and the record are the same thing. So the
 * tour goes round all of it in one line of argument: here is a lab, here is a tube in it, here is
 * what is on that tube, and here is each tool used on it in turn, ending with a plasmid in the
 * freezer that was not there at the start.
 *
 * Nothing here draws anything, and nothing pretends. A step that says a run was recorded records it.
 */
import type { PartFeature } from "@biolibs/bionet";
import type { LabView } from "@biolibs/bionet-client";
import { cutSites, cutsOf, digestPieces, planLigation, planPcr } from "@biolibs/bionet-tools";
import type { DemoLab } from "./lab.js";

/** Where a step is shown. */
export type TourStop =
  | { at: "lab"; focus?: { place: string | null; item?: string } }
  | { at: "sequences"; part?: string }
  | { at: "pcr"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; template?: string; forward?: string; reverse?: string; step?: "denature" | "anneal" | "extend"; cycle?: number } }
  | { at: "digest"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; tube?: string; enzymes?: readonly string[]; keep?: readonly number[]; ran?: number } }
  | { at: "ligation"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; tubes?: readonly string[]; joined?: number } };

/** One stop on the walk. */
export interface TourStep {
  /** What this stop is called. */
  title: string;
  /** What to say here, in a sentence or two. */
  says: string;
  /** Where to be, worked out from the lab as it stands, since a step may name something an earlier step made. */
  show: (lab: LabView) => TourStop;
  /**
   * Something to do to the lab on arriving, such as recording the run just shown. It is given the
   * lab as it stands and does nothing if it has already been done, so that going back and forward
   * over a step does not do it twice.
   */
  does?: (demo: DemoLab, lab: LabView) => Promise<unknown>;
}

/** The tube of a part with this name, if the lab has one with something in it. */
const tubeOf = (lab: LabView, name: string): string | undefined => {
  const part = lab.parts.find((one) => one.name === name);
  return part === undefined ? undefined : lab.items.find((one) => one.part === part.checksum && !one.retired && one.amount > 0)?.item;
};

/** What the gene is called once it has been cut out and kept. */
export const GENE_PIECE = "pGene EcoRI+BamHI 786 bp";

/** What the ligation makes. */
export const MADE = "pWren1";

/**
 * The walk through the demo lab.
 *
 * @param demo - The lab, for the names and places the steps point at.
 * @returns The steps, in order.
 *
 * @example
 * ```ts
 * import { demoLab, demoTour } from "@biolibs/bionet-demo";
 *
 * const demo = await demoLab();
 * demoTour(demo).length;    // the stops on the walk
 * ```
 */
export function demoTour(demo: DemoLab): TourStep[] {
  const { tubes, instruments, places } = demo;
  // What each run really makes, worked out once by the same engines the tools use, so that a run
  // the tour records is the run the tool in front of it would have recorded.
  const { pGene, backbone, forward, reverse } = demo.molecules;
  const product = planPcr(pGene, forward.sequence, reverse.sequence).products[0];
  const sites = ["EcoRI", "BamHI"].flatMap((name) => { const cutter = cutsOf(pGene, name); return cutter === null ? [] : cutSites(pGene, cutter); });
  const gene = digestPieces(pGene, sites).find((one) => one.length === 786);
  const joined = gene === undefined ? undefined : planLigation([
    { id: "backbone", name: backbone.name, sequence: backbone.sequence, ends: backbone.ends ?? { left: 0, right: 0 }, features: backbone.features },
    { id: "gene", name: GENE_PIECE, sequence: gene.sequence, ends: gene.ends, features: gene.features },
  ]).products[0];
  return [
    {
      title: "A lab",
      says: "A room with a bench and a freezer, drawn from what the lab itself says is in it. Nothing here is a picture of a lab: it is the lab's own record of where things are, which is the same record that says who may change it.",
      show: () => ({ at: "lab", focus: { place: null } }),
    },
    {
      title: "The freezer",
      says: "Inside the freezer is a box, and in the box are tubes. A tube is in one place at a time, and the lab knows which, because somebody put it there and signed for it.",
      show: () => ({ at: "lab", focus: { place: places.box } }),
    },
    {
      title: "A tube",
      says: "This tube holds pGene, a small plasmid. The ring drawn over it is the molecule in the tube, with what is marked on it: a gene called wrenA, a promoter, and the origin that lets it copy itself.",
      show: () => ({ at: "lab", focus: { place: places.box, item: tubes.pGene } }),
    },
    {
      title: "What is on it",
      says: "The same molecule read closely. The features came in with the file this plasmid was brought in from, and they are kept in the lab's log, so every member reads the same map. Underneath, the enzymes that cut it once or twice — which is what a cloning plan is built out of.",
      show: () => ({ at: "sequences", part: demo.molecules.pGene.name }),
    },
    {
      title: "A PCR, at the machine",
      says: "First, a check that the gene is where it should be: a PCR with two primers that sit inside it. A thermocycler shows a programme, a temperature and a cycle count, and nothing at all about the DNA.",
      show: () => ({ at: "pcr", start: { view: "screen", template: tubes.pGene, forward: tubes.forward, reverse: tubes.reverse } }),
    },
    {
      title: "In the tube",
      says: "This is what the machine does not show, and what the person at it has to picture: the strands coming apart, the primers finding the one place each matches, and a copy growing from each. The letters are the lab's own bases, not an illustration of some.",
      show: () => ({ at: "pcr", start: { view: "tube", template: tubes.pGene, forward: tubes.forward, reverse: tubes.reverse, step: "anneal", cycle: 2 } }),
    },
    {
      title: "What came out",
      says: "502 bases, which is the distance between the two primers — and the working shows that subtraction, checked against the molecule the engine built. The gene is there. Recording the run takes a little from each tube and puts the product in the freezer.",
      show: () => ({ at: "pcr", start: { view: "result", template: tubes.pGene, forward: tubes.forward, reverse: tubes.reverse } }),
      does: async (lab, state) => {
        if (state.runs.some((one) => one.kind === "pcr")) return;
        await lab.lab.recordRun({
          kind: "pcr", instrument: instruments.pcr,
          inputs: [{ item: tubes.pGene, amount: 1, role: "template" }, { item: tubes.forward, amount: 1, role: "forward primer" },
                   { item: tubes.reverse, amount: 1, role: "reverse primer" }],
          outputs: product === undefined ? [] : [{ sequence: product.sequence, name: "wrenA check", amount: 50, unit: "µL" }],
          settings: { anneal_at_least: 18 }, note: "the gene is where it should be",
        });
      },
    },
    {
      title: "Cutting it open",
      says: "Now the gene is taken out, with the two enzymes whose sites sit either side of it. Each cut is shown in the bases the enzyme recognised, and each piece knows which enzyme made each of its ends — which is what decides what it can be joined to.",
      show: () => ({ at: "digest", start: { view: "tube", tube: tubes.pGene, enzymes: ["EcoRI", "BamHI"] } }),
    },
    {
      title: "The gel",
      says: "Two bands, 926 and 786 bases, which is what the lengths say they should be. The slider runs the gel: every piece starts in the same well and they draw apart as they go. The 786 is the gene, and it is kept — the band is cut out, cleaned up, and becomes a tube.",
      show: () => ({ at: "digest", start: { view: "result", tube: tubes.pGene, enzymes: ["EcoRI", "BamHI"], keep: gene === undefined ? [] : [gene.from] } }),
      does: async (lab, state) => {
        if (state.runs.some((one) => one.kind === "digest") || gene === undefined) return;
        const piece = gene;
        await lab.lab.recordRun({
          kind: "digest", instrument: instruments.digest,
          inputs: [{ item: tubes.pGene, amount: 1, role: "cut" }],
          outputs: [{ sequence: piece.sequence, name: GENE_PIECE, amount: 20, unit: "µL", ends: piece.ends, features: piece.features }],
          settings: { enzymes: "EcoRI+BamHI", expected: "926,786", gel: "1.0" }, note: "the gene is the lower band",
        });
      },
    },
    {
      title: "Joining it up",
      says: "The gene, and a backbone cut with the same two enzymes that has been waiting in the freezer. Their ends fit one way only, so there is no question of which way round the gene goes in. Drag the slider and the two pieces close into a circle.",
      show: (lab) => ({ at: "ligation", start: { view: "tube", tubes: [tubes.backbone, tubeOf(lab, GENE_PIECE)].filter((one): one is string => one !== undefined), joined: 45 } }),
    },
    {
      title: "What it makes",
      says: "A plasmid of 3,492 bases that nobody had before, carrying what each piece carried, with both joins marked. It is a part like any other: known by its sequence, so another lab that made the same thing would call it the same name without ever having spoken to this one.",
      show: (lab) => ({ at: "ligation", start: { view: "result", tubes: [tubes.backbone, tubeOf(lab, GENE_PIECE)].filter((one): one is string => one !== undefined) } }),
      does: async (lab, state) => {
        if (state.parts.some((one) => one.name === MADE)) return;
        const gene = tubeOf(state, GENE_PIECE);
        if (gene === undefined) return;
        if (joined === undefined) return;
        await lab.lab.recordRun({
          kind: "ligation", instrument: instruments.ligation,
          inputs: [{ item: tubes.backbone, amount: 1, role: "piece" }, { item: gene, amount: 1, role: "piece" }],
          outputs: [{ sequence: joined.sequence, circular: true, name: MADE, amount: 20, unit: "µL", features: joined.features as PartFeature[] }],
          settings: { pieces: 2, joins: 2, made: "circle" }, note: null,
        });
      },
    },
    {
      title: "Back in the freezer",
      says: "The box has three tubes in it that were not there at the start, and every one of them says which run made it and what went into that run. That is the whole of it: a freezer, the tools used on what is in it, and one signed record of both.",
      show: (lab) => ({ at: "lab", focus: { place: places.box, item: tubeOf(lab, MADE) ?? tubes.pGene } }),
    },
  ];
}
