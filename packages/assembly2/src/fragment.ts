/**
 * What the engine assembles: a molecule, or a primer standing in for one.
 *
 * The two are not the same kind of thing — a primer is a single strand, with no topology and no ends to
 * ligate — so the few questions the engine asks of either are asked through here.
 */

import { Dseqrecord } from "@biolibs/dseqrecord";
import { Primer } from "./primer.js";

/** A fragment going into an assembly. */
export type Fragment = Dseqrecord | Primer;

/**
 * A fragment's bases.
 *
 * Both record classes print themselves as a summary rather than as their sequence, so this asks for the
 * sequence itself.
 *
 * @param fragment - The fragment.
 * @returns Its upper strand, as written.
 */
export function textOf(fragment: Fragment): string {
  return fragment.seq?.toString() ?? "";
}

/**
 * Whether a fragment is a circular molecule.
 *
 * @param fragment - The fragment.
 * @returns Whether it is; a primer never is.
 */
export function isCircularFragment(fragment: Fragment): boolean {
  return fragment instanceof Dseqrecord && fragment.circular;
}

/**
 * The molecule a fragment stands for, so that a primer can be assembled alongside real ones.
 *
 * @param fragment - The fragment.
 * @returns It, or a linear molecule of the same bases.
 */
export function asRecord(fragment: Fragment): Dseqrecord {
  return fragment instanceof Dseqrecord ? fragment : new Dseqrecord(textOf(fragment));
}
