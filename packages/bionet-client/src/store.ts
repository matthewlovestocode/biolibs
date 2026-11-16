/**
 * What a device keeps: the lab's entries, and a few settings.
 *
 * The entries are the truth and everything shown is worked out from them, so a store has no table of
 * items or amounts to fall out of step. Lose it, and the lab's web peer or any other member hands
 * every entry back. Where it lives depends on the device, so it is an interface: a SQLite file on a
 * desktop (`@biolibs/bionet-client/sqlite`), memory in a test, whatever a browser offers.
 */
import type { SignedEntry } from "@biolibs/bionet";

/** Where a device keeps things. */
export interface LabStore {
  /** Every entry held. */
  entries(): SignedEntry[];
  /** Keep more entries, each with its ID. Adding one already held does nothing. */
  add(entries: readonly { id: string; signed: SignedEntry }[]): void;
  /** A setting, or `null` if it was never set. */
  setting(name: string): string | null;
  /** Set a setting. `null` forgets it. */
  set(name: string, value: string | null): void;
  /** Finish with the store. */
  close(): void;
}

/** Where a device's private key lives. A desktop app gives one backed by the system's keychain. */
export interface KeyKeeper {
  /** The key as `exportSigningKey` wrote it, or `null` if this device has none yet. */
  load(): Promise<string | null>;
  /** Keep a new key. */
  save(exported: string): Promise<void>;
}

/**
 * A store that lives in memory and is gone when the process is.
 *
 * @returns The store.
 */
export function memoryStore(): LabStore {
  const held = new Map<string, SignedEntry>();
  const settings = new Map<string, string>();
  return {
    entries: () => [...held.values()],
    add: (entries) => { for (const { id, signed } of entries) if (!held.has(id)) held.set(id, signed); },
    setting: (name) => settings.get(name) ?? null,
    set: (name, value) => { if (value === null) settings.delete(name); else settings.set(name, value); },
    close: () => {},
  };
}

/**
 * A key kept in memory, for tests and for trying things out. A real device keeps its key somewhere
 * the operating system guards.
 *
 * @returns The keeper.
 */
export function memoryKeys(): KeyKeeper {
  let held: string | null = null;
  return { load: async () => held, save: async (exported) => { held = exported; } };
}
