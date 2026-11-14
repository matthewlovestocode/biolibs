/** Replays the KDTree / NeighborSearch golden cases (reference/golden/gen_nsearch_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { getUniqueParents, unfoldEntities, uniqueify, KDTree, Neighbor, NeighborSearch, PDBParser, Point } from "@biolibs/pdb";
import { excOk, type Exc } from "./encode.js";

interface Out { result?: unknown; exc?: Exc }
interface Case { kind: "kdtree" | "ns" | "point" | "neighbor" | "sel"; fn: string; paths: number[][]; single: boolean; level: string; result: unknown; args: number[];  coords: number[][]; bucket: number; text: string; mode: string; indices: number[] | null; ops: any[][]; ops_out: Out[]; exc?: Exc; warnings: string[]; repr?: Out; str?: Out }

const num = (x: number): unknown => (Number.isNaN(x) ? "nan" : x);
const parse = (text: string): any => captureWarnings(() => new PDBParser({ permissive: true, quiet: true }).getStructure("x", text)).result;

function atomList(s: any, mode: string, indices: number[] | null): any[] {
  if (mode === "unpacked") return s.childList.flatMap((m: any) => m.childList.flatMap((c: any) => c.getUnpackedList().flatMap((r: any) => r.getUnpackedList())));
  const atoms = [...s.getAtoms()];
  return mode === "all" ? atoms : indices!.map((i) => atoms[i]);
}

function runOp(c: Case, tree: KDTree | NeighborSearch, op: any[]): unknown {
  if (c.kind === "kdtree") {
    const t = tree as KDTree;
    if (op[0] === "search") return t.search(op[1], op[2]).map((p) => [p.index, num(p.radius)]);
    const f = op[0] === "neighbor" ? t.neighborSearch(op[1]) : t.neighborSimpleSearch(op[1]);
    return f.map((n) => [n.index1, n.index2, num(n.radius)]);
  }
  const ns = tree as NeighborSearch;
  if (op[0] === "search") return ns.search(op[1], op[2], op[3]).map((e: any) => e.getFullId());
  const pairs = ns.searchAll(op[1], op[2]).map(([a, b]: any) => [a.getFullId(), b.getFullId()]);
  // Above atom level Python's order is a hash order, so both sides are compared sorted.
  return op[2] === "A" ? pairs : pairs.sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1));
}

/** Python's `sorted(..., key=json.dumps)`: compare by the JSON text. */
function sameSorted(want: any, got: any): boolean { return JSON.stringify(want) === JSON.stringify(got); }

function same(want: any, got: any): boolean {
  if (typeof want === "number" && typeof got === "number") return want === got || Math.abs(want - got) <= 1e-12 * Math.max(1, Math.abs(want));
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => same(w, got[i]));
  return want === got;
}

/** What a call produced, in the shape the cases record. */
const attempt = (f: () => unknown): Out => {
  try { return { result: f() }; } catch (e) { return { exc: { type: (e as Error).name, msg: (e as Error).message } }; }
};

describe("KDTree and NeighborSearch: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/nsearch.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`searches (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      if (c.kind === "point" || c.kind === "neighbor") {
        const obj = c.kind === "point" ? new Point(c.args[0]!, c.args[1]) : new Neighbor(c.args[0]!, c.args[1]!, c.args[2]);
        const fields = obj instanceof Point ? [obj.index, obj.radius] : [obj.index1, obj.index2, obj.radius];
        if (!same(c.result, fields)) bad.push(`${c.kind} ${c.args}`);
        // Printing one of these raises in Biopython, and the cases record that like any other result.
        for (const [what, want] of [["repr", c.repr], ["str", c.str]] as const) {
          const got = attempt(() => (what === "repr" ? obj.repr() : obj.toString()));
          if (JSON.stringify(want) !== JSON.stringify(got)) bad.push(`${c.kind} ${c.args} ${what}: want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
        }
        continue;
      }
      if (c.kind === "sel") {
        const s = parse(c.text);
        const ents = c.paths.map((p) => p.reduce((x: any, i) => x.childList[i], s));
        const cap = captureWarnings(() => {
          if (c.fn === "unfold") return (unfoldEntities(c.single ? ents[0] : ents, c.level) as any[]).map((e) => e.getFullId());
          const list = c.fn === "parents" ? getUniqueParents(ents) : uniqueify([...ents, ...ents]);
          return (list as any[]).map((e) => e.getFullId()).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
        });
        const ok = cap.error !== undefined ? excOk(c.exc, { type: (cap.error as Error).name, msg: (cap.error as Error).message }) : !c.exc && JSON.stringify(c.result) === JSON.stringify(cap.result);
        if (!ok) bad.push(`sel ${c.fn} ${JSON.stringify(c.paths)} ${c.level}: want ${JSON.stringify(c.exc ?? c.result).slice(0, 200)} got ${JSON.stringify(cap.error ? (cap.error as Error).message : cap.result).slice(0, 200)}`);
        continue;
      }
      let tree: KDTree | NeighborSearch;
      const cap = captureWarnings(() => (c.kind === "kdtree" ? new KDTree(c.coords, c.bucket) : new NeighborSearch(atomList(parse(c.text), c.mode, c.indices), c.bucket)));
      if (cap.error !== undefined) {
        if (!excOk(c.exc, { type: (cap.error as Error).name, msg: (cap.error as Error).message })) bad.push(`construct: want ${JSON.stringify(c.exc)} got ${(cap.error as Error).message}`);
        continue;
      }
      if (c.exc) { bad.push(`construct: want ${JSON.stringify(c.exc)}, got a tree`); continue; }
      tree = cap.result!;
      let why = "";
      for (let i = 0; i < c.ops.length && !why; i++) {
        const w = c.ops_out[i]!;
        let g: Out;
        try { g = { result: runOp(c, tree, c.ops[i]!) }; } catch (e) { g = { exc: { type: (e as Error).name, msg: (e as Error).message } }; }
        const ok = w.exc ? excOk(w.exc, g.exc) : g.exc === undefined && (c.kind === "ns" && c.ops[i]![0] === "search_all" && c.ops[i]![2] !== "A" ? sameSorted(w.result, g.result) : same(w.result, g.result));
        if (!ok) why = `${c.kind} ${JSON.stringify(c.ops[i]).slice(0, 100)}: want ${JSON.stringify(w).slice(0, 250)} got ${JSON.stringify(g).slice(0, 250)}`;
      }
      if (why) bad.push(why);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
