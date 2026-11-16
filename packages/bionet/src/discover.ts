/**
 * Finding labs you were never told about, by walking from ones you were.
 *
 * There is no index of labs and nothing here builds one. A lab is found the way a page was found on
 * the early web: somebody you already know points at it. So discovery is a walk — start from
 * addresses a person gave you, fetch each lab's inventory, follow the labs it points at, and stop
 * when you run out of new ones or hit the bounds you set.
 *
 * Three things about that are worth being plain about, because they are properties of the design and
 * not gaps in the implementation.
 *
 * **What you find is what your seeds could reach.** There is no view of the whole network and no way
 * to know what you are missing. Two people starting from different labs will find different sets, and
 * neither is the network. `Discovery` therefore records the path by which each lab was reached, so a
 * person can see *how* they came to be looking at it.
 *
 * **A pointer is not an endorsement.** A lab pointing at another says only that the address exists.
 * Nothing here treats being pointed at as evidence about what that lab holds or who they are.
 *
 * **Only a lab that checks out can introduce anyone.** A document whose signature fails, or that was
 * served from an address it does not claim, is reported and then its pointers are dropped on the
 * floor. Otherwise anyone able to answer for one address could fill a crawl with addresses of their
 * choosing, and the bounds below would be the only thing standing in the way.
 */
import { fetchInventory, settled, signingKeys, type FetchOptions, type FetchedInventory } from "./fetch.js";
import { labOrigin } from "./origin.js";

/** How far a crawl goes unless told otherwise. */
export const BY_DEFAULT = { labs: 50, depth: 2 };

/** Whether a lab's key is what the lab that pointed at it said it would be. */
export type AsIntroduced =
  /** Nobody said, either because this was a seed or because the pointer carried no key. */
  | "unsaid"
  /** The key answering is the one the referring lab recorded. */
  | "agrees"
  /** A different key is answering than the referring lab recorded. */
  | "differs";

/** A lab the walk reached. */
export interface Reached {
  /** Its inventory, fetched and checked. */
  found: FetchedInventory;
  /** Whether its signatures hold and it came from the address it claims. */
  settled: boolean;
  /** How many pointers from a seed: 0 for a seed itself. */
  depth: number;
  /** The addresses walked to get here, starting at the seed and ending at this lab. */
  path: string[];
  /** The lab that pointed at this one, or null for a seed. */
  introducedBy: string | null;
  /** Whether the key answering is the one the referring lab recorded. */
  asIntroduced: AsIntroduced;
}

/** A lab the walk could not reach. */
export interface Unreachable {
  /** The address that was tried. */
  origin: string;
  /** How many pointers from a seed. */
  depth: number;
  /** The lab that pointed at it, or null for a seed. */
  introducedBy: string | null;
  /** What went wrong, in the words the attempt produced. */
  why: string;
}

/** What a walk came to. */
export interface Discovery {
  /** The labs reached, in the order they were reached. */
  reached: Reached[];
  /** The addresses that were tried and did not answer usefully. */
  unreachable: Unreachable[];
  /** Whether the walk stopped at its bounds with addresses still unvisited. */
  stoppedEarly: boolean;
}

/** How far to walk, and what to walk with. */
export interface DiscoverOptions extends FetchOptions {
  /** The most labs to fetch. Defaults to 50. */
  maxLabs?: number;
  /** How many pointers from a seed to follow. 0 fetches the seeds only. Defaults to 2. */
  maxDepth?: number;
  /** Called as each lab is reached, for anything that wants to show a walk in progress. */
  onReached?: (one: Reached) => void;
}

/** One address waiting to be visited. */
interface Pending {
  origin: string;
  depth: number;
  path: string[];
  introducedBy: string | null;
  /** The key the referring lab said would be here. */
  expectedKey: string | null;
}

/**
 * Walk the network from labs you already know.
 *
 * @param seeds - Addresses to start from, which somebody told you.
 * @param options - How far to walk, and what to fetch with.
 * @returns Every lab reached, how it was reached, and what could not be.
 *
 * @example
 * ```ts
 * import { discover, partsNeeded, settledLabs, whoHas } from "@biolibs/bionet";
 *
 * const walk = await discover(["wrenlab.example"], { maxDepth: 2 });
 * walk.reached.map((one) => `${one.path.join(" → ")}`);
 *
 * whoHas(partsNeeded(plan.document), settledLabs(walk));
 * ```
 */
export async function discover(seeds: readonly string[], options: DiscoverOptions = {}): Promise<Discovery> {
  const mostLabs = options.maxLabs ?? BY_DEFAULT.labs;
  const deepest = options.maxDepth ?? BY_DEFAULT.depth;

  const reached: Reached[] = [];
  const unreachable: Unreachable[] = [];
  const seen = new Set<string>();
  const queue: Pending[] = [];

  for (const seed of seeds) {
    try {
      const origin = labOrigin(seed);
      if (seen.has(origin)) continue;
      seen.add(origin);
      queue.push({ origin, depth: 0, path: [origin], introducedBy: null, expectedKey: null });
    } catch (cause) {
      unreachable.push({ origin: seed, depth: 0, introducedBy: null, why: reason(cause) });
    }
  }

  let fetched = 0;
  while (queue.length > 0) {
    if (fetched >= mostLabs) return { reached, unreachable, stoppedEarly: true };
    const next = queue.shift()!;
    fetched += 1;

    let found: FetchedInventory;
    try {
      found = await fetchInventory(next.origin, options);
    } catch (cause) {
      unreachable.push({ origin: next.origin, depth: next.depth, introducedBy: next.introducedBy, why: reason(cause) });
      continue;
    }

    const keys = signingKeys(found);
    const one: Reached = {
      found,
      settled: settled(found),
      depth: next.depth,
      path: next.path,
      introducedBy: next.introducedBy,
      asIntroduced: next.expectedKey === null ? "unsaid"
        : keys.includes(next.expectedKey) ? "agrees" : "differs",
    };
    reached.push(one);
    options.onReached?.(one);

    // A lab that does not check out does not get to say who else exists.
    if (!one.settled || next.depth >= deepest) continue;

    for (const pointer of found.signed.inventory.peers ?? []) {
      let origin: string;
      try {
        origin = labOrigin(pointer.origin);
      } catch (cause) {
        unreachable.push({ origin: pointer.origin, depth: next.depth + 1, introducedBy: next.origin, why: reason(cause) });
        continue;
      }
      if (seen.has(origin)) continue;
      seen.add(origin);
      queue.push({
        origin,
        depth: next.depth + 1,
        path: [...next.path, origin],
        introducedBy: next.origin,
        expectedKey: pointer.key,
      });
    }
  }
  return { reached, unreachable, stoppedEarly: false };
}

/** @param cause - Whatever was thrown. @returns Something a person can read. */
const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * The labs from a walk whose signatures hold and which came from their own address.
 *
 * These are the ones worth matching parts against. The rest are in `reached` with `settled` false, so
 * that a walk can say "this address answered and did not check out" rather than quietly skipping it.
 *
 * @param discovery - What a walk came to.
 * @returns Their inventories, in the order they were reached.
 */
export function settledLabs(discovery: Discovery): FetchedInventory[] {
  return discovery.reached.filter((one) => one.settled).map((one) => one.found);
}

/**
 * The labs a walk reached whose key is not the one that introduced them.
 *
 * Nothing is concluded from this. It is surfaced because it is the one disagreement a walk can notice
 * without an authority: two parties describing the same address differently.
 *
 * @param discovery - What a walk came to.
 * @returns Those labs.
 */
export function introducedDifferently(discovery: Discovery): Reached[] {
  return discovery.reached.filter((one) => one.asIntroduced === "differs");
}
