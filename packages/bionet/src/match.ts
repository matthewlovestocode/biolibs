/**
 * What a plan needs before anyone can run it, and which labs have it.
 *
 * A cloning plan bottoms out in molecules nobody made: the parts that were simply had. Replaying the
 * plan proves the product follows from those parts, which is worth a great deal and still leaves the
 * reader holding nothing. This is the step that turns a checked plan into something a lab can act on —
 * take the plan's leaves, and ask who has them.
 *
 * Parts are matched by checksum, never by name. A SEGUID is the same whichever strand the molecule was
 * written from and, for a circle, wherever it was cut open, so two labs that have never spoken publish
 * the same checksum for the same molecule. A name agrees with nothing.
 */
import { recordFromSequenceModel, type CloningStrategyDocument } from "@biolibs/opencloning";
import type { FetchedInventory } from "./fetch.js";
import type { InventoryPart } from "./model.js";

/** One molecule a plan starts from. */
export interface NeededPart {
  /** Its identifier within the plan. */
  id: number;
  /** What the plan calls it. */
  name: string;
  /** Its SEGUID checksum, which is what labs are asked about. */
  checksum: string;
  /** How many base pairs. */
  length: number;
  /** Whether it is a circle. */
  circular: boolean;
}

/** A lab that has a part. */
export interface Holder {
  /** The lab's address. */
  origin: string;
  /** What the lab calls itself. */
  lab: string;
  /** The part as that lab lists it. */
  part: InventoryPart;
}

/** A part a plan needs, and who has it. */
export interface Sourcing {
  /** The part. */
  needed: NeededPart;
  /** The labs listing a molecule with this checksum, in the order the inventories were given. */
  holders: Holder[];
}

/**
 * The molecules a plan starts from: the ones no step in it makes.
 *
 * @param document - The plan.
 * @returns One entry per starting molecule, with its checksum.
 *
 * @example
 * ```ts
 * import { partsNeeded } from "@biolibs/bionet";
 *
 * partsNeeded(plan.document).map((part) => part.name);   // [ "f1", "f2", "f3" ]
 * ```
 */
export function partsNeeded(document: CloningStrategyDocument): NeededPart[] {
  const made = new Set(document.sources.filter((source) => source.input.length > 0).map((source) => source.id));
  const names = new Map(document.sources.map((source) => [source.id, source.output_name]));
  const needed: NeededPart[] = [];
  for (const sequence of document.sequences) {
    if (made.has(sequence.id)) continue;
    const record = recordFromSequenceModel(sequence);
    needed.push({
      id: sequence.id,
      name: names.get(sequence.id) ?? record.name,
      checksum: record.seguid(),
      length: record.length,
      circular: record.circular,
    });
  }
  return needed;
}

/**
 * Ask a set of inventories who has each of a plan's starting molecules.
 *
 * Inventories whose signatures do not hold, or that were not served from the address they claim, are
 * the caller's to filter out first — `settled` in `fetch.ts` says which those are. This matches what
 * it is given, and says nothing about whether the labs are to be believed.
 *
 * @param needed - What the plan needs.
 * @param inventories - The inventories to ask.
 * @returns One entry per needed part, with the labs that list it.
 */
export function whoHas(needed: readonly NeededPart[], inventories: readonly FetchedInventory[]): Sourcing[] {
  return needed.map((part) => {
    const holders: Holder[] = [];
    for (const found of inventories) {
      for (const listed of found.signed.inventory.parts) {
        if (listed.checksum === part.checksum) {
          holders.push({ origin: found.origin, lab: found.signed.inventory.lab.name, part: listed });
        }
      }
    }
    return { needed: part, holders };
  });
}

/**
 * The parts nobody asked has.
 *
 * @param sourcing - What `whoHas` worked out.
 * @returns The parts with no holder.
 */
export function unsourced(sourcing: readonly Sourcing[]): NeededPart[] {
  return sourcing.filter((one) => one.holders.length === 0).map((one) => one.needed);
}

/**
 * The parts a lab has but will not send.
 *
 * Listing a part without offering it is a normal thing for a lab to do, and a reader is better off
 * knowing the molecule exists somewhere than being told nobody has it.
 *
 * @param sourcing - What `whoHas` worked out.
 * @returns The parts whose every holder has them marked unavailable.
 */
export function heldButNotOffered(sourcing: readonly Sourcing[]): NeededPart[] {
  return sourcing
    .filter((one) => one.holders.length > 0 && one.holders.every((holder) => !holder.part.available))
    .map((one) => one.needed);
}
