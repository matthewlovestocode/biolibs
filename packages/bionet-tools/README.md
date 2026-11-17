# @biolibs/bionet-tools

The tools a lab uses at the bench, tied to its freezer: its sequences and their maps, PCR, a check digest with its gel, a ligation that joins the pieces back up, an induction that grows a strain to make the protein the whole thing was for, and a check on whether that protein will be modified into something that works. Sequences come in from the SnapGene, GenBank, EMBL and FASTA files a lab already has, with their features. For PCR, choose a template and two primers from the tubes the lab holds, see what they would make, and record the run. The template and primers drop by what was used, and the product becomes a new tube that knows which run made it.

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

## Growing a culture to get the protein

A lab that stops at DNA has stopped one step short of what the DNA was for. An induction is the step
across: a culture of a strain that carries the construct is grown, fed something that turns the
promoter on, and a few hours later a lane of a polyacrylamide gel either has a band at the right mass
or it does not.

```ts
import { inductionCultures, inductionGenes, inductionRun, planInduction } from "@biolibs/bionet-tools";

inductionCultures(lab);                     // the cultures there are, the ones carrying something first
inductionGenes(lab, culture);               // what that strain carries, and the coding sequences marked on each

const plan = planInduction(lab, { culture, gene, cds: "casein", cutSignal: true });
plan.kilodaltons;                           // what the band should run at
plan.bands[0].position;                     // where on the gel, beside plan.ladder
plan.checksum;                              // the identity the protein will have in the lab

const run = inductionRun(lab, { culture, gene, cds: "casein", inducer: "galactose", concentration: "2%" });
run.showed;                                 // what to record if the band was there
run.nothing;                                // what to record if it was grown and nothing was at that mass
run.keep;                                   // the protein to add as a part, and the tube of it
```

Two things here are unlike every other tool in this package, and both are deliberate.

**Nothing that comes out is worked out from what went in.** A PCR's product is the stretch between the
primers and arithmetic gives it. A culture's product is whatever the cells chose to make, and no
sequence predicts the yield, the solubility or whether the thing folded. So what is computed is the
protein the gene *codes for* and the mass its band *should* run at. Whether the band is there is read
off a gel by a person, and is the one thing recorded. `inductionChecks` says when the gel chosen could
not answer the question at all — a band below what it separates runs off the front, one above it stays
in the well, and one that lands on a marker band cannot be told from it.

**The protein is not an output of the run.** A run's outputs are DNA — every device that reads the log
agrees on that, and an entry saying otherwise would be refused by the older ones. So an induction is
recorded as a run with no outputs that used some of a culture, the same shape a transformation has, and
the protein is added afterwards as a part in its own right. The run names it in its settings by the
checksum that part will have, which `inducedBy` reads back: so a device that was not there when it
happened arrives at the same answer from the log alone, without a new kind of entry.

## Getting something to order

A project usually begins with a protein, not a gene: somebody reads it out of UniProt, or works it
out, or decides on it. A synthesis company needs DNA, and the organism the protein came from is not
the one it is going into, so its own codons are not what you would order.

```ts
import { countCodonUsage, reverseTranslate } from "@biolibs/bionet-tools";

const gene = reverseTranslate(casein, countCodonUsage(pichiaGenes), { avoid: [{ name: "EcoRI", site: "GAATTC" }] });
gene.sequence;    // 630 bases, in Pichia's own codons, with a stop on the end
```

It is the optimiser underneath: a gene is written with any codon per residue and then rewritten into
the host's own, so the preferences, the sites kept out and the runs of one base are handled by the
same code that handles them for a gene somebody already had. `changes` comes back empty, because
nothing was changed from anything.

This exists because of what happened when a model was put in front of these tools. It had the
protein, knew the host, knew the sites and knew the problem — and could not produce one base of DNA,
because every road to a gene needed a gene. The tool it reached for was `optimise_codons`, so that
is the tool that now does it: **give it a protein and a gene is written; give it DNA and that gene
is rewritten.**

## Putting a construct together, and keeping the frame

The assembly desk is about the molecules: which pieces go round a ring and what primers make them
fit. This is about the protein, and it is a different question with a different way of going wrong.

```ts
import { designFusion, fusionWorking } from "@biolibs/bionet-tools";

const made = designFusion(lab, { pieces: [
  { part: aox1, as: "promoter" }, { part: alphaFactor, as: "signal" },
  { part: casein, as: "coding" }, { sequence: "CACCACCACCACCACCAC", name: "His6", as: "tag" },
] });

made.junctions;    // every place two pieces meet, and whether the frame survived it
made.protein;      // what the cell would read
made.mature;       // what is left once the signal peptide is cut off
made.checks;       // what a careful person would stop and ask
```

**A ring can be built perfectly, sequence exactly as designed, and give the wrong protein**, because
what was joined does not read as one chain. A piece that is twenty bases rather than twenty-one
shifts everything after it, and the cell reads a different protein without complaining. The gel
shows a band; the sequencing matches the design; the design was wrong. That failure is silent,
common, and entirely computable, which is the case for doing it here.

Three things are checked that nothing else here checks.

**The frame at every junction.** Each translated piece is counted, and a junction is in frame only if
everything before it comes to a whole number of codons. The arithmetic is shown: *"56 bases come
before this, which is 2 past a whole codon, so casein and everything after it is read in the wrong
frame."*

**A stop where no stop belongs.** The whole translated stretch is read as one. A stop before the end
means the chain finishes early, and that is usually a frame that shifted a piece or two earlier —
which the check says, so the symptom points at the cause.

**Where the signal peptide is.** A signal only works at the very beginning of the chain. Putting a
tag in front of one is a mistake people make because the tag belongs at the N-terminus and so does
the signal, and only one of them can be: the protein is made, and stays inside the cell.

Roles that are not translated — a promoter, a terminator — sit outside the coding stretch and are
checked only for being in a sensible place. `useFusionBench` is the same at a desk, with the pieces
in order and the frame watched as they are laid out.

## Whether the protein will actually work

A band of the right mass is not the same as a protein that does its job, and for a milk protein the
difference is the whole project. Casein builds a micelle — which is what makes it behave like cheese
rather than like dissolved protein — through clusters of phosphorylated serines binding calcium. A
host can make casein of exactly the right mass, giving exactly the right band, that will not do the
job, because the kinase that puts the phosphates on is one the host does not have.

```ts
import { comparedWithKnown, hostPhosphorylation, phosphoSites, phosphoWorking } from "@biolibs/bionet-tools";

const found = phosphoSites(casein.sequence);
found.sites.map((one) => [one.at, one.by, one.round]);
// [[30, "S-x-E", 3], [32, "S-x-E", 2], [33, "S-x-E", 1], [34, "S-x-E", 1], [50, "S-x-E", 1]]

comparedWithKnown(found.sites.map((one) => one.at), [30, 32, 33, 34, 50]).caught;   // 1
hostPhosphorylation("Pichia pastoris GS115")?.secretoryKinase;                      // "not known"
```

Two things come back and they are different in kind, which is why they are worked out separately.

**The sites are a rule over the sequence.** The kinase of the secretory pathway reads Ser-x-Glu, and
once a serine is phosphorylated it carries the negative charge a glutamate does for the one two
residues before it — so the sites march backwards along a cluster, which is why casein's serines come
in runs. `round` says which pass found each, and `phosphoWorking` shows the rule and every pass.

Applied to bovine β-casein, that rule gives back exactly the five phosphoserines a curator recorded in
UniProt, and nothing else. A test asserts it, because that agreement is the only reason to believe the
rule on a sequence nobody has studied — a variant, or the same gene rewritten in another host's
codons. `comparedWithKnown` is how to make that check for any protein that has a record.

**Whether the host has the enzyme is not a rule.** `hostPhosphorylation` says what is generally held
about the usual expression hosts, says how firmly, and says plainly that it is a claim to go and
check — which a lab's own literature tools can now do. It is there to stop somebody discovering at the
end of a month that the protein was never going to be phosphorylated.

## Several proposals read as one piece of work

A proposal is one run. Nothing in the log says that eleven of them are one build, or which comes
first — and until this, nothing read them as anything but eleven unrelated cards spread over four
tabs, in whatever order they happened to be made.

But the order is not missing from the data. It is simply never followed. A proposal says what it
expects to make, each thing with the checksum that would be its identity; another says what it
needs, and may name a part there is no tube of yet by that same checksum. Where one expects what
another needs, the first has to happen first.

```ts
import { planOfWork, saysWork } from "@biolibs/bionet-tools";

const work = planOfWork(lab);
saysWork(work);
// ["4 steps are proposed, in 2 pieces of work.", "2 steps could be carried out now.", …]

work.ready.map((one) => one.plan.kind);    // what somebody could go and do now
work.toGet;                                // what has to be ordered before any of it can start
work.threads.map((one) => one.name);       // ["pWren-CSN2", "a terminator cassette"]
```

```tsx
import { WorkToDo } from "@biolibs/bionet-tools";

<WorkToDo onOpen={(plan) => goToTheToolFor(plan.kind)} />
```

Three things are worth knowing about it.

**Which project it is for is filed, not derived.** The order is a fact about molecules and is worked
out; which work belongs together is a decision and is not. Four caseins are four chains in one
project, and two unrelated projects are also chains — nothing can tell them apart by looking at what
they make. So `planOfWork` groups by the `project` field on each plan, and anything nobody filed goes
under `Not filed` rather than being lumped in with somebody else's.

```ts
work.projects.map((one) => [one.name, one.ready.length]);
// [["Bioprinting", 0], ["Real Vegan Cheese", 2], ["Not filed", 1]]
```

**Nothing else is declared, so nothing can drift.** The order is derived, not asserted. There is no new
kind of entry, nothing an older device has to understand, and no way for a stated order and the real
one to disagree.

**A chain never crosses into another.** A piece of work is every step joined to every other by what
they make and need, so a step can only ever wait on one in its own chain. That is what lets the
steps be numbered within a chain rather than across the lot, and a test asserts it.

**The chain stops at a transformation.** What a transformation makes is alive, so it has no checksum
for a later proposal to point at, and the culture an induction would use does not exist until
somebody has grown it. The work up to putting a construct into a host can be proposed as one chain;
what follows is proposed afresh once there is something growing. That is a real limit, and it is
said in the panel rather than left to be discovered.

One thing has to be done for a chain to be possible at all: **a proposal may only name a part the
lab knows of**, so what an earlier step would make has to be added with `addPart` — no tube, just
the sequence under a name — before a later step can say it needs it.

## Taking it to a bench

Everything else here is for a screen: a panel that knows the lab, with the tubes in dropdowns and the
working folded away. None of it is any use at a bench with gloves on, and a plan nobody can follow
standing up is not finished.

```ts
import { protocolText, protocolsFor } from "@biolibs/bionet-tools";

for (const sheet of protocolsFor(lab, { project: "Real Vegan Cheese" })) console.log(protocolText(sheet));
```

```markdown
## 1. Copy it by PCR

**Take out**
- 1 µL of pGene — in Box 1 (the tube holds 30 µL)

**Set**
- Denature: 98 °C
- Anneal: 55 °C for 30 s
- Cycles: 30

**Do**
1. Set up the reaction with 1 µL of pGene as the template.
2. Run the programme above.

**This plan does not say**
- which polymerase and which buffer
- the final volume of the reaction, and how much water
```

The last list is the whole point. A protocol wants rather more than a plan records — a polymerase, a
buffer, a final volume, a way of making cells competent — and a tool that wrote in plausible ones
would be **making things up on a page somebody carries to a bench and trusts**. So each step keeps
two lists apart: what the plan says, which is exact, and what it does not say, which is named so the
lab supplies its own and finds the hole before starting rather than halfway through.

Nothing here invents a number. If a volume is on the page, somebody set that volume; if a programme
is missing, the step says so and tells you to set it as the lab usually does.

Two smaller things it does because the chain already knows them. A part the lab has no tube of says
**"what step 1 makes"** where an earlier step makes it, rather than sending somebody shopping for it.
And a piece of work that makes nothing — a digest, a check — is titled by what it is done *to*,
since it has no product to be named by.

## And what to do when the host will not

Diagnosing is cheap to be honest about: either the motif is there or it is not. Proposing a way
round is where a tool can do real damage, because the ways round are not equivalent, **the most
computable of them is the least likely to work**, and a lab that spends a month on the wrong one has
spent a month.

```ts
import { phosphomimetic, remediesFor } from "@biolibs/bionet-tools";

remediesFor(hostPhosphorylation("Komagataella phaffii")).routes.map((one) => [one.name, one.standing]);
// co-express the kinase · reported        a host that already has it · well established
// phosphorylate it afterwards · reported  a phosphomimetic · worth trying
// measure what you actually get · well established

const asked = phosphomimetic(casein, [15, 17, 18, 19, 35]);
asked.isoelectric;    // { before: 5.13, after: 4.78 } — the charge, which is what it changes
asked.kilodaltons;    // { before: 23.6, after: 23.8 } — not something a gel will show
```

Five routes, **none of them recommended**, because which suits depends on what a lab has — a tissue
culture room, a second selection marker, a purified kinase, time — and nothing here knows that. Each
carries what it costs and how firmly it is held. The one held most firmly is to express it and
measure the thing you care about, which is the only one that says where a lab really is rather than
where the literature says it probably is.

`phosphomimetic` is the one that can be computed, and the honest framing is the whole value of it. A
phosphoserine carries about two negative charges at the pH of a cell; a glutamate carries one, in a
smaller group of a different shape. Where phosphoserines sit in a cluster and bind calcium between
them — which is what makes casein build a micelle — the geometry is part of the work. **It is a way
of asking whether charge alone is enough. It is not a way of making phosphorylated protein**, and
every answer says so.

Two details that matter at a bench: what really moves is the isoelectric point, and the weight moves
by a couple of hundred daltons, which no gel will show — so the tool says not to look for it there.
`mimeticGene` rewrites the coding sequence to match, which is what a lab actually orders.

## The tool

```tsx
import "@biolibs/bionet-tools/tools.css";
import { InstrumentTool, PcrTool } from "@biolibs/bionet-tools";

<InstrumentTool place={thermocyclerId} onDone={close} />   // the tool for whichever instrument that is
<Tools />                                                  // every tool, and the lab's sequences
<PcrTool />                                                // or one tool on its own; DigestTool likewise
```

The tools use the lab's hooks and are drawn with the panels' styles, so they go inside a `LabProvider` and a `LabWindow`. `InstrumentTool` opens PCR for a place whose `model` is `thermocycler`, digest and gel for a `gel-station`, a ligation for a `heat-block` and an induction for a `shaking-incubator`, and says so when there is no tool for an instrument yet. `Tools` lists them all, and still records a run at the lab's instrument for that tool if it has placed one.

The tools' own descriptions explain their terms on hover, with a picture, through
[`@biolibs/glossary-react`](../glossary-react). Import its `glossary.css` once as well.

## License

MIT
