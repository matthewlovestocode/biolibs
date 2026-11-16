/**
 * @packageDocumentation
 * `@biolibs/bionet-peer`: a lab's web peer, the member of a lab's network that holds no key.
 *
 * Members work on their own devices, often offline. For them to agree, something has to be there
 * when every laptop is closed. A peer is that: it keeps a copy of the lab's signed log, passes
 * changes between members who are never online together, and serves the inventory a member
 * publishes. It cannot sign, so it cannot change the lab.
 *
 * - `peer.ts` — what it does with a connection, whatever carries it
 * - `store.ts` — where it keeps things: in memory, or in a folder
 * - `serve.ts` — putting it on a web server
 * - `loopback.ts` — reaching it without a network, for tests and for demos
 */
export * from "./peer.js";
export * from "./store.js";
export * from "./serve.js";
export * from "./loopback.js";
