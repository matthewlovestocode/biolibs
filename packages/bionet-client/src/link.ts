/**
 * A device's connection to the lab's web peer.
 *
 * It is allowed to fail. A device works with no peer at all; this only carries entries to and from
 * the lab's address when it can, says how that is going, and keeps trying when it cannot.
 *
 * The exchange is the one `@biolibs/bionet`'s `sync.ts` describes. The peer sends a number, this
 * signs it with the device's key, and if that key is on the lab's roster the two swap whatever the
 * other lacks. A peer that holds nothing knows no members, so on being refused this sends what it
 * holds and asks again: that is how a lab's first entries get there at all.
 */
import { entriesBeyond, haveOf, readMessage, signHello, type Have, type SignedEntry, type SignedInventory,
         type SyncMessage } from "@biolibs/bionet";
import type { SigningKey } from "@biolibs/opencloning";

/**
 * How the connection is going. `waiting` means the peer answered and this device's key is not on the
 * roster it holds.
 */
export type LinkStatus = "offline" | "connecting" | "waiting" | "syncing" | "synced";

/** What a link needs. */
export interface LinkOptions {
  /** The peer's socket address. */
  url: string;
  /** The lab's ID. */
  lab: string;
  /** This device's key. */
  key: SigningKey;
  /** What this device holds, now. */
  held: () => readonly SignedEntry[];
  /** Hand over entries that arrived. Resolves to how many were kept. */
  take: (entries: readonly unknown[]) => Promise<number>;
  /** Called whenever the status, the problem or what is pending changes. */
  onChange: () => void;
  /** Something to open sockets with. Defaults to the runtime's own `WebSocket`. */
  WebSocket?: typeof globalThis.WebSocket;
}

/** How many entries go in one message. */
const BATCH = 500;

/**
 * The connection from one device to its lab's web peer.
 *
 * `Lab` makes and runs one of these; it is exported for anything that wants to drive the exchange
 * itself. Give it the peer's address, the lab, the device's key and a way to read and add to what
 * the device holds, then `start()` it. It reconnects on its own, waiting longer each time.
 */
export class PeerLink {
  status: LinkStatus = "offline";
  /** What is in the way, said for a person, or `null`. */
  problem: string | null = null;
  /** When this device and the peer last had the same entries. */
  lastSynced: string | null = null;
  /** What the peer holds, as far as this knows. `null` until the peer has said. */
  peerHas: Have | null = null;

  private ws: WebSocket | null = null;
  private stopped = true;
  private delay = 1_000;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private turn: Promise<unknown> = Promise.resolve();
  private publishing: ((answer: { ok: boolean; reason: string | null }) => void) | null = null;
  private pushNow: () => void = () => {};
  private sendInventory: (signed: SignedInventory) => void = () => {};

  constructor(private readonly options: LinkOptions) {}

  /** How many entries held here the peer is not known to have. */
  get pending(): number {
    const held = this.options.held();
    return this.peerHas === null ? held.length : entriesBeyond(held, this.peerHas).length;
  }

  /** Start, and keep trying. */
  start(): void {
    this.stopped = false;
    this.open();
  }

  /** Stop, and stop trying. */
  stop(): void {
    this.stopped = true;
    if (this.retry !== null) clearTimeout(this.retry);
    this.ws?.close();
    this.ws = null;
    this.pushNow = () => {};
    this.sendInventory = () => {};
    this.say("offline", null);
  }

  /** Send the peer whatever it lacks. Called whenever something is written on this device. */
  push(): void {
    this.pushNow();
  }

  /**
   * Ask the peer to publish an inventory.
   *
   * @param signed - The inventory, signed by this device.
   * @returns Whether it was published, and why not.
   */
  publish(signed: SignedInventory): Promise<{ ok: boolean; reason: string | null }> {
    if (this.status !== "synced" && this.status !== "syncing") {
      return Promise.resolve({ ok: false, reason: "Not connected to the lab's peer as a member." });
    }
    return new Promise((resolve) => {
      this.publishing = resolve;
      this.sendInventory(signed);
      setTimeout(() => {
        if (this.publishing === resolve) {
          this.publishing = null;
          resolve({ ok: false, reason: "The lab's peer did not answer." });
        }
      }, 15_000);
    });
  }

  private say(status: LinkStatus, problem: string | null = this.problem): void {
    this.status = status;
    this.problem = problem;
    this.options.onChange();
  }

  private settled(): void {
    this.lastSynced = new Date().toISOString();
    this.say("synced", null);
  }

  private open(): void {
    if (this.stopped) return;
    const { lab, key, held, take } = this.options;
    const Socket = this.options.WebSocket ?? globalThis.WebSocket;
    this.say("connecting", null);
    let ws: WebSocket;
    try {
      ws = new Socket(this.options.url);
    } catch (cause) {
      this.say("offline", `That is not an address a peer can be reached at: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }
    this.ws = ws;
    let nonce = "";
    let welcomed = false;
    let pushedEverything = false;
    const send = (message: SyncMessage): void => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); };
    const sendEntries = (entries: readonly SignedEntry[]): void => {
      for (let at = 0; at < entries.length; at += BATCH) send({ type: "entries", entries: entries.slice(at, at + BATCH) });
    };
    const hello = async (): Promise<void> => send({ type: "hello", have: haveOf(held()), signature: await signHello(key, lab, nonce) });

    this.pushNow = () => {
      // Only over a connection that is open. Counting an entry as delivered because it was written
      // into a socket that had already closed would leave it unsent and reported as sent.
      if (!welcomed || this.peerHas === null || ws.readyState !== ws.OPEN) return;
      const lacking = entriesBeyond(held(), this.peerHas);
      if (lacking.length === 0) return;
      this.peerHas = haveOf(held());           // what it will have, once it has kept these
      this.say("syncing");
      sendEntries(lacking);
    };
    this.sendInventory = (signed) => send({ type: "inventory", signed });

    ws.addEventListener("message", (event) => {
      this.turn = this.turn.then(async () => {
        let message: SyncMessage;
        try {
          message = readMessage(String(event.data));
        } catch {
          return;                              // a peer that says something else is ignored, not obeyed
        }
        if (message.type === "challenge") {
          if (message.lab !== lab) {
            this.say("waiting", "That peer serves a different lab.");
            return;
          }
          nonce = message.nonce;
          await hello();
        } else if (message.type === "refused") {
          if (message.code === "not-a-member") {
            if (welcomed) {
              welcomed = false;
              this.say("waiting", message.reason);
            } else if (!pushedEverything && held().length > 0) {
              pushedEverything = true;
              sendEntries(held());
            } else {
              this.say("waiting", "This device's key is not on the roster the lab's peer holds yet. A keeper has to add it and sync.");
              // Ask again in a few seconds, on the same connection: the keeper may be doing it now.
              setTimeout(() => { if (this.ws === ws && !welcomed) void hello(); }, 4_000);
            }
          } else if (message.code === "bad-inventory" && this.publishing !== null) {
            this.publishing({ ok: false, reason: message.reason });
            this.publishing = null;
          } else {
            this.say(this.status, message.reason);
          }
        } else if (message.type === "welcome") {
          welcomed = true;
          this.delay = 1_000;
          this.peerHas = message.have;
          this.say("syncing", null);
          this.pushNow();
          if (this.pending === 0) this.settled();
        } else if (message.type === "entries") {
          await take(message.entries);
          if (welcomed && this.peerHas !== null) {
            // Whatever the peer just sent, it has. Count it, so it is not offered straight back.
            for (const { entry } of message.entries) {
              this.peerHas[entry.author] = Math.max(this.peerHas[entry.author] ?? -1, entry.seq);
            }
            if (this.pending === 0) this.settled();
          }
        } else if (message.type === "kept") {
          if (!welcomed) await hello();        // the peer now knows the roster; ask again
          else if (this.pending === 0) this.settled();
        } else if (message.type === "published" && this.publishing !== null) {
          this.publishing({ ok: true, reason: null });
          this.publishing = null;
        }
      });
    });
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.pushNow = () => {};
      this.sendInventory = () => {};
      if (this.publishing !== null) {
        this.publishing({ ok: false, reason: "The connection to the lab's peer was lost." });
        this.publishing = null;
      }
      if (this.stopped) return;
      this.say("offline", this.status === "waiting" ? this.problem : null);
      this.retry = setTimeout(() => this.open(), this.delay);
      this.delay = Math.min(this.delay * 2, 30_000);
    });
    ws.addEventListener("error", () => {});    // the close that follows is what is acted on
  }
}
