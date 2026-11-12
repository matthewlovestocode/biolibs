/** Replays the Bio.PDB.Superimposer golden cases (reference/golden/gen_svd_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { PDBParser, Superimposer } from "@biolibs/pdb";

interface Out { result?: unknown; exc?: { type: string; msg: string | null } }
interface Case { text: string; rigid: [number[][], number[]] | null; ops: any[][]; ops_out: Out[]; warnings: string[] }

const num = (x: number): unknown => (Number.isNaN(x) ? "nan" : x === Infinity ? "inf" : x === -Infinity ? "-inf" : x);
const flat = (a: any): { dtype: string; arr: unknown } => ({ dtype: a instanceof Float32Array ? "float32" : "float64", arr: Array.from(a as ArrayLike<number>, num) });
const mat = (rows: ArrayLike<ArrayLike<number>>): { dtype: string; arr: unknown } => ({ dtype: rows.length > 0 && (rows[0] as any) instanceof Float32Array ? "float32" : "float64", arr: Array.from(rows, (r) => Array.from(r, num)) });

function same(want: any, got: any, tol: number): boolean {
  if (typeof want === "number" && typeof got === "number") return want === got || Math.abs(want - got) <= tol * Math.max(1, Math.abs(want), Math.abs(got));
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => same(w, got[i], tol));
  if (want !== null && typeof want === "object") return got !== null && typeof got === "object" && Object.keys(want).every((k) => same(want[k], got[k], tol));
  return want === got;
}

function parse(text: string): any {
  return captureWarnings(() => new PDBParser({ permissive: true, quiet: true }).getStructure("x", text)).result;
}

describe("Bio.PDB.Superimposer: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/superimposer.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`set_atoms and apply (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const s1 = parse(c.text), s2 = parse(c.text);
      if (c.rigid) s2.transform(c.rigid[0].map((r) => Float32Array.from(r)), Float32Array.from(c.rigid[1]));
      const a1 = [...s1.getAtoms()], a2 = [...s2.getAtoms()];
      const pick = (atoms: any[], idx: number[]): any[] => idx.map((i) => atoms[i]);
      const sup = new Superimposer();
      const cap = captureWarnings(() => c.ops.map((op): Out => {
        try {
          if (op[0] === "set") { sup.setAtoms(pick(a1, op[1]), pick(a2, op[2])); return { result: [{ dtype: "float64", arr: num(sup.rms!) }, [mat(sup.rotran![0]), flat(sup.rotran![1])]] }; }
          if (op[0] === "apply" || op[0] === "apply_early") { sup.apply(pick(a2, op[1])); return { result: null }; }
          return { result: pick(a2, op[1]).map((a) => flat(a.getCoord())) };
        } catch (e) { return { exc: { type: (e as Error).name, msg: (e as Error).message } }; }
      }));
      let why = "";
      for (let i = 0; i < c.ops.length && !why; i++) {
        const w = c.ops_out[i]!, g = cap.result![i]!;
        // The rms of a perfect fit is rounding noise, so compare it with an absolute tolerance.
        const ok = w.exc ? g.exc !== undefined && g.exc.type === w.exc.type && g.exc.msg === w.exc.msg : g.exc === undefined && same(w.result, g.result, 1e-4);
        if (!ok) why = `op ${JSON.stringify(c.ops[i]).slice(0, 100)}: want ${JSON.stringify(w).slice(0, 300)} got ${JSON.stringify(g).slice(0, 300)}`;
      }
      if (!why && JSON.stringify(c.warnings) !== JSON.stringify(cap.warnings.map((w) => w.message))) why = "warnings differ";
      if (why) bad.push(why);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
