/**
 * What a peer holds: the lab's entries, and the inventory a member last asked it to publish.
 *
 * Nothing here decides what to keep — `takeEntries` in `@biolibs/bionet` does that — a store only
 * remembers. And what it remembers is a cache: every member's device holds the whole log and sends
 * it again, so a peer that loses its store loses nothing but time.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isSignedEntry, isSignedInventory, type SignedEntry, type SignedInventory } from "@biolibs/bionet";

/** Where a peer keeps things. */
export interface PeerStore {
  /** Every entry held. The peer reads this and never writes to it except through `append`. */
  readonly held: readonly SignedEntry[];
  /** Keep more entries. */
  append(entries: readonly SignedEntry[]): void;
  /** The inventory to serve, or `null` if no member has published one. */
  inventory(): SignedInventory | null;
  /** Serve this inventory from now on. */
  publish(signed: SignedInventory): void;
}

/**
 * A store that lives in memory and is gone when the process is.
 *
 * @returns The store.
 */
export function memoryPeerStore(): PeerStore {
  const held: SignedEntry[] = [];
  let inventory: SignedInventory | null = null;
  return {
    held,
    append: (entries) => { held.push(...entries); },
    inventory: () => inventory,
    publish: (signed) => { inventory = signed; },
  };
}

/**
 * A store kept in a folder: the entries one to a line in a file that is only ever added to, and the
 * published inventory beside it.
 *
 * @param dir - The folder. It is made if it is not there.
 * @returns The store, with whatever the folder already held read back.
 */
export function filePeerStore(dir: string): PeerStore {
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, "log.jsonl");
  const inventoryPath = join(dir, "inventory.json");

  const held: SignedEntry[] = [];
  if (existsSync(logPath)) {
    for (const line of readFileSync(logPath, "utf8").split("\n")) {
      if (line === "") continue;
      try {
        const entry: unknown = JSON.parse(line);
        if (isSignedEntry(entry)) held.push(entry);
      } catch {
        // A torn last line from a crash mid-write. Whoever sent that entry will send it again.
      }
    }
  }

  let inventory: SignedInventory | null = null;
  if (existsSync(inventoryPath)) {
    try {
      const read: unknown = JSON.parse(readFileSync(inventoryPath, "utf8"));
      if (isSignedInventory(read)) inventory = read;
    } catch {
      // Unreadable is the same as absent: a member will publish again.
    }
  }

  return {
    held,
    append(entries) {
      if (entries.length === 0) return;
      appendFileSync(logPath, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""));
      held.push(...entries);
    },
    inventory: () => inventory,
    publish(signed) {
      writeFileSync(inventoryPath, `${JSON.stringify(signed, null, 1)}\n`);
      inventory = signed;
    },
  };
}
