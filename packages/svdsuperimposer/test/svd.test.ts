/** Replays the Bio.SVDSuperimposer golden cases (reference/golden/gen_svd_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SVDSuperimposer } from "@biolibs/svdsuperimposer";

interface Out { result?: unknown; exc?: { type: string; msg: string | null } }
interface Case { ops: any[][]; ops_out: Out[] }

const num = (x: number): unknown => (Number.isNaN(x) ? "nan" : x === Infinity ? "inf" : x === -Infinity ? "-inf" : x);
const dtype = (a: ArrayLike<unknown>): string => (a instanceof Float32Array ? "float32" : "float64");
const arr = (a: ArrayLike<any>, nested: boolean): unknown => ({ dtype: nested ? (a.length > 0 && a[0] instanceof Float32Array ? "float32" : "float64") : dtype(a), arr: nested ? Array.from(a, (r: ArrayLike<number>) => Array.from(r, num)) : Array.from(a as ArrayLike<number>, num) });
const points = (rows: number[][], f32: boolean): ArrayLike<ArrayLike<number>> => (f32 ? rows.map((r) => Float32Array.from(r)) : rows);

function apply(sup: SVDSuperimposer, op: any[], scalar: string): unknown {
  switch (op[0]) {
    case "set": sup.set(points(op[1], op[3] === "f"), points(op[2], op[3] === "f")); return null;
    case "run": sup.run(); return null;
    case "transformed": return arr(sup.getTransformed() as any, true);
    case "rotran": { const [rot, tran] = sup.getRotran(); return [arr(rot as any, true), arr(tran, false)]; }
    case "init_rms": return { dtype: scalar, arr: num(sup.getInitRms()) };
    case "rms": return { dtype: scalar, arr: num(sup.getRms()) };
  }
  throw new Error(op[0]);
}

/** Numbers compare to 1e-6 relative (single precision cases accumulate differently), with an absolute floor for values near zero. */
function same(want: any, got: any, tol: number): boolean {
  if (typeof want === "number" && typeof got === "number") return want === got || Math.abs(want - got) <= tol * Math.max(1, Math.abs(want), Math.abs(got));
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => same(w, got[i], tol));
  if (want !== null && typeof want === "object") return got !== null && typeof got === "object" && Object.keys(want).every((k) => same(want[k], got[k], tol));
  return want === got;
}

describe("Bio.SVDSuperimposer: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/svd.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`superimpose (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const sup = new SVDSuperimposer();
      let why = "";
      let scalar = "float64";
      for (let i = 0; i < c.ops.length && !why; i++) {
        const w = c.ops_out[i]!;
        let got: Out;
        if (c.ops[i]![0] === "set") scalar = c.ops[i]![3] === "f" ? "float32" : "float64";
        try { got = { result: apply(sup, c.ops[i]!, scalar) }; } catch (e) { got = { exc: { type: (e as Error).name, msg: (e as Error).message } }; }
        const f32 = JSON.stringify(w).includes("float32");
        const ok = w.exc ? got.exc !== undefined && got.exc.type === w.exc.type && got.exc.msg === w.exc.msg : got.exc === undefined && same(w.result, got.result, f32 ? 1e-4 : 1e-8);
        if (!ok) why = `op ${JSON.stringify(c.ops[i]).slice(0, 120)}: want ${JSON.stringify(w).slice(0, 300)} got ${JSON.stringify(got).slice(0, 300)}`;
      }
      if (why) bad.push(why);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
