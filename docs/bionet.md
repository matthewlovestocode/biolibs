# @biolibs/bionet

Labs publishing what they hold, so that a cloning plan can be acted on and not just believed. **This is not a port.** Every other package here is measured against a Python library case by case and carries a parity checklist; this one has no upstream, so there is nothing to be at parity with. What it has instead is a design, and a set of claims kept deliberately narrow. See [the package README](../packages/bionet/README.md) for the API with worked examples.

```ts
import { fetchInventory, partsNeeded, settled, whoHas } from "@biolibs/bionet";

const found = await fetchInventory("endylab.example");
const sourcing = whoHas(partsNeeded(plan.document), settled(found) ? [found] : []);
```

## Why there is a package here at all

[`@biolibs/opencloning`](opencloning.md) can send a plan the receiving end replays rather than trusts, and sign it so the plan is attached to a key. Both of those are about the document. Neither gets anybody a plasmid, and neither answers the question a reader actually has next: who has the parts this starts from?

A plan bottoms out in molecules nobody made — the things that were simply had. Those leaves are what `partsNeeded` returns, and they are what somebody, somewhere, has in a freezer.

## What an inventory is

Three things and a time: who published it, the parts, and when. A part is listed by its SEGUID rather than by the lab's own name for it, which is the design decision the rest rests on. A SEGUID is the same whichever strand the molecule was written from and, for a circle, wherever it was cut open, so two labs that have never spoken publish the same string for the same molecule. Names agree with nothing. A lab that lists a fragment as `pEndy-402` is still found when a plan calls it `f3`.

Parts also carry whether they are on offer. A lab listing what it holds without offering all of it is normal, and `heldButNotOffered` keeps that separate from `unsourced` — "nobody has this" and "somebody has it but is not sending it" are different problems for the person reading the plan.

## What fetching one establishes, and what it does not

A fetch settles three things, and they are reported separately rather than flattened into one badge:

- the document **parses** as an inventory;
- its **signatures hold**, so not a word of it has changed since whoever holds those keys published it;
- it was served from the **address it claims**, which is what ties those keys to that address.

`settled()` is all three. None of them, and not all three together, is *this lab is who it says it is*. The address does that work, and only as far as the address was already trusted: if you know `endylab.example` is the Endy lab because you read it in a paper or saw it on their door, then a signed inventory served from there binds that key to that lab. If you do not know it, nothing in this package will tell you. There is no registry here and nobody to appeal to — that is a property of the design, not an omission from it.

Two edges stated plainly in `origin.ts`, and enforced:

- **https, or nothing**, apart from a machine talking to itself. Over plain http anything in the middle can substitute the document, and the signature on the substitute verifies perfectly.
- **First sight is a leap.** A convincing stand-in is indistinguishable from the real lab on the first visit. What is distinguishable is a key *changing*, which is the whole reason `trust.ts` writes the first one down. `"changed"` may mean a lab rotated its key or it may mean somebody is standing where the lab used to be; only the lab can say which. The value is that the question gets asked.

## Reading a stranger's document

`readInventory` hands back the document **exactly as it arrived**, never a tidied copy. This is not fastidiousness: the signature covers the bytes the lab wrote, so trimming an over-long note or filling in a missing field would leave a document that no longer matches its own signature, and the thing verified would not be the thing used. Anything out of bounds is therefore refused rather than repaired, and over-long text is a display problem for whatever shows it.

The same care applies one layer down. Signatures are made under a domain string — `biolibs/bionet signed inventory v1` here, `biolibs/opencloning signed plan v2` there — prefixed to the bytes before signing, so a signature over one kind of document cannot be lifted onto another kind that happens to serialise the same way. The test for it signs one document under both domains and shows the crossover failing while each holds under its own.

## Source layout

```
packages/bionet/src/
  model.ts       what an inventory is
  inventory.ts   writing one, signing one, reading a stranger's
  origin.ts      where one lives, and what fetching it proves
  fetch.ts       fetching and checking one
  trust.ts       remembering which key answered last time
  match.ts       what a plan needs, and who has it
```

No golden cases: there is no Python library to record them from. `packages/bionet/test/bionet.test.ts` checks the behaviour the package claims, and `test/readme.test.ts` runs every example in the README.
