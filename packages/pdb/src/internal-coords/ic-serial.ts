/**
 * Biopython's *serial* assembly: building a chain's atoms one residue at a time.
 *
 * `IC_Chain.internal_to_atom_coordinates` chooses this over the vectorised `ic-assemble.ts` when given a `start`
 * or `fin` sequence position, or with `ParallelAssembleResidues` turned off. It walks each residue's hedra from
 * its N-CA-C outwards through a queue, which places the same atoms the vectorised path does but also leaves each
 * dihedron holding its own pair of transforms.
 *
 * Those transforms are the one thing the two paths differ on. Biopython's `assemble` *rebinds* `d.cst` and
 * `d.rcst` rather than writing through the views into `IC_Chain.dCoordSpace`, so the chain's own array is left
 * stale here; `update_dCoordSpace` is what refreshes it.
 */
import { coordSpace } from "../homog.js";
import type { Matrix } from "../vectors.js";
import { AtomKey, FIELDS } from "./atom-key.js";
import { Edron } from "./edron.js";
import type { IC_Chain } from "./ic-chain.js";
import type { IC_Residue } from "./ic-residue.js";
import { initAtomCoords } from "./ic-assemble.js";

/**
 * A residue's sequence position, the second field of its Biopython id.
 *
 * @param ric - The residue. @returns The position.
 */
const resPos = (ric: IC_Residue): number => (ric.residue.id as readonly (string | number)[])[1] as number;

/** One atom's place in a residue being assembled: its key and its homogeneous coordinates. */
export interface PlacedAtom {
  /** The atom's key. */
  key: AtomKey;
  /** Its homogeneous coordinates, `[x, y, z, 1]`. */
  coord: number[];
}

/**
 * The N-CA-C coordinates to build a residue from: its own, when they are already placed.
 *
 * @param ric - The residue about to be assembled.
 * @returns Its starting atoms, or {@link defaultStartpos} when no N-CA-C of its own is placed.
 */
export function getStartpos(ric: IC_Residue): Map<string, PlacedAtom> {
  const cic = ric.cic!;
  const startPos = new Map<string, PlacedAtom>();
  for (const ncac of ric.NCaCKey) {
    const ndxs = ncac.map((ak) => cic.atomArrayIndex.get(ak.hashKey)!);
    if (!ndxs.every((n) => cic.atomArrayValid[n] === 1)) continue;
    ncac.forEach((ak, i) => {
      startPos.set(ak.hashKey, { key: ak, coord: [...cic.atomArray.subarray(ndxs[i]! * 4, ndxs[i]! * 4 + 4)] });
    });
  }
  return startPos.size === 0 ? defaultStartpos(ric) : startPos;
}

/**
 * The N-CA-C coordinates to build a residue from when none of its own are placed: the dihedra's own.
 *
 * The residue then comes out in the coordinate space of the dihedron that starts it, which is what Biopython's
 * `resetLocation` asks for and what puts a `start` residue's alpha carbon at the origin.
 *
 * @param ric - The residue about to be assembled.
 * @returns The atoms of every dihedron that starts at one of its N-CA-C keys, in their own local coordinates.
 */
export function defaultStartpos(ric: IC_Residue): Map<string, PlacedAtom> {
  const cic = ric.cic!;
  const out = new Map<string, PlacedAtom>();
  const keys = [...ric.NCaCKey].map((t) => Edron.genKey(t)).sort();
  for (const k of keys) {
    for (const dk of cic.id3DhIndex!.get(k) ?? []) {
      const d = cic.dihedra.get(dk)!;
      d.atomkeys.forEach((a, i) => { out.set(a.hashKey, { key: a, coord: [...cic.dAtoms![d.ndx]![i]!] }); });
    }
  }
  return out;
}

/**
 * Compute atom coordinates for one residue from its internal coordinates.
 *
 * Starts from the hedra around N-CA-C and works outwards through a queue: a dihedron whose first three atoms are
 * placed can place its fourth, and its second hedron then goes on the queue to be followed in turn. A hedron key
 * that starts no dihedron simply drains away, which is what ends the walk.
 *
 * Writes into {@link IC_Chain.atomArray} as the vectorised path does, and leaves each dihedron it visits holding
 * its own forward and reverse transforms.
 *
 * @param ric - The residue to build.
 * @param resetLocation - Build in the first dihedron's own coordinate space rather than from atoms already
 *   placed, which puts the alpha carbon at the origin.
 * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
 * @returns Every atom placed, by its key's hash, or null for a residue with no atoms to work with.
 */
export function assembleResidue(ric: IC_Residue, resetLocation = false, verbose = false): Map<string, PlacedAtom> | null {
  void verbose;
  const cic = ric.cic!;
  if (ric.akSet === null || ric.akSet.size === 0) return null;   // give up now if no atoms to work with

  const NCaCKey = [...ric.NCaCKey].sort((a, b) => (Edron.genKey(a) < Edron.genKey(b) ? -1 : 1));
  // Biopython compares `int(...)` of the key's position field with the residue's own number; the key holds the
  // position as a string, so both sides are made numbers here.
  const rseqpos = Number(ric.rbase[0]);

  // The order of these matters: C-CA-N first, then the two hedra that reach the side chain and the carbonyl.
  const startLst = ric.splitAkl([ric.rak("C"), ric.rak("CA"), ric.rak("N")]);
  if (ric.akc!.has("CB")) startLst.push(...ric.splitAkl([ric.rak("N"), ric.rak("CA"), ric.rak("CB")]));
  if (ric.akc!.has("O")) startLst.push(...ric.splitAkl([ric.rak("O"), ric.rak("C"), ric.rak("CA")]));
  startLst.push(...NCaCKey);

  const q: AtomKey[][] = [...startLst];
  const atomCoords = resetLocation ? defaultStartpos(ric) : getStartpos(ric);

  while (q.length > 0) {
    const h1k = q.pop()!;                                        // Python's deque.pop: from the right
    const dihedraKeys = cic.id3DhIndex!.get(Edron.genKey(h1k));
    if (dihedraKeys === undefined) continue;
    for (const dk of dihedraKeys) {
      const d = cic.dihedra.get(dk)!;
      const dseqpos = Number(d.atomkeys[0]!.akl[FIELDS.respos]);
      d.initialCoords = cic.dAtoms![d.ndx]!;
      // Biopython also guards against a dihedron with no fourth atom here; its own arrays always have one.
      const dH2key = d.hedron2!.atomkeys;
      const ak = d.atomkeys[3]!;
      const acount = d.atomkeys.filter((a) => atomCoords.has(a.hashKey)).length;

      if (acount === 4) {
        // Already placed: follow its second hedron, but only within this residue.
        if (dseqpos === rseqpos) q.unshift([...dH2key]);
        if (cic.dcsValid![d.ndx] !== 1) {
          // Can happen for alternative locations; Biopython needs it only for its OpenSCAD output.
          setTransforms(d, h1k, atomCoords, cic);
        }
      } else if (acount === 3) {
        setTransforms(d, h1k, atomCoords, cic);
        const local = d.initialCoords[3]!;
        const acak3 = d.rcst!.map((row) => row.reduce((sum: number, v: number, k: number) => sum + v * local[k]!, 0));
        atomCoords.set(ak.hashKey, { key: ak, coord: acak3 });
        const andx = cic.atomArrayIndex.get(ak.hashKey)!;
        for (let k = 0; k < 4; k++) cic.atomArray[andx * 4 + k] = acak3[k]!;
        cic.atomArrayValid[andx] = 1;
        if (dseqpos === rseqpos) q.unshift([...dH2key]);
      }
      // Fewer than three placed: nothing to build from, which `verbose` reports in Biopython.
    }
  }
  return atomCoords;
}

/**
 * Give a dihedron the transforms into and out of the coordinate space of its first hedron's three atoms.
 *
 * @param d - The dihedron, which keeps the pair itself.
 * @param h1k - Its first hedron's three atom keys, in the order the queue holds them.
 * @param atomCoords - The atoms placed so far.
 * @param cic - The chain, whose `dcsValid` is set for this dihedron.
 */
function setTransforms(d: { ndx: number; cst?: Matrix; rcst?: Matrix }, h1k: readonly AtomKey[],
  atomCoords: Map<string, PlacedAtom>, cic: IC_Chain): void {
  const acs = h1k.map((a) => atomCoords.get(a.hashKey)!.coord);
  const [cst, rcst] = coordSpace(acs[0]!, acs[1]!, acs[2]!, true);
  d.cst = cst;
  d.rcst = rcst!;
  cic.dcsValid![d.ndx] = 1;
}

/**
 * Build every residue of a chain in turn, dropping the residues outside a `start`/`fin` range.
 *
 * A residue outside the range loses its atom keys *and its atoms*: Biopython clears the residue's children, so
 * the structure comes out holding only the subregion asked for.
 *
 * @param cic - The chain to build.
 * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
 * @param start - First sequence position to build, or null for no lower bound.
 * @param fin - Last sequence position to build, or null for no upper bound.
 */
export function assembleResiduesSer(cic: IC_Chain, verbose = false, start: number | null = null, fin: number | null = null): void {
  cic.dcsValid!.fill(0);
  for (const ric of cic.orderedAaIcList) {
    const pos = resPos(ric);
    // Biopython tests `if fin and ...`, so a position of 0 is no bound at all.
    if ((fin !== null && fin !== 0 && fin < pos) || (start !== null && start !== 0 && start > pos)) {
      ric.akSet = null;
      ric.akc = null;
      ric.residue.childDict = new Map();
      ric.residue.childList = [];
      continue;
    }
    const atomCoords = assembleResidue(ric, false, verbose);
    if (atomCoords !== null && atomCoords.size > 0) ric.akSet = new Set([...atomCoords.values()].map((p) => p.key));
  }
}

/**
 * The serial half of `internal_to_atom_coordinates`: place the atoms residue by residue.
 *
 * A `start` position becomes a new chain start, so that the build begins there with its alpha carbon at the
 * origin rather than from wherever the previous residue left off.
 *
 * @param cic - The chain to build.
 * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
 * @param start - First sequence position to build, or null.
 * @param fin - Last sequence position to build, or null.
 */
export function buildChainAtomsSer(cic: IC_Chain, verbose = false, start: number | null = null, fin: number | null = null): void {
  if (start !== null && start !== 0) {
    for (const ric of cic.orderedAaIcList) {
      if (start !== resPos(ric)) continue;
      cic.initNCaCs.push(...ric.splitAkl([new AtomKey([ric, "N"]), new AtomKey([ric, "CA"]), new AtomKey([ric, "C"])]));
    }
  }
  initAtomCoords(cic);
  assembleResiduesSer(cic, verbose, start, fin);
}
