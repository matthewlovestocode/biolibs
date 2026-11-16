/**
 * Getting entries from one machine to another, and deciding who may have them.
 *
 * `merge.ts` works a lab out from whatever entries it is given. This is how they are given: two
 * machines say how far into each key's log they hold, and each sends the other what it lacks. It
 * does not matter which machine is a member's laptop and which is the lab's web peer; the exchange
 * is the same, and nothing here opens a connection — that is for whatever carries the messages.
 *
 * The one asymmetry is who may read. A lab's logs hold everything: every tube, every amount, who
 * took what. The web peer relays them between members and must not hand them to anybody who asks,
 * so before it sends an entry it makes the other side prove it holds a key on the roster, by signing
 * a number the peer just made up. Writing needs no such proof. An entry is signed by its author and
 * `mergeLog` already refuses what the roster does not allow, so a stranger who pushes entries gets
 * nothing kept and learns nothing.
 */
import { signUnder, verifyUnder, type DocumentSignature, type SignOptions,
         type SigningKey } from "@biolibs/opencloning";
import { isSignedInventory, verifyInventory } from "./inventory.js";
import { entryId, isSignedEntry, type SignedEntry } from "./log.js";
import { mergeLog, type LabState } from "./merge.js";
import type { SignedInventory } from "./model.js";
import { originMatches } from "./origin.js";

/** What the bytes of a signed hello are for. */
export const HELLO_DOMAIN = "biolibs/bionet peer hello v1";

/** The longest one message may be, as text. */
export const LONGEST_MESSAGE = 8_000_000;

/** How many entries one message may carry. */
export const MOST_ENTRIES = 2_000;

/** How far into each key's log a machine holds: for each key, the last `seq` with no gap before it. */
export type Have = Record<string, number>;

/** One message between two machines. */
export type SyncMessage =
  /** The peer's opening: which lab it serves, and a number to sign. */
  | { type: "challenge"; lab: string; nonce: string }
  /** The answer: the signature over that number, and how much this side holds. */
  | { type: "hello"; signature: DocumentSignature; have: Have }
  /** The hello was from a member. How much the peer holds; what the member lacks follows. */
  | { type: "welcome"; have: Have }
  /** Entries the other side lacks. */
  | { type: "entries"; entries: SignedEntry[] }
  /** How many of the entries just sent were kept. */
  | { type: "kept"; count: number }
  /** A freshly signed public inventory, for the peer to publish. */
  | { type: "inventory"; signed: SignedInventory }
  /** The inventory was published. */
  | { type: "published"; published_at: string }
  /** Something was turned down. `code` is for programs, `reason` for people. */
  | { type: "refused"; code: "not-a-member" | "bad-message" | "bad-inventory"; reason: string };

/**
 * How far into each key's log a set of entries reaches without a gap.
 *
 * @param entries - Entries held.
 * @returns For each key, the last `seq` such that every entry from 0 up to it is present.
 */
export function haveOf(entries: readonly SignedEntry[]): Have {
  const seqs = new Map<string, Set<number>>();
  for (const { entry } of entries) seqs.set(entry.author, (seqs.get(entry.author) ?? new Set()).add(entry.seq));
  const have: Have = {};
  for (const [author, held] of seqs) {
    let last = -1;
    while (held.has(last + 1)) last++;
    if (last >= 0) have[author] = last;
  }
  return have;
}

/**
 * The entries another machine lacks.
 *
 * @param entries - Entries held here.
 * @param have - How far the other machine says it holds.
 * @returns What to send it, each key's log in order.
 */
export function entriesBeyond(entries: readonly SignedEntry[], have: Have): SignedEntry[] {
  return entries.filter(({ entry }) => entry.seq > (have[entry.author] ?? -1))
                .sort((a, b) => (a.entry.author === b.entry.author ? a.entry.seq - b.entry.seq
                                                                   : a.entry.author < b.entry.author ? -1 : 1));
}

/**
 * Answer a peer's challenge: sign the number it made up, for the lab it named.
 *
 * @param key - This device's key.
 * @param lab - The lab's ID, from the challenge.
 * @param nonce - The number, from the challenge.
 * @param options - A name to sign under, and when.
 * @returns The signature to send back in a hello.
 */
export function signHello(key: SigningKey, lab: string, nonce: string, options: SignOptions = {}): Promise<DocumentSignature> {
  return signUnder(HELLO_DOMAIN, { lab, nonce }, key, options);
}

/**
 * Check the answer to a challenge.
 *
 * It settles one thing: whoever sent this holds the private half of the key it names, now. Whether
 * that key may read the lab is `isMember`'s question.
 *
 * @param lab - The lab the challenge named.
 * @param nonce - The number the challenge carried.
 * @param signature - The answer.
 * @returns The key that answered, or `null` if the signature does not hold.
 */
export async function verifyHello(lab: string, nonce: string, signature: DocumentSignature): Promise<string | null> {
  const [check] = await verifyUnder(HELLO_DOMAIN, { lab, nonce }, [signature]);
  return check!.ok ? signature.public_key : null;
}

/**
 * Whether a key may read the lab: it is on the roster and has not been removed.
 *
 * @param state - The lab.
 * @param key - The key.
 * @returns Whether to send it entries.
 */
export function isMember(state: LabState, key: string): boolean {
  return state.roster.some((one) => one.key === key && one.removed === null);
}

/**
 * Take entries from another machine, keeping the ones that belong.
 *
 * An entry is kept if, merged with what is already held, it finds a place in the lab and its author
 * is or was on the roster. Entries from keys the roster has never heard of are dropped, which is
 * what stops a stranger filling a peer's disk, and so are entries still waiting on others — whoever
 * sent them will send them again along with what they were waiting for.
 *
 * @param lab - The lab's ID.
 * @param held - Entries already held.
 * @param incoming - What arrived. Anything that is not an entry is ignored.
 * @returns The entries worth keeping that were not already held, and the lab with them merged in.
 */
export async function takeEntries(lab: string, held: readonly SignedEntry[], incoming: readonly unknown[]): Promise<{
  kept: SignedEntry[]; state: LabState;
}> {
  const merged = await mergeLog([...held, ...incoming], { lab });
  const known = new Set(merged.roster.map((one) => one.key));
  const already = new Set(await Promise.all(held.map((one) => entryId(one.entry))));
  const kept = merged.entries.filter((one) => known.has(one.signed.entry.author) && !already.has(one.id))
                             .map((one) => one.signed);
  return { kept, state: await mergeLog([...held, ...kept], { lab }) };
}

/**
 * Decide whether a peer should publish an inventory a member sent it.
 *
 * The peer cannot sign, so the public inventory has to come from a member. It is published only if
 * a key on the roster signed it, it names the address the peer serves it from, and it is newer than
 * the one it would replace.
 *
 * @param state - The lab.
 * @param signed - What the member sent.
 * @param origin - The address this peer serves from.
 * @param current - What is published now, if anything.
 * @returns `null` if it should be published, or why not.
 */
export async function inventoryProblem(state: LabState, signed: unknown, origin: string,
                                       current: SignedInventory | null = null): Promise<string | null> {
  if (!isSignedInventory(signed)) return "That is not a signed inventory.";
  const checks = await verifyInventory(signed);
  if (!checks.some((check) => check.ok && isMember(state, check.public_key))) {
    return "No key on this lab's roster signed that inventory.";
  }
  if (!originMatches(signed.inventory.lab.origin, origin)) return "That inventory names a different address from this one.";
  if (current !== null && !(signed.inventory.published_at > current.inventory.published_at)) {
    return "That inventory is not newer than the one already published.";
  }
  return null;
}

/**
 * Read a message that came off the wire.
 *
 * @param text - What arrived.
 * @returns The message.
 * @throws If it is too long, not JSON, or not a message this understands.
 */
export function readMessage(text: string): SyncMessage {
  if (text.length > LONGEST_MESSAGE) throw new Error("That message is longer than will be read.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("That message is not JSON.");
  }
  const held = value as Record<string, unknown> | null;
  const have = (given: unknown): given is Have => typeof given === "object" && given !== null && !Array.isArray(given)
    && Object.values(given).every((seq) => Number.isInteger(seq) && (seq as number) >= 0);
  const words = (given: unknown): given is string => typeof given === "string" && given.length <= 2_000;
  if (typeof held !== "object" || held === null) throw new Error("That is not a message.");
  switch (held["type"]) {
    case "challenge": if (words(held["lab"]) && words(held["nonce"])) return held as SyncMessage; break;
    case "hello": if (typeof held["signature"] === "object" && held["signature"] !== null && have(held["have"])) return held as SyncMessage; break;
    case "welcome": if (have(held["have"])) return held as SyncMessage; break;
    case "entries":
      if (Array.isArray(held["entries"]) && held["entries"].length <= MOST_ENTRIES && held["entries"].every(isSignedEntry)) return held as SyncMessage;
      break;
    case "kept": if (Number.isInteger(held["count"])) return held as SyncMessage; break;
    case "inventory": if (typeof held["signed"] === "object" && held["signed"] !== null) return held as SyncMessage; break;
    case "published": if (words(held["published_at"])) return held as SyncMessage; break;
    case "refused": if (words(held["code"]) && words(held["reason"])) return held as SyncMessage; break;
  }
  throw new Error("That is not a message this understands.");
}
