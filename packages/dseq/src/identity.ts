/**
 * A molecule's checksum: pydna's `Dseq.seguid`.
 *
 * The SEGUID of a double-stranded molecule covers both strands, and for a circular one it is taken from
 * whichever rotation reads smallest, so two records of the same plasmid with different origins get the
 * same answer. A linear molecule's overhangs are written out as gaps first, so that a sticky end is part
 * of what is identified.
 */

import { cdseguid, ldseguid } from "@biolibs/seguid";
import { Dseq } from "./dseq.js";

/** @param n - How many dashes. @returns Them, with a negative count giving none, as Python's `'-' * n` does. */
const dashes = (n: number): string => "-".repeat(Math.max(0, n));

/**
 * The molecule's SEGUID.
 *
 * @param d - The molecule.
 * @returns A `cdseguid=` checksum for a circle and an `ldseguid=` one for a linear molecule.
 * @throws TypeError for a single strand, which has no overhang to write out as gaps.
 */
export function seguidOf(d: Dseq): string {
  if (d.circular) {
    return cdseguid(d.watson.toUpperCase(), d.crick.toUpperCase(), "{DNA-extended}") as string;
  }
  const ovhg = d.ovhg;
  // `self.ovhg * '-'` with no overhang: Python multiplies a string by None and says so.
  if (ovhg === null) throw new TypeError("can't multiply sequence by non-int of type 'NoneType'");
  // Each strand is padded to the molecule's full width, so that the overhangs show up as gaps.
  const watson = (dashes(ovhg) + d.watson + dashes(-ovhg + d.crick.length - d.watson.length)).toUpperCase();
  const crick = (dashes(ovhg + d.watson.length - d.crick.length) + d.crick + dashes(-ovhg)).toUpperCase();
  return ldseguid(watson, crick, "{DNA-extended},AU") as string;
}
