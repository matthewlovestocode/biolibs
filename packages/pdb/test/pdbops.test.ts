/** Replays the Bio.PDB entity-operation golden cases (reference/golden/gen_pdbops_cases.py): transform, center of mass, setters, item access, disordered methods. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings, pyRepr } from "@biolibs/core";
import { PDBParser } from "@biolibs/pdb";
import { excOk, type Exc } from "./encode.js";

interface Case { text: string; ops: any[][]; ops_out: { result?: unknown; exc?: Exc }[]; warnings: string[] }

const SPECIAL: Record<string, number> = { nan: NaN, inf: Infinity, "-inf": -Infinity };
const val = (v: any): any => (typeof v === "string" && Object.hasOwn(SPECIAL, v) ? SPECIAL[v] : v);
const num = (x: number): unknown => (Number.isNaN(x) ? "nan" : x === Infinity ? "inf" : x === -Infinity ? "-inf" : x);
const dtype = (a: ArrayLike<number>): string => (a instanceof Float32Array ? "float32" : "float64");
const arr = (a: ArrayLike<number>): unknown => ({ dtype: dtype(a), arr: Array.from(a, num) });
class IndexErr extends Error { override name = "IndexError"; }
const node = (s: any, path: number[]): any => path.reduce((x, i) => {
  if (!x.childList) throw new TypeError("no child_list");
  if (i >= x.childList.length) throw new IndexErr("list index out of range");
  return x.childList[i];
}, s);
const key = (k: any): any => k;
const reprs = (it: Iterable<any>): string[] => [...it].map((c) => c.repr()).slice(0, 15);

function atomsState(s: any): unknown[] {
  const out: unknown[] = [];
  for (const m of s.childList) for (const c of m.childList) for (const r of c.getUnpackedList()) for (const a of r.getUnpackedList()) out.push(arr(a.coord));
  return out;
}
function typed(spec: any[], kind: "m" | "t"): any {
  const f32 = spec[spec.length - 1] === "f";
  const mk = (xs: number[]): ArrayLike<number> => (f32 ? Float32Array.from(xs) : Float64Array.from(xs));
  return kind === "m" ? spec[1].map((row: any[]) => mk(row.map(val))) : mk(spec[1].map(val));
}
/** Python's repr of a dict key from the internal id key (`s` string, `n` number, `t` tuple). */
function keyRepr(k: string): string {
  if (k[0] === "s") return pyRepr(k.slice(1));
  if (k[0] === "n") return k.slice(1);
  return pyRepr(JSON.parse(k.slice(1)).map((v: unknown) => v)).replace(/^\[/, "(").replace(/\]$/, ")");
}
function state(x: any): unknown { return [x.length, reprs(x.childList), [...x.childDict.keys()].map(keyRepr).sort().slice(0, 15)]; }

function apply(s: any, op: any[]): unknown {
  const x = node(s, op[1]);
  const need = (name: string): any => { if (typeof x[name] !== "function") throw new TypeError(`no ${name}`); return x[name].bind(x); };
  switch (op[0]) {
    case "transform": need("transform")(typed(op[2], "m"), typed(op[3], "t")); return atomsState(s);
    case "com": return arr(op[2] === "disordered" ? need("centerOfMass")() : need("centerOfMass")(op[2]));
    case "vector": { const v = need("getVector")(); return [v.repr(), v.ar.map(num)]; }
    case "set": {
      const [name, v0] = [op[2], val(op[3])];
      const v = name === "coord" ? Float32Array.from((op[3] as any[]).map(val)) : v0;
      const m: Record<string, [string, string]> = { altloc: ["setAltloc", "getAltloc"], bfactor: ["setBfactor", "getBfactor"], occupancy: ["setOccupancy", "getOccupancy"], charge: ["setCharge", "getCharge"], radius: ["setRadius", "getRadius"], serial_number: ["setSerialNumber", "getSerialNumber"], coord: ["setCoord", "getCoord"] };
      need(m[name]![0])(v);
      const g = need(m[name]![1])();
      return name === "coord" ? arr(g) : typeof g === "number" ? num(g) : g;
    }
    case "level": return need("getLevel")();
    case "iterator": return reprs(need("getIterator")());
    case "residues": return reprs(need("getResidues")());
    case "chains": return reprs(need("getChains")());
    case "models": return reprs(need("getModels")());
    case "atoms": return reprs(need("getAtoms")());
    case "setitem": {
      // An Atom has no `set`, which is how the port says what Python says by refusing `__setitem__`.
      if (typeof x.set !== "function") throw new TypeError(`'${x.constructor.name}' object does not support item assignment`);
      const child = node(s, op[3]).copy(); need("set")(key(op[2]), child); return [x.selectedChild === null ? "None" : x.selectedChild.repr(), [...x.childDict.keys()].map(keyRepr).sort()]; }
    case "delitem": need("delete")(key(op[2])); return state(x);
    case "dis": {
      const [m, arg] = [op[2], op[3]];
      if (m === "has") return need("disorderedHasId")(arg);
      if (m === "ids") return need("disorderedGetIdList")();
      if (m === "get") return need("disorderedGet")(arg).repr();
      if (m === "select") need("disorderedSelect")(arg);
      else need("disorderedRemove")(arg);
      return [x.selectedChild === null ? "None" : x.selectedChild.repr(), need("disorderedGetIdList")()];
    }
    case "get_list": return reprs(need("getList")());
    case "cmp": {
      // `compare` returns a sign; Python's operators turn it into a boolean. A wrapper compares as its selected
      // child, which is where the TypeError for an incomparable operand comes from.
      const other = Array.isArray(op[2]) ? node(s, op[2]) : val(op[2]);
      const symbol = { lt: "<", le: "<=", gt: ">", ge: ">=" }[op[3] as "lt"] as "<";
      // A chain's operators are not an ordering (a blank id answers 0 or 1 whichever way it is asked), so it has
      // its own method; everything else turns `compare`'s sign into the operator's answer.
      if (typeof x.compareOp === "function") return x.compareOp(other, symbol);
      const sign = need("compare")(other, symbol) as number;
      return { lt: sign < 0, le: sign <= 0, gt: sign > 0, ge: sign >= 0 }[op[3] as "lt"];
    }
    case "item": {
      // An Atom is not a container: it has none of these, which is how the port says what Python says.
      const name = x.constructor.name;
      if (op[2] === "len") {
        if (typeof x.length !== "number") throw new TypeError(`object of type '${name}' has no len()`);
        return x.length;
      }
      if (op[2] === "contains") {
        if (typeof x.has !== "function") throw new TypeError(`argument of type '${name}' is not a container or iterable`);
        return x.has(key(op[3]));
      }
      if (typeof x.get !== "function") throw new TypeError(`'${name}' object is not subscriptable`);
      return x.get(key(op[3])).repr();
    }
    case "detach_parent": need("detachParent")(); return x.getParent() === null;
  }
  throw new Error(op[0]);
}

/** Floats compare to 1e-5 (single precision accumulates differently from NumPy's BLAS) unless both sides are float64. */
function same(want: any, got: any): boolean {
  if (typeof want === "number" && typeof got === "number") return want === got || Math.abs(want - got) <= 1e-5 * Math.max(1, Math.abs(want), Math.abs(got));
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => same(w, got[i]));
  if (want !== null && typeof want === "object") return got !== null && typeof got === "object" && Object.keys(want).every((k) => same(want[k], got[k]));
  return want === got;
}

describe("Bio.PDB entity operations: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/pdbops.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`operations (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const s = captureWarnings(() => new PDBParser({ permissive: true, quiet: true }).getStructure("x", c.text)).result as any;
      const cap = captureWarnings(() => c.ops.map((op) => {
        try { return { result: apply(s, op) }; } catch (e) { return { exc: { type: (e as Error).name, msg: (e as Error).message } as Exc }; }
      }));
      const got = cap.result!;
      let why = "";
      for (let i = 0; i < c.ops.length && !why; i++) {
        const w = c.ops_out[i]!, g = got[i]!;
        const ok = w.exc ? excOk(w.exc, g.exc) : !g.exc && same(w.result, g.result);
        if (!ok) why = `op ${JSON.stringify(c.ops[i])}: want ${JSON.stringify(w).slice(0, 300)} got ${JSON.stringify(g, (_, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v)).slice(0, 300)}`;
      }
      if (!why && JSON.stringify(c.warnings) !== JSON.stringify(cap.warnings.map((w) => w.message))) why = `warnings: want ${JSON.stringify(c.warnings)} got ${JSON.stringify(cap.warnings.map((w) => w.message))}`;
      if (why) bad.push(why + " :: " + JSON.stringify(c.ops).slice(0, 900));
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 8).join("\n")}`).toBe(0);
  });
});
