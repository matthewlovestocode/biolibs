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
 * **The address is the identity.** An inventory signed by a key and served from `wrenlab.example` ties
 * that key to `wrenlab.example` and to nothing else. There is no registry, no authority and nobody to
 * ask: you get a lab's key the way you got its web address, and what you can catch afterwards is the
 * key *changing*.
 *
 * An inventory may also point at other labs, which is the only way anyone is found without being told
 * an address by a person. See `PeerModel` and `discover.ts`.
 */

import type { PartEnds } from "./log.js";

/** The version of this document these are written in. */
export const INVENTORY_VERSION = 1;

/** The version every published method carries. */
export const METHOD_VERSION = 1;

/** Who published an inventory. */
export interface LabModel {
  /** What the lab calls itself. A label, not a verified name. */
  name: string;
  /**
   * The web address the inventory is published at, as an origin like `https://wrenlab.example`.
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

/**
 * One thing a step of a published method uses.
 *
 * It names a **part** and not a tube, which is the whole of what makes a method travel. A tube's ID
 * means something only in the lab that holds it; a part's checksum means the same molecule
 * everywhere, so a lab reading this can look in its own freezer, or ask the network who has one.
 */
export interface MethodInput {
  /** The molecule, by the checksum every lab agrees on, or `null` for something that is alive. */
  part: string | null;
  /** What the publishing lab called it, so that a person can read the step. */
  name: string;
  /** How much of it, in the unit the publishing lab used. */
  amount: number;
  unit: string | null;
  /** What it is there as: a template, a piece, the construct. */
  role: string;
  /**
   * The molecule itself, where it is a starting material and the publisher chose to write it out.
   *
   * A method whose starting materials carry no sequence still tells somebody holding the same
   * molecules exactly what to do with them. It does not tell somebody holding none of them what to
   * order, which is why it is written out unless a lab says otherwise.
   */
  sequence?: string;
  /** The step that makes it, counting from 1, where a step of this method does. */
  from?: number;
  /**
   * For something alive, which has no checksum: what it would have to be a culture of.
   *
   * A strain is the lab's own — the same plasmid in the same published host twice is two strains —
   * so it cannot be named across labs the way a molecule can. What can be said is what it carries
   * and what it is, and whoever follows this has to make their own.
   */
  alive?: { carries: string[]; host: string | null };
}

/** One step of a published method. */
export interface MethodStep {
  /** Where it comes in the order, counting from 1. */
  step: number;
  /** What kind of run it is: `pcr`, `assembly`, `transformation`. */
  kind: string;
  /** What it uses. */
  uses: MethodInput[];
  /** What it makes, each with the checksum that is its identity. */
  makes: { name: string; sequence?: string; circular: boolean; ends: PartEnds; length: number; checksum: string }[];
  /** How it is set up. */
  settings: Record<string, string | number>;
  /** Why, and anything else said about it. */
  note: string | null;
  /** The steps that have to be carried out before it, by their numbers. */
  after: number[];
}

/**
 * A method: a lab's plan, written so that another lab can carry it out.
 *
 * It is what a plan becomes when it leaves. Inside a lab a plan points at tubes, which is what a
 * person at that bench needs; published, every tube is replaced by the checksum of what is in it,
 * since that is the one name two labs that have never spoken already agree on.
 */
export interface MethodDocument {
  /** Always `1`. */
  bionet_method_version: number;
  /** Who published it. */
  lab: LabModel;
  /** What it is called: the project it came from, or what it makes. */
  name: string;
  /** What following it the whole way would leave you with. */
  makes: { name: string; checksum: string }[];
  /**
   * What a lab has to have before it can start: the molecules no step of this makes.
   *
   * Each is a checksum, which is what `whoHas` searches on, so a lab without one can go and find
   * who has it rather than being told only that something is missing.
   */
  needs: MethodInput[];
  /** The steps, in an order that can be carried out. */
  steps: MethodStep[];
  /** Anything the publishers wanted to say about it as a whole. */
  note: string | null;
  /** When they say they published it, as an ISO 8601 instant. */
  published_at: string;
}

/** A method with signatures beside it, which is how one is published. */
export interface SignedMethod {
  /** The method, exactly as it was signed. */
  method: MethodDocument;
  /** The signatures over it. */
  signatures: import("@biolibs/opencloning").DocumentSignature[];
}
