/** Replays Bio.Align.substitution_matrices golden cases (reference/golden/gen_matrix_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { substitutionMatrices as SM } from "@biolibs/align";

const { SubstitutionArray, readMatrix, loadMatrix, loadNames } = SM;
type J = unknown;
interface Case { kind: string; name?: string; text?: string; int?: boolean; spec?: any; ops?: any[][]; exc?: { type: string; msg: string | null } | undefined; [k: string]: any }

const encArr = (x: any): J => ({ $: "arr", alphabet: x.alphabet, shape: x.shape, int: x.dtype === "int", v: [...x.data], header: x.header ?? null });
const enc = (x: any): J => (x instanceof SubstitutionArray ? encArr(x) : Array.isArray(x) ? x.map(enc) : x);
const keyIn = (k: any): any => (Array.isArray(k) ? k : k);

function build(spec: any): InstanceType<typeof SubstitutionArray> {
  if (spec.entries) return SubstitutionArray.fromEntries(spec.entries, spec.int ? "int" : "float");
  return new SubstitutionArray({ alphabet: spec.alphabet, dims: spec.dims, data: spec.data ?? null, dtype: spec.int ? "int" : "float" });
}

function apply(m: InstanceType<typeof SubstitutionArray>, op: any[]): J {
  switch (op[0]) {
    case "get": return enc(m.get(keyIn(op[1])));
    case "set": m.set(keyIn(op[1]), op[2]); return encArr(m);
    case "getor": return enc(m.getOr(keyIn(op[1]), op[2]));
    case "has": return m.has(op[1]);
    case "keys": return m.keys();
    case "values": return m.values();
    case "items": return m.items();
    case "update": m.update(op[1]); return encArr(m);
    case "select": return encArr(m.select(op[1]));
    case "format": return m.format(op[1]);
    case "str": return m.toString();
    default: throw new Error(op[0]);
  }
}

function run(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  try {
    if (c.kind === "load") {
      const m = loadMatrix(c.name!);
      out["matrix"] = encArr(m);
      out["text"] = m.toString();
      out["forms"] = Object.fromEntries(["%d", "%.2f", "%5.1f", "%e", "%g", "%s", "%+.0f", "%-4i", "%04.1f"].map((f) => [f, m.format(f)]));
      out["keys"] = m.keys().slice(0, 60);
      out["items"] = m.items().slice(0, 60);
      out["rows"] = m.ndim === 2 ? Object.fromEntries([...m.alphabet].slice(0, 3).map((l) => [l, encArr(m.get(l))])) : {};
    } else if (c.kind === "names") out["names"] = loadNames();
    else if (c.kind === "read") out["matrix"] = encArr(readMatrix(c.text!, c.int ? "int" : "float"));
    else if (c.kind === "array") {
      const m = build(c.spec);
      out["array"] = encArr(m);
      const res: any[] = [];
      out["ops_out"] = res;
      for (const op of c.ops!) {
        try { res.push({ result: apply(m, op) }); } catch (e) { res.push({ exc: { type: (e as Error).name, msg: (e as Error).message } }); }
      }
      out["final"] = encArr(m);
    }
  } catch (e) {
    out["exc"] = { type: (e as Error).name, msg: (e as Error).message };
  }
  return out;
}

const norm = (x: any): any => x === undefined ? null : JSON.parse(JSON.stringify(x, (_, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v)));
const same = (a: any, b: any): boolean => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const excOk = (want: any, got: any): boolean => {
  const w = want?.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return !!w && !!got && w.type === got.type && (w.msg === null || w.msg === got.msg);
};

describe("substitution matrices: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/matrices.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  const groups = new Map<string, Case[]>();
  for (const c of cases) (groups.get(c.kind) ?? groups.set(c.kind, []).get(c.kind)!).push(c);
  for (const [kind, list] of groups) {
    it(`${kind} (${list.length} cases, Biopython ${biopython})`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const got = run(c);
        let why = "";
        if (c.exc || got["exc"]) { if (!excOk(c.exc, got["exc"])) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`; }
        for (const k of ["matrix", ...(c.kind === "load" ? ["text"] : []), "forms", "keys", "items", "rows", "names", "array", "final"]) {
          if (!why && (k in c || k in got) && !same(c[k], got[k])) why = `${k}: want ${JSON.stringify(c[k])?.slice(0, 300)} got ${JSON.stringify(got[k])?.slice(0, 300)}`;
        }
        if (!why && c.ops_out) c.ops_out.forEach((w: any, i: number) => {
          const g = got["ops_out"]?.[i];
          if (!why && (w.exc || g?.exc ? !excOk(w.exc, g?.exc) : !same(w.result, g?.result))) why = `op ${JSON.stringify(c.ops![i])}: want ${JSON.stringify(w)?.slice(0, 200)} got ${JSON.stringify(g)?.slice(0, 200)}`;
        });
        if (why) bad.push(`${JSON.stringify(c.spec ?? c.name ?? c.text)?.slice(0, 120)}\n    ${why}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
    });
  }
});
