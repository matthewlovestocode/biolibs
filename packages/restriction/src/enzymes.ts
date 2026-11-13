/** Builds the enzymes from the REBASE data: `enzymes`, `AllEnzymes`, `CommOnly` and `NonComm`. */

import { RestrictionBatch } from "./batch.js";
import { registry } from "./registry.js";
import { RestrictionType } from "./restriction-type.js";
import { restDict, typedict } from "./restriction-dictionary.js";

/** Every enzyme by name, e.g. `enzymes["EcoRI"]`. */
export const enzymes: Readonly<Record<string, RestrictionType>> = (() => {
  const out: Record<string, RestrictionType> = {};
  for (const [bases, names] of Object.values(typedict)) {
    for (const name of names) out[name] = new RestrictionType(name, bases, restDict[name]!);
  }
  return out;
})();

for (const [name, e] of Object.entries(enzymes)) registry.byName.set(name, e);
registry.makeBatch = (items) => new RestrictionBatch(items);

/** The enzymes sold by at least one supplier. */
export const CommOnly: RestrictionBatch = new RestrictionBatch();
/** The enzymes nobody sells. */
export const NonComm: RestrictionBatch = new RestrictionBatch();
for (const e of Object.values(enzymes)) (e.isComm() ? CommOnly : NonComm).addNocheck(e);

/** Every enzyme (commercial ones first). */
export const AllEnzymes: RestrictionBatch = new RestrictionBatch(CommOnly);
for (const e of NonComm) AllEnzymes.addNocheck(e);
registry.allEnzymes = AllEnzymes;
