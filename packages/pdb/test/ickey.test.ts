/** Replays the Bio.PDB.internal_coords.AtomKey golden cases (reference/golden/gen_ickey_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AtomKey, Dihedron, Edron, FIELDS, Hedron, IC_Chain, IC_Residue, PDBParser, PIC_FLAGS, setAccuracy95 } from "@biolibs/pdb";
import { captureWarnings } from "@biolibs/core";
import { assembleResidue, defaultStartpos, getStartpos, icSettings } from "@biolibs/pdb";

type Exc = { type: string; msg: string | null };
type Out = { result?: unknown; exc?: Exc };
interface Spec { how: string; value: unknown }
interface Spec2 { cls: string; how: string; keys: string[] }
interface Case { kind: string; num?: number; fn?: string; a?: Spec | Spec2 | number; b?: Spec | Spec2 | number; angles?: number[]; avg?: number; in_rads?: boolean; out_rads?: boolean; what?: string; text?: string; entry?: string; how?: string; twice?: boolean; start?: number; fin?: number; serial_flag?: boolean; reset?: boolean; spec?: Spec | Spec2; keys?: string[]; result?: unknown; exc?: Exc; warnings: string[] }

/** AttributeError is a TypeError here, with no message to compare. */
const excOk = (want?: Exc, got?: Exc): boolean => {
  if (!want || !got) return !want && !got;
  const w = want.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return w.type === got.type && (w.msg === null || w.msg === got.msg);
};
const err = (e: unknown): Exc => ({ type: (e as Error).name, msg: (e as Error).message });
const attempt = (f: () => unknown): Out => { try { return { result: f() }; } catch (e) { return { exc: err(e) }; } };
/**
 * Compare two recorded results, applying {@link excOk} wherever one of them holds a recorded exception.
 *
 * A case's result has `attempt()`s nested inside it, and the generator writes `msg: null` for an AttributeError
 * (which is a TypeError here, with a message of its own); a plain JSON comparison would call those different.
 */
function same(a: unknown, b: unknown): boolean {
  const isExc = (x: unknown): x is { exc: Exc } => x !== null && typeof x === "object" && "exc" in x;
  if (isExc(a) || isExc(b)) {
    if (!isExc(a) || !isExc(b)) return false;
    return excOk(a.exc, b.exc);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => same(x, b[i]));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => k in (b as object) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
const outOk = (w: Out, g: Out): boolean => (w.exc ? excOk(w.exc, g.exc) : g.exc === undefined && same(w.result, g.result));

/** Build a key the way the generator's `build` does. */
function build(spec: Spec): AtomKey {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const { how, value } = spec;
  if (how === "string") return new AtomKey(value);
  if (how === "args") return new AtomKey(value as unknown[]);
  if (how === "list") return new AtomKey([value]);
  if (how === "dict") return new AtomKey([Object.fromEntries(value as [string, unknown][])]);
  if (how === "kwargs") return new AtomKey([], Object.fromEntries(value as [string, unknown][]));
  throw new Error(how);
}

function runKey(c: Case): Out {
  return attempt(() => {
    const k = build(c.spec!);
    return { akl: [...k.akl], id: k.id, repr: k.repr(), atm: attempt(() => k.atm()),
      is_backbone: k.isBackbone(), cr_class: attempt(() => k.crClass()) };
  });
}

function runPair(c: Case): Out {
  return attempt(() => {
    const a = build(c.a!), b = build(c.b!);
    return { cmp: attempt(() => a.compare(b)), lt: attempt(() => a.lt(b)), le: attempt(() => a.le(b)),
      gt: attempt(() => a.gt(b)), ge: attempt(() => a.ge(b)),
      eq: a.equals(b), ne: !a.equals(b), altloc_match: a.altlocMatch(b) };
  });
}

function runSort(c: Case): Out {
  return attempt(() => {
    // Python's `sorted` is stable and uses `<`; the ranks `compare` returns drive it the same way.
    const keys = c.keys!.map((s) => new AtomKey(s));
    return [...keys].sort((x, y) => { const [p, q] = x.compare(y); return p - q; }).map((k) => k.id);
  });
}

/** Build an Edron, Hedron or Dihedron the way the generator's `build_edron` does. */
function buildEdron(spec: Spec2): Edron {
  const keys = spec.keys.map((k) => new AtomKey(k));
  const Cls = { edron: Edron, hedron: Hedron, dihedron: Dihedron }[spec.cls]!;
  if (spec.how === "list") return new Cls([keys]);
  if (spec.how === "args") return new Cls(keys);
  if (spec.how === "kwargs") {
    const names = ["a1", "a2", "a3", "a4"] as const;
    return new Cls([], Object.fromEntries(spec.keys.map((k, i) => [names[i]!, k])));
  }
  throw new Error(spec.how);
}

function runEdron(c: Case): Out {
  return attempt(() => {
    const spec = c.spec as Spec2;
    const e = buildEdron(spec);
    const out: Record<string, unknown> = {
      id: e.id, e_class: e.eClass, re_class: e.reClass, cre_class: e.creClass, rc: e.rc,
      is_backbone: e.isBackbone(), repr: attempt(() => e.repr()), needs_update: e.needsUpdate,
      keys: e.atomkeys.map((k) => k.id), contains: e.contains(e.atomkeys[0]!),
      gen_key: Edron.genKey([...e.atomkeys]), gen_tuple: Edron.genTuple(e.id).map((k) => k.id),
    };
    if (spec.cls === "hedron") {
      const h = e as Hedron;
      out["xrh_class"] = h.xrhClass ?? null;
      out["values"] = [attempt(() => h.len12), attempt(() => h.angle), attempt(() => h.len23)];
    }
    if (spec.cls === "dihedron") {
      const d = e as Dihedron;
      out["id3"] = d.id3.map((k) => k.id);
      out["id32"] = d.id32.map((k) => k.id);
      out["primary"] = d.primary;
      out["pclass"] = d.pclass ?? null;
      out["altCB_class"] = d.altCBClass ?? null;
      out["reverse"] = d.reverse;
      out["angle"] = attempt(() => d.angle);
    }
    return out;
  });
}

function runEpair(c: Case): Out {
  return attempt(() => {
    const a = buildEdron(c.a as Spec2), b = buildEdron(c.b as Spec2);
    const r = a.compare(b);
    return { lt: attempt(() => a.lt(b)), le: attempt(() => a.le(b)), gt: attempt(() => a.gt(b)),
      ge: attempt(() => a.ge(b)), eq: a.equals(b), ne: !a.equals(b),
      cmp: attempt(() => (r === null ? false : r.map((k) => k.id))) };
  });
}

function runResidue(c: Case): Out {
  return attempt(() => {
    const s = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!);
    const residues = [...s.getResidues()].slice(0, 12);
    return residues.map((res) => {
      const ric = new IC_Residue(res);
      const sortedKeys = [...ric.akSet].sort((a, b) => { const [p, q] = a.compare(b); return p - q; });
      return {
        rbase: ric.rbase.map((x) => (x === null ? null : String(x))),
        lc: ric.lc, is20AA: ric.is20AA, isAccept: ric.isAccept,
        repr: ric.repr(), pretty_str: ric.prettyStr(),
        ak_set: sortedKeys.map((k) => k.id).sort(),
        akc: [...ric.akc].map(([k, v]) => `${typeof k === "string" ? k : (k as { name: string }).name}=${v.id}`).sort(),
        rak_CA: attempt(() => ric.rak("CA").id),
        rak_missing: attempt(() => [ric.rak("ZZ").id, ric.rak("ZZ").missing]),
        contains: sortedKeys.slice(0, 4).map((k) => attempt(() => ric.contains(k))),
        alt_ids: ric.altIds,
      };
    });
  });
}

/** Round as the generator rounds, so that the last bits of a float cannot fail a comparison. */
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

const sortedIds = (m: Map<string, { id: string }>): string[] => [...m.values()].map((e) => e.id).sort();

/** Sort lists of key ids the way Python's `sorted` orders lists of lists. */
const sortKeyLists = (lists: string[][]): string[][] => [...lists].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));

function runEdraBuild(c: Case): Out {
  return attempt(() => {
    const s = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!);
    return [...s.getChains()].slice(0, 2).map((chain) => {
      const cic = new IC_Chain(chain);
      const built = cic.orderedAaIcList.map((ric) => attempt(() => { ric.createEdra(); return null; }));
      const arr = attempt(() => { cic.buildAtomArray(); return null; });
      const rows: number[][] = [];
      for (let i = 0; i < cic.AAsiz; i++) rows.push([...cic.atomArray.subarray(i * 4, i * 4 + 4)].map((x) => round6(x)));
      return {
        residues: cic.orderedAaIcList.map((ric) => ric.prettyStr()),
        initNCaCs: sortKeyLists(cic.initNCaCs.map((t) => t.map((k) => k.id))),
        akset: [...cic.akset.values()].map((k) => k.id).sort(),
        built,
        chain_hedra: sortedIds(cic.hedra),
        chain_dihedra: sortedIds(cic.dihedra),
        per_residue: cic.orderedAaIcList.map((ric) => ({
          pretty: ric.prettyStr(),
          hedra: sortedIds(ric.hedra),
          dihedra: sortedIds(ric.dihedra),
          primary: [...ric.dihedra.values()].filter((d) => d.primary).map((d) => d.id).sort(),
          NCaCKey: attempt(() => sortKeyLists(ric.NCaCKey.map((t) => t.map((k) => k.id)))),
          rprev: ric.rprev.map((r) => r.prettyStr()),
          rnext: ric.rnext.map((r) => r.prettyStr()),
        })),
        atom_array: arr,
        AAsiz: cic.AAsiz,
        aktuple: cic.aktuple.map((k) => k.id),
        atomArrayIndex: [...cic.atomArrayIndex].map(([k, v]) => `${cic.aktuple[v]!.id}=${v}`).sort(),
        atomArrayValid: [...cic.atomArrayValid].map((v) => v === 1),
        coords: rows,
        // the atoms now look into the array: writing a row moves the atom
        atom_views: cic.bpAtomArray.map((a) => (a === null ? null : [...a.coord].map((x) => round6(x)))),
        dtypes: [...new Set(cic.bpAtomArray.filter((a) => a !== null).map((a) => (a!.coord instanceof Float64Array ? "float64" : "float32")))].sort(),
      };
    });
  });
}

function runSplit(c: Case): Out {
  return attempt(() => {
    const out: unknown[] = [];
    const s = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!);
    for (const res of [...s.getResidues()].slice(0, 8)) {
      const ric = new IC_Residue(res);
      if (!ric.isAccept) continue;
      for (const names of [["N", "CA", "C"], ["N", "CA", "CB"], ["CA", "C", "O"], ["N", "CA", "C", "O"], ["ZZ", "CA", "C"]]) {
        const keys = names.map((n) => ric.rak(n));
        for (const missingOK of [false, true]) {
          out.push({ res: ric.prettyStr(), ask: names, missingOK,
            // sorted on both sides: Biopython returns these in the arbitrary order of a set
            got: attempt(() => ric.splitAkl(keys, missingOK).map((t) => t.map((k) => k.id)).sort()) });
        }
      }
    }
    return out;
  });
}

/**
 * Replay `atom_to_internal_coordinates`: the index maps and the measured bond lengths, angles and dihedral angles.
 *
 * The warning NumPy emits inside `multi_coord_space` is captured, since the number of them says how many times the
 * transforms were computed.
 */
function runA2ic(c: Case): Out {
  const cap = captureWarnings(() => {
    // The parse's own warnings are not recorded: the generator parses with the warnings silenced.
    const parsed = captureWarnings(() => new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!));
    if (parsed.error !== undefined) throw parsed.error;
    const s = parsed.result!;
    if (c.entry === "structure") s.atomToInternalCoordinates();
    else if (c.entry === "model") for (const m of s.getModels()) m.atomToInternalCoordinates();
    else for (const ch of s.getChains()) ch.atomToInternalCoordinates();
    const chains = [...s.getChains()].slice(0, 2).map((chain) => {
      const cic = chain.internalCoord;
      if (cic === null || cic.hedraNdx === undefined) {
        return { empty: true, residues: cic === null ? null : cic.orderedAaIcList.map((r) => r.prettyStr()) };
      }
      const r6 = (a: ArrayLike<number>): unknown[] => Array.from(a).map(enc6);
      // Biopython leaves the value arrays uninitialized until there is a dihedron to measure, so there is
      // nothing to compare in that case.
      const measured = cic.dihedra.size > 0;
      const vals = (a: ArrayLike<number>): unknown => (measured ? r6(a) : null);
      return {
        hedraLen: cic.hedraLen, dihedraLen: cic.dihedraLen,
        hedraNdx: [...cic.hedraNdx].map(([k, v]) => `${k}=${v}`),
        dihedraNdx: [...cic.dihedraNdx!].map(([k, v]) => `${k}=${v}`),
        measured,
        hedraL12: vals(cic.hedraL12!), hedraL23: vals(cic.hedraL23!), hedraAngle: vals(cic.hedraAngle!),
        dihedraAngle: vals(cic.dihedraAngle!), dihedraAngleRads: vals(cic.dihedraAngleRads!),
        a2ha_map: [...cic.a2haMap!], a2da_map: [...cic.a2daMap!],
        a2h_map: cic.a2hMap!.map((row) => [...row]),
        h2aa: cic.h2aa!.map((row) => [...row]),
        a2d_map: cic.a2dMap!.map((pair) => pair.map((half) => [...half])),
        dRev: [...cic.dRev!].map((x) => x === 1), dFwd: [...cic.dFwd!].map((x) => x === 1),
        dH1ndx: [...cic.dH1ndx!], dH2ndx: [...cic.dH2ndx!],
        h1d_map: cic.h1dMap!.map((row) => [...row]),
        id3_dh_index: [...cic.id3DhIndex!].map(([k, v]) => `${k}=${v.join(",")}`),
        id32_dh_index: [...cic.id32DhIndex!].map(([k, v]) => `${k}=${v.join(",")}`),
        dcsValid: [...cic.dcsValid!].map((x) => x === 1),
        dAtoms_needs_update: [...cic.dAtomsNeedsUpdate!].map((x) => x === 1),
        hAtoms_needs_update: [...cic.hAtomsNeedsUpdate!].map((x) => x === 1),
        dCoordSpace: measured ? cic.dCoordSpace!.map((half) => half.map((m) => m.map((row) => r6(row)))) : null,
        // the di/hedra now read their values out of the chain's arrays
        hedra: sortRows([...cic.hedra.values()].map((h) =>
          measured ? [h.id, enc6(h.len12), enc6(h.angle), enc6(h.len23)] : [h.id])),
        dihedra: sortRows([...cic.dihedra.values()].map((d) =>
          measured ? [d.id, enc6(d.angle), d.reverse, d.h1key ?? "", d.h2key!] : [d.id, d.reverse, d.h1key ?? "", d.h2key!])),
        // a second pass must not change anything: initEdra's guards hold
        // the second pass's warnings are not recorded either, so it runs inside its own capture
        again: !measured ? null : captureWarnings(() => { chain.atomToInternalCoordinates(); return r6(chain.internalCoord!.dihedraAngle!); }).error === undefined
          ? { result: r6(chain.internalCoord!.dihedraAngle!) }
          : { exc: { type: "Error", msg: "" } },
      };
    });
    return { chains, warnings_seen: [] as string[] };
  });
  if (cap.error !== undefined) return { exc: err(cap.error) };
  const out = cap.result!;
  out.warnings_seen = cap.warnings.map((w) => `${w.category}: ${w.message}`);
  return { result: out };
}

/** Round as the generator rounds, with the strings it uses for the values JSON has no syntax for. */
const enc6 = (x: number): unknown => (Number.isNaN(x) ? "nan" : x === Infinity ? "inf" : x === -Infinity ? "-inf" : round6(x));

/** Sort rows of mixed values the way Python's `sorted` orders lists whose first element is a string id. */
const sortRows = (rows: unknown[][]): unknown[][] =>
  [...rows].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));

/**
 * Replay `internal_to_atom_coordinates`: the local coordinates of the di/hedra and the atoms rebuilt from them.
 *
 * Each case says what to invalidate first, since the assembly only does work where an atom is out of date.
 */
function runI2a(c: Case): Out {
  const parsed = captureWarnings(() => {
    const st = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!);
    for (const ch of st.getChains()) ch.atomToInternalCoordinates();
    return st;
  });
  if (parsed.error !== undefined) return { exc: err(parsed.error) };
  const s = parsed.result!;
  return attempt(() => [...s.getChains()].slice(0, 2).map((chain) => {
    const cic = chain.internalCoord;
    if (cic === null || cic.dAtomsNeedsUpdate === undefined) return { empty: true };
    const r6 = (a: ArrayLike<number>): unknown[] => Array.from(a).map(enc6);
    const rows = (): unknown[][] => Array.from({ length: cic.AAsiz }, (_, i) => r6(cic.atomArray.subarray(i * 4, i * 4 + 4)));
    const before = rows();
    const beforeNums = Array.from({ length: cic.AAsiz }, (_, i) => [...cic.atomArray.subarray(i * 4, i * 4 + 4)]);

    if (c.how === "all") cic.atomArrayValid.fill(0);
    else if (c.how === "last") cic.atomArrayValid[cic.AAsiz - 1] = 0;
    else if (c.how === "mid_n") {
      for (let ndx = 1; ndx < cic.AAsiz; ndx++) {
        if (cic.aktuple[ndx]!.akl[FIELDS.atm] === "N") { cic.atomArrayValid[ndx] = 0; break; }
      }
    } else if (c.how === "angle" && cic.dihedraLen > 0) {
      const k = Math.floor(cic.dihedraLen / 2);
      const deg = cic.dihedraAngle as Float64Array, rads = cic.dihedraAngleRads as Float64Array;
      deg[k] = (((deg[k]! + 30 + 180) % 360) + 360) % 360 - 180;
      rads[k] = (deg[k]! * Math.PI) / 180;
      cic.dAtomsNeedsUpdate[k] = 1;
      cic.atomArrayValid[cic.a2daMap![k * 4 + 3]!] = 0;
    }

    const cap = captureWarnings(() => {
      if (c.entry === "structure") s.internalToAtomCoordinates();
      else if (c.entry === "model") for (const m of s.getModels()) m.internalToAtomCoordinates();
      else for (const ch of s.getChains()) ch.internalToAtomCoordinates();
      if (c.twice === true) chain.internalToAtomCoordinates();
    });
    if (cap.error !== undefined) throw cap.error;

    let dev = 0;
    for (let i = 0; i < cic.AAsiz; i++) {
      for (let k = 0; k < 3; k++) dev = Math.max(dev, Math.abs(cic.atomArray[i * 4 + k]! - beforeNums[i]![k]!));
    }
    return {
      before,
      coords: rows(),
      valid: [...cic.atomArrayValid].map((v) => v === 1),
      // how far the rebuilt chain moved: large by design when the chain start itself was invalidated
      // rounded coarsely on purpose: this is a maximum over every atom, so only its size is meaningful
      max_dev: Math.round(dev * 1e3) / 1e3,
      hAtoms: cic.hAtoms!.map((h) => h.map((a) => r6(a))),
      hAtomsR: cic.hAtomsR!.map((h) => h.map((a) => r6(a))),
      dAtoms: cic.dAtoms!.map((d) => d.map((a) => r6(a))),
      a4_pre_rotation: cic.a4PreRotation!.map((a) => r6(a)),
      hAtoms_needs_update: [...cic.hAtomsNeedsUpdate!].map((v) => v === 1),
      dAtoms_needs_update: [...cic.dAtomsNeedsUpdate].map((v) => v === 1),
      dcsValid: [...cic.dcsValid!].map((v) => v === 1),
      dSetValid: cic.dSetValid!.map((row) => [...row]),
      dSet: cic.dSet!.map((d) => d.map((a) => r6(a))),
      atom_views: cic.bpAtomArray.map((a) => (a === null ? null : r6(a.coord))),
      warnings_seen: cap.warnings.map((w) => `${w.category}: ${w.message}`),
      // measuring the rebuilt atoms must give the angles back
      remeasured: attempt(() => { chain.atomToInternalCoordinates(); return r6(cic.dihedraAngle!); }),
    };
  }));
}

/** Replay the bare `Exception` an entity entry point raises for a chain with no internal coordinates. */
function runI2aUnset(c: Case): Out {
  return attempt(() => {
    const s = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!);
    return [...s.getChains()].slice(0, 2).map((ch) => attempt(() => ch.internalToAtomCoordinates()));
  });
}

/** Sort rows whose first element is an id, the way Python's `sorted` orders those lists. */
const sortById = (rows: unknown[][]): unknown[][] =>
  [...rows].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));

/**
 * Replay the serial rebuild: a `start`/`fin` subregion, or the parallel assembly turned off.
 *
 * The residues outside the range lose their atom keys and their atoms, so the structure itself is recorded too.
 */
function runI2aSer(c: Case): Out {
  const parsed = captureWarnings(() => {
    const st = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!);
    for (const ch of st.getChains()) ch.atomToInternalCoordinates();
    return st;
  });
  if (parsed.error !== undefined) return { exc: err(parsed.error) };
  const s = parsed.result!;
  const restore = icSettings.parallelAssembleResidues;
  try {
    if (c.serial_flag === true) icSettings.parallelAssembleResidues = false;
    return attempt(() => [...s.getChains()].slice(0, 2).map((chain) => {
      const cic = chain.internalCoord;
      if (cic === null || cic.dAtomsNeedsUpdate === undefined) return { empty: true };
      if (c.how === "all") cic.atomArrayValid.fill(0);
      const r6 = (a: ArrayLike<number>): unknown[] => Array.from(a).map(enc6);
      const cap = captureWarnings(() => chain.internalToAtomCoordinates(false, c.start ?? null, c.fin ?? null));
      return {
        call: cap.error === undefined ? { result: null } : { exc: err(cap.error) },
        coords: Array.from({ length: cic.AAsiz }, (_, i) => r6(cic.atomArray.subarray(i * 4, i * 4 + 4))),
        valid: [...cic.atomArrayValid].map((v) => v === 1),
        dcsValid: [...cic.dcsValid!].map((v) => v === 1),
        residues: cic.orderedAaIcList.map((ric) => ({
          pretty: ric.prettyStr(),
          ak_set: ric.akSet === null ? null : [...ric.akSet].map((k) => k.id).sort(),
          akc: ric.akc === null ? null
            : [...ric.akc].map(([k, v]) => `${typeof k === "string" ? k : k.name}=${v.id}`).sort(),
          atoms: ric.residue.getUnpackedList().map((a) => a.getName()),
          nchild: ric.residue.childList.length,
        })),
        // each dihedron keeps its own pair of transforms here, and the chain's array is left stale
        transforms: sortById([...cic.dihedra.values()].map((d) =>
          [d.id, d.cst!.map((row) => r6(row)), d.rcst!.map((row) => r6(row))])),
        dCoordSpace0: cic.dCoordSpace![0]!.map((m) => m.map((row) => r6(row))),
        structure_atoms: [...s.getAtoms()].map((a) => `${String((a.getFullId() as unknown[])[3] !== undefined ? (((a.getFullId() as unknown[])[3] as unknown[])[0]) : "")}:${a.getName()}`).sort(),
        warnings_seen: cap.warnings.map((w) => `${w.category}: ${w.message}`),
      };
    }));
  } finally {
    icSettings.parallelAssembleResidues = restore;
  }
}

/** Replay `IC_Residue.assemble` on its own, including the reset that builds in the dihedron's own frame. */
function runAssemble(c: Case): Out {
  const parsed = captureWarnings(() => {
    const st = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!);
    for (const ch of st.getChains()) ch.atomToInternalCoordinates();
    return st;
  });
  if (parsed.error !== undefined) return { exc: err(parsed.error) };
  const s = parsed.result!;
  return attempt(() => {
    const out: unknown[] = [];
    for (const chain of [...s.getChains()].slice(0, 1)) {
      const cic = chain.internalCoord;
      if (cic === null || cic.dAtomsNeedsUpdate === undefined) continue;
      if (c.how === "all") cic.atomArrayValid.fill(0);
      else if (c.how === "ncac2") {
        // Only the second residue's backbone, so it has no valid N-CA-C of its own to build from.
        for (const ric of cic.orderedAaIcList.slice(1, 2)) {
          for (const nm of ["N", "CA", "C"]) {
            const ak = ric.akc!.get(nm);
            if (ak !== undefined) cic.atomArrayValid[cic.atomArrayIndex.get(ak.hashKey)!] = 0;
          }
        }
      }
      // `assemble` reads the di/hedra's local coordinates, which `initAtomCoords` is what fills in.
      cic.initAtomCoords();
      // Seeding happens in there, so invalidating after it leaves the first residue with no valid N-CA-C.
      if (c.how === "all_after") cic.atomArrayValid.fill(0);
      for (const ric of cic.orderedAaIcList) {
        out.push({
          res: ric.prettyStr(),
          got: attempt(() => sortById([...(assembleResidue(ric, c.reset) ?? new Map()).values()]
            .map((p) => [p.key.id, p.coord.map(enc6)]))),
          start: attempt(() => [...getStartpos(ric).values()].map((p) => p.key.id).sort()),
          default: attempt(() => [...defaultStartpos(ric).values()].map((p) => p.key.id).sort()),
        });
      }
      out.push({
        coords: Array.from({ length: cic.AAsiz }, (_, i) => [...cic.atomArray.subarray(i * 4, i * 4 + 4)].map(enc6)),
        valid: [...cic.atomArrayValid].map((v) => v === 1),
      });
    }
    return out;
  });
}

/**
 * The path to the first place two recorded results differ, which is what a mismatch report needs.
 *
 * @param a - The expected value. @param b - What the port produced. @returns A dotted path, with the two values.
 */
function firstDiff(a: unknown, b: unknown, path = ""): string {
  if (same(a, b)) return "";
  const obj = (x: unknown): boolean => x !== null && typeof x === "object";
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return firstDiff(a[i], b[i], `${path}[${i}]`);
  } else if (obj(a) && obj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])];
    for (const k of keys) if (!same(ao[k], bo[k])) return firstDiff(ao[k], bo[k], `${path}.${k}`);
  }
  // `JSON.stringify(undefined)` is undefined, not "undefined", so an absent value has to be spelled out:
  // a case that returns nothing where Python returned something used to crash the reporter.
  const show = (x: unknown): string => (x === undefined ? "undefined" : JSON.stringify(x).slice(0, 200));
  return `${path} ${show(a)} vs ${show(b)}`;
}


/** `set_accuracy_95`, which is a formatting round rather than an arithmetic one. */
function runAccuracy(c: Case): Out {
  const out = attempt(() => enc6(setAccuracy95(c.num!)));
  return out;
}

/** The three circular angle statistics, each a static on `Dihedron`. */
function runAngleStat(c: Case): Out {
  return attempt(() => {
    if (c.fn === "angle_dif") return enc6(Dihedron.angleDif(c.a as number, c.b as number));
    if (c.fn === "angle_avg") {
      return enc6(Dihedron.angleAvg(c.angles!, { inRads: c.in_rads === true, outRads: c.out_rads === true }));
    }
    return enc6(Dihedron.anglePopSd(c.angles!, c.avg!));
  });
}

/**
 * The accessors that need a measured chain: a hedron's bond lengths, a dihedron's `bits` and `difference`,
 * and what a set or a map keyed by edra does.
 */
function runEdraAccess(c: Case): Out {
  return attempt(() => {
    const parsed = captureWarnings(() => {
      const s = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", c.text!);
      s.atomToInternalCoordinates();
      return s;
    });
    if (parsed.error !== undefined) throw parsed.error;
    const chain = [...parsed.result!.getChains()][0]!;
    const cic = chain.internalCoord!;
    // The generator sorts by `gen_key`, which is the id, so sorting by id gives the same order.
    const hedra = [...cic.hedra.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const dihedra = [...cic.dihedra.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const out: Record<string, unknown> = {};
    if (c.what === "lengths") {
      out.hedra = hedra.slice(0, 6).map((h) => {
        const ak = h.atomkeys;
        const probes: AtomKey[][] = [[ak[0]!, ak[1]!], [ak[1]!, ak[0]!], [ak[1]!, ak[2]!], [ak[2]!, ak[1]!],
                                     [ak[0]!, ak[2]!], [ak[0]!], [], [ak[0]!, ak[1]!, ak[2]!]];
        return {
          id: h.id,
          get: probes.map((pr) => attempt(() => { const v = h.getLength(pr); return v === null ? null : enc6(v); })),
          set12: attempt(() => { h.setLength([ak[0]!, ak[1]!], 1.75); return [enc6(h.len12), h.needsUpdate]; }),
          set23: attempt(() => { h.setLength([ak[1]!, ak[2]!], 1.25); return [enc6(h.len23), h.needsUpdate]; }),
          set_bad: attempt(() => h.setLength([ak[0]!], 1.0)),
          // The angle is pinned first, as the generator pins it: the message quotes the hedron's repr, and
          // the measured angle agrees to about twelve places rather than to the last bit.
          set_absent: attempt(() => {
            (cic.hedraAngle as unknown as number[])[h.ndx] = 100.5;
            return h.setLength(
              [hedra[hedra.length - 1]!.atomkeys[0]!, hedra[hedra.length - 1]!.atomkeys[2]!], 1.0);
          }),
        };
      });
    }
    if (c.what === "bits") {
      out.flags = Object.fromEntries(Object.entries(PIC_FLAGS));
      out.dihedra = dihedra.map((d) => ({ id: d.id, bits: attempt(() => d.bits()),
                                          angle: attempt(() => enc6(d.angle)) }));
      out.difference = dihedra.map((d, i) =>
        attempt(() => enc6(d.difference(dihedra[(i + 1) % dihedra.length]!))));
    }
    if (c.what === "hash") {
      // A Map keyed by `hashKey` is what a Python set of edra is: duplicates collapse, and the survivors
      // are the equality classes.
      const setOf = (es: Edron[]): string[] =>
        [...new Map(es.concat(es).map((e) => [e.hashKey, e.id])).values()].sort();
      out.hedra_set = setOf(hedra);
      out.dihedra_set = setOf(dihedra);
      out.mixed_set_len = new Map([...hedra, ...dihedra].map((e) => [e.hashKey, e])).size;
      out.dict_round_trip = [...new Map(hedra.map((h) => [h.hashKey, h.id])).values()].sort();
    }
    return out;
  });
}

describe("Bio.PDB.internal_coords: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/ickey.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  const runners: Record<string, (c: Case) => Out> = { key: runKey, pair: runPair, sort: runSort, edron: runEdron, epair: runEpair, residue: runResidue, edra_build: runEdraBuild, split: runSplit, a2ic: runA2ic, i2a: runI2a, i2a_unset: runI2aUnset, i2a_ser: runI2aSer, assemble: runAssemble, accuracy: runAccuracy, angle_stat: runAngleStat, edra_access: runEdraAccess };
  for (const kind of ["key", "pair", "sort", "edron", "epair", "residue", "split", "edra_build", "a2ic", "i2a", "i2a_unset", "i2a_ser", "assemble", "accuracy", "angle_stat", "edra_access"]) {
    const list = cases.filter((c) => c.kind === kind);
    it(`${kind} (${list.length} cases, Biopython ${biopython})`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const got = runners[kind]!(c);
        const want: Out = c.exc ? { exc: c.exc } : { result: c.result };
        if (!outOk(want, got)) {
          bad.push(`${JSON.stringify(c.spec ?? c.a ?? c.keys ?? (c.text ?? "").slice(0, 60))} @${firstDiff(want, got)}\n    want ${JSON.stringify(want).slice(0, 300)}\n    got  ${JSON.stringify(got).slice(0, 300)}`);
        }
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 4).join("\n")}`).toBe(0);
    });
  }
});
