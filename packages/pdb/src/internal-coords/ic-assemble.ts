/**
 * Assembling a chain's atoms from its internal coordinates: the reverse of `ic-measure.ts`.
 *
 * These are `IC_Chain`'s own methods in Biopython (`propagate_changes`, `init_atom_coords`,
 * `assemble_residues`, `update_dCoordSpace`, `internal_to_atom_coordinates`); they are free functions here so
 * that the class keeps to one responsibility per file, and {@link IC_Chain} delegates to them.
 *
 * Biopython does this with masked NumPy arithmetic over whole arrays. The loops here are written to produce the
 * same values in the same order, and the comments say which NumPy expression each one stands for, because the
 * masks are what make that code hard to read: a *full-size* mask indexes all the dihedra, while an *update-size*
 * one indexes only those being recomputed, and the two are used together.
 */
import { multiCoordSpace } from "../homog.js";
import type { Matrix } from "../vectors.js";
import { FIELDS } from "./atom-key.js";
import { Edron } from "./edron.js";
import type { IC_Chain } from "./ic-chain.js";
import { icSettings } from "./settings.js";

/** A dihedron is ready to place its fourth atom when its first three are known and the fourth is not. */
const DIHEDRA_SELECT = [true, true, true, false];

/**
 * Invalidate every atom that depends on one already invalid.
 *
 * The atom array is in atom-key order, so a residue's side chain follows its backbone and a later residue
 * follows an earlier one. An invalid N, CA or C therefore moves everything to the end of the chain segment, while
 * an invalid side-chain atom moves only the rest of that residue. Hydrogens are terminal and move nothing.
 *
 * @param cic - The chain to walk.
 */
export function propagateChanges(cic: IC_Chain): void {
  const atmNdx = FIELDS.atm, posNdx = FIELDS.respos;
  const done = new Set<string>();
  for (let csNdx = 0; csNdx < cic.initNCaCs.length; csNdx++) {
    const csStart = cic.atomArrayIndex.get(cic.initNCaCs[csNdx]![0]!.hashKey)!;
    // The segment runs to the next chain start, or to the end of the array for the last one.
    const next = cic.initNCaCs[csNdx + 1];
    const csNext = next === undefined ? cic.AAsiz : cic.atomArrayIndex.get(next[0]!.hashKey)!;

    for (let andx = csStart; andx < csNext; andx++) {
      if (cic.atomArrayValid[andx] === 1) continue;
      const ak = cic.aktuple[andx]!;
      const atm = ak.akl[atmNdx] as string | null;
      const pos = ak.akl[posNdx] as string | null;
      if (atm === "N" || atm === "CA" || atm === "C") {
        cic.atomArrayValid.fill(0, andx, csNext);
        break;
      }
      if (atm !== "H" && pos !== null && !done.has(pos)) {
        // The array is sorted, so this residue's remaining atoms are the ones that follow.
        for (let i = andx; i < csNext; i++) {
          if (cic.aktuple[i]!.akl[posNdx] === pos) cic.atomArrayValid[i] = 0;
          else break;
        }
        done.add(pos);
      }
    }
  }
}

/**
 * Place each hedron's and dihedron's atoms in its own coordinate space, from the measured values.
 *
 * A hedron sits with its second atom at the origin and its third up the +Z axis; the first is placed by the
 * supplement of the bond angle, on the assumption (Biopython's) that the angle is obtuse and so the first atom is
 * in -Z. The reversed copy is the same hedron read the other way round. A dihedron takes its first three atoms
 * from its first hedron — reversed when the dihedron is — and gets its fourth from its second hedron, moved so
 * that the shared atom is at the origin and then rotated about Z by the dihedral angle.
 *
 * Any chain start whose N, CA and C are not all valid is seeded from its hedron's own coordinates, since the
 * assembly has to begin somewhere.
 *
 * @param cic - The chain whose local coordinates are computed.
 */
export function initAtomCoords(cic: IC_Chain): void {
  const dLen = cic.dihedraLen, hLen = cic.hedraLen;
  const hNeeds = cic.hAtomsNeedsUpdate!, dNeeds = cic.dAtomsNeedsUpdate!;
  const hAtoms = cic.hAtoms!, hAtomsR = cic.hAtomsR!, dAtoms = cic.dAtoms!, a4pre = cic.a4PreRotation!;
  const l12 = cic.hedraL12!, l23 = cic.hedraL23!, angle = cic.hedraAngle!;

  // A dihedron whose hedra moved needs its own atoms recomputed, and its transforms are then stale.
  if (!dNeeds.every((x) => x === 1)) {
    for (let d = 0; d < dLen; d++) {
      if (hNeeds[cic.dH1ndx![d]!] === 1 || hNeeds[cic.dH2ndx![d]!] === 1) dNeeds[d] = 1;
      if (dNeeds[d] === 1) cic.dcsValid![d] = 0;
    }
  }

  if (hNeeds.some((x) => x === 1)) {
    for (let h = 0; h < hLen; h++) {
      if (hNeeds[h] !== 1) continue;
      // sar: the supplementary angle, which is what puts the first atom in -Z.
      const sar = ((180 - angle[h]!) * Math.PI) / 180;
      const sinSar = Math.sin(sar), cosSarN = -Math.cos(sar);
      hAtoms[h]![2]![2] = l23[h]!;
      hAtoms[h]![0]![0] = sinSar * l12[h]!;
      hAtoms[h]![0]![2] = cosSarN * l12[h]!;
      hAtomsR[h]![0]![2] = l12[h]!;
      hAtomsR[h]![2]![0] = sinSar * l23[h]!;
      hAtomsR[h]![2]![2] = cosSarN * l23[h]!;
    }
    hNeeds.fill(0);

    // Everything but the dihedral angle itself. Only the fourth atom takes work.
    for (let d = 0; d < dLen; d++) {
      if (dNeeds[d] !== 1) continue;
      const h1 = cic.dH1ndx![d]!, h2 = cic.dH2ndx![d]!, rev = cic.dRev![d] === 1;
      a4pre[d] = [...(rev ? hAtoms[h2]![0]! : hAtomsR[h2]![2]!)];
      a4pre[d]![2] = -a4pre[d]![2]! + (rev ? l23[h2]! : l12[h2]!);   // to +Z, then shift the shared atom to the origin
      const from = rev ? [...hAtomsR[h1]!].slice(0, 3).reverse() : hAtoms[h1]!.slice(0, 3);
      for (let i = 0; i < 3; i++) dAtoms[d]![i] = [...from[i]!];
    }
  }

  // The rotation by the dihedral angle, which is the only part a changed angle alone needs.
  for (let d = 0; d < dLen; d++) {
    if (dNeeds[d] !== 1) continue;
    const a = cic.dihedraAngleRads![d]!, c = Math.cos(a), s = Math.sin(a);
    const [x, y, z, w] = a4pre[d]! as [number, number, number, number];
    dAtoms[d]![3] = [c * x - s * y, s * x + c * y, z, w];
  }
  dNeeds.fill(0);

  // Assembly cannot start from a chain start whose three atoms are not placed, so seed it from the hedron.
  for (const iNCaC of cic.initNCaCs) {
    const ndxs = iNCaC.map((ak) => cic.atomArrayIndex.get(ak.hashKey)!);
    if (ndxs.every((n) => cic.atomArrayValid[n] === 1)) continue;
    const hatoms = hAtoms[cic.hedraNdx!.get(Edron.genKey(iNCaC))!]!;
    for (let i = 0; i < 3; i++) {
      const andx = ndxs[i]!;
      for (let k = 0; k < 4; k++) cic.atomArray[andx * 4 + k] = hatoms[i]![k]!;
      cic.atomArrayValid[andx] = 1;
    }
  }
}

/**
 * Place every atom in chain coordinates, by transforming each dihedron out of its own coordinate space.
 *
 * A dihedron with its first three atoms placed can place its fourth: the reverse transform of those three takes
 * the fourth atom's local coordinates into the chain's. Placing it may complete the first three of another
 * dihedron, so this repeats until nothing is left to do — which it always reaches, because a dihedron whose
 * atoms are all placed is never selected again.
 *
 * This is Biopython's vectorised `assemble_residues`, which does not refresh {@link IC_Chain.dCoordSpace};
 * {@link updateDCoordSpace} does that.
 *
 * @param cic - The chain to assemble.
 */
export function assembleResidues(cic: IC_Chain): void {
  const dLen = cic.dihedraLen;
  const a2da = cic.a2daMap!, a2d = cic.a2dMap!, dAtoms = cic.dAtoms!;
  const d2a = (d: number): number[] => [0, 1, 2, 3].map((i) => a2da[d * 4 + i]!);

  // One copy of each dihedron's four atom rows, and of whether each is up to date.
  cic.dSet = Array.from({ length: dLen }, (_, d) => d2a(d).map((a) => [...cic.atomArray.subarray(a * 4, a * 4 + 4)]));
  cic.dSetValid = Array.from({ length: dLen }, (_, d) => d2a(d).map((a) => cic.atomArrayValid[a] === 1));
  const dSet = cic.dSet, dSetValid = cic.dSetValid;

  // A dihedron with an atom out of date has transforms out of date too.
  for (let d = 0; d < dLen; d++) if (!dSetValid[d]!.every((v) => v)) cic.dcsValid![d] = 0;

  const ready = (d: number): boolean => d2a(d).every((a, i) => (cic.atomArrayValid[a] === 1) === DIHEDRA_SELECT[i]);
  let work = Array.from({ length: dLen }, (_, d) => dSetValid[d]!.every((v, i) => v === DIHEDRA_SELECT[i]));

  while (work.some((w) => w)) {
    const ndxs: number[] = [];
    for (let d = 0; d < dLen; d++) if (work[d]!) ndxs.push(d);
    const updateMap = ndxs.map((d) => a2da[d * 4 + 3]!);

    // The transforms are reused when every one of them is current, and recomputed for the whole batch otherwise.
    // The reuse never happens in practice, here or in Biopython: a dihedron selected for work has its fourth
    // atom invalid, which is exactly what the loop above has just marked its transforms stale for. The branch is
    // kept because Biopython has it, so no golden case can reach it.
    const cspace = ndxs.every((d) => cic.dcsValid![d] === 1)
      ? ndxs.map((d) => cic.dCoordSpace![1]![d]!)
      : (multiCoordSpace(ndxs.map((d) => dSet[d]!), ndxs.length, true) as [Matrix[], Matrix[]])[1];

    ndxs.forEach((d, i) => {
      const m = cspace[i]!, local = dAtoms[d]![3]!, andx = updateMap[i]!;
      for (let r = 0; r < 4; r++) {
        cic.atomArray[andx * 4 + r] = m[r]!.reduce((sum: number, v: number, k: number) => sum + v * local[k]!, 0);
      }
      cic.atomArrayValid[andx] = 1;
    });

    // Only the dihedra that share a new atom can have become ready.
    work = new Array<boolean>(dLen).fill(false);
    for (const a of updateMap) {
      const [ds, positions] = a2d[a]!;
      ds.forEach((d, i) => { dSet[d]![positions[i]!] = [...cic.atomArray.subarray(a * 4, a * 4 + 4)]; });
      for (const d of ds) work[d] = ready(d);
    }
  }
}

/**
 * Recompute the coordinate-space transforms of the dihedra whose atoms have moved.
 *
 * @param cic - The chain whose transforms are refreshed.
 * @param workSelector - Which dihedra to refresh; by default the assembly is run first and every dihedron whose
 *   transforms went stale is refreshed.
 */
export function updateDCoordSpace(cic: IC_Chain, workSelector?: boolean[]): void {
  let sel = workSelector;
  if (sel === undefined) {
    assembleResidues(cic);                               // fast when there is nothing to do
    sel = Array.from({ length: cic.dihedraLen }, (_, d) => cic.dcsValid![d] !== 1);
  }
  const ndxs: number[] = [];
  for (let d = 0; d < cic.dihedraLen; d++) if (sel[d]!) ndxs.push(d);
  const [fwd, rev] = multiCoordSpace(ndxs.map((d) => cic.dSet![d]!), ndxs.length, true) as [Matrix[], Matrix[]];
  ndxs.forEach((d, i) => {
    cic.dCoordSpace![0]![d] = fwd[i]!;
    cic.dCoordSpace![1]![d] = rev[i]!;
    cic.dcsValid![d] = 1;
  });
}

/**
 * Compute atom coordinates for the chain from its internal coordinates.
 *
 * @param cic - The chain to build.
 * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
 * @param start - First sequence position to build, which selects Biopython's serial assembly.
 * @param fin - Last sequence position to build, likewise.
 * @throws Error for `start` or `fin`, or with {@link icSettings.parallelAssembleResidues} turned off: the serial
 *   assembly (`assemble_residues_ser`, `IC_Residue.assemble`) is not ported yet.
 */
export function buildChainAtoms(cic: IC_Chain, verbose = false, start: number | null = null, fin: number | null = null): void {
  void verbose;
  if (cic.dAtomsNeedsUpdate === undefined) return;        // nothing has been measured, so nothing to build
  if (!icSettings.parallelAssembleResidues || start !== null || fin !== null) {
    throw new Error("internal_to_atom_coordinates: serial assembly (start/fin) is not ported yet");
  }
  propagateChanges(cic);
  initAtomCoords(cic);
  assembleResidues(cic);
}
