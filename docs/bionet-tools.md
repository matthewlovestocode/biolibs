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

Digest is the same three: `digest.ts`, the digest half of `run.ts`, and `digest-tool.tsx`. `tools.tsx` is the way in, from an instrument or from a list of every tool.

The first two are plain data and are tested against a real lab without a browser. The same split as the scene, for the same reason: the rules are the part that can be wrong in ways that matter.

## A PCR at the machine: four voices

`pcr-scene.ts` works out a PCR as a person at a thermocycler meets it, and `pcr-bench.tsx` shows it. What is shown keeps four things apart, because they answer different questions and are wanted by different people.

- **The machine**: what it displays. A programme, a temperature, a cycle.
- **The run**: what is true of this reaction, worked out from the lab's sequences. Where each primer binds, the product's length, each primer's melting temperature.
- **The checks**: what a careful operator would stop and ask. Annealing above a primer's melting temperature; an extension too short for the product. Each is about this run and may be wrong, so none stops a run.
- **What is going on**: for somebody new. General, never changes, and its terms explain themselves through the glossary.

The view into the tube exists because of the one thing a thermocycler never shows and beginners get wrong: which strands are the product. `strandCounts` is the arithmetic — two more over-long strands every cycle, and a product that doubles — and the tests check it adds up to every strand being copied once a cycle.

`tubeLens` is the same moment magnified at a primer's site, in the lab's real bases: which are paired as the template unzips, the primer's bases over the ones they match with any tail left unpaired, and the bases the polymerase adds, each the partner of the one opposite. The tests check every letter against the sequence and every pair against the rule.

"Run the programme" plays each step into the next and each cycle into the next. The first three cycles go at the pace chosen, since each shows something new; after that every cycle looks alike, so they go by quickly, and what there is to watch is beside the scene: the cycle the machine is on, a trace of the cycle's temperatures with the current step marked, and the strands of each kind as bars on a doubling scale.

The suggested programme is conventions (five degrees under the cooler primer, a minute per thousand bases), and the operator can change it. What they set is kept in the run's settings, since it is what somebody repeating the run needs.

## A digest is a check, and makes nothing

The digest tool cuts a tube's molecule in silico, lists the pieces and draws the gel they should give beside a ladder. Recording it uses some of the tube and notes the enzymes, the pieces expected and whether the real gel showed them. The offered enzymes are the ones usually on a shelf that cut the molecule, fewest cuts first, since one or two cuts is what a check wants; any other can be named.

It does not offer to keep a cut piece as a tube. A part is a sequence and whether it is a circle, and a piece cut by an enzyme is defined by its ends as much as its sequence: two pieces with the same bases and different overhangs are different molecules that would have one checksum. Until a part can say what ends it has, recording a piece would record something false. That is the next thing the model needs before assembly can be a tool.

The gel is `@biolibs/gel`'s model, with that package's own limits: conventional figures, positions as a fraction of the lane, pieces too close in size merged into one band.

## What the tool does not check

The merge does not run the PCR again. A run says what came out, and the lab records that its signer said so. The tool only offers to record a product the engine worked out, so an honest member's run is right; a run written by other software is a claim like any other signed entry. Replaying a run from its inputs to check it is possible, since the inputs and settings are kept, and is not built yet.

## Source layout

```
packages/bionet-tools/src/
  pcr.ts           what a PCR would make, worked out from sequences alone
  pcr-scene.ts     a PCR as met at the machine: the programme, the checks, what is in the tube
  pcr-bench.tsx    what is shown beside the instrument, and what the scene is told to draw
  digest.ts        where enzymes cut, the pieces, and the gel they would give
  run.ts           each as a lab does one: which tubes, and what to record
  pcr-tool.tsx     the PCR tool
  digest-tool.tsx  the digest tool, and the gel drawn
  tools.tsx        getting to a tool: from an instrument, or from a list of them all
packages/bionet-tools/tools.css   the few styles of its own
```
