# @biolibs/bionet-peer

A lab's web peer: the member of a lab's network that holds no key.

Members work on their own devices, often offline. For them to agree, something has to be there when
every laptop is closed. A peer keeps a copy of the lab's signed log, passes changes between members
who are never online together, and serves the inventory a member publishes.

It cannot sign, so it cannot forge an entry or an inventory. The worst it can do is withhold them or
serve old ones.

## Install

```bash
npm install @biolibs/bionet-peer ws
```

## On a web server

```ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { WS_OPTIONS, attachPeer, createPeer, filePeerStore, serveInventory } from "@biolibs/bionet-peer";

const store = filePeerStore("./data");
const peer = createPeer({ lab: process.env.BIONET_LAB ?? null, origin: "https://lab-wren.onrender.com", store });

const server = createServer((request, response) => {
  if (serveInventory(request, response, store)) return;   // /.well-known/bionet.json, once published
  response.writeHead(404).end();
});
attachPeer(server, new WebSocketServer(WS_OPTIONS), peer);  // members' apps connect to /sync
server.listen(3000);
```

Nothing here imports `ws` or a web framework: the server and the socket server are handed in, so the
same code sits beside Next, Express or a bare `node:http` server.

## What it will and will not do

| | |
|---|---|
| **Reading is guarded** | Before it sends anybody an entry, the other side signs a number the peer just made up, with a key on the roster. A lab's logs hold every tube and who took what |
| **Writing is not** | Entries are signed by their authors, and nothing is kept from a key the roster has never heard of |
| **It serves one lab** | The one whose ID it is given. With `null` it turns everybody away, since otherwise whoever connected first could found "the lab" |
| **It passes changes on** | To every other member who is connected, as it keeps them |
| **It cuts off a removed member** | The moment the entry that removes them arrives |
| **It publishes for members only** | An inventory signed by a roster key, naming the peer's own address, newer than the one it replaces |
| **Its store is a cache** | Members hold the whole log and send it again |

## Without a network

```ts
import { createPeer, loopback, memoryPeerStore } from "@biolibs/bionet-peer";

const network = loopback(createPeer({ lab, origin, store: memoryPeerStore() }));
// hand network.WebSocket to a device where it would take WebSocket
network.down();   // open connections close, new ones fail
network.up();
```

That is how a device and a peer are tested with no sockets, and how a page can run a whole lab for
somebody to try.

## Testing

`test/peer.test.ts` speaks the protocol by hand, to check what a well-behaved device never tries.
`@biolibs/bionet-client`'s tests run whole devices against it.

## License

MIT
