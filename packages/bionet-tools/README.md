# @biolibs/bionet-tools

The tools a lab uses at the bench, tied to its freezer: its sequences and their maps, PCR, a check digest with its gel, and a ligation that joins the pieces back up. Sequences come in from the SnapGene, GenBank, EMBL and FASTA files a lab already has, with their features. For PCR, choose a template and two primers from the tubes the lab holds, see what they would make, and record the run. The template and primers drop by what was used, and the product becomes a new tube that knows which run made it.

```
npm install @biolibs/bionet-tools @biolibs/bionet-panels @biolibs/bionet-react @biolibs/bionet-theme react
```

## Bringing sequences in

```ts
import { readSequenceFile } from "@biolibs/bionet-tools";

const read = readSequenceFile(file.name, new Uint8Array(await file.arrayBuffer()));
read.format;      // "snapgene", "genbank", "embl" or "fasta"
read.circular;    // as the file says
read.features;    // [{ type: "CDS", label: "AmpR", strand: -1, parts: [{ start: 999, end: 1860 }] }, …]
await act("addPart", { name: read.name, sequence: read.sequence, circular: read.circular, features: read.features });
```

SnapGene's own `.dna` files are read as they are, so a lab's constructs come across with their
names, their shape and everything marked on them. The features are kept in the lab's signed log
with the part, so every member sees the same map. A part is known by its sequence: bringing in one
the lab already has adds only what is marked on it.

## A sequence's map

```tsx
import { SequenceMap } from "@biolibs/bionet-tools";

<SequenceMap name={part.name} length={part.length} circular={part.circular} features={part.features}
             marks={[{ at: 396, label: "EcoRI" }]} spans={[{ start: 1950, end: 1972, label: "fwd", strand: 1 }]} />
```

A circle for a plasmid and a line for anything else. Features are arrows in lanes, so ones that
overlap can both be seen; `marks` are places to name, such as where an enzyme cuts; `spans` are
stretches to point at, such as where a primer binds. `SequencesTool` is the whole thing for a lab:
choose files to bring in, pick any part, and read its map, its features and which enzymes cut it
once or twice.

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

## What the product carries

```ts
import { pcrFeatures } from "@biolibs/bionet-tools";

pcrFeatures(template, { name: "fwd", sequence: fwd }, { name: "rvs", sequence: rvs });
// what the template had on the stretch copied, moved to where it now is, and each primer at its end
```

A feature that is only partly copied is carried as the part that was, and its name says `(part)`,
since half a gene is not the gene. `pcrRun` puts these on the product it asks the lab to record, so
a product made here has its map from the start. `moleculeOf(part)` gives a part in the shape
`@biolibs/bionet-scene` draws: a ring or a bar with its features, above the machine or over a tube.

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

## A digest at the gel station

```tsx
import { InstrumentStage } from "@biolibs/bionet-scene";
import { useDigestBench } from "@biolibs/bionet-tools";

const bench = useDigestBench({ instrument });
<InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
```

The same five views as a PCR, named for this machine: the gel box, the gel in it, the power supply,
what is in the tube, and the gel once run. In the tube the molecule is drawn as its map with every
cut marked, in the scene and on the page, and the pieces are listed with what made each end and what
each carries. The run gel is drawn in the scene and on the page, and can be dragged back to watch
the pieces start in the well and draw apart.

```ts
import { cutSites, cutsOf, digestPieces } from "@biolibs/bionet-tools";

const sites = cutSites(part, cutsOf(part, "EcoRI"));
sites[0];                      // { at: 11, bottom: 15, overhang: "5′", bases: "AATT", site: { start: 10, end: 16 }, … }
digestPieces(part, sites);     // each piece: from, to, length, left and right ends, features carried
```

`cutSites` finds the enzyme's own bases behind each cut the restriction engine reports, on either
strand and across a circle's origin, and says where each strand is cut and what end that leaves.
Each piece is also a molecule of its own: `sequence` is every base either of its strands has and
`ends` how many at each end are unpaired. `digestRun` takes `keep`, the pieces to keep by where they
start, and the run it asks the lab to record then makes a tube of each: a part with those ends and
whatever the piece carries. That is cutting a band out of the gel and cleaning it up.

`digestChecks` is what a careful operator would ask before running the gel: pieces too close to tell
apart, a piece the gel will not hold, one cut of a circle, an enzyme that does nothing.

## A gel that runs, and pieces that close

Arriving at the gel finds it running: every piece starts in the same well and they draw apart as
they go, which is the whole of what a gel does. Arriving at the ligation's tube finds the pieces
closing. Both are the thing itself rather than an ornament on it, so they play on arrival and stop
wherever the slider is put. A machine asking for reduced motion is never given any.

## A ligation at the heat block

```tsx
import { useLigationBench } from "@biolibs/bionet-tools";

const bench = useLigationBench({ instrument });
<InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
```

The step after a digest. Tick the cut pieces in the tube and what they would make is worked out from
their ends: which fit, in what order, which way round, and whether anything closes into a circle.
In the tube view the pieces are drawn as arcs with a gap at each join, and dragging closes them,
which is the ring closing and not decoration. What it makes is drawn as a map with each join marked,
carrying what each piece carried, turned round with it where a piece went in backwards.

```ts
import { endBases, endsFit, planLigation } from "@biolibs/bionet-tools";

endBases(piece).right;                      // { kind: "5′", bases: "GATC" }
endsFit(endBases(a).right, endBases(b).left);   // { kind: "5′", bases: "GATC" }, or null
planLigation([vector, insert]).products[0];     // its length, its pieces in order, its joins, its features
```

The joining itself is `@biolibs/assembly2`'s. What this adds is what a bench has to read: where each
piece sits in the product, which way round it went, and what each join is made of.

`ligationChecks` is what a careful person would ask: a piece whose two ends fit each other and will
close on itself, the same pieces making one product with an insert in and another with it the other
way round, a blunt join that will mostly not happen, and a piece that came out of a PCR, which has
no phosphate for ligase to seal. `ratioWorking` is the arithmetic for how much of each to put in.

## Designing primers

Primers are designed at a desk and ordered, so this tool has no instrument. It takes a part from the
lab and a stretch of it — dragged out on a strip, typed as two bases, or chosen as a feature, which
is how people usually choose — and designs the pair that amplifies exactly that stretch.

```ts
import { designPair, featureStretches, primerOrder } from "@biolibs/bionet-tools";

const [gene] = featureStretches(part);                  // what is marked on it, as stretches
const design = designPair(part, gene);                  // { targetTm: 60, minLength: 18, maxLength: 30 } unless said
design.forward.chosen.report.sequence;                  // 5′ to 3′
design.forward.candidates;                              // every length tried, each with its score, term by term
design.forward.why;                                     // "24 bases scores lowest, at 0.72: 59.3 °C is 0.7 from the 60 °C aimed for, …"
design.warnings;                                        // what a careful person would stop at
primerOrder(design, { base: "wrenA" }).lines;           // "wrenA-F\tTTGAGT…", "wrenA-R\t…"
```

The choosing is `@biolibs/pcr`'s and is not done again here. What is added is what a person wants
beside the answer. Every candidate is kept, with the score that ranked it, so the winner can be seen
to have won and any other length can be taken instead (`forwardLength`, `reverseLength`). A stretch
may run through a plasmid's origin. And the warnings cover the pair and the template as well as each
primer: melting temperatures too far apart, the two primers pairing with each other at a 3′ end, a
primer whose 3′ end is found in more than one place (`bindingPlaces` lists them, on both strands and
through the origin), and primers that overlap because the stretch is short.

Each figure has its working, as the other tools do: `primerTmWorking` is the nearest-neighbour sum
itself — every neighbouring pair with what the table gives for it, the ends, the salt and the one
formula they go into — and is only returned if the sum done here reaches the engine's figure;
`gcWorking` is the count over the length; `productWorking` the subtraction of the two ends, compared
with what the PCR engine makes from the pair; `selfWorking` and `crossWorking` the bases that pair
with each other, laid out for `PairedBases` to draw; `scoreWorking` the score of a candidate.

```tsx
import { usePrimerBench } from "@biolibs/bionet-tools";

const primers = usePrimerBench({ onPcr: (tubes) => openPcr(tubes) });
<LabView lab={lab} wide beside={primers.panel} {...(primers.desk.focus === null ? {} : { focus: primers.desk.focus })}
         molecule={(item) => (item === primers.desk.focus?.item ? primers.desk.molecule : null)} />
```

`panel` is the tool. `desk` is what a scene beside it should show: the template's tube to look at,
and the template as a molecule with the stretch and a primer at each end marked on it, drawn over
that tube. `PrimerTool` is the panel alone.

Keeping a design adds the two primers to the lab as parts. A tube of each is added only when there
is one, with `addItem`, and no run is recorded: a tube of something ordered is not the output of a
run, so its record says only that it is in the lab. Once the lab has a tube of the template and of
each primer, `desk.ready` names them and the PCR tool can be opened on them.

## The working

```tsx
import { ShowWorking, tmWorking, lengthWorking } from "@biolibs/bionet-tools";

tmWorking("fwd", "GGATCACAGTCTACACTG")?.steps;
// ["9 of its 18 bases are A or T, and 9 are G or C.", "2 × 9 + 4 × 9 = 54 °C."]

<ShowWorking working={lengthWorking(top, bottom, template, product.length)} />
```

Everything the tool says is worked out in the window from the lab's own sequences, so it can all be
shown. Each figure opens to the steps that give it, and says on the outside whether it is `exact`
(it follows from the sequences alone) or an `estimate` (it rests on a rule of thumb, which is named).

- `tmWorking`: the count behind a melting temperature.
- `bindingWorking`: a primer laid against the strand it binds, base by base, drawn by `FacedBases`.
- `lengthWorking`: the product's length as a subtraction, compared with what the engine built.
- `programmeWorking`: where the suggested annealing temperature and extension time come from.
- `countsWorking`: how many strands there are after each cycle, as a table.
- `carriedWorking`: how each feature was moved from the template onto the product.
- `siteWorking`: one cut in its bases, drawn by `CutBases`.
- `piecesWorking`: the pieces as differences between cuts that add up to the whole, compared with the gel engine's.
- `migrationWorking`: how far a piece runs, by the rule the gel is drawn by.
- `joinWorking`: one join with its two overhangs written one over the other, drawn by `JoinBases`.
- `ligationLengthWorking`: the pieces' lengths, less the overhangs they share.
- `ratioWorking`: how much insert to put in for a given number of molecules to each of vector.

Every check from `programmeChecks` carries `because`: the comparison that raised it. At the machine,
the copied stretch is also marked off under the strands in the scene, with its subtraction.

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
tube and notes which enzymes, what was expected and whether the gel showed it. Pieces can be kept
as tubes, each a part with the ends the enzymes left.

## The tool

```tsx
import "@biolibs/bionet-tools/tools.css";
import { InstrumentTool, PcrTool } from "@biolibs/bionet-tools";

<InstrumentTool place={thermocyclerId} onDone={close} />   // the tool for whichever instrument that is
<Tools />                                                  // every tool, and the lab's sequences
<PcrTool />                                                // or one tool on its own; DigestTool likewise
```

The tools use the lab's hooks and are drawn with the panels' styles, so they go inside a `LabProvider` and a `LabWindow`. `InstrumentTool` opens PCR for a place whose `model` is `thermocycler` and digest and gel for a `gel-station`, and says so when there is no tool for an instrument yet. `Tools` lists them all, and still records a run at the lab's instrument for that tool if it has placed one.

The tools' own descriptions explain their terms on hover, with a picture, through
[`@biolibs/glossary-react`](../glossary-react). Import its `glossary.css` once as well.

## License

MIT
