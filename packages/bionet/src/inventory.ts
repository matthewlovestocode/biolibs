/**
 * Writing an inventory, signing one, and reading one a stranger published.
 *
 * Reading is the careful half. What arrives is a file from a web address, so `readInventory` checks
 * its shape and its size before anything else looks at it, and says plainly what is wrong when it is
 * wrong. Nothing here decides whether to believe an inventory — `fetch.ts` and `trust.ts` do that, and
 * they have less to go on than you might like.
 */
import type { Dseqrecord } from "@biolibs/dseqrecord";
import { signUnder, verifyUnder, type SignatureCheck, type SignOptions,
         type SigningKey } from "@biolibs/opencloning";
import { INVENTORY_VERSION, type InventoryDocument, type InventoryPart, type LabModel,
         type SignedInventory } from "./model.js";

/** What the bytes of a signed inventory are for. */
export const INVENTORY_DOMAIN = "biolibs/bionet signed inventory v1";

/** How many parts one inventory may list. */
export const MOST_PARTS = 5_000;
/** The longest an inventory may be, as text. */
export const LONGEST = 4_000_000;

/** What `inventoryFrom` needs to know that the molecules cannot say. */
export interface InventoryOptions {
  /** When to say it was published. Defaults to now. */
  publishedAt?: string;
  /** Whether the parts are on offer. Defaults to true. */
  available?: boolean;
  /** A note per part, by the part's name. */
  notes?: Record<string, string>;
}

/**
 * Write an inventory from the molecules a lab holds.
 *
 * @param records - The molecules.
 * @param lab - Who is publishing, and from where.
 * @param options - When, whether the parts are offered, and any notes.
 * @returns The inventory, ready to sign.
 *
 * @example
 * ```ts
 * import { inventoryFrom, signInventory } from "@biolibs/bionet";
 *
 * const inventory = inventoryFrom([pUC19, insert], {
 *   name: "Endy lab", origin: "https://endylab.example", contact: null, note: null,
 * });
 * const published = await signInventory(inventory, key, { signer: "Endy lab" });
 * ```
 */
export function inventoryFrom(records: readonly Dseqrecord[], lab: LabModel,
                              options: InventoryOptions = {}): InventoryDocument {
  const parts: InventoryPart[] = records.map((record, at) => {
    const name = record.name === "" ? `part${at + 1}` : record.name;
    return {
      id: record.id === "" || record.id === null ? String(at + 1) : record.id,
      name,
      checksum: record.seguid(),
      length: record.length,
      circular: record.circular,
      available: options.available ?? true,
      note: options.notes?.[name] ?? null,
    };
  });
  return {
    bionet_inventory_version: INVENTORY_VERSION,
    lab,
    parts,
    published_at: options.publishedAt ?? new Date().toISOString(),
  };
}

/**
 * Sign an inventory, or add a signature to one already signed.
 *
 * A second signature on someone else's inventory is a lab vouching for it — that they have seen these
 * parts, say. It is not required, and nothing treats it as more than one more key's claim.
 *
 * @param inventory - The inventory, signed or not.
 * @param key - The key to sign with.
 * @param options - A name to sign under, and when.
 * @returns The signed inventory.
 */
export async function signInventory(inventory: InventoryDocument | SignedInventory, key: SigningKey,
                                    options: SignOptions = {}): Promise<SignedInventory> {
  const held = isSignedInventory(inventory) ? inventory.inventory : inventory;
  const already = isSignedInventory(inventory) ? inventory.signatures : [];
  return { inventory: held, signatures: [...already, await signUnder(INVENTORY_DOMAIN, held, key, options)] };
}

/**
 * Check every signature on an inventory.
 *
 * @param signed - The signed inventory.
 * @returns One check per signature, in the same order. Never throws over a bad one.
 */
export async function verifyInventory(signed: SignedInventory): Promise<SignatureCheck[]> {
  return verifyUnder(INVENTORY_DOMAIN, signed.inventory, signed.signatures);
}

/** @param value - Anything. @returns Whether it is an inventory with signatures beside it. */
export function isSignedInventory(value: unknown): value is SignedInventory {
  const held = value as Partial<SignedInventory> | null;
  return held !== null && typeof held === "object"
    && Array.isArray(held.signatures) && typeof held.inventory === "object" && held.inventory !== null;
}

/**
 * Say whether a field is absent, or text no longer than it is allowed to be.
 *
 * @param value - The field.
 * @param most - How long it may be.
 * @returns Whether it will do.
 */
const sayable = (value: unknown, most: number): boolean =>
  value === null || value === undefined || (typeof value === "string" && value.length <= most);

/**
 * Read a signed inventory somebody else published.
 *
 * What comes back is the document **exactly as it arrived**, not a tidied copy of it. That matters:
 * the signature covers the bytes the lab wrote, so trimming a long note or filling in a missing field
 * here would leave a document that no longer matches its own signature. Anything out of bounds is
 * therefore refused rather than repaired, and anything over-long is a display problem for whatever
 * shows it.
 *
 * @param value - The parsed JSON.
 * @returns The inventory and its signatures, untouched.
 * @throws If it is not an inventory, or holds a field this will not carry.
 */
export function readInventory(value: unknown): SignedInventory {
  if (!isSignedInventory(value)) throw new Error("This is not a signed inventory.");
  const held = value.inventory as Partial<InventoryDocument>;
  const lab = held.lab as Partial<LabModel> | undefined;
  if (typeof lab?.name !== "string" || typeof lab.origin !== "string") {
    throw new Error("This inventory does not say which lab published it, or from where.");
  }
  if (lab.name.length > 200 || lab.origin.length > 500 || !sayable(lab.contact, 200) || !sayable(lab.note, 2_000)) {
    throw new Error("This inventory says more about the lab than will be carried.");
  }
  if (!Array.isArray(held.parts)) throw new Error("This inventory has no list of parts.");
  if (held.parts.length > MOST_PARTS) throw new Error(`An inventory may list at most ${MOST_PARTS} parts.`);
  for (const part of held.parts as Partial<InventoryPart>[]) {
    if (typeof part?.checksum !== "string" || !Number.isInteger(part.length) || part.length! < 0
        || part.checksum.length > 120 || !sayable(part.id, 200) || !sayable(part.name, 200)
        || !sayable(part.note, 2_000)) {
      throw new Error("This inventory lists something that is not a part.");
    }
  }
  if (!sayable(held.published_at, 40)) throw new Error("This inventory's publication time is not a time.");
  return value;
}
