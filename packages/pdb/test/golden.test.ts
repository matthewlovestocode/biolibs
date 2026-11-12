/** Replays Bio.PDB golden cases (reference/golden/gen_pdb_cases.py) against the TypeScript port. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { PDBParser } from "@biolibs/pdb";
import { canon, encStructure, excOk, type Exc } from "./encode.js";

interface Case { kind: string; text: string; pqr?: boolean; permissive?: boolean; quiet?: boolean; id?: string; exc?: Exc; structure?: unknown; header?: unknown; trailer?: unknown; line_counter?: number; warnings: string[] }

class IndexErr extends Error { override name = "IndexError"; }
class TypeErr extends Error { override name = "TypeError"; }
const node = (s: any, path: number[]): any => {
  let x = s;
  for (const i of path) {
    if (!x.childList) throw new TypeErr("no child_list");
    if (i >= x.childList.length) throw new IndexErr("list index out of range");
    x = x.childList[i];
  }
  return x;
};
const meth = (x: any, name: string): any => { if (typeof x[name] !== "function") throw new TypeErr(`no ${name}`); return x[name].bind(x); };
const ids = (x: any): unknown => x.childList.map((c: any) => c.id);
function applyOp(s: any, op: any[]): unknown {
  const x = node(s, op[1]);
  switch (op[0]) {
    case "len": if (typeof x.length !== "number") throw new TypeErr("no len"); return x.length;
    case "ids": return ids(x);
    case "get": return meth(x, "get")(op[2]).repr();
    case "contains": return meth(x, "has")(op[2]);
    case "repr": return x.repr();
    case "unpacked": return meth(x, "getUnpackedList")().map((a: any) => a.repr());
    case "dist": { const y = node(s, op[2]); return meth(x, "minus")(y); }
    case "cmp": { const y = node(s, op[2]); const e = x.equals(y); const c = x.compare(y); return [e, !e, c < 0, c <= 0, c > 0, c >= 0]; }
    case "setid": x.id = op[2]; return [x.getFullId(), x.childList.map((c: any) => c.getFullId()).slice(0, 3)];
    case "detach": meth(x, "detachChild")(op[2]); return [x.length, ids(x)];
    case "copy": { const y = x.copy(); return [meth(x, "strictlyEquals")(y), x.strictlyEquals(y, true), (typeof y.length === "number" ? y.length : (() => { throw new TypeErr("no len"); })()), y.getParent() === null, y.getFullId()]; }
    case "strict": { const y = node(s, op[2]); return meth(x, "strictlyEquals")(y); }
    case "insert": meth(x, "insert")(op[2], node(s, op[3]).copy()); return [x.length, ids(x)];
    case "atoms": return [...meth(x, "getAtoms")()].map((a: any) => a.repr()).slice(0, 12);
  }
  throw new Error(op[0]);
}
function runOps(c: any): Record<string, any> {
  const out: Record<string, any> = {};
  const cap = captureWarnings(() => {
    const s = new PDBParser({ permissive: true }).getStructure("x", c.text);
    out["ops_out"] = c.ops.map((op: any[]) => {
      try { return { result: applyOp(s, op) }; } catch (e) { return { exc: { type: (e as Error).name, msg: (e as Error).message } }; }
    });
  });
  if (cap.error !== undefined) out["exc"] = { type: (cap.error as Error).name, msg: (cap.error as Error).message };
  out["warnings"] = cap.warnings.map((w) => w.message);
  return out;
}

function run(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  const cap = captureWarnings(() => {
    const p = new PDBParser({ permissive: c.permissive ?? true, quiet: c.quiet ?? false, isPqr: c.pqr ?? false });
    const s = p.getStructure(c.id ?? "x", c.text);
    out["structure"] = encStructure(s);
    out["header"] = p.getHeader();
    out["trailer"] = p.getTrailer();
    out["line_counter"] = p.lineCounter;
  });
  if (cap.error !== undefined) out["exc"] = { type: (cap.error as Error).name, msg: (cap.error as Error).message };
  out["warnings"] = cap.warnings.map((w) => w.message);
  return out;
}

describe("PDBParser: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/pdb.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`parse (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const got = c.kind === "ops" ? runOps(c) : run(c);
      let why = "";
      if (c.kind === "ops" && !c.exc) {
        const w = (c as any).ops_out as any[], g = got["ops_out"] as any[];
        for (let i = 0; i < w.length && !why; i++) {
          const ok = w[i].exc ? excOk({ type: w[i].exc.type, msg: null }, g[i].exc) : !g[i].exc && canon(w[i].result) === canon(g[i].result);
          if (!ok) why = `op ${JSON.stringify((c as any).ops[i])}: want ${canon(w[i]).slice(0, 300)} got ${canon(g[i]).slice(0, 300)}`;
        }
        if (!why && JSON.stringify(c.warnings) !== JSON.stringify(got["warnings"])) { const W = c.warnings, G = got["warnings"] as string[]; const d = W.findIndex((w, i) => w !== G[i]); const k = d < 0 ? W.length : d; why = `warnings[${k}]: want ${JSON.stringify(W[k])} got ${JSON.stringify(G[k])} (n ${W.length}/${G.length}) ops ${JSON.stringify((c as any).ops)}`; }
        if (why) bad.push(why);
        continue;
      }
      if (!excOk(c.exc, got["exc"])) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
      else if (!c.exc) {
        for (const k of ["structure", "header", "trailer", "line_counter"]) {
          if (!why && canon((c as any)[k]) !== canon(got[k])) why = `${k}: want ${canon((c as any)[k]).slice(0, 400)} got ${canon(got[k])?.slice(0, 400)}`;
        }
      }
      if (!why && JSON.stringify(c.warnings) !== JSON.stringify(got["warnings"])) why = `warnings: want ${JSON.stringify(c.warnings).slice(0, 300)} got ${JSON.stringify(got["warnings"]).slice(0, 300)}`;
      if (why) bad.push(`${JSON.stringify(c.text.slice(0, 120))}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
