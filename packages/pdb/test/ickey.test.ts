/** Replays the Bio.PDB.internal_coords.AtomKey golden cases (reference/golden/gen_ickey_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AtomKey, Dihedron, Edron, Hedron, IC_Chain, IC_Residue, PDBParser } from "@biolibs/pdb";

type Exc = { type: string; msg: string | null };
type Out = { result?: unknown; exc?: Exc };
interface Spec { how: string; value: unknown }
interface Spec2 { cls: string; how: string; keys: string[] }
interface Case { kind: string; text?: string; spec?: Spec | Spec2; a?: Spec | Spec2; b?: Spec | Spec2; keys?: string[]; result?: unknown; exc?: Exc; warnings: string[] }

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

/** The residues of the first chains, accepted and wired to their neighbours, as the generator wires them. */
function wiredResidues(text: string, chainLimit: number, resLimit: number): { cic: IC_Chain; rics: IC_Residue[] }[] {
  const s = new PDBParser({ PERMISSIVE: true, QUIET: true }).getStructure("x", text);
  return [...s.getChains()].slice(0, chainLimit).map((chain) => {
    const cic = new IC_Chain();
    const rics: IC_Residue[] = [];
    for (const res of [...chain.getResidues()].slice(0, resLimit)) {
      const ric = new IC_Residue(res);
      if (!ric.isAccept) continue;
      ric.cic = cic;
      rics.push(ric);
    }
    rics.forEach((ric, i) => {
      ric.rprev = i > 0 ? [rics[i - 1]!] : [];
      ric.rnext = i + 1 < rics.length ? [rics[i + 1]!] : [];
    });
    return { cic, rics };
  });
}

const sortedIds = (m: Map<string, { id: string }>): string[] => [...m.values()].map((e) => e.id).sort();

function runEdraBuild(c: Case): Out {
  return attempt(() =>
    wiredResidues(c.text!, 2, 8).map(({ cic, rics }) => ({
      built: rics.map((ric) => attempt(() => { ric.createEdra(); return null; })),
      chain_hedra: sortedIds(cic.hedra),
      chain_dihedra: sortedIds(cic.dihedra),
      residues: rics.map((ric) => ({
        pretty: ric.prettyStr(),
        hedra: sortedIds(ric.hedra),
        dihedra: sortedIds(ric.dihedra),
        primary: [...ric.dihedra.values()].filter((d) => d.primary).map((d) => d.id).sort(),
        NCaCKey: attempt(() => ric.NCaCKey.map((t) => t.map((k) => k.id)).sort()),
        ak_set: [...ric.akSet].map((k) => k.id).sort(),
      })),
    })));
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

describe("Bio.PDB.internal_coords: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/ickey.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  const runners: Record<string, (c: Case) => Out> = { key: runKey, pair: runPair, sort: runSort, edron: runEdron, epair: runEpair, residue: runResidue, edra_build: runEdraBuild, split: runSplit };
  for (const kind of ["key", "pair", "sort", "edron", "epair", "residue", "split", "edra_build"]) {
    const list = cases.filter((c) => c.kind === kind);
    it(`${kind} (${list.length} cases, Biopython ${biopython})`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const got = runners[kind]!(c);
        const want: Out = c.exc ? { exc: c.exc } : { result: c.result };
        if (!outOk(want, got)) {
          bad.push(`${JSON.stringify(c.spec ?? c.a ?? c.keys ?? (c.text ?? "").slice(0, 60))}\n    want ${JSON.stringify(want).slice(0, 300)}\n    got  ${JSON.stringify(got).slice(0, 300)}`);
        }
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 4).join("\n")}`).toBe(0);
    });
  }
});
