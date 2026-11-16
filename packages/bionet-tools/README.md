# @biolibs/bionet-tools

The tools a lab uses at the bench, tied to its freezer: PCR, and a check digest with its gel. For PCR, choose a template and two primers from the tubes the lab holds, see what they would make, and record the run. The template and primers drop by what was used, and the product becomes a new tube that knows which run made it.

```
npm install @biolibs/bionet-tools @biolibs/bionet-panels @biolibs/bionet-react @biolibs/bionet-theme react
```

## What a PCR would make

```ts
import { planPcr, primerTm } from "@biolibs/bionet-tools";

const template = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const plan = planPcr({ sequence: template, circular: false }, "GGATCACAGTCTACACTG", "GGTATACATACTCTGAAG");
plan.problem;               // null
plan.products[0].length;    // 75
primerTm("GGATCACAGTCTACACTG");   // 54
```

`planPcr` takes sequences and returns sequences, using the engine in `@biolibs/assembly2` that the cloning plans use. The primers may be given in either order. If they do not make exactly one product, `problem` says why in words.

## From the freezer to a recorded run

```ts
import { pcrRun, pcrTubes } from "@biolibs/bionet-tools";

const { templates, primers } = pcrTubes(lab);      // lab is the `lab` of a client's snapshot
const run = pcrRun(lab, { template: templates[0].item, forward: primers[0].item, reverse: primers[1].item });
run.plan?.products[0]?.length;                     // what it would make
if (run.worked !== null) await act("recordRun", run.worked);
```

`pcrTubes` offers short linear parts as primers and the rest as templates. `pcrRun` works a choice out into what to hand the lab's `recordRun`: `worked` when there is exactly one product, and `failed` for a run that was done and gave nothing, which still used the tubes.

## A PCR at the machine

```tsx
import { InstrumentStage } from "@biolibs/bionet-scene";
import { usePcrBench } from "@biolibs/bionet-tools";

const bench = usePcrBench({ instrument });
<InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
```

`usePcrBench` is a PCR as a person at the machine meets it. `stage` is what a scene is told to show:
the programme on the screen, the well that is taken, the strands in the tube. `panel` is what goes
beside it, and keeps four things apart: what the **machine** shows, what is true of this **run**, the
**checks** a careful operator would make, and what is going on, for somebody new. This package does
not depend on three.js; the scene comes from `@biolibs/bionet-scene`.

The pieces are plain functions:

```ts
import { primerBinding, programmeChecks, screenOf, strandCounts, suggestProgramme, tubeView } from "@biolibs/bionet-tools";

const programme = suggestProgramme({ length: 1500, primers: [{ name: "fwd", tm: 60 }, { name: "rev", tm: 58 }] });
programme.steps[1];                 // { name: "anneal", celsius: 53, seconds: 30 }
screenOf(programme)[3].text;        // "  Anneal  53 °C   0:30"
programmeChecks(programme, { length: 1500, primers: [{ name: "fwd", tm: 60 }, { name: "rev", tm: 58 }] });   // []
strandCounts(3);                    // { template: 2, long: 6, product: 8 }
```

`tubeView` says what is in the tube at each step of each cycle, including the thing people find
hardest to picture: the first cycle's copies run on too far, the second makes the first strands of
exactly the product's length, and from the third the product takes over. The programme a run was
set to is kept with the run.

## A digest and its gel

```ts
import { cutters, digestRun, planDigest } from "@biolibs/bionet-tools";

const plan = planDigest({ sequence: "AAAAAAAAAAGAATTCAAAAAAAAAAAAAAAAAAAAGGATCCAAAAAAAAAA", circular: true }, ["EcoRI", "BamHI"]);
plan.fragments;    // [ 26, 26 ]
plan.problem;      // null

cutters(part);                                             // the usual enzymes that cut a part, fewest cuts first
const run = digestRun(lab, { tube, enzymes: ["EcoRI"] });  // what to record, if the gel matched or did not
```

`planDigest` gives the cuts, the pieces, and the bands they and a ladder would show on a gel, from
`@biolibs/restriction` and `@biolibs/gel`. A digest here is a check: recording it uses some of the
tube, makes nothing, and notes which enzymes, what was expected and whether the gel showed it.
Keeping a cut piece as a tube is not offered, because a part cannot yet say what ends it has.

## The tool

```tsx
import "@biolibs/bionet-tools/tools.css";
import { InstrumentTool, PcrTool } from "@biolibs/bionet-tools";

<InstrumentTool place={thermocyclerId} onDone={close} />   // the tool for whichever instrument that is
<Tools />                                                  // every tool, for a lab that has not drawn its room
<PcrTool />                                                // or one tool on its own; DigestTool likewise
```

The tools use the lab's hooks and are drawn with the panels' styles, so they go inside a `LabProvider` and a `LabWindow`. `InstrumentTool` opens PCR for a place whose `model` is `thermocycler` and digest and gel for a `gel-station`, and says so when there is no tool for an instrument yet. `Tools` lists them all, and still records a run at the lab's instrument for that tool if it has placed one.

The tools' own descriptions explain their terms on hover, with a picture, through
[`@biolibs/glossary-react`](../glossary-react). Import its `glossary.css` once as well.

## License

MIT
