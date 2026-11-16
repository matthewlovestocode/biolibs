/**
 * The peer itself: what it does with each connection, whatever carries the connection.
 *
 * It does what any member's device does — takes entries, keeps the ones that belong, sends each side
 * what it lacks — and two things only it does: it is there when every laptop is closed, and it holds
 * the inventory the lab shows the world. It has no key. It cannot sign, so it cannot forge an entry
 * or an inventory; the worst it can do is withhold them or serve old ones.
 *
 * **Reading is guarded and writing is not.** A lab's logs hold every tube and who took what, so
 * before the peer sends anybody an entry the other side has to prove it holds a key on the roster,
 * by signing a number the peer just made up. Anybody may send entries, because an entry is signed by
 * its author and nothing is kept from a key the roster has never heard of.
 */
import { LONGEST_MESSAGE, entriesBeyond, haveOf, inventoryProblem, isMember, mergeLog, readMessage, takeEntries,
         verifyHello, type SignedEntry, type SyncMessage } from "@biolibs/bionet";
import type { PeerStore } from "./store.js";

/** One connection, as little of it as the peer needs. Anything that can carry text will do. */
export interface PeerSocket {
  /** Send some text to the other side. */
  send(text: string): void;
  /** Close the connection. */
  close(): void;
  /** Be told of each message that arrives. */
  onMessage(heard: (text: string) => void): void;
  /** Be told when the connection ends. */
  onClose(ended: () => void): void;
}

/** What a peer needs to know about the lab it serves. */
export interface PeerOptions {
  /**
   * The lab's ID: the ID of its founding entry. With `null` the peer turns every connection away.
   * A peer serves one lab it was told about — otherwise whoever connected first could found "the lab".
   */
  lab: string | null;
  /** The web address the lab's inventory is published from. An inventory naming another is refused. */
  origin: string;
  /** Where to keep things. */
  store: PeerStore;
  /** Something that makes a number nobody could guess. Defaults to 16 random bytes in hex. */
  nonce?: () => string;
}

/** A peer. */
export interface Peer {
  /** Take a new connection. */
  connect(socket: PeerSocket): void;
  /** How many connections have proved they are members. */
  readonly members: number;
}

/** How many entries go in one message. */
const BATCH = 500;

const randomNonce = (): string =>
  [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * Make a peer for one lab.
 *
 * @param options - Which lab, the address it publishes from, and where to keep things.
 * @returns The peer. Hand it each connection as it arrives.
 *
 * @example
 * ```ts
 * import { createPeer, memoryPeerStore } from "@biolibs/bionet-peer";
 *
 * const peer = createPeer({ lab, origin: "https://lab-wren.onrender.com", store: memoryPeerStore() });
 * peer.connect(socket);   // each time somebody connects
 * ```
 */
export function createPeer(options: PeerOptions): Peer {
  const { lab, origin, store } = options;
  const nonceOf = options.nonce ?? randomNonce;
  /** Connections that have proved membership, with the key each proved it with. */
  const members = new Map<PeerSocket, string>();
  // One message at a time, across every connection, so that two cannot both append what they kept
  // against the same picture of what is held.
  let turn: Promise<unknown> = Promise.resolve();
  const inTurn = (work: () => Promise<void>): void => { turn = turn.then(work, work); };

  const say = (socket: PeerSocket, message: SyncMessage): void => socket.send(JSON.stringify(message));
  const sendEntries = (socket: PeerSocket, entries: readonly SignedEntry[]): void => {
    for (let at = 0; at < entries.length; at += BATCH) say(socket, { type: "entries", entries: entries.slice(at, at + BATCH) });
  };

  return {
    get members() { return members.size; },
    connect(socket) {
      if (lab === null) {
        say(socket, { type: "refused", code: "bad-message", reason: "This lab has not been founded yet, so its peer holds nothing." });
        socket.close();
        return;
      }
      const nonce = nonceOf();
      socket.onClose(() => { members.delete(socket); });
      socket.onMessage((text) => inTurn(async () => {
        let message: SyncMessage;
        try {
          message = readMessage(text);
        } catch (cause) {
          say(socket, { type: "refused", code: "bad-message", reason: cause instanceof Error ? cause.message : String(cause) });
          return;
        }

        if (message.type === "hello") {
          const key = await verifyHello(lab, nonce, message.signature);
          if (key === null || !isMember(await mergeLog(store.held, { lab }), key)) {
            say(socket, { type: "refused", code: "not-a-member", reason: "That key is not on this lab's roster, so it is not sent the lab's entries." });
            return;
          }
          members.set(socket, key);
          say(socket, { type: "welcome", have: haveOf(store.held) });
          sendEntries(socket, entriesBeyond(store.held, message.have));
        } else if (message.type === "entries") {
          const { kept, state } = await takeEntries(lab, store.held, message.entries);
          store.append(kept);
          say(socket, { type: "kept", count: kept.length });
          // Pass them on to every other member who is connected, which is what keeps two open apps in
          // step. Somebody those very entries removed is a member no longer, and is sent nothing more.
          for (const [other, key] of members) {
            if (!isMember(state, key)) {
              members.delete(other);
              say(other, { type: "refused", code: "not-a-member", reason: "This key has been removed from the lab's roster." });
            } else if (other !== socket) {
              sendEntries(other, kept);
            }
          }
        } else if (message.type === "inventory") {
          if (!members.has(socket)) {
            say(socket, { type: "refused", code: "not-a-member", reason: "Only a member who has said hello may publish." });
            return;
          }
          const problem = await inventoryProblem(await mergeLog(store.held, { lab }), message.signed, origin, store.inventory());
          if (problem !== null) {
            say(socket, { type: "refused", code: "bad-inventory", reason: problem });
            return;
          }
          store.publish(message.signed);
          say(socket, { type: "published", published_at: message.signed.inventory.published_at });
        } else {
          say(socket, { type: "refused", code: "bad-message", reason: "That is not something to send a peer." });
        }
      }));
      say(socket, { type: "challenge", lab, nonce });
    },
  };
}

/** The longest message a peer will read, for whatever carries the connection to enforce. */
export const LONGEST_PEER_MESSAGE = LONGEST_MESSAGE;
