/** Replays the Bio.PDB.Polypeptide golden cases (reference/golden/gen_poly_cases.py): lookups, isAa/isNucleic, PPBuilder and CaPPBuilder. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import * as P from "@biolibs/pdb";
import { excOk, type Exc } from "./encode.js";

interface Case { kind: "build" | "func"; text: string; builder: string; radius: number | null; aa_only: number | boolean; path: number[]; func: string; args: any[]; result?: unknown; pps?: any[]; after?: any[]; exc?: Exc; warnings: string[] }

const num = (x: number | null | undefined): unknown => (x === null || x === undefined ? null : Number.isNaN(x) ? "nan" : x === Infinity ? "inf" : x === -Infinity ? "-inf" : x);
const node = (s: any, path: number[]): any => path.reduce((x, i) => x.childList[i], s);
const xtra = (r: any): unknown => Object.fromEntries(Object.entries(r.xtra as Record<string, number | null>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, num(v)]));
const sel = (r: any): unknown => r.getList().map((a: any) => (a.isDisordered() === 2 ? a.selectedChild.altloc : null));
const tryEnc = (out: any, key: string, f: () => unknown): void => {
  try { out[key] = f(); } catch (e) { out[key + "_exc"] = { type: (e as Error).name, msg: (e as Error).message }; }
};

function encPp(pp: P.Polypeptide): any {
  const out: any = { len: pp.length, ids: pp.map((r) => r.id), names: pp.map((r) => r.getResname()), seq: String(pp.getSequence()) };
  try { out.repr = pp.repr(); } catch (e) { out.repr_exc = (e as Error).name; }
  tryEnc(out, "ca", () => pp.getCaList().map((a) => a.repr()));
  tryEnc(out, "phipsi", () => pp.getPhiPsiList().map(([a, b]) => [num(a), num(b)]));
  tryEnc(out, "tau", () => pp.getTauList().map(num));
  tryEnc(out, "theta", () => pp.getThetaList().map(num));
  out.xtra = [...pp].map(xtra);
  out.sel = [...pp].map(sel);
  return out;
}

function run(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  const cap = captureWarnings(() => {
    if (c.kind === "func") {
      const f: Record<string, (...a: any[]) => unknown> = { index_to_one: P.indexToOne, index_to_three: P.indexToThree, one_to_index: P.oneToIndex, three_to_index: P.threeToIndex, is_aa: P.isAa, is_nucleic: P.isNucleic };
      out["result"] = f[c.func]!(...c.args);
      return;
    }
    const s = captureWarnings(() => new P.PDBParser({ permissive: true, quiet: true }).getStructure("x", c.text)).result as any;
    const b = c.builder === "ca" ? new P.CaPPBuilder(...(c.radius === null ? [] : [c.radius])) : new P.PPBuilder(...(c.radius === null ? [] : [c.radius]));
    const pps = b.buildPeptides(node(s, c.path), c.aa_only as number);
    out["pps"] = pps.map(encPp);
    out["after"] = s.childList.flatMap((m: any) => m.childList.flatMap((ch: any) => ch.childList.map((r: any) => [xtra(r), sel(r)])));
  });
  if (cap.error !== undefined) { delete out["pps"]; out["exc"] = { type: (cap.error as Error).name, msg: (cap.error as Error).message }; }
  out["warnings"] = cap.warnings.map((w) => w.message);
  return out;
}

/** Floats compare to 1e-6 (angles go through arccos); everything else exactly. */
function same(want: any, got: any): boolean {
  if (typeof want === "number" && typeof got === "number") return want === got || Math.abs(want - got) <= 1e-6 * Math.max(1, Math.abs(want), Math.abs(got)) || Math.abs(Math.abs(want) - Math.PI) + Math.abs(Math.abs(got) - Math.PI) < 1e-6;
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => same(w, got[i]));
  if (want !== null && typeof want === "object") return got !== null && typeof got === "object" && Object.keys(want).length === Object.keys(got).length && Object.keys(want).every((k) => same(want[k], got[k]));
  return want === got;
}

describe("Bio.PDB.Polypeptide: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/polypeptide.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`builders and lookups (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const got = run(c);
      let why = "";
      if (!excOk(c.exc, got["exc"])) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
      else if (!c.exc && !same(c.kind === "func" ? c.result : [c.pps, c.after], c.kind === "func" ? got["result"] : [got["pps"], got["after"]])) {
        why = `result: want ${JSON.stringify(c.kind === "func" ? c.result : c.pps).slice(0, 400)} got ${JSON.stringify(c.kind === "func" ? got["result"] : got["pps"]).slice(0, 400)}`;
      } else if (JSON.stringify(c.warnings) !== JSON.stringify(got["warnings"])) why = `warnings: want ${JSON.stringify(c.warnings).slice(0, 200)} got ${JSON.stringify(got["warnings"]).slice(0, 200)}`;
      if (why) bad.push(`${c.kind} ${c.func ?? c.builder} ${JSON.stringify(c.args ?? [c.radius, c.aa_only, c.path])}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
