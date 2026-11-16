# @biolibs/glossary and @biolibs/glossary-react

The words of molecular biology said plainly, a picture for every one of them, and a place for a biologist to put their name to both. See the package READMEs for the API: [glossary](../packages/glossary/README.md), [glossary-react](../packages/glossary-react/README.md).

```tsx
import "@biolibs/glossary-react/glossary.css";
import { Term } from "@biolibs/glossary-react";

<p>Each <Term slug="primer">primer</Term> binds one strand.</p>
```

## Why these are packages

The glossary began inside the biolibs site, which is where its lessons are. The desktop app needs the same words, at the moment a person is about to run a PCR and not in a lesson beforehand. Two copies would drift, so the words and the pictures are here and both read them.

## A term is its words and its picture

Some readers do not get from a sentence to an understanding without seeing the thing. For them a definition on its own is not a smaller version of help; it is none. So the rule is that a term always has a composed picture, and that the two are never shown apart: the tooltip leads with the picture, and a term added without one fails a test.

The words and the pictures are separate packages only so that something which needs the words alone does not load the drawings. They are tested together.

## The pictures are worked out, where they can be

A picture of a restriction cut uses the real enzyme; a picture of a gel runs the gel model; a reverse complement is taken by the engine. So a picture cannot quietly disagree with what the libraries do. Each also carries a description in words for somebody who cannot see it, and bases are letters as well as colours, so colour is never the only cue.

## Sign-off

None of this was written by a biologist, and a learner cannot tell a good definition from a plausible one. So each term can carry a review: who, in what capacity, when.

Three decisions shape it.

- **It is optional, and its absence is said.** A term nobody has reviewed says "Not yet reviewed by a biologist" wherever it is shown. `REVIEWS` starts empty. Nothing is claimed that has not happened.
- **A review is of what was read.** A term's fingerprint is made from its sentence, its paragraph, its reason and its picture as drawn. A review records that fingerprint. Change a word or a line of the drawing and the review is shown as being of an earlier version, not as covering the new one.
- **The words and the picture are signed off together.** A correct sentence beside a misleading drawing is not a reviewed term.

A review today is an entry in `review.ts`, added through the repository like any other change, so who added it is in the history. It is not a cryptographic signature. The same fingerprint could be signed with a Bionet key later, which would let a review be checked without trusting the repository.

## What is not here

Lessons and checks specific to a tool: why a PCR's first cycles make over-long strands, or that an annealing temperature is above a primer's melting temperature. Those belong with the tool. Terms the tools need and the glossary lacks get added here, each with a picture.

## Source layout

```
packages/glossary/src/
  terms.ts     the terms, looking one up, and finding them in text
  review.ts    who has reviewed a term, and whether it has changed since
packages/glossary-react/src/
  diagrams.tsx, basics.tsx, more.tsx   the pictures; TermDiagram picks one by slug
  primitives.tsx                       what they are drawn with
  term.tsx                             a term in text, a card, and the review sheet
packages/glossary-react/glossary.css   the tooltip and the pictures' colours
```
