/**
 * A connection to a peer that never leaves the process.
 *
 * It gives back something shaped like the `WebSocket` a device opens, wired straight to a peer in
 * the same program. That is how a device and a peer are tested with no network, and how a page can
 * run a whole lab — several devices and their peer — for somebody to try.
 */
import type { Peer } from "./peer.js";

/** A switch for the pretend network. */
export interface Loopback {
  /** Hand this to a device where it would take `WebSocket`. */
  WebSocket: typeof globalThis.WebSocket;
  /** Take the network away: open connections close, and new ones fail. */
  down(): void;
  /** Bring it back. */
  up(): void;
  /** How many connections are open. */
  readonly open: number;
}

/**
 * Make an in-process way to reach a peer.
 *
 * @param peer - The peer.
 * @returns A `WebSocket` stand-in that connects to it, and a switch to cut the network.
 *
 * @example
 * ```ts
 * import { createPeer, loopback, memoryPeerStore } from "@biolibs/bionet-peer";
 *
 * const peer = createPeer({ lab, origin: "https://lab.example", store: memoryPeerStore() });
 * const network = loopback(peer);
 * // new Lab({ store, keys, WebSocket: network.WebSocket })
 * ```
 */
export function loopback(peer: Peer): Loopback {
  let isUp = true;
  const live = new Set<{ end(): void }>();
  const later = (work: () => void): void => { setTimeout(work, 0); };

  class Socket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readyState = 0;
    private readonly heard: Record<string, ((event: { data?: string }) => void)[]> = { message: [], close: [], error: [], open: [] };
    private toPeer: ((text: string) => void)[] = [];
    private peerEnded: (() => void)[] = [];

    constructor(readonly url: string) {
      later(() => {
        if (!isUp) { this.end(); return; }
        this.readyState = 1;
        live.add(this);
        peer.connect({
          send: (text) => later(() => { if (this.readyState === 1) this.emit("message", { data: text }); }),
          close: () => later(() => this.end()),
          onMessage: (listener) => { this.toPeer.push(listener); },
          onClose: (ended) => { this.peerEnded.push(ended); },
        });
        this.emit("open", {});
      });
    }

    addEventListener(type: string, listener: (event: { data?: string }) => void): void {
      (this.heard[type] ??= []).push(listener);
    }

    send(text: string): void {
      if (this.readyState !== 1) return;
      later(() => { if (this.readyState === 1) for (const listener of this.toPeer) listener(text); });
    }

    close(): void {
      later(() => this.end());
    }

    end(): void {
      if (this.readyState === 3) return;
      this.readyState = 3;
      live.delete(this);
      for (const ended of this.peerEnded) ended();
      this.emit("close", {});
    }

    private emit(type: string, event: { data?: string }): void {
      for (const listener of this.heard[type] ?? []) listener(event);
    }
  }

  return {
    WebSocket: Socket as unknown as typeof globalThis.WebSocket,
    down() { isUp = false; for (const socket of [...live]) socket.end(); },
    up() { isUp = true; },
    get open() { return live.size; },
  };
}
