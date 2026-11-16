/**
 * Putting a peer on a web server: the `/sync` socket, and the inventory at its well-known path.
 *
 * Nothing here imports a WebSocket library or a web framework. The server and the socket server are
 * handed in, described only by the few things this uses, so the same code sits beside Next, Express
 * or a bare `node:http` server.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Peer, PeerSocket } from "./peer.js";
import { LONGEST_PEER_MESSAGE } from "./peer.js";
import type { PeerStore } from "./store.js";

/** A socket as the `ws` library hands one over, as little of it as is used. */
export interface WsLike {
  readonly readyState: number;
  readonly OPEN: number;
  send(data: string): void;
  close(): void;
  on(event: "message", heard: (data: unknown) => void): unknown;
  on(event: "close" | "error", ended: () => void): unknown;
}

/** A WebSocket server as the `ws` library makes one with `noServer`, as little of it as is used. */
export interface WsServerLike {
  handleUpgrade(request: IncomingMessage, socket: unknown, head: unknown, done: (ws: WsLike) => void): void;
}

/** A web server that can be listened to for upgrades. */
export interface UpgradableServer {
  on(event: "upgrade", heard: (request: IncomingMessage, socket: unknown, head: unknown) => void): unknown;
}

/**
 * Hand a peer a socket from the `ws` library.
 *
 * @param ws - The socket.
 * @returns The same connection, as the peer wants it.
 */
export function fromWs(ws: WsLike): PeerSocket {
  return {
    send: (text) => { if (ws.readyState === ws.OPEN) ws.send(text); },
    close: () => ws.close(),
    onMessage: (heard) => { ws.on("message", (data) => heard(String(data))); },
    onClose: (ended) => { ws.on("close", ended); ws.on("error", ended); },
  };
}

/** The settings to make a `ws` server with, so that it reads no message longer than a peer will. */
export const WS_OPTIONS = { noServer: true, maxPayload: LONGEST_PEER_MESSAGE } as const;

/**
 * Listen on a web server for members' apps.
 *
 * @param server - The web server.
 * @param sockets - A `ws` server made with `WS_OPTIONS`.
 * @param peer - The peer.
 * @param options - `path` is where the socket is (default `/sync`); `elsewhere` is given any upgrade
 *   that is for another path, for whatever else on the server takes them.
 */
export function attachPeer(server: UpgradableServer, sockets: WsServerLike, peer: Peer, options: {
  path?: string; elsewhere?: (request: IncomingMessage, socket: unknown, head: unknown) => void;
} = {}): void {
  const path = options.path ?? "/sync";
  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url ?? "/", "http://peer").pathname !== path) {
      options.elsewhere?.(request, socket, head);
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => peer.connect(fromWs(ws)));
  });
}

/** Where a lab's inventory is asked for. */
export const INVENTORY_PATHS: ReadonlySet<string> = new Set(["/.well-known/bionet.json", "/bionet.json"]);

/**
 * Answer a request for the lab's inventory, if that is what it is and a member has published one.
 *
 * It is served readable from any page: an inventory is published to be read, and says nothing private.
 *
 * @param request - The request.
 * @param response - Where to answer.
 * @param store - The peer's store.
 * @returns Whether it was answered. If not, the request is for whatever else the server does.
 */
export function serveInventory(request: IncomingMessage, response: ServerResponse, store: PeerStore): boolean {
  const published = store.inventory();
  if (published === null || (request.method !== "GET" && request.method !== "HEAD")) return false;
  if (!INVENTORY_PATHS.has(new URL(request.url ?? "/", "http://lab").pathname)) return false;
  response.writeHead(200, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*",
                            "cache-control": "no-store" });
  response.end(request.method === "HEAD" ? undefined : `${JSON.stringify(published, null, 1)}\n`);
  return true;
}
