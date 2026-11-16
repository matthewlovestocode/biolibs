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

## A digest is a check first

The digest tool cuts a tube's molecule in silico, lists the pieces and draws the gel they should give beside a ladder. Recording it uses some of the tube and notes the enzymes, the pieces expected and whether the real gel showed them. The offered enzymes are the ones usually on a shelf that cut the molecule, fewest cuts first, since one or two cuts is what a check wants; any other can be named.

For a long time it did not offer to keep a cut piece as a tube. A piece cut by an enzyme is defined by its ends as much as its sequence: two pieces with the same bases and different overhangs are different molecules, and a part that was only a sequence would have given them one checksum. Recording a piece then would have recorded something false. A part can now say its ends, so a piece can be kept; see the gel station below.

The gel is `@biolibs/gel`'s model, with that package's own limits: conventional figures, positions as a fraction of the lane, pieces too close in size merged into one band.

## Sequences come in from the files a lab has

A lab already has its constructs, and it has them as SnapGene and GenBank files. So the first thing a sequence tool has to do is read those, with what is marked on them, and nothing here asks a lab to type a plasmid in. `readSequenceFile` reads SnapGene's own format, GenBank, EMBL and FASTA through `@biolibs/seqio`, in the window, with no server: the file never leaves the machine except as entries in the lab's own log.

The map is the picture a lab reads a construct by, and it is drawn in two places from the same features. On the page it is an SVG, a circle or a line, with enzymes that cut once named on it. In the scene it is a ring or a bar in three dimensions: over a tube that has been picked in its box, and above the thermocycler as what a run made. Those are the same picture on purpose. The page is where a map is read closely; the scene is where it is tied to the physical thing.

A PCR's product carries what its template had on the stretch copied. That is worked out here and recorded with the run, so a product is never a bare sequence that somebody has to annotate again. A feature cut by the end of the product is kept as far as it goes and named as a part.

What this is not is a sequence editor. Nothing here edits bases, and the features a file brings are shown and carried, not redrawn by hand.

## The working is shown

The calculations happen in the window, on the lab's own sequences. That is usually treated as an implementation detail. Here it is treated as something to show: there is no server whose answer has to be taken on trust, so every figure can open to the steps that give it.

Two kinds of thing are kept apart, because confusing them is how tools mislead. Some of what a PCR tool says is **exact**: that these bases pair with those, that the product is this long, that a feature lands here. Those are facts about sequences and can be shown in full, down to the letters. The rest is **estimate**: a melting temperature from the Wallace rule, an annealing temperature five degrees under it, a minute a thousand bases. Those are shown as the rule and its inputs, with what the rule ignores, and are labelled as estimates on the outside so nobody has to open one to find out.

Where a figure can be checked against something worked out another way, it is. The product's length is a subtraction on where the primers bind; the product itself is built by the assembly engine. The working shows both and says whether they agree.

The working is plain data (`pcr-working.ts`), so it is tested against the thing it explains: the count against the melting temperature the tool uses, the bases against the sequences, the subtraction against the engine.

## The gel station, to the same standard

A digest is met at a gel box the way a PCR is met at a thermocycler, and the split is the same. The box and its power supply show volts, current and time. Where the DNA was cut, how many pieces there are and how far each has run are pictured, and then read off the gel against a ladder. So the stage has the same five views under this machine's names, and the last two are the pictured ones: the molecule with its cuts, and the gel once run.

Three things are worked out that the first digest tool did not have. **Each cut in its bases**: the restriction engine says where an enzyme cuts; `cutSites` finds the enzyme's own sequence behind each of those cuts, on either strand, and from it where each strand is cut and what end is left. It keeps only sites whose cut the engine also found, so nothing is invented, and a test checks across thousands of cuts that none is left unexplained. **Each piece with its ends**: which enzyme made each end, what overhang it has, and what features it carries. **The checks** a careful operator would make before pouring a gel.

The run gel can be dragged back to the start. That is the one piece of motion here, and it is the thing itself: every piece begins in the same well and they draw apart as they run, which is the whole of what a gel does.

Voltage and time are kept with the run and are not modelled. How far a given voltage moves a band in a given time depends on the box, the buffer and the gel, and a tool that drew that with confidence would be making it up. A piece can be kept. Ticking one and recording a gel that matched makes a tube of it, as cutting the band out and cleaning it up does at the bench. The part it is a tube of has the ends the enzymes left and whatever the piece carried, and is traced back to the tube that was cut. Its length in the freezer is every base either strand has, which for sticky ends is a few more than the length it runs at on a gel, since a gel sees the paired stretch and the freezer counts the overhangs too.

## What the tool does not check

The merge does not run the PCR again. A run says what came out, and the lab records that its signer said so. The tool only offers to record a product the engine worked out, so an honest member's run is right; a run written by other software is a claim like any other signed entry. Replaying a run from its inputs to check it is possible, since the inputs and settings are kept, and is not built yet.

## Source layout

```
packages/bionet-tools/src/
  sequence-file.ts reading a lab's sequence files, and carrying features onto a stretch
  map.tsx          a sequence's map, a circle or a line
  sequences-tool.tsx  bringing sequences in, and reading any part as a map
  pcr.ts           what a PCR would make, worked out from sequences alone
  pcr-scene.ts     a PCR as met at the machine: the programme, the checks, what is in the tube
  pcr-working.ts   the working behind each figure, as steps that can be checked
  working.tsx      the working drawn: a figure that opens to show its steps
  pcr-bench.tsx    what is shown beside the instrument, and what the scene is told to draw
  digest.ts        where enzymes cut, the pieces, and the gel they would give
  digest-working.ts  each cut in its bases, each piece with its ends, the checks, the working
  digest-bench.tsx   what is shown beside the gel station, and what the scene is told to draw
  run.ts           each as a lab does one: which tubes, and what to record
  pcr-tool.tsx     the PCR tool
  digest-tool.tsx  the digest tool, and the gel drawn
  tools.tsx        getting to a tool: from an instrument, or from a list of them all
packages/bionet-tools/tools.css   the few styles of its own
```
