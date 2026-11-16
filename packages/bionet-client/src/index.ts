/**
 * @packageDocumentation
 * `@biolibs/bionet-client`: one device in one lab.
 *
 * `@biolibs/bionet` says what a lab's signed log means. This is the thing that keeps one: a device's
 * key, its copy of the log, every action a member can take, and the connection to the lab's web
 * peer. It works with no network and syncs when there is one.
 *
 * It is an application with the edges left open. Where entries are kept, where the key lives and
 * what opens a socket are handed in, so the same `Lab` runs behind a desktop window, in a browser or
 * in a test:
 *
 * - `lab.ts` — the device: `Lab`, and the plain-data snapshot a window draws
 * - `link.ts` — the connection to the web peer, which is allowed to fail
 * - `source.ts` — the narrow way a window reaches a lab, in this process or another
 * - `store.ts` — the interfaces for storage and key keeping, with in-memory versions
 * - `sqlite.ts` — storage in a SQLite file, at `@biolibs/bionet-client/sqlite` because it needs Node
 */
export * from "./lab.js";
export * from "./link.js";
export * from "./store.js";
export * from "./source.js";
