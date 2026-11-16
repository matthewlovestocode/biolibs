/**
 * Fetching a lab's inventory, and reporting exactly what came back.
 *
 * Nothing here returns a bare "trusted" flag, because there is no single question being answered. A
 * fetch establishes three separate things, and they are reported separately: whether the document is
 * an inventory at all, whether its signatures hold, and whether it was served from the address it
 * claims. A caller that wants a yes-or-no can ask for `settled`, which is all three at once and says
 * so in its own documentation.
 */
import { verifyInventory, readInventory, LONGEST } from "./inventory.js";
import { inventoryUrl, labOrigin, originMatches } from "./origin.js";
import type { SignedInventory } from "./model.js";
import type { SignatureCheck } from "@biolibs/opencloning";

/** How long to wait for a lab's web server. */
const PATIENCE = 10_000;

/** An inventory, fetched. */
export interface FetchedInventory {
  /** Where it was actually fetched from. */
  origin: string;
  /** The inventory and its signatures, exactly as served. */
  signed: SignedInventory;
  /** One check per signature. */
  checks: SignatureCheck[];
  /** Whether the document was served from the origin it names. */
  fromItsOwnAddress: boolean;
}

/** How to fetch. */
export interface FetchOptions {
  /** Something to fetch with. Defaults to the runtime's own `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** How long to wait, in milliseconds. */
  timeoutMs?: number;
}

/**
 * Fetch a lab's inventory and check it.
 *
 * @param address - The lab's address, like `wrenlab.example`.
 * @param options - What to fetch with, and how long to wait.
 * @returns What came back, with the signatures checked and the address compared.
 * @throws If the address is not usable, nothing answered, or what answered is not an inventory.
 *
 * @example
 * ```ts
 * import { fetchInventory, settled } from "@biolibs/bionet";
 *
 * const found = await fetchInventory("wrenlab.example");
 * settled(found);                       // signed, and served from the address it claims
 * found.signed.inventory.parts.length;
 * ```
 */
export async function fetchInventory(address: string, options: FetchOptions = {}): Promise<FetchedInventory> {
  const origin = labOrigin(address);
  const url = inventoryUrl(origin);
  const get = options.fetch ?? globalThis.fetch;
  const response = await get(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(options.timeoutMs ?? PATIENCE),
  });
  if (!response.ok) throw new Error(`${origin} has no inventory to read (${response.status}).`);
  const text = await response.text();
  if (text.length > LONGEST) throw new Error(`${origin} published more inventory than this will read.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`What ${origin} published is not JSON.`);
  }
  const signed = readInventory(parsed);
  return {
    origin,
    signed,
    checks: await verifyInventory(signed),
    fromItsOwnAddress: originMatches(signed.inventory.lab.origin, origin),
  };
}

/**
 * The fingerprints of the keys whose signatures held.
 *
 * These, not the lab's name, are what a lab is recognised by from one visit to the next.
 *
 * @param found - A fetched inventory.
 * @returns The fingerprints, sorted, with duplicates dropped.
 */
export function signingKeys(found: FetchedInventory): string[] {
  return [...new Set(found.checks.filter((check) => check.ok).map((check) => check.fingerprint))].sort();
}

/**
 * Whether everything a fetch can settle came out right: at least one signature holds, and the document
 * was served from the address it claims.
 *
 * This is not "this lab is who it says it is". It is "this document is internally consistent and came
 * from the address you asked for". Whether that address is the lab you mean is something you knew
 * before you typed it, or do not know at all.
 *
 * @param found - A fetched inventory.
 * @returns Whether it is consistent and from its own address.
 */
export function settled(found: FetchedInventory): boolean {
  return found.fromItsOwnAddress && found.checks.some((check) => check.ok);
}
