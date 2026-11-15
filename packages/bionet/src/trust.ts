/**
 * Remembering which key answered for a lab last time.
 *
 * There is no authority in this network, so the first time you fetch a lab's inventory you cannot tell
 * its real key from a convincing stand-in. Write the key down, though, and every visit afterwards is
 * worth something: a key that is the same is the same correspondent, and a key that has **changed** is
 * either a lab that rotated its key or somebody standing where the lab used to be. Which of those it
 * is, only the lab can tell you — but the question gets asked, which is the part that matters.
 *
 * This is deliberately a small, dumb record. It does not decide anything; it reports whether it has
 * seen these keys at this address before. Where the record is kept is the caller's business: a browser
 * might keep it in local storage, a script in a file.
 */

/** Somewhere to keep what has been seen. */
export interface LabMemory {
  /** @param origin - A lab's address. @returns The keys seen there, or null. */
  get(origin: string): string[] | null;
  /** @param origin - A lab's address. @param keys - The keys seen there now. */
  set(origin: string, keys: string[]): void;
}

/** Whether a lab's keys are as they were. */
export type Acquaintance =
  /** Never seen this address before. Nothing is being claimed by that. */
  | "new"
  /** The same keys as last time. */
  | "known"
  /** This address answered before, with other keys. */
  | "changed";

/** What came of looking a lab up. */
export interface Recognition {
  /** How well it is known. */
  how: Acquaintance;
  /** The keys seen before, if any. */
  before: string[];
  /** The keys it is answering with now. */
  now: string[];
}

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((one, at) => one === b[at]);

/**
 * Look a lab up without writing anything down.
 *
 * @param memory - Where keys are remembered.
 * @param origin - The lab's address.
 * @param keys - The fingerprints answering for it now.
 * @returns What is known about it.
 */
export function recognise(memory: LabMemory, origin: string, keys: readonly string[]): Recognition {
  const before = memory.get(origin);
  const now = [...keys].sort();
  if (before === null || before.length === 0) return { how: "new", before: [], now };
  return { how: same(before, now) ? "known" : "changed", before, now };
}

/**
 * Look a lab up and write down what answered.
 *
 * A changed key is recorded like any other, because refusing to update would only mean asking the same
 * question forever. The answer says it changed; what to do about that is not this function's business.
 *
 * @param memory - Where keys are remembered.
 * @param origin - The lab's address.
 * @param keys - The fingerprints answering for it now.
 * @returns What was known about it before this visit.
 */
export function remember(memory: LabMemory, origin: string, keys: readonly string[]): Recognition {
  const found = recognise(memory, origin, keys);
  if (found.now.length > 0) memory.set(origin, found.now);
  return found;
}

/**
 * A record kept in memory, for a script or a test.
 *
 * @returns Somewhere to keep what has been seen, which lasts as long as the program does.
 */
export function labMemory(): LabMemory {
  const held = new Map<string, string[]>();
  return {
    get: (origin) => held.get(origin) ?? null,
    set: (origin, keys) => void held.set(origin, keys),
  };
}
