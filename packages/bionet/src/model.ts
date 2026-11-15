/**
 * What a lab publishes about itself: who it is, and what it holds.
 *
 * This is not a port of anything. It is a small document a lab can put at a fixed path on its own web
 * address, signed with its key, saying what parts it has. Two things make it useful rather than
 * decorative.
 *
 * **Parts are named by checksum.** A lab's own name for a plasmid means nothing to anyone else, so
 * every part carries its SEGUID, which is the same whichever strand you write it from and, for a
 * circle, wherever you cut it open. Two labs holding the same molecule publish the same checksum
 * without having agreed on anything.
 *
 * **The address is the identity.** An inventory signed by a key and served from `endylab.example` ties
 * that key to `endylab.example` and to nothing else. There is no registry, no authority and nobody to
 * ask: you get a lab's key the way you got its web address, and what you can catch afterwards is the
 * key *changing*.
 *
 * An inventory may also point at other labs, which is the only way anyone is found without being told
 * an address by a person. See `PeerModel` and `discover.ts`.
 */

/** The version of this document these are written in. */
export const INVENTORY_VERSION = 1;

/** Who published an inventory. */
export interface LabModel {
  /** What the lab calls itself. A label, not a verified name. */
  name: string;
  /**
   * The web address the inventory is published at, as an origin like `https://endylab.example`.
   *
   * Fetching checks this against where the document actually came from. A document claiming an origin
   * it was not served from is refused, because that claim is the whole of the binding.
   */
  origin: string;
  /** How to reach them about a part, if they said. */
  contact: string | null;
  /** Anything else they wanted to say. */
  note: string | null;
}

/** One part a lab holds. */
export interface InventoryPart {
  /** The lab's own identifier for it. Meaningful to them. */
  id: string;
  /** What they call it. */
  name: string;
  /**
   * Its SEGUID checksum, as `@biolibs/seguid` writes one: `cdseguid=…` for a circle, `ldseguid=…` for
   * a linear molecule. This is what one lab's part is matched to another's by.
   */
  checksum: string;
  /** How many base pairs. */
  length: number;
  /** Whether it is a circle. */
  circular: boolean;
  /** Whether they are offering it. A lab may list what it holds without offering all of it. */
  available: boolean;
  /** Anything worth saying about it. */
  note: string | null;
}

/**
 * Another lab, pointed at by this one.
 *
 * This is how labs are found at all. There is no index to look a lab up in, so the only way to reach
 * one you have not been told about is to start from a lab you already know and follow what it points
 * at — which is what `discover.ts` does.
 *
 * Pointing at a lab is **not** vouching for what that lab holds, and nothing here treats it as such.
 * It says only: this address exists and publishes an inventory. A pointer does carry one useful
 * thing, though. If the referring lab records the key it saw there, a crawler can compare that with
 * the key actually answering, and a disagreement is worth a person's attention — without anyone
 * having to be in charge.
 */
export interface PeerModel {
  /** The peer's address, as an origin like `https://otherlab.example`. */
  origin: string;
  /** What the referring lab calls them. A label, not a verified name. */
  name: string | null;
  /**
   * The fingerprint of the key the referring lab saw answering there, if they recorded one.
   *
   * A crawler compares this with the key it finds. Agreement is weak corroboration from somebody
   * other than the lab itself; disagreement means one of them is looking at something the other is
   * not, and only the labs can say which.
   */
  key: string | null;
  /** Why they are pointed at, if the referring lab said. */
  note: string | null;
}

/** A lab's inventory. */
export interface InventoryDocument {
  /** Always `1`. */
  bionet_inventory_version: number;
  /** Who published it. */
  lab: LabModel;
  /** What they hold. */
  parts: InventoryPart[];
  /**
   * Other labs this one points at, if it points at any.
   *
   * Absent in inventories written before there was such a thing, which stay perfectly valid: a
   * reader treats a missing list as an empty one and must not add the field, since the signature
   * covers the document as it was written.
   */
  peers?: PeerModel[];
  /** When they say they published it, as an ISO 8601 instant. */
  published_at: string;
}

/** An inventory with signatures beside it, which is how one is published. */
export interface SignedInventory {
  /** The inventory, exactly as it was signed. */
  inventory: InventoryDocument;
  /** The signatures over it. */
  signatures: import("@biolibs/opencloning").DocumentSignature[];
}
