# @biolibs/bionet-demo

A lab to show Bionet with, and a walk through it. See [the package README](../packages/bionet-demo/README.md) for the API with worked examples.

```tsx
import { Demo } from "@biolibs/bionet-demo";

<Demo />
```

## Why a demo is a package and not a page

What makes any of this worth having is that the freezer, the tools and the record are one thing: a run takes from a tube because it is the same tube, and the product is in the freezer because the run said so. A person meets that one window at a time, and one window at a time it looks like several ordinary programs. So there has to be something that goes round the whole of it in one line of argument.

It is a package rather than a page in the app because an app owns nothing, and because the same walk should be able to run anywhere the packages run — a desktop tab today, a web page later, without being written twice.

## It is a real lab, which is the point

The demo opens a lab on a key held in memory, founds it, and fills it with the same signed entries a person's app writes. Every stop then mounts the real tool against it, so what is shown is what the app does, and anybody can take the controls mid-sentence. A demo that reimplemented the tools to look good would be the one part of the repository nobody could trust, and it would drift.

Three stops record runs, so the lab really changes as the walk goes on: by the last stop the box holds three tubes that were not there at the start, each saying which run made it. The steps check the lab before acting, so going back and forward does not do anything twice, and starting again opens a fresh lab.

## The molecules are made, not written down

A demo has to be the same every time and everything in it has to be true. So the sequences are built from a number that is written down, with the gene and the two sites placed where the walk needs them, and every other site in the common set patched out of the filler — a site on one of these plasmids is always one that was planted. The package's own tests then check the things the walk asserts out loud: that EcoRI and BamHI each cut pGene once and nothing else does, that the primers make one product of 502 bases, that the pieces are 926 and 786, and that they close into one circle of 3,492. A demo that stopped being true fails the build.

## What a tour needed from the tools

Only one thing: that each bench can be opened on a given state. `usePcrBench`, `useDigestBench` and `useLigationBench` take a `start` that is read once, when the bench is mounted, so a tour that remounts a bench sets that tool up without taking its controls away afterwards. Nothing is driven from outside after that, and no tool knows it is in a demo.

## Source layout

```
packages/bionet-demo/src/
  molecules.ts     the molecules, made from a number that is written down
  lab.ts           the lab: opened, founded and filled by ordinary entries
  tour.ts          the walk, as plain data: where to be, what to say, what to do there
  tour-player.tsx  the walk, drawn and played
packages/bionet-demo/demo.css   the strip, and the room under it
```
