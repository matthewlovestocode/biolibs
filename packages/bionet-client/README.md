# @biolibs/bionet-client

One device in one lab: its key, its copy of the lab's signed log, everything a member can do, and the
connection to the lab's web peer. It works with no network and syncs when there is one. A member can
keep parts and tubes, say where each is, record a run at the bench, and back up the key and the lab.

It is an application with the edges left open. Where entries are kept, where the key lives and what
opens a socket are handed in, so the same `Lab` runs behind a desktop window, in a browser or in a test.

## Install

```bash
npm install @biolibs/bionet-client
```

## A device

```ts
import { Lab, memoryKeys, memoryStore } from "@biolibs/bionet-client";

const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
await lab.setPerson("Ada");
await lab.found({ name: "The Wren Lab" });          // works at once, with no peer anywhere

await lab.addPart({ name: "f1", sequence: "GGATCACAGTCTACACTGCTCACTCC" });
const part = lab.snapshot().lab.parts[0].checksum;
const tube = await lab.addItem({ part, amount: 10, unit: "µL" });
await lab.adjust({ item: tube, by: -3 });
lab.snapshot().lab.items[0].amount;                  // 7

await lab.setPeer("wss://lab-wren.onrender.com/sync"); // now it syncs, and keeps trying when it cannot
```

Every action becomes a signed entry in this device's own log. A change the lab would refuse is tried
first and **never written**, because a log is forever: the promise rejects with the reason.

On a desktop, keep the entries in a SQLite file. It is its own entry point because it needs Node:

```ts
import { sqliteStore } from "@biolibs/bionet-client/sqlite";

const lab = await new Lab({ store: sqliteStore("./lab-data"), keys }).open();
```

`keys` is anything with `load()` and `save()`. A real device keeps its key where the operating system
guards it; `memoryKeys()` is for tests.

## Joining

1. The new member sends a keeper their device's key: `lab.snapshot().device.key`.
2. The keeper adds it, `lab.addMember({ key, person })`, and sends back `lab.invite`.
3. The new member calls `lab.join(invite)`. The lab arrives once the keeper's change reaches the peer.

## Where things are

```ts
const freezer = await lab.addPlace({ kind: "freezer", name: "−80" });
const box = await lab.addPlace({ kind: "box", name: "Box 1", parent: freezer, grid: { rows: 9, columns: 9 } });
await lab.putItem({ item: tube, place: box, slot: { row: 0, column: 0 } });
lab.snapshot().lab?.places.length;    // 2
```

`movePlace`, `standPlace` (in metres, kept to the millimetre) and `retirePlace` do the rest. An
instrument can say which one it is: `addPlace({ kind: "instrument", name: "PCR", parent: bench, model: "thermocycler" })`.
`layoutFrom` in `@biolibs/bionet-space` turns the snapshot's lab into something that can be drawn.

## Recording a run

```ts
const done = await lab.recordRun({
  kind: "pcr", instrument: thermocycler,
  inputs: [{ item: template, amount: 1, role: "template" }],
  outputs: [{ sequence: "GGATCACAGTCTACACTGCTCACTCC", name: "amplicon", amount: 50, unit: "µL" }],
});
done.items;    // the IDs of the tubes it made
```

`@biolibs/bionet-tools` works out what to pass for a PCR.

`addPart` takes `features` as well, and `annotatePart({ part, features })` says them for a part the
lab already has. `addPart` and a run's outputs take `ends` too, for a linear piece whose ends are not blunt. An output of a run may carry `features`; they are said for the product if nobody
has marked that molecule yet.

## Giving the method to another lab

A lab can publish what it holds. This is how it publishes what it *did*, which is the other half and
the one that was missing.

```ts
const method = await wren.publishMethod({ project: "Real Vegan Cheese",
                                          lab: { name: "The Wren Lab", origin: "https://wrenlab.example", contact: null, note: null } });

// Somewhere else entirely: another key, another store, another lab.
const taken = await finch.takeMethod({ method: JSON.stringify(method), project: "Cheese, ours" });
taken.proposed;    // the steps, now proposed here, naming this lab's own tubes
taken.missing;     // molecules this lab has never heard of, by checksum, and which steps want them
taken.alive;       // what cannot be sent at all, so this lab has to make its own
```

Taking one is the reverse of publishing it. Every tube became a checksum on the way out, so on the
way in each checksum is looked for in this lab: a tube of it where there is one, the part where the
lab knows the molecule but holds none — which is Bionet's way of saying "get this first" — and said
to be missing where the lab has never heard of it. Nothing is used and nothing is recorded as done;
what lands is proposals, as if somebody here had made them.

Two labs that share no key, no store and no peer come out expecting the same molecules. That is what
reproducible means here, and `test/method.test.ts` is written as exactly that: two labs, one
document crossing between them.

`methodFor` writes the method out without signing it, which is what an adviser may do — publishing
puts a lab's name and key behind something, and that is a keeper's act.

## Backing up the key

A device's key never leaves it, with one exception: a lab with one member and one device ends when
the device does.

```ts
const backup = await lab.backUp("several unrelated words");   // text to write to a file
// later, on a new device that is not in a lab yet:
await fresh.restore({ backup, passphrase: "several unrelated words" });
await fresh.join(invite);                                      // and it carries on the same log
```

The key is who you are; the lab itself is every signed change. `exportLab` writes all of them to a
file and `importLab` brings them back, so with both files a lab comes back on a new device with no
peer to ask:

```ts
const copy = await lab.exportLab();          // every signed entry, as JSON
await fresh.restore({ backup, passphrase });
await fresh.importLab(copy);                 // the same lab, and it carries on the same log
```

The copy is not sealed. Every entry in it is signed, so it cannot be altered without that showing,
but whoever reads the file reads the lab.

The key is sealed with AES-256-GCM under a key stretched from the passphrase by PBKDF2 (600,000
rounds of SHA-256). Nothing remembers the passphrase. `restore` is refused once a device is in a
lab: one key on two devices writes two histories the lab cannot tell apart.

## The window's side

A window does not always share a process with the lab. It reaches one through a `LabSource`: the lab
as plain data, to be told when it changes, and one of a fixed list of things to be done.

```ts
import { ACTIONS, perform, sourceOf } from "@biolibs/bionet-client";

const source = sourceOf(lab);                 // a lab in this process
source.snapshot();                            // the same object until something changes
await source.act("adjust", { item: tube, by: -1 });   // { ok: true, result } or { ok: false, error }

await perform(lab, "close");                  // { ok: false, ... }: not on the list, so refused
```

`perform` is the door for a lab in another process: it does only what is in `ACTIONS`.

## Testing

`test/client.test.ts` runs two devices against the real peer from `@biolibs/bionet-peer`, in process:
founding offline, joining, live changes, a network that goes away and comes back, refusals, removal,
publishing, and reopening from disk.

## License

MIT
