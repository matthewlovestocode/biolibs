# @biolibs/bionet-tools

The tools a lab uses at the bench, tied to its freezer. The first is PCR: choose a template and two primers from the tubes the lab holds, see what they would make, and record the run. The template and primers drop by what was used, and the product becomes a new tube that knows which run made it.

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

## The tool

```tsx
import "@biolibs/bionet-tools/tools.css";
import { InstrumentTool, PcrTool } from "@biolibs/bionet-tools";

<InstrumentTool place={thermocyclerId} onDone={close} />   // the tool for whichever instrument that is
<PcrTool />                                                // or the PCR tool on its own
```

The tools use the lab's hooks and are drawn with the panels' styles, so they go inside a `LabProvider` and a `LabWindow`. `InstrumentTool` opens the PCR tool for a place whose `model` is `thermocycler`, and says so when there is no tool for an instrument yet.

## License

MIT — see [LICENSE](LICENSE).
