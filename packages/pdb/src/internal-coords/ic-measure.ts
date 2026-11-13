/**
 * Measuring a chain's internal coordinates: the value arrays, the index maps between them and the atom array, and
 * the bond lengths, bond angles and dihedral angles read off the atom coordinates.
 *
 * These are `IC_Chain`'s own methods in Biopython (`init_edra`, `build_edraArrays`,
 * `atom_to_internal_coordinates`); they are free functions here so that the class keeps to one responsibility per
 * file, and {@link IC_Chain} delegates to them.
 */
import { IndexError } from "@biolibs/core";
import type { AtomKey } from "./atom-key.js";
import { Edron } from "./edron.js";
import { multiCoordSpace } from "../homog.js";
import type { Matrix } from "../vectors.js";
import type { IC_Chain } from "./ic-chain.js";

/**
 * Allocate the chain's angle arrays and give every hedron and dihedron its index into them.
 *
 * Builds the angles first if they are not there, and the atom array if it is not there — the order matters,
 * because building the angles can add atoms (a glycine C-beta) that the atom array must then include.
 *
 * @param cic - The chain being measured.
 * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
 */
export function initEdra(cic: IC_Chain, verbose = false): void {
  const first = cic.orderedAaIcList[0];
  if (first === undefined) throw new IndexError("list index out of range");
  if (first.hedra.size === 0) for (const ric of cic.orderedAaIcList) ric.createEdra();
  if (cic.atomArrayValid.length === 0) cic.buildAtomArray();
  if (cic.hedraNdx === undefined) {
    cic.hedraLen = cic.hedra.size;
    cic.hedraL12 = new Float64Array(cic.hedraLen);
    cic.hedraAngle = new Float64Array(cic.hedraLen);
    cic.hedraL23 = new Float64Array(cic.hedraLen);
    cic.hedraNdx = ndxMap(cic.hedra);

    cic.dihedraLen = cic.dihedra.size;
    cic.dihedraAngle = new Float64Array(cic.dihedraLen);
    cic.dihedraAngleRads = new Float64Array(cic.dihedraLen);
    cic.dihedraNdx = ndxMap(cic.dihedra);
  }
  if (cic.hAtomsNeedsUpdate === undefined) buildEdraArrays(cic);
}


/**
 * Build the index maps between the atom array and the angle arrays, and link each dihedron to its two hedra.
 *
 * @param cic - The chain whose maps are built.
 *
 * A dihedron's first three atoms usually name a hedron of the chain; when they do not, the same three in reverse
 * do, and the dihedron is marked reversed. That flag decides which way its atoms run against its hedra, and the
 * assembly later depends on it.
 */
export function buildEdraArrays(cic: IC_Chain): void {
  const hedraNdx = cic.hedraNdx!;
  const dihedraNdx = cic.dihedraNdx!;
  cic.dcsValid = new Uint8Array(cic.dihedraLen);
  cic.dCoordSpace = [[], []];
  // The hedra's own atom coordinates, and the dihedra's: filled in by the assembly, homogeneous from the start.
  cic.hAtoms = Array.from({ length: cic.hedraLen }, () => [0, 1, 2].map(() => [0, 0, 0, 1]));
  cic.hAtomsR = cic.hAtoms.map((h) => h.map((a) => [...a]));
  cic.hAtomsNeedsUpdate = new Uint8Array(cic.hedraLen).fill(1);
  cic.dAtoms = Array.from({ length: cic.dihedraLen }, () => [0, 1, 2, 3].map(() => [0, 0, 0, 1]));
  cic.a4PreRotation = Array.from({ length: cic.dihedraLen }, () => [0, 0, 0, 1]);

  // Which atom row each hedron's three atoms live in, in hedron order.
  const a2ha: number[] = [];
  cic.a2hMap = Array.from({ length: cic.AAsiz }, () => [] as number[]);
  cic.h2aa = Array.from({ length: cic.hedraLen }, () => [] as number[]);
  for (const [hk, hndx] of hedraNdx) {
    const hedron = cic.hedra.get(hk)!;
    hedron.ndx = hndx;
    hedron.cic = cic;
    for (const ak of hedron.atomkeys) {
      const akndx = cic.atomArrayIndex.get(ak.hashKey)!;
      a2ha[hndx * 3 + cic.h2aa[hndx]!.length] = akndx;
      cic.h2aa[hndx]!.push(akndx);
      cic.a2hMap[akndx]!.push(hndx);
    }
  }
  cic.a2haMap = a2ha;

  const a2da: number[] = [];
  const a2d: [number[], number[]][] = Array.from({ length: cic.AAsiz }, () => [[], []]);
  cic.dRev = new Uint8Array(cic.dihedraLen);
  cic.dH1ndx = new Int32Array(cic.dihedraLen);
  cic.dH2ndx = new Int32Array(cic.dihedraLen);
  cic.h1dMap = Array.from({ length: cic.hedraLen }, () => [] as number[]);
  cic.id3DhIndex = new Map();
  cic.id32DhIndex = new Map();

  for (const [dk, dndx] of dihedraNdx) {
    const d = cic.dihedra.get(dk)!;
    const keys = d.atomkeys;
    for (let i = 0; i < 4; i++) {
      const andx = cic.atomArrayIndex.get(keys[i]!.hashKey)!;
      a2da[dndx * 4 + i] = andx;
      a2d[andx]![0].push(dndx);
      a2d[andx]![1].push(i);
    }

    // The first three atoms, or the same three reversed: whichever names a hedron of this chain.
    let h1key = Edron.genKey(keys.slice(0, 3));
    let h2key = Edron.genKey(keys.slice(1, 4));
    let h1ndx = hedraNdx.get(h1key);
    if (h1ndx === undefined) {
      h1key = Edron.genKey([keys[2]!, keys[1]!, keys[0]!]);
      h2key = Edron.genKey([keys[3]!, keys[2]!, keys[1]!]);
      h1ndx = hedraNdx.get(h1key)!;
      cic.dRev[dndx] = 1;
      d.reverse = true;
    }
    const h2ndx = hedraNdx.get(h2key)!;
    d.h1key = h1key;
    d.h2key = h2key;
    d.hedron1 = cic.hedra.get(h1key);
    d.hedron2 = cic.hedra.get(h2key);
    cic.dH1ndx[dndx] = h1ndx;
    cic.dH2ndx[dndx] = h2ndx;
    cic.h1dMap[h1ndx]!.push(dndx);
    d.ndx = dndx;
    d.cic = cic;

    const did3 = Edron.genKey(keys.slice(0, 3));
    const did32 = Edron.genKey(keys.slice(1, 4));
    if (!cic.id3DhIndex.has(did3)) cic.id3DhIndex.set(did3, []);
    cic.id3DhIndex.get(did3)!.push(dk);
    if (!cic.id32DhIndex.has(did32)) cic.id32DhIndex.set(did32, []);
    cic.id32DhIndex.get(did32)!.push(dk);
  }
  cic.a2daMap = a2da;
  cic.a2dMap = a2d;
  cic.dFwd = cic.dRev.map((r) => (r === 0 ? 1 : 0));
  cic.dAtomsNeedsUpdate = new Uint8Array(cic.dihedraLen).fill(1);
}


/**
 * Measure every bond length, bond angle and dihedral angle from the atom coordinates.
 *
 * The two lengths of a hedron are the distances between its atoms, and its angle comes from the law of cosines.
 * A dihedron is measured by putting its first three atoms into a coordinate space of their own — the second atom
 * at the origin, the third on the +Z axis, the first in the XZ plane — and reading the fourth atom's azimuth in
 * that space.
 *
 * @param cic - The chain being measured.
 * @param verbose - Accepted where Biopython accepts it, which uses it only to report problems while building.
 */
export function measureChain(cic: IC_Chain, verbose = false): void {
  if (cic.orderedAaIcList.length === 0) return;
  initEdra(cic, verbose);
  if (cic.dihedra.size === 0) return;

  const row = (ndx: number): number[] => [...cic.atomArray.subarray(ndx * 4, ndx * 4 + 4)];
  const dist = (a: number[], b: number[]): number =>
    Math.sqrt((a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2);

  const l12 = cic.hedraL12 as Float64Array;
  const l23 = cic.hedraL23 as Float64Array;
  const angle = cic.hedraAngle as Float64Array;
  for (let h = 0; h < cic.hedraLen; h++) {
    const a0 = row(cic.a2haMap![h * 3]!), a1 = row(cic.a2haMap![h * 3 + 1]!), a2 = row(cic.a2haMap![h * 3 + 2]!);
    l12[h] = dist(a0, a1);
    l23[h] = dist(a1, a2);
    const a0a2 = dist(a0, a2);
    angle[h] = (Math.acos((l12[h]! ** 2 + l23[h]! ** 2 - a0a2 ** 2) / (2 * l12[h]! * l23[h]!)) * 180) / Math.PI;
  }

  const dha = Array.from({ length: cic.dihedraLen }, (_, d) =>
    [0, 1, 2, 3].map((i) => row(cic.a2daMap![d * 4 + i]!)));
  const [fwd, rev] = multiCoordSpace(dha, cic.dihedraLen, true) as [Matrix[], Matrix[]];
  cic.dCoordSpace = [fwd, rev];
  cic.dcsValid = new Uint8Array(cic.dihedraLen).fill(1);
  // Biopython's dihedra hold views into these rows, so writing the array gives each dihedron its pair.
  for (const [dk, d] of cic.dihedraNdx!) {
    const dh = cic.dihedra.get(dk)!;
    dh.cst = fwd[d]!;
    dh.rcst = rev[d]!;
  }

  const rads = cic.dihedraAngleRads as Float64Array;
  const degs = cic.dihedraAngle as Float64Array;
  for (let d = 0; d < cic.dihedraLen; d++) {
    // The fourth atom seen from the first three: its azimuth is the dihedral angle.
    const m = fwd[d]!;
    const a4 = dha[d]![3]!;
    const x = (m[0] as number[]).reduce((sum: number, v: number, k: number) => sum + v * a4[k]!, 0);
    const y = (m[1] as number[]).reduce((sum: number, v: number, k: number) => sum + v * a4[k]!, 0);
    rads[d] = Math.atan2(y, x);
    degs[d] = (rads[d]! * 180) / Math.PI;
  }
}

/**
 * Compare two tuples of atom keys the way Python compares tuples: element by element, and a prefix sorts first.
 *
 * @param a - The first tuple.
 * @param b - The second.
 * @returns A negative number, zero or a positive number, as a comparator wants.
 * @throws Whatever {@link AtomKey.lt} throws for two atom names it cannot rank.
 */
function tupleCmp(a: readonly AtomKey[], b: readonly AtomKey[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i]!.equals(b[i]!)) continue;
    return a[i]!.lt(b[i]!) ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * Number the di/hedra of a chain, in the order Biopython's `sorted(self.hedra.keys())` puts them.
 *
 * The keys are tuples of atom keys there, so they sort by the atoms' own order — N before CA before C — and not
 * by the text of the key, which would put CA first.
 *
 * @param m - The chain's hedra or dihedra, by key.
 * @returns Each key with its index into the chain's value arrays.
 */
function ndxMap(m: ReadonlyMap<string, { readonly atomkeys: readonly AtomKey[] }>): Map<string, number> {
  const entries = [...m.entries()].sort(([, x], [, y]) => tupleCmp(x.atomkeys, y.atomkeys));
  return new Map(entries.map(([k], i) => [k, i]));
}
