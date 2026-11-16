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

## Everything a member can do is one list

`ACTIONS` in `source.ts` is the whole of what a window may ask for: saying who is at the device, founding or joining, the roster, parts and tubes, places and where a tube is, recording a run at the bench, publishing, and backing up. A tool or a scene does not get a way of its own into the lab. It asks for one of these, so a new kind of window adds no new power.

## The key can be kept somewhere else

The design gives each device its own key and never moves one. The exception is loss: a lab with one member and one device ends when the device does, and the real Wren Lab was exactly that. So a key can be sealed under a passphrase into a small document, and opened on a new device.

Two things keep that from undoing the rest. A window is handed only the sealed text, so the rule that the window never sees the key still holds. And `restore` is refused once a device is in a lab: a backup is for a device standing in for a lost one, and a key in use on two devices at once writes two histories under one name. A restored device joins as usual, is sent its own old log by the peer, and carries on from where that stopped.

A key alone does not bring a lab back; the log does, and a device that has lost its copy has to get the log from somewhere. If the lab has a peer that still holds it, joining is enough. If it has none, or the peer has lost it, `exportLab` is the other source: every signed entry in one file. It is checked on the way in exactly as entries from a peer are, and a copy is not believed about which lab it is of until its own entries have founded that lab. A device without a roster key can import a copy and read the lab, and cannot change it.

The fingerprint written on the outside of a backup is not sealed, so it is checked against the key inside before the key is used.

## Source layout

```
packages/bionet-client/src/
  lab.ts       the device: Lab, and the plain-data snapshot a window draws
  link.ts      the connection to the web peer, which is allowed to fail
  source.ts    the narrow way a window reaches a lab
  backup.ts    the device's key, sealed under a passphrase
  store.ts     the interfaces for storage and key keeping, with in-memory versions
  sqlite.ts    storage in a SQLite file
```
