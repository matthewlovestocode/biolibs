/**
 * Writing a ring out, once the search has found an order for its fragments.
 *
 * Each overlap belongs to both of the fragments it joins, so the ring is written as each fragment minus the overlap
 * it shares with the fragment before it. That is also what makes two rings comparable: a ring is the same molecule
 * whichever fragment it was written from and whichever strand was read, so {@link canonicalCircular} reduces it to a
 * single string and lets the search report one product per molecule rather than one per fragment order.
 */

import { Seq } from "@biolibs/seq";
import { SeqFeature } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { clipLocation, shiftLocation } from "@biolibs/seqedit";
import type { AnyLocation } from "@biolibs/seqedit";
import { primerTm } from "@biolibs/pcr";
import { reverseComplement } from "./ends.js";
import {
  type GibsonFragment, type GibsonJunction, type GibsonOptions, type GibsonProduct, overlapLength,
} from "./gibson-types.js";

/** One fragment in one orientation, as the search uses it. */
export interface Oriented {
  /** Its position in the caller's list, so a ring can say which fragments it used. */
  index: number;
  /** The fragment's name. */
  name: string;
  /** Whether this is the fragment turned over. */
  flipped: boolean;
  /** Its sequence in this orientation. */
  residues: string;
  /** Its record in this orientation, when it has one. */
  record?: SeqRecord;
}

/**
 * The orientations of a fragment the search may use.
 *
 * @param fragment - The fragment.
 * @param index - Its position in the input.
 * @param allowFlips - Whether turning it over is allowed.
 * @returns One or two oriented fragments.
 */
export function orientations(fragment: GibsonFragment, index: number, allowFlips: boolean): Oriented[] {
  const forward: Oriented = { index, name: fragment.name, flipped: false, residues: fragment.residues, record: fragment.record };
  if (!allowFlips) return [forward];
  const flippedRecord = fragment.record?.reverseComplement({
    features: true, letterAnnotations: true, id: true, name: true, description: true, dbxrefs: true, annotations: true,
  });
  return [forward, {
    index, name: fragment.name, flipped: true,
    residues: reverseComplement(fragment.residues),
    record: flippedRecord,
  }];
}

/**
 * Turn an ordered ring of oriented fragments into a product.
 *
 * The first fragment's leading overlap is the one it shares with the last, so removing it from the front puts the
 * ring's origin just after that junction.
 *
 * @param ring - The fragments in the order they go round.
 * @param o - The overlap limits, which decide each junction's length.
 * @returns The product, with its sequence, features and junctions.
 */
export function buildRing(ring: readonly Oriented[], o: Required<GibsonOptions>): GibsonProduct {
  const junctions: GibsonJunction[] = [];
  for (let i = 0; i < ring.length; i++) {
    const from = ring[i]!;
    const to = ring[(i + 1) % ring.length]!;
    const size = overlapLength(from.residues, to.residues, o.minOverlap, o.maxOverlap);
    const overlap = to.residues.slice(0, size);
    junctions.push({ from: from.name, to: to.name, overlap, length: size, tm: primerTm(overlap) });
  }

  // Each fragment contributes itself minus the overlap it shares with the fragment before it.
  let residues = "";
  const features: SeqFeature[] = [];
  for (let i = 0; i < ring.length; i++) {
    const fragment = ring[i]!;
    const leading = junctions[(i - 1 + junctions.length) % junctions.length]!.length;
    const kept = fragment.residues.slice(leading);
    if (fragment.record) {
      // The fragment's own features, clipped to the part kept and moved to where that part sits in the ring.
      for (const feature of fragment.record.features) {
        if (feature.location === null) continue;
        const clipped = clipLocation(feature.location as AnyLocation, leading, fragment.residues.length);
        if (clipped === null) continue;
        features.push(new SeqFeature(
          shiftLocation(clipped, residues.length), feature.type, feature.id, new Map(feature.qualifiers),
        ));
      }
    }
    residues += kept;
  }

  const order = ring.map((f) => ({ name: f.name, flipped: f.flipped }));
  const record = new SeqRecord(
    new Seq(residues),
    order.map((f) => f.name).join("+"),
    "assembly", "a Gibson assembly", [], features,
    new Map<string, unknown>([["molecule_type", "DNA"], ["topology", "circular"]]),
  );
  const flipped = order.filter((f) => f.flipped).map((f) => f.name);
  const turned = flipped.length === 0 ? "" : `, turned over: ${flipped.join(", ")}`;
  return {
    record, length: residues.length, order, junctions,
    description: `${residues.length} bp: ${order.map((f) => f.name).join(" + ")}${turned}`,
  };
}

/**
 * The canonical form of a circular sequence: the alphabetically first of every rotation of it and of its reverse
 * complement.
 *
 * Two rings are the same molecule when their canonical forms match, whichever fragment each was written from and
 * whichever strand was read.
 *
 * @param residues - The ring's sequence.
 * @returns The canonical form, or `""` for an empty sequence.
 * @example
 * ```ts
 * canonicalCircular("GCA") === canonicalCircular("AGC"); // true — the same circle
 * ```
 */
export function canonicalCircular(residues: string): string {
  if (residues === "") return "";
  let best: string | null = null;
  for (const strand of [residues, reverseComplement(residues)]) {
    const doubled = strand + strand;
    for (let i = 0; i < strand.length; i++) {
      const rotation = doubled.slice(i, i + strand.length);
      if (best === null || rotation < best) best = rotation;
    }
  }
  return best!;
}
