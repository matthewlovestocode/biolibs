# @biolibs/bionet-demo

A lab that shows what Bionet is, and a walk through it. The lab is made up and real at the same
time: it is opened on a key held in memory, founded, and filled by the same signed entries a
person's app writes, so the tools, the scene and the history all work on it for real. Closing the
window forgets the lot.

```
npm install @biolibs/bionet-demo @biolibs/bionet-theme react react-dom
```

## The whole thing

```tsx
import "@biolibs/bionet-theme/theme.css";
import "@biolibs/bionet-scene/scene.css";
import "@biolibs/bionet-tools/tools.css";
import "@biolibs/glossary-react/glossary.css";
import "@biolibs/bionet-demo/demo.css";
import { Demo } from "@biolibs/bionet-demo";

<Demo />
```

Thirty-one stops, from the room down to one tube and back again. Before any machine is used it stops at a desk: the primers the PCR needs are not in the freezer at the start, so the walk designs them for the gene, shows every length that was weighed, and has them arrive as tubes. It walks to each machine before
using it — across the room, up to the thermocycler, and only then in front of it — because a tool
is a thing on a bench in the lab and not a screen that replaces it. The stage's first view looks
from the same direction the room was looking, so the two are the same machine from the same side.

At each machine it goes through every view: the machine, what is under its lid, what it displays,
what is in the tube, and what came out. The PCR's tube is watched over four stops — the strands
parting, the primers landing, the first copies running on too far, and the third cycle where the
product's own length first appears. Each stop mounts the real tool, opened on what the stop is
about, so anybody can take the controls at any point. Nothing is a recording.

## The lab on its own

```ts
import { demoLab } from "@biolibs/bionet-demo";

const demo = await demoLab();
demo.lab.snapshot().lab?.parts.map((one) => one.name);   // pGene, pWren backbone — the primers arrive during the walk
```

`demo.source` goes straight into `LabProvider`. `demo.tubes`, `demo.instruments` and `demo.places`
name what is in it, for anything that wants to point at a particular tube or machine.

## The molecules

```ts
import { demoMolecules } from "@biolibs/bionet-demo";

const { pGene, backbone, forward, reverse } = demoMolecules();
```

Made, not pasted: built from a number that is written down, with the gene and the two sites put
where the tour needs them and every other site patched out, so a site on one of these plasmids is
always one somebody planted. `pGene` is a small plasmid holding one gene between an EcoRI site and a
BamHI site; `backbone` is a bigger plasmid already cut with the same two, waiting as a linear piece
with sticky ends. The package's tests check that the enzymes still cut where the tour says, that the
primers are still the pair the design tool gives for the gene and still make one product of 780 bases, and that the pieces still close into one circle — so a
demo that quietly stopped being true would fail the build rather than be shown to somebody.

## The walk on its own

```tsx
import { DemoTour, demoTour } from "@biolibs/bionet-demo";

demoTour(demo).map((step) => step.title);
<DemoTour demo={demo} />
```

A step is where to be, what to say, and what to do there. Three of them record a run — the PCR, the
digest that keeps the gene, and the ligation — so the lab really changes as the walk goes on, and
the last stop is true. They check the lab first, so going back and forward over a step does not do
it twice, and **Start again** opens a fresh lab.

## License

MIT.
