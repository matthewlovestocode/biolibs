# @biolibs/bionet-client

One device in one lab: its key, its copy of the lab's signed log, everything a member can do, and the connection to the lab's web peer. It works with no network and syncs when there is one.

```ts
import { Lab, memoryKeys, memoryStore, sourceOf } from "@biolibs/bionet-client";

const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
await lab.setPerson("Ada");
await lab.found({ name: "The Wren Lab" });           // works at once, with no peer anywhere

await lab.addPart({ name: "f1", sequence: "GGATCACAGTCTACACTGCTCACTCC" });
const tube = await lab.addItem({ part: lab.snapshot().lab!.parts[0]!.checksum, amount: 10, unit: "µL" });
await lab.adjust({ item: tube, by: -3 });
lab.snapshot().lab!.items[0]!.amount;                 // 7

await sourceOf(lab).act("adjust", { item: tube, by: -1 });   // { ok: true, result: undefined }
```

## An application with the edges left open

`Lab` is a whole lab application without a window. What it does not decide is where things live, because that depends on the device: where entries are kept (`LabStore`), where the private key is (`KeyKeeper`), and what opens a socket. A desktop app hands it a SQLite file and the system's keychain; a test hands it memory. The same class runs behind both.

SQLite is its own entry point, `@biolibs/bionet-client/sqlite`, because it needs Node, and importing the rest of the package into a browser must not drag it in. It is loaded at run time and not imported, since tools that bundle code do not all know yet that `node:sqlite` is part of Node.

## Nothing waits for the network

Every action becomes a signed entry in this device's own log, is kept, and is offered to the peer if there is one. The connection is allowed to fail: it says how it is going, and reconnects on its own, waiting longer each time. An entry counts as sent only over a connection that is open; counting it as delivered because it was written into a socket that had already closed would leave it unsent and reported as sent.

## A change is tried before it is written

A log is forever. So an action is merged against the lab first, and one the lab would refuse — a sequence that is not one, an item that does not exist, a change to the roster by somebody who is not a keeper — is turned down with the reason and never signed.

## The way a window reaches a lab

A window does not always share a process with the lab it shows. In a desktop app the lab lives where the key and the files are, and the window is deliberately given neither. So anything that draws a lab reaches it through `LabSource`: the lab as plain data, being told when it changes, and one of a fixed list of things to be done.

`sourceOf(lab)` is that for a lab in the same process. `perform(lab, action, payload)` is the door for a lab somewhere else, and it does only what is in `ACTIONS`: a window that has been tricked can still do no more than a person at it could.

`snapshot()` returns the same object until something changes, so it can be compared by identity, which is what React's external-store hook needs.

## Source layout

```
packages/bionet-client/src/
  lab.ts       the device: Lab, and the plain-data snapshot a window draws
  link.ts      the connection to the web peer, which is allowed to fail
  source.ts    the narrow way a window reaches a lab
  store.ts     the interfaces for storage and key keeping, with in-memory versions
  sqlite.ts    storage in a SQLite file
```
