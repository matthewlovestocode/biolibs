# @biolibs/bionet-tools

The tools a lab uses at the bench, tied to its freezer. The first is PCR. See [the package README](../packages/bionet-tools/README.md) for the API with worked examples.

```ts
import { pcrRun, pcrTubes } from "@biolibs/bionet-tools";

const { templates, primers } = pcrTubes(lab);
const run = pcrRun(lab, { template: templates[0].item, forward: primers[0].item, reverse: primers[1].item });
if (run.worked !== null) await act("recordRun", run.worked);
```

## Why there is a package here at all

The engines could already run a PCR, and the lab could already hold tubes. What was missing was the join: a PCR whose template is a tube in a box, and whose product is another. A sequence editor that does not know the freezer leaves the lab to copy sequences in and write tubes down afterwards, which is where a lab's record and its freezer drift apart.

## A run is recorded, not just worked out

Working out the product is the smaller half. The larger is `run.record` in [`@biolibs/bionet`](bionet.md): one signed entry that takes what was used from each tube, adds the product as a tube, and keeps the run. So a tube can answer where it came from, and the history says what was done and not only what changed.

A run that gave nothing at the bench is recorded too. The tubes were used all the same, and a lab that only records its successes has a freezer that does not add up.

## Three layers, so that the window decides nothing

- `pcr.ts` knows sequences: a template and two primers in, products out.
- `run.ts` knows the lab: which tubes to offer, and what to ask the lab to record for a choice.
- `pcr-tool.tsx` holds what has been chosen and nothing else.

The first two are plain data and are tested against a real lab without a browser. The same split as the scene, for the same reason: the rules are the part that can be wrong in ways that matter.

## What the tool does not check

The merge does not run the PCR again. A run says what came out, and the lab records that its signer said so. The tool only offers to record a product the engine worked out, so an honest member's run is right; a run written by other software is a claim like any other signed entry. Replaying a run from its inputs to check it is possible, since the inputs and settings are kept, and is not built yet.

## Source layout

```
packages/bionet-tools/src/
  pcr.ts         what a PCR would make, worked out from sequences alone
  run.ts         a PCR as a lab does one: which tubes, and what to record
  pcr-tool.tsx   the PCR tool, and the tool an instrument opens
packages/bionet-tools/tools.css   the few styles of its own
```
