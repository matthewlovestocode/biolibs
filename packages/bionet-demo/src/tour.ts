/**
 * The walk through the lab, as plain data: where to be, what to say, and what to do there.
 *
 * One window at a time is how the app is used and the worst way to be shown it, because what makes
 * Bionet worth anything is that the freezer, the tools and the record are the same thing. So the
 * tour goes round all of it in one line of argument: here is a lab, here is a tube in it, here is
 * what is on that tube, here are primers designed for it, and here is each tool used on it in turn, ending with a plasmid in the
 * freezer that was not there at the start.
 *
 * Nothing here draws anything, and nothing pretends. A step that says a run was recorded records it.
 */
import type { PartFeature } from "@biolibs/bionet";
import type { LabView } from "@biolibs/bionet-client";
import { cutSites, cutsOf, digestPieces, planLigation, planPcr, type Gap, type Sample } from "@biolibs/bionet-tools";
import type { DemoLab } from "./lab.js";
import { PRIMERS } from "./molecules.js";

/** Where a step is shown. */
export type TourStop =
  | { at: "lab"; focus?: { place: string | null; item?: string } }
  | { at: "sequences"; part?: string; focus?: { place: string | null; item?: string } }
  | { at: "verify"; start?: { design?: string; read?: string } }
  | { at: "codons"; start?: { gene?: string; hostGenes?: readonly string[]; avoid?: readonly string[] } }
  | { at: "construct"; start?: { pieces?: readonly { part: string; as: "promoter" | "signal" | "coding" | "tag" | "linker" | "terminator" | "other" }[]; name?: string } }
  | { at: "assembly"; start?: { pieces?: readonly string[]; overlap?: number; name?: string; section?: "pieces" | "ring" | "junctions" | "primers" | "working" } }
  | { at: "primers"; start?: { part?: string; stretch?: { start: number; end: number }; feature?: string; name?: string; section?: "choose" | "pair" | "considered" | "working" | "order" } }
  | { at: "pcr"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; template?: string; forward?: string; reverse?: string; step?: "denature" | "anneal" | "extend"; cycle?: number } }
  | { at: "digest"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; tube?: string; enzymes?: readonly string[]; keep?: readonly number[]; ran?: number } }
  | { at: "ligation"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; tubes?: readonly string[]; joined?: number } }
  | { at: "induction"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; culture?: string; gene?: string; cds?: string; ran?: number } }
  | { at: "spectro"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; tube?: string; sample?: Sample; shown?: number; dilution?: number } }
  | { at: "electro"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; construct?: string; cells?: string; host?: string; volts?: number; gap?: Gap } }
  | { at: "imager"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; gel?: string; ladder?: string; expected?: readonly number[] } }
  | { at: "spin"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; rotor?: string; what?: string; rpm?: number; loaded?: readonly number[] } }
  | { at: "grow"; start?: { view?: "machine" | "block" | "screen" | "tube" | "result"; host?: string; celsius?: number; hours?: number; selection?: string } };

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
  /** The tubes the PCR is run from. The primers' are there once the design stop has had them arrive. */
  const pcr = (lab: LabView): { template: string; forward?: string; reverse?: string } => {
    const [one, other] = [tubeOf(lab, forward.name), tubeOf(lab, reverse.name)];
    return { template: tubes.pGene, ...(one === undefined ? {} : { forward: one }), ...(other === undefined ? {} : { reverse: other }) };
  };
  /** The primer design tool, opened on the gene. */
  const designing = (lab: LabView, section: "choose" | "pair" | "considered" | "working" | "order"): TourStop => {
    const part = lab.parts.find((one) => one.name === pGene.name);
    return { at: "primers", start: { ...(part === undefined ? {} : { part: part.checksum }), feature: "wrenA", name: PRIMERS, section } };
  };
  const cutting = { tube: tubes.pGene, enzymes: ["EcoRI", "BamHI"] as const };
  /** The pieces in the tube at the heat block, once the digest has put the gene in the freezer. */
  const joining = (lab: LabView): string[] =>
    [tubes.backbone, tubeOf(lab, GENE_PIECE)].filter((one): one is string => one !== undefined);

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
      says: "The same molecule read closely, with the tube it is in still there behind it. The features came in with the file this plasmid was brought in from, and they are kept in the lab's log, so every member reads the same map. Underneath, the enzymes that cut it once or twice — which is what a cloning plan is built out of.",
      show: (lab) => ({
        at: "sequences", focus: { place: places.box, item: tubes.pGene },
        ...(() => { const part = lab.parts.find((one) => one.name === pGene.name); return part === undefined ? {} : { part: part.checksum }; })(),
      }),
    },

    // ── at the desk: the primers ─────────────────────────────────────────────────────────────────
    {
      title: "Choosing what to copy",
      says: "The first check will be that the gene is where it should be, which is a PCR, and a PCR needs two primers the lab does not have. So they are designed. Choosing the gene from what is marked on the plasmid chooses the stretch: 780 bases, from its first to its last. Over the tube, the same plasmid with that stretch and a primer at each end of it.",
      show: (lab) => designing(lab, "choose"),
    },
    {
      title: "Every length that was tried",
      says: "A primer has to start at its end of the stretch, so the only choice is how long it is. Every length from 18 to 30 was measured, and here they all are with the score that ranked them. Nothing was thrown away unseen, and any of them can be taken instead. One thing is flagged: the two melting temperatures are a few degrees apart, which is worth knowing and not worth stopping for.",
      show: (lab) => designing(lab, "considered"),
    },
    {
      title: "Ordered, and arrived",
      says: "Primers are ordered, not made at the bench. The design is kept as two parts, known by their sequences like everything else, and when the tubes come they are added as tubes that arrived: no run is recorded, because nothing was made here. They go in the box beside the plasmid.",
      show: (lab) => designing(lab, "order"),
      does: async (lab, state) => {
        for (const [primer, column] of [[forward, 0], [reverse, 1]] as const) {
          if (state.parts.some((one) => one.name === primer.name)) continue;
          await lab.lab.addPart({ name: primer.name, sequence: primer.sequence, circular: false });
          const part = lab.lab.snapshot().lab?.parts.find((one) => one.name === primer.name);
          if (part === undefined) continue;
          const tube = await lab.lab.addItem({ part: part.checksum, amount: 100, unit: "µL" });
          await lab.lab.putItem({ item: tube, place: places.box, slot: { row: 3, column } });
        }
      },
    },

    // ── to the thermocycler ──────────────────────────────────────────────────────────────────────
    {
      title: "Over to the bench",
      says: "The three machines sit on the bench, where the lab put them. They are not icons: each is drawn to the shape of the thing it is, and that is the same drawing you walk up to next.",
      show: () => ({ at: "lab", focus: { place: places.bench } }),
    },
    {
      title: "Up to the thermocycler",
      says: "With the primers in the freezer the PCR can be run. Walking up to the machine is still the lab: the same room, the same record, just closer.",
      show: () => ({ at: "lab", focus: { place: instruments.pcr } }),
    },
    {
      title: "At the machine",
      says: "And now in front of it, with the tubes already chosen. A thermocycler is a block of wells under a heated lid, with a screen on the front. Everything it can tell you is on that screen.",
      show: (lab) => ({ at: "pcr", start: { view: "machine", ...pcr(lab) } }),
    },
    {
      title: "Under the lid",
      says: "The lid lifts and the block is underneath: ninety-six wells, with this reaction in the first. The lid presses on the tubes while it runs so that nothing condenses on their caps.",
      show: (lab) => ({ at: "pcr", start: { view: "block", ...pcr(lab) } }),
    },
    {
      title: "The programme",
      says: "The screen, close up, and the programme suggested for this reaction. Five degrees under the cooler primer, a minute for every thousand bases — both conventions, and both shown with the arithmetic that got there. Change either and the checks underneath answer.",
      show: (lab) => ({ at: "pcr", start: { view: "screen", ...pcr(lab) } }),
    },
    {
      title: "Heat pulls the strands apart",
      says: "Here is what the machine does not show. Ninety-five degrees, and the two strands of the template come apart — nothing can be copied until they are single. The letters are this lab's own bases.",
      show: (lab) => ({ at: "pcr", start: { view: "tube", ...pcr(lab), step: "denature", cycle: 1 } }),
    },
    {
      title: "The primers find their places",
      says: "Cooler, and each primer finds the one place on the template that it matches and binds there. Below, the bases themselves: each one pairing with its partner, and the three at the end that have to pair for the polymerase to start.",
      show: (lab) => ({ at: "pcr", start: { view: "tube", ...pcr(lab), step: "anneal", cycle: 1 } }),
    },
    {
      title: "And a copy grows from each",
      says: "Seventy-two degrees. The polymerase starts at a primer and runs along, adding the partner of each base it passes. These first copies start in the right place and run on too far, which is why the first cycle makes nothing of the length wanted.",
      show: (lab) => ({ at: "pcr", start: { view: "tube", ...pcr(lab), step: "extend", cycle: 1 } }),
    },
    {
      title: "By the third cycle",
      says: "Now a copy is being made from a strand that already begins at a primer, so it stops where that one began. These are the first strands of exactly the product's length, and from here they double every cycle while the over-long ones only grow by two.",
      show: (lab) => ({ at: "pcr", start: { view: "tube", ...pcr(lab), step: "extend", cycle: 3 } }),
    },
    {
      title: "What came out",
      says: "780 bases, which is the stretch the primers were designed for — and the working shows that subtraction, checked against the molecule the engine built. The gene is there. Recording the run takes a little from each tube and puts the product in the freezer.",
      show: (lab) => ({ at: "pcr", start: { view: "result", ...pcr(lab) } }),
      does: async (lab, state) => {
        const [one, other] = [tubeOf(state, forward.name), tubeOf(state, reverse.name)];
        if (state.runs.some((each) => each.kind === "pcr") || product === undefined || one === undefined || other === undefined) return;
        await lab.lab.recordRun({
          kind: "pcr", instrument: instruments.pcr,
          inputs: [{ item: tubes.pGene, amount: 1, role: "template" }, { item: one, amount: 1, role: "forward primer" },
                   { item: other, amount: 1, role: "reverse primer" }],
          outputs: [{ sequence: product.sequence, name: "wrenA check", amount: 50, unit: "µL" }],
          settings: { anneal_at_least: 18 }, note: "the gene is where it should be",
        });
      },
    },

    // ── across to the gel station ────────────────────────────────────────────────────────────────
    {
      title: "Back out to the room",
      says: "Out of the machine and back to where it stands. The thermocycler has a run against it now, and the freezer has a tube that was not there four minutes ago.",
      show: () => ({ at: "lab", focus: { place: places.bench } }),
    },
    {
      title: "Across to the gel station",
      says: "Next the gene comes out of the plasmid, with the two enzymes whose sites sit either side of it. That is a digest, and it is read on a gel.",
      show: () => ({ at: "lab", focus: { place: instruments.digest } }),
    },
    {
      title: "The gel box",
      says: "A shallow tank with a lid, and beside it the power supply. Between them they show a voltage and a time, and nothing whatever about the DNA.",
      show: () => ({ at: "digest", start: { view: "machine", ...cutting } }),
    },
    {
      title: "The gel itself",
      says: "Under the lid, a slab of agarose with a row of wells at one end. The wells go at the negative end, because DNA is negative all along its backbone and runs towards the positive one.",
      show: () => ({ at: "digest", start: { view: "block", ...cutting } }),
    },
    {
      title: "The power supply",
      says: "A hundred volts for forty minutes. Nothing here works out what that will give — it depends on the box, the buffer and the gel — so what is set is kept with the run and no more is claimed.",
      show: () => ({ at: "digest", start: { view: "screen", ...cutting } }),
    },
    {
      title: "Where it gets cut",
      says: "In the tube: the plasmid with both cuts marked, and each cut opened out into the bases the enzyme recognised and the staggered ends it leaves. Each piece knows which enzyme made each of its ends, which is what decides what it can be joined to.",
      show: () => ({ at: "digest", start: { view: "tube", ...cutting } }),
    },
    {
      title: "The gel, running",
      says: "Every piece starts in the same well and they draw apart as they go, which is the whole of what a gel does. Two bands, 926 and 786, which is what the lengths say they should be. The 786 is the gene, and it is kept: cut out of the gel, cleaned up, and made a tube.",
      show: () => ({ at: "digest", start: { view: "result", ...cutting, keep: gene === undefined ? [] : [gene.from], ran: 0 } }),
      does: async (lab, state) => {
        if (state.runs.some((one) => one.kind === "digest") || gene === undefined) return;
        await lab.lab.recordRun({
          kind: "digest", instrument: instruments.digest,
          inputs: [{ item: tubes.pGene, amount: 1, role: "cut" }],
          outputs: [{ sequence: gene.sequence, name: GENE_PIECE, amount: 20, unit: "µL", ends: gene.ends, features: gene.features }],
          settings: { enzymes: "EcoRI+BamHI", expected: "926,786", gel: "1.0" }, note: "the gene is the lower band",
        });
      },
    },

    // ── and to the heat block ────────────────────────────────────────────────────────────────────
    {
      title: "Along to the heat block",
      says: "The gene is out. What is left is to put it into something that can be grown, which is a ligation, and that happens in a tube left at one temperature for a long time.",
      show: () => ({ at: "lab", focus: { place: instruments.ligation } }),
    },
    {
      title: "One number on a display",
      says: "This is the whole of what the machine shows while a ligation happens, and whether anything joined is found out days later by what grows. Everything that matters is in the tube and invisible.",
      show: (lab) => ({ at: "ligation", start: { view: "machine", tubes: joining(lab) } }),
    },
    {
      title: "The wells",
      says: "A metal block with holes for tubes. In this one: the gene, a backbone cut with the same two enzymes that has been waiting in the freezer, and ligase with the buffer that carries the ATP it needs.",
      show: (lab) => ({ at: "ligation", start: { view: "block", tubes: joining(lab) } }),
    },
    {
      title: "Sixteen degrees, overnight",
      says: "Two things are wanted at once and they want opposite temperatures: the ends have to stay stuck together long enough to be sealed, and ligase works faster the warmer it is. Sixteen overnight is the usual answer to that.",
      show: (lab) => ({ at: "ligation", start: { view: "screen", tubes: joining(lab) } }),
    },
    {
      title: "The pieces close",
      says: "And this is what is going on in it. Each piece takes its share of the ring in proportion to its length, with a gap at every join, and the gaps close. Their ends fit one way only, so there is no question of which way round the gene goes in.",
      show: (lab) => ({ at: "ligation", start: { view: "tube", tubes: joining(lab), joined: 0 } }),
    },
    {
      title: "What it makes",
      says: "A plasmid of 3,492 bases that nobody had before, carrying what each piece carried, with both joins marked. It is a part like any other: known by its sequence, so another lab that made the same thing would call it the same name without ever having spoken to this one.",
      show: (lab) => ({ at: "ligation", start: { view: "result", tubes: joining(lab) } }),
      does: async (lab, state) => {
        if (state.parts.some((one) => one.name === MADE) || joined === undefined) return;
        const gene = tubeOf(state, GENE_PIECE);
        if (gene === undefined) return;
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
      says: "The box has five tubes in it that were not there at the start. Three say which run made them and what went into that run; the two primers say only that they arrived, which is the truth about them. That is the whole of it: a freezer, the tools used on what is in it, and one signed record of both.",
      show: (lab) => ({ at: "lab", focus: { place: places.box, item: tubeOf(lab, MADE) ?? tubes.pGene } }),
    },
  ];
}
