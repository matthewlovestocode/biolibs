# @biolibs/bionet

Labs publishing what they hold, so that a cloning plan can be **acted on** and not just believed.

[`@biolibs/opencloning`](../opencloning) lets a lab send a plan that the receiving end can replay, and
sign it so the plan is attached to a key. Both of those are about the document. Neither of them gets
anybody a plasmid. This package is the other half: a lab writes down what it has, signs the list, and
publishes it at a fixed path on its own web address. Then a plan's starting parts can be looked up.

It is also what a lab is kept with inside: every member's device signs its own changes into its own
log, and the lab is worked out from all of them together. Parts and tubes, where each tube is, and
what was done at the bench are all changes of that kind. See "Inside a lab" below.

- **Write an inventory** from the molecules a lab holds
- **Sign it**, and let another lab countersign
- **Publish it** at `/.well-known/bionet.json`
- **Fetch one** and find out three separate things: that it is an inventory, that its signatures hold,
  and that it came from the address it claims
- **Remember** which key answered last time, so a key that changes gets noticed
- **Find labs you were never told about**, by walking the pointers from ones you were
- **Ask who has** the parts a plan starts from, matched by checksum

> **This is not a port.** Every other package in biolibs is measured against a Python library case by
> case, and says so. This one has no upstream: there is nothing to be at parity with. It is a small,
> deliberate design, and the paragraphs below are as careful about what it does not establish as about
> what it does.

## What a fetched inventory actually establishes

Three things, kept apart on purpose, because flattening them into one "verified" badge would be a lie
of exactly the kind this is meant to avoid:

| | What it means |
|---|---|
| it parsed | Somebody published a document of the right shape at that address |
| its signatures hold | Whoever holds those keys published **this** list — not a word of it has changed since |
| it came from its own address | The document names the origin it was served from, so those keys belong to **that address** |

`settled()` is all three at once. What none of them is: *this lab is who it says it is.* The address
does that work, and only as far as you already trusted the address. If you know `wrenlab.example` is
the Wren lab — from a paper, a colleague, a sign on the door — then a signed inventory served from
there ties that key to that lab. If you do not know that, nothing here will tell you.

Two edges worth stating plainly:

- **https or nothing**, apart from a machine talking to itself. Over plain http anything in the middle
  can swap the document, and the signature on the substitute will verify perfectly.
- **First sight is a leap of faith.** You cannot tell a lab's real key from a convincing stand-in on
  the first visit. What you can tell is a key *changing* — which is what `trust.ts` is for, and why it
  is worth writing down the first one.

## Install

```bash
npm install @biolibs/bionet
```

```mermaid
graph BT
  bionet["@biolibs/bionet"] --> opencloning["@biolibs/opencloning<br/><i>plans, and the signing</i>"]
  bionet --> dseqrecord["@biolibs/dseqrecord"]
```

## Publishing what a lab holds

```ts
import { inventoryFrom, signInventory } from "@biolibs/bionet";
import { generateSigningKey } from "@biolibs/opencloning";

const key = await generateSigningKey();

const inventory = inventoryFrom([f1, f2, f3], {
  name: "Wren lab",
  origin: "https://wrenlab.example",
  contact: null,
  note: null,
});

console.log(inventory.parts[0].name);        // "f1" — what this lab calls it
console.log(inventory.parts[0].checksum);    // ldseguid=... — what everyone else matches on

const published = await signInventory(inventory, key, { signer: "Wren lab" });
// write JSON.stringify(published) to /.well-known/bionet.json
```

A part is listed by its SEGUID, which is the same whichever strand the molecule was written from and,
for a circle, wherever it was cut open. Two labs that have never spoken publish the same checksum for
the same molecule. Their names for it agree with nothing.

## Reading somebody else's

```ts
import { fetchInventory, settled, signingKeys } from "@biolibs/bionet";

const found = await fetchInventory("wrenlab.example");

console.log(found.checks[0].ok);           // true — the signature holds
console.log(found.fromItsOwnAddress);      // true — and it was served from the address it names
console.log(settled(found));               // true — both of those
console.log(signingKeys(found));           // [ "2f3f-fe1a-3d7d-c3b4" ]
```

What comes back is the document **exactly as it arrived**, never a tidied copy: the signature covers
the bytes the lab wrote, so trimming a long note or filling in a missing field would leave a document
that no longer matches its own signature. Anything out of bounds is refused instead of repaired.

## Noticing when a key changes

```ts
import { labMemory, remember } from "@biolibs/bionet";

const memory = labMemory();   // a browser would keep this in local storage

console.log(remember(memory, found.origin, signingKeys(found)).how);   // "new" — first visit, a leap
console.log(remember(memory, found.origin, signingKeys(found)).how);   // "known"

// a month later, a different key answers for the same address
console.log(remember(memory, found.origin, ["9999-aaaa-bbbb-cccc"]).how);   // "changed"
```

`"changed"` is the only one of the three that is evidence of anything. It may be a lab that rotated its
key, or it may be somebody standing where the lab used to be; only the lab can tell you which. The
point is that the question gets asked rather than passed over.

## How labs find each other

There is no index of labs, and this does not build one. A lab is found the way a page was found on
the early web: somebody you already know points at it. An inventory can therefore carry pointers to
other labs, and `discover` walks them.

```ts
import { discover, peer, settledLabs } from "@biolibs/bionet";

// pointing at somebody, in your own inventory
const inventory = inventoryFrom(parts, lab, {
  peers: [peer("otherlab.example", { name: "Other lab", key: "2f3f-fe1a-3d7d-c3b4" })],
});

// walking from a lab you were told about
const walk = await discover(["wrenlab.example"], { maxDepth: 2 });

console.log(walk.reached.map((one) => one.path.join(" → ")));
// [ "https://wrenlab.example",
//   "https://wrenlab.example → https://otherlab.example" ]
console.log(walk.unreachable[0]?.why);      // why an address did not answer, and who pointed at it
```

So the answer to "how does a new lab get found" is: **publish, and tell one person.** Put a signed
inventory at `/.well-known/bionet.json`, give the address to a lab that already has one, and when
they add you to their `peers` everyone who walks through them reaches you. Nothing can automate that
first introduction, and a design that claimed to would be inventing an authority.

Three consequences, stated rather than glossed:

- **What you find is what your seeds could reach.** There is no view of the whole network and no way
  to know what you are missing. Two people starting from different labs find different sets, and
  neither is "the network" — which is why `Discovery` records the `path` by which each lab was
  reached, so a person can see how they came to be looking at it.
- **A pointer is not an endorsement.** It says this address exists and publishes an inventory. It
  says nothing about what that lab holds or who they are.
- **Only a lab that checks out can introduce anyone.** If a document's signature fails, or it was
  served from an address it does not claim, it is reported and then its pointers are discarded —
  otherwise whoever could answer for one address could fill your walk with addresses of their
  choosing.

A pointer may record the key the referring lab saw. A walk compares it with the key actually
answering and reports `agrees`, `differs` or `unsaid`:

```ts
import { introducedDifferently } from "@biolibs/bionet";

for (const one of introducedDifferently(walk)) {
  console.log(one.found.origin, "is not answering with the key", one.introducedBy, "recorded");
}
```

Nothing is concluded from a disagreement. It is surfaced because it is the one contradiction a walk
can notice without anybody being in charge: two parties describing the same address differently. One
of them is looking at something the other is not, and only they can say which.

Walks are bounded — 50 labs and 2 hops by default, `stoppedEarly` when it ran into that — and an
address is visited once however many labs point at it, so a cycle is walked but not gone round.

## Asking who has the parts

```ts
import { partsNeeded, unsourced, whoHas } from "@biolibs/bionet";

const needed = partsNeeded(plan.document);
console.log(needed.map((part) => part.name));          // [ "f1", "f2", "f3" ]

const sourcing = whoHas(needed, [found]);
console.log(sourcing[0].holders[0].lab);               // "Wren lab"
console.log(unsourced(sourcing).map((p) => p.name));   // [ "f3" ] — nobody asked has this one
```

`partsNeeded` is the plan's leaves: the molecules no step in it makes, which is exactly what somebody
has to already have. Matching is by checksum, so a lab that calls the same molecule `pWren-402` is
found anyway. `heldButNotOffered` separates "nobody has it" from "somebody has it but is not sending
it", which are different problems for the person reading the plan.

Inventories whose signatures do not hold are yours to filter out before you call `whoHas` — it matches
what it is given and claims nothing about whether the labs are to be believed.

## Inside a lab

An inventory is what a lab shows the world. Inside it, a freezer changes every day and the people
changing it are not always online, so what a lab holds is not a file anybody edits. It is worked out
from **signed logs**: each device has a key, every change made on it is one signed entry in that
key's own log, and nobody writes to anybody else's.

```ts
import { addItem, addPart, addToRoster, adjustItem, entryId, foundLab, mergeLog, newItemId,
         nextEntry, publicInventory, recountItem, signInventory } from "@biolibs/bionet";

// Ada founds the lab. Its ID is the ID of that entry, not a name or an address.
const founding = await foundLab(adasKey, { name: "The Wren Lab", person: "Ada" });
const ada = [founding];
const write = async (held, key, op) => held.push(await nextEntry(await mergeLog(held), key, op));

await write(ada, adasKey, addToRoster(bobsKey.publicKey, "Bob"));
await write(ada, adasKey, addPart({ sequence: "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA", name: "f1" }));
const part = (await mergeLog(ada)).parts[0].checksum;
const tube = newItemId();
await write(ada, adasKey, addItem({ item: tube, part, amount: 10, unit: "µL" }));

// Bob takes a copy and both go offline. Each uses some of the tube.
const bob = [...ada];
await write(ada, adasKey, adjustItem(tube, -1));
await write(bob, bobsKey, adjustItem(tube, -2));

// They meet. Either order, either machine: the same lab, and both uses counted.
const everything = [...new Set([...ada, ...bob])];
(await mergeLog(everything)).items[0].amount;             // 7
(await mergeLog(everything.reverse())).items[0].amount;   // 7
```

`mergeLog` takes every entry held, in any order, and returns the lab: its roster, its parts, its
items and how much of each, and for every entry whether it counted and why not if not.

| Rule | Why |
|---|---|
| Order comes from what an entry had seen, never from a clock | Offline laptops agree about nothing, least of all the time |
| Amounts are whole-number differences | Two people using a tube are two uses. Whole numbers have one spelling to sign and add up exactly |
| A recount replaces only the adjustments its author had seen | The count was true when it was made; what happened unseen still happened |
| An item below zero, or counted twice at once, is flagged `needsRecount` | The freezer is the truth, and the log should say when it has lost track |
| Overlapping edits: the lower entry ID stands, and `overlaps` reports the other | The same choice on every machine, and nobody can arrange it in advance |
| Only a keeper changes the roster; the longer-standing keeper is heard first | Two keepers removing each other must come out one way |
| A removal names a cutoff in the removed key's log | Somebody removed cannot add to the lab later by claiming not to have heard. What they wrote past it is kept and marked `set aside` |

An entry that is not allowed is still placed, with `status` and `reason`, because the people in the
lab need to see what was turned away. An entry whose kind this version does not know is kept in the
chain and not applied, so an older app survives a newer one.

What leaves the lab is a reduction of all that:

```ts
const lab = await mergeLog(everything);
const inventory = publicInventory(lab, {
  name: "The Wren Lab", origin: "https://lab-wren.onrender.com", contact: null, note: null,
});
inventory.parts.map((one) => [one.name, one.available]);   // [ [ "f1", false ] ]

const published = await signInventory(inventory, adasKey, { signer: "Ada" });
```

A part is listed if some item of it has anything left, and is on offer only once a member has said
so with `offerPart`. Amounts, items and who did what stay inside.

### Where things are

A lab's places are a tree, and a tube is put in one. Both are signed changes, merged like the rest.

```ts
import { addPlace, movePlace, newPlaceId, putItem } from "@biolibs/bionet";

const freezer = newPlaceId();
const box = newPlaceId();
await write(ada, adasKey, addPlace({ place: freezer, kind: "freezer", name: "−80" }));
await write(ada, adasKey, addPlace({ place: box, kind: "box", name: "Box 1", parent: freezer, grid: { rows: 9, columns: 9 } }));
await write(ada, adasKey, putItem(tube, box, { row: 2, column: 3 }));

const lab = await mergeLog(ada);
lab.places.map((one) => one.name);    // [ "−80", "Box 1" ]
lab.items[0].where;                   // { place: box, slot: { row: 2, column: 3 } }
lab.crowded;                          // []
```

A place has a kind, a name and the place it is in; only a box has positions, fixed when it is added.
`standPlace` says where a place stands and how big it is, in whole millimetres, and is optional.

Two things people working apart can do are shown, never refused, because neither person did
anything wrong. If each moves a place into the other, both come out `adrift`: in nothing, until
somebody moves one. If each stands a tube in the same position, it is listed in `crowded` until
somebody goes and looks.

### What is marked on a part

```ts
import { annotatePart } from "@biolibs/bionet";

await write(ada, adasKey, annotatePart(part, [{ type: "CDS", label: "demo", strand: 1, parts: [{ start: 5, end: 35 }] }]));
(await mergeLog(ada)).parts[0]!.features.length;    // 1
```

A part can carry features: a type, a label, a strand, and one or more stretches of the sequence,
which is what a GenBank or SnapGene file marks. They are said whole, like any field: the later
saying wins, and two said apart are an overlap with the lower entry ID kept. Features that run past
the end of the part are refused.

### A part with sticky ends

```ts
import { addPart } from "@biolibs/bionet";

await write(ada, adasKey, addPart({ sequence: "AATTCGGGGTTTTGGGGCCCCAAAAGGATC", name: "piece", ends: { left: 4, right: 4 } }));
(await mergeLog(ada)).parts.at(-1)!.ends;    // { left: 4, right: 4 }
```

A piece cut out by a restriction enzyme has a few unpaired bases at each end, and they decide what it
can be joined to. A linear part may say so: its sequence is every base either strand has, read along
the top strand, and `ends` says how many at each end are on one strand only. Positive is a 5′
overhang, negative a 3′ one, 0 blunt. The checksum takes the ends in, so the same bases with
different ends are different parts, and a piece is the same part whichever strand it was written
from. A part with blunt ends is recorded and named exactly as it always was.

### A change this version cannot read

```ts
import { strayField } from "@biolibs/bionet";

strayField(addPart({ sequence: "GGATCC", name: "f1" }));                              // null
strayField({ type: "part.add", sequence: "GGATCC", circular: false, name: "f1", nicked: true });   // "nicked"
```

Every kind of change lists the fields it may carry, and so does everything inside them. A change
carrying anything else is set aside as `not understood`, with the field named, exactly as a kind of
change this version has never heard of is.

This is deliberately strict, and it is strict because of what happened when parts learned to have
ends. A version that did not know `ends` took such an entry, ignored them, and worked the part's
checksum out from the bases alone — so two machines read one entry differently, which is the one
thing the merge must never do. A new *kind* of change was always safe, because an old reader refused
it and said so. A new *field* was not. Now it is: adding one is a breaking change for older readers,
and they will say which field they could not read instead of quietly disagreeing about the lab.

### What was done at the bench

A run is one change that does three things: takes what was used from each tube that went in, adds
each tube that came out, and keeps the run so a tube can say where it came from.

```ts
import { newRunId, recordRun } from "@biolibs/bionet";

const product = newItemId();
await write(ada, adasKey, recordRun({
  run: newRunId(), kind: "pcr", instrument: null,
  inputs: [{ item: tube, amount: 1, role: "template" }],
  outputs: [{ item: product, sequence: F1.slice(0, 40), circular: false, name: "amplicon", amount: 50, unit: "µL" }],
  settings: { anneal_at_least: 18 }, outcome: "worked", note: null,
}));

const after = await mergeLog(ada);
after.items.find((one) => one.item === tube)?.amount;      // one less than before
after.items.find((one) => one.item === product)?.from;     // the run's ID
after.runs.length;                                         // 1
```

A run is recorded whole or refused whole. One that did not work is recorded with nothing coming
out, and still takes what was used. The merge does not work the run out again: what came out is what
its signer said came out.

### What somebody proposes doing

A plan is a run nobody has done. It has a run's shape with everything that says something happened
taken out, and it changes nothing the lab holds: no amount moves, and no tube or part is made.

```ts
import { newPlanId, planRun, settlePlan } from "@biolibs/bionet";

const proposed = newPlanId();
await write(ada, adasKey, planRun({
  plan: proposed, kind: "pcr", instrument: null,
  inputs: [{ item: tube, amount: 1, role: "template" }],
  expects: [{ sequence: F1.slice(0, 40), circular: false, name: "amplicon" }],
  settings: { anneal_at_least: 18 }, note: "to check the insert is there",
}));

const planned = await mergeLog(ada);
planned.plans[0]?.settled;                // null: it is open
planned.plans[0]?.expects[0]?.checksum;   // what the product would be known by

// Somebody does it and records the run as usual. Closing the plan is a change of its own.
const done = planned.runs[0]!.run;
await write(ada, adasKey, settlePlan(proposed, done));     // or settlePlan(proposed, null) to set it aside
(await mergeLog(ada)).plans[0]?.settled?.run;              // the run that carried it out
```

An input may name a `part` in place of an `item`, for something there is no tube of yet. A plan
carries what it expects and not how that was worked out: each reader's own tools work it out again
and can say whether they agree. A plan whose tubes have since been retired or run short is not
refused; it lists them in `wanting`.

The link from a run to its plan is the settling entry's alone. A recorded run is, field for field,
what it always was, so a device too old to know of plans still reads the run and holds the same
inventory.

A plan is what a key with the role `adviser` is for. An adviser may add parts, say what is marked on
a part that nothing is marked on, propose runs, and set aside a plan of its own. Everything else it
writes is refused where the logs are merged, on every device, so something with no hands at the
bench can be let into a lab without being able to say that anything was done, used or moved.

Where an adviser and a person mark the same part without having heard of each other, the person's
reading stands, whichever entry has the lower ID. Between two people it is the lower ID as usual.

```ts
// An adviser may describe a part nobody has described.
await write(claude, claudesKey, annotatePart(checksum, [{ type: "CDS", label: "wrenA", strand: 1, parts: [{ start: 0, end: 30 }] }]));

// It may not change what somebody has marked: this one is refused, and what Ada marked stands.
await write(ada, adasKey, annotatePart(checksum, [{ type: "CDS", label: "as Ada reads it", strand: 1, parts: [{ start: 0, end: 30 }] }]));
await write(claude, claudesKey, annotatePart(checksum, [{ type: "CDS", label: "and again", strand: 1, parts: [{ start: 0, end: 30 }] }]));
(await mergeLog(ada)).parts.find((one) => one.checksum === checksum)?.features[0]?.label;   // "as Ada reads it"
```

### Moving entries between machines

`mergeLog` works on whatever it is given. `sync.ts` is how entries are given, without opening a
connection itself: each side says how far into every log it holds (`haveOf`), sends what the other
lacks (`entriesBeyond`), and keeps what belongs of what arrives (`takeEntries`, which drops anything
from a key the roster has never heard of).

A lab's web peer relays entries between members and must not hand them to anybody who asks. So it
sends a `challenge`, the other side answers with `signHello`, and the peer sends entries only if
`verifyHello` names a key that `isMember`. Writing needs no proof: entries are signed by their
authors. `inventoryProblem` is the peer's rule for publishing an inventory a member sends it, and
`readMessage` reads one message off the wire.

## Testing

```bash
npm test                 # the whole workspace
npx vitest run packages/bionet/test
```

| File | What it checks |
|---|---|
| `test/bionet.test.ts` | inventories, signing, addresses, fetching, remembering, matching |
| `test/discover.test.ts` | walking the network, and everything a walk refuses to do |
| `test/log.test.ts` | signed logs: offline work, recounts, overlaps, forgery, removal |
| `test/sync.test.ts` | exchanging entries, who may read them, what a peer keeps and publishes |
| `test/readme.test.ts` | every code block in this file |

## Things to know

- **A signature over an inventory cannot be mistaken for a signature over a plan.** Each is made under
  its own domain string, and the test for it signs one document under both domains to prove the
  crossover fails.
- **`whoHas` matches by checksum only.** A lab that lists a molecule under a different name is still
  found; a lab that lists the right name with the wrong molecule is not.
- **An unsigned inventory is not a broken one**, it is one that claims nothing. It parses, it may be
  perfectly accurate, and `settled()` is false.
- **An inventory written before there were peers is still valid.** A missing list of pointers reads
  as an empty one, and nothing adds the field to a document it did not write — the signature covers
  the document as the lab wrote it.
- **A log entry is signed under its own domain**, `biolibs/bionet log entry v1`, and must be signed by
  the key whose log it is in. A good signature from the wrong key is refused.
- **Nothing here opens a connection.** `sync.ts` says what two machines send each other; carrying
  the messages is for whatever uses this.
- **Nothing here fetches a part.** Finding out who has a plasmid is as far as software goes; the rest
  is an email and a padded envelope.

## License

MIT — see [LICENSE](LICENSE).
