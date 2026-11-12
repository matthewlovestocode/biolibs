/** Shared helpers of the Bio.PDB golden tests: JSON encoders for structures, canonical JSON and exception matching. */
import type { Atom, DisorderedAtom, DisorderedResidue, Residue, Structure } from "@biolibs/pdb";

/** An exception as the generators record it. */
export type Exc = { type: string; msg: string | null };

const num = (x: number | null): number | null => (x === null || Number.isNaN(x) ? null : x);
const arr = (a: Float32Array | null): number[] | null => (a === null ? null : [...a]);
const encAtom = (a: Atom): unknown => ({
  name: a.name, fullname: a.fullname, coord: [...a.coord], bfactor: num(a.bfactor), occupancy: num(a.occupancy), altloc: a.altloc, serial: a.serialNumber, element: a.element, mass: num(a.mass),
  dflag: a.disorderedFlag, anisou: arr(a.anisouArray), siguij: arr(a.siguijArray), sigatm: arr(a.sigatmArray), charge: num(a.pqrCharge), radius: num(a.radius), full_id: a.getFullId(),
});
const encChildAtom = (x: Atom | DisorderedAtom): unknown => (x.isDisordered() === 2
  ? { disordered: "atom", id: x.id, selected: ((x as DisorderedAtom).selectedChild as Atom).altloc, children: (x as DisorderedAtom).disorderedGetList().map(encAtom) }
  : encAtom(x as Atom));
const encRes = (r: Residue): unknown => ({ id: r.id, resname: r.resname, segid: r.segid, disordered: r.disordered, full_id: r.getFullId(), atoms: r.childList.map((a) => encChildAtom(a)) });
const encChildRes = (x: Residue | DisorderedResidue): unknown => (x.isDisordered() === 2
  ? { disordered: "residue", id: x.id, selected: ((x as DisorderedResidue).selectedChild as Residue).resname, children: [...(x as DisorderedResidue).childDict.values()].map((c) => encRes(c as Residue)) }
  : encRes(x as Residue));
export const encStructure = (s: Structure): unknown => ({
  id: s.id, full_id: s.getFullId(), models: s.childList.map((m) => ({ id: m.id, serial: m.serialNum, chains: m.childList.map((c) => ({ id: c.id, residues: c.childList.map((r) => encChildRes(r)) })) })),
});

/** JSON with object keys sorted, so dictionaries compare regardless of insertion order (JS orders integer-like keys first). */
export const canon = (x: unknown): string => JSON.stringify(x, (_, v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

export const excOk = (want?: Exc, got?: Exc): boolean => {
  if (!want || !got) return !want && !got;
  const w = want.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return w.type === got.type && (w.msg === null || w.msg === got.msg);
};

