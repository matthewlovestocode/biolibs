# @biolibs/bionet-peer

A lab's web peer: the member of a lab's network that holds no key. It keeps a copy of the lab's signed log, passes changes between members who are never online together, and serves the inventory a member publishes.

```ts
import { createPeer, loopback, memoryPeerStore } from "@biolibs/bionet-peer";

const store = memoryPeerStore();
const peer = createPeer({ lab, origin: "https://lab-wren.onrender.com", store });

const network = loopback(peer);     // reach it without a network, for a test or a demo
network.WebSocket;                  // hand this to a device where it would take WebSocket
network.down();                     // open connections close, and new ones fail
```

## Why a lab needs one

Members work on their own devices, often offline, and two of them may never be online at the same moment. Something has to be there when every laptop is closed. A peer is that, and it is deliberately the least it can be: it stores and forwards, and it cannot sign. A peer that is broken into can withhold the lab or serve an old copy of it. It cannot forge an entry or an inventory, because it has nothing to forge one with.

## Reading is guarded, writing is not

A lab's logs hold every tube and who took what, so before the peer sends anybody an entry the other side has to prove it holds a key on the roster, by signing a number the peer just made up. The signature is made under a domain of its own and covers the lab's ID as well as the number, so an answer cannot be replayed against another challenge or another lab.

Writing needs no such proof. An entry is signed by its author, and the peer keeps nothing from a key the roster has never heard of, which is also what stops a stranger filling its disk. This asymmetry is what lets a lab's very first entries arrive: a peer that holds nothing knows no members, so the founder pushes first and is recognised afterwards.

## What else it decides

- **It serves one lab**, the one whose ID it is given. Without that, whoever connected first could found "the lab".
- **It passes changes on** to every other member who is connected, as it keeps them.
- **It cuts off a removed member** the moment the entry that removes them arrives.
- **It publishes for members only**: an inventory signed by a roster key, naming the peer's own address, and newer than the one it replaces.

Every one of these is a rule that must be the same at every lab, which is why the peer is a package and not something each lab writes.

## Its store is a cache

Every member's device holds the whole log and sends it again, so a peer that loses its store loses time and nothing else. `filePeerStore` keeps entries one to a line in a file that is only ever added to, and tolerates a last line torn by a crash.

## Nothing is imported that a host would have to match

`attachPeer` and `serveInventory` put a peer on a web server, but the server and the WebSocket server are handed in, described only by the few things that are used. The same code sits beside Next, Express or a bare `node:http` server.

## Source layout

```
packages/bionet-peer/src/
  peer.ts        what it does with a connection, whatever carries it
  store.ts       where it keeps things: in memory, or in a folder
  serve.ts       putting it on a web server
  loopback.ts    reaching it without a network
```
