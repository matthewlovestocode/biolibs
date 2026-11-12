/** Replays the Bio.PDB.SASA golden cases (reference/golden/gen_sasa_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { PDBParser, ShrakeRupley } from "@biolibs/pdb";
import { excOk, type Exc } from "./encode.js";

interface Out { result?: [string, unknown[], number | string][]; exc?: Exc }
interface Case { text: string; kwargs: { probe_radius?: number; n_points?: number; radii_dict?: Record<string, number> }; ops: [number[], string][]; ops_out: Out[]; radii: [string, number][]; exc?: Exc; warnings: string[] }

const node = (s: any, path: number[]): any => path.reduce((x, i) => x.childList[i], s);

/** Every `sasa` that has been set, in the generator's order: [kind, full id, value]. */
function collect(s: any): [string, unknown, number][] {
  const out: [string, unknown, number][] = [];
  const visit = (x: any, kind: string): void => { if (Object.hasOwn(x, "sasa") && x.sasa !== undefined) out.push([kind, x.getFullId(), x.sasa]); };
  visit(s, "S");
  for (const m of s.childList) {
    visit(m, "M");
    for (const c of m.childList) {
      visit(c, "C");
      for (const r of c.childList) { visit(r, "R"); for (const a of r.childList) visit(a, "A"); }
    }
  }
  return out;
}

/** SASA values compare to 1e-9 relative: the sums add numbers in different orders. Everything else exactly. */
function same(want: any, got: any): boolean {
  if (typeof want === "number" && typeof got === "number") return want === got || Math.abs(want - got) <= 1e-9 * Math.max(1, Math.abs(want));
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => same(w, got[i]));
  return want === got;
}

describe("Bio.PDB.SASA: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/sasa.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`ShrakeRupley (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const s = captureWarnings(() => new PDBParser({ permissive: true, quiet: true }).getStructure("x", c.text)).result as any;
      let sr: ShrakeRupley;
      try { sr = new ShrakeRupley(c.kwargs.probe_radius, c.kwargs.n_points, c.kwargs.radii_dict ?? null); } catch (e) {
        if (!excOk(c.exc, { type: (e as Error).name, msg: (e as Error).message })) bad.push(`ctor ${JSON.stringify(c.kwargs)}: want ${JSON.stringify(c.exc)} got ${(e as Error).message}`);
        continue;
      }
      if (c.exc) { bad.push(`ctor ${JSON.stringify(c.kwargs)}: want ${JSON.stringify(c.exc)}, got an object`); continue; }
      let why = "";
      c.ops.forEach(([path, level], i) => {
        if (why) return;
        const w = c.ops_out[i]!;
        let g: Out;
        try { sr.compute(node(s, path), level); g = { result: collect(s) as never }; } catch (e) { g = { exc: { type: (e as Error).name, msg: (e as Error).message } }; }
        const ok = w.exc ? excOk(w.exc, g.exc) : g.exc === undefined && same(w.result, g.result);
        if (!ok) why = `${JSON.stringify(c.kwargs)} compute(${JSON.stringify(path)}, ${level}): want ${JSON.stringify(w).slice(0, 300)} got ${JSON.stringify(g).slice(0, 300)}`;
      });
      const radii = [...sr.radiiDict].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      if (!why && JSON.stringify(radii) !== JSON.stringify(c.radii)) why = `radii dict: want ${JSON.stringify(c.radii).slice(0, 200)} got ${JSON.stringify(radii).slice(0, 200)}`;
      if (why) bad.push(why);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
