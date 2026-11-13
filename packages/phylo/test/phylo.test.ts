/** Replays Bio.Phylo golden cases (reference/golden/gen_phylo_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Clade as BaseClade, Newick, Tree as BaseTree, parse, read, write } from "@biolibs/phylo";
import { PyFloat } from "@biolibs/core";

type Json = any;
const cases: Json[] = JSON.parse(readFileSync(new URL("./golden/phylo.json", import.meta.url), "utf8"));
const camel = (s: string): string => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const fx = (x: unknown): unknown => (typeof x === "number" && !Number.isFinite(x) ? { f: Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf" } : x);
const conf = (c: unknown): unknown => (c === null ? null : c instanceof PyFloat ? ["float", fx(c.value)] : Number.isInteger(c) ? ["int", c] : ["float", fx(c)]);
const encClade = (c: Newick.Clade | BaseClade): Json => {
  const d: Json = { name: c.name, bl: fx(c.branchLength), conf: conf(c.confidence), width: fx(c.width), color: c.color === null ? null : c.color.toRgb(), clades: c.clades.map(encClade) };
  if ("comment" in c) d.comment = (c as Newick.Clade).comment;
  return d;
};
const encTree = (t: BaseTree): Json => {
  const d: Json = { rooted: t.rooted, id: t.id, name: t.name, root: encClade(t.root) };
  if ("weight" in t) d.weight = fx((t as Newick.Tree).weight);
  return d;
};
const pathOf = (tree: BaseTree, target: unknown): number[] | null => {
  const walk = (c: BaseClade, p: number[]): number[] | null => {
    if (c === target) return p;
    for (let i = 0; i < c.clades.length; i++) { const r = walk(c.clades[i]!, [...p, i]); if (r !== null) return r; }
    return null;
  };
  return walk(tree.root, []);
};
const encResult = (tree: BaseTree, r: unknown): Json => {
  if (r instanceof BaseClade) { const p = pathOf(tree, r); return p !== null ? { path: p } : { clade: encClade(r) }; }
  if (r instanceof BaseTree) return { clade: encClade(r.root) };
  if (r instanceof Map) return { map: [...r].map(([k, v]) => [encResult(tree, k), fx(v)]) };
  if (Array.isArray(r)) return r.map((x) => encResult(tree, x));
  if (r instanceof PyFloat) return r.value;
  if (r !== null && typeof r === "object" && Symbol.iterator in r) return [...(r as Iterable<unknown>)].map((x) => encResult(tree, x));
  return r === undefined ? null : fx(r);
};

const FUNCS: Record<string, (c: any) => unknown> = {
  short: (c) => c.branchLength !== null && c.branchLength < 0.2,
  named: (c) => Boolean(c.name),
  always: () => true,
  never: () => false,
  boom: (c) => c.nothing.x,
  typeerr: (c) => { if (c.branchLength === null) throw new TypeError("not supported"); return c.branchLength < "a"; },
};
const CLASSES: Record<string, unknown> = { Clade: Newick.Clade, BaseClade, Tree: Newick.Tree };

const dec = (tree: BaseTree, x: Json): unknown => {
  if (x !== null && typeof x === "object" && !Array.isArray(x)) {
    if ("path" in x) { let c = tree.root; for (const i of x.path) c = c.get(i) as BaseClade; return c; }
    if ("fn" in x) return FUNCS[x.fn];
    if ("cls" in x) return CLASSES[x.cls];
    if ("list" in x) return x.list.map((i: Json) => dec(tree, i));
    if ("tuple" in x) return x.tuple.map((i: Json) => dec(tree, i));
    if ("dict" in x) return Object.fromEntries(Object.entries(x.dict).map(([k, v]) => [camel(k), dec(tree, v)]));
    if ("float" in x) return x.float;
    throw new Error(JSON.stringify(x));
  }
  return x;
};
const decKw = (tree: BaseTree, kw: Json): Record<string, unknown> => Object.fromEntries(Object.entries(kw ?? {}).map(([k, v]) => [camel(k), dec(tree, v)]));

const runOp = (tree: BaseTree, op: Json): unknown => {
  const m: string = op.m;
  const args = (op.args ?? []).map((a: Json) => dec(tree, a));
  const kwargs = decKw(tree, op.kwargs);
  const t = tree as any;
  switch (m) {
    case "str": return tree.toString();
    case "repr": return tree.repr();
    case "root_repr": return tree.root.repr();
    case "clade_str": return [...tree.getTerminals(), ...tree.getNonterminals()].map((c) => c.toString());
    case "clade_repr": return [...tree.getTerminals(), ...tree.getNonterminals()].map((c) => c.repr());
    case "format": return t.format(...args);
    case "getitem": return tree.root.get(args[0]);
    case "getslice": return tree.root.get({ start: args[0], stop: args[1], step: args[2] });
    case "len": return tree.root.length;
    case "set_color": { const cl = tree.root.get(args[0]) as BaseClade; cl.color = args[1]; return cl.color!.toRgb(); }
    case "color_repr": { const c = (tree.root.get(args[0]) as BaseClade).color!; return [c.repr(), c.toString()]; }
    case "color_hex": { const c = (tree.root.get(args[0]) as BaseClade).color!; return [c.toHex(), c.toRgb()]; }
    case "from_clade": return encTree((tree.constructor as typeof BaseTree).fromClade(args[0] as BaseClade, decKw(tree, op.kwargs)));
    case "is_terminal": return tree.isTerminal();
    case "clade": return tree.clade;
    case "find_any": return t.findAny(args[0], kwargs);
    case "find_elements": return [...t.findElements(args[0], kwargs)];
    case "find_clades": return [...t.findClades(args[0], kwargs)];
    case "get_path": return t.getPath(args[0], kwargs);
    case "depths": return t.depths(args[0] ?? kwargs["unitBranchLengths"]);
    case "common_ancestor": return t.commonAncestor(...args);
    case "root_with_outgroup": return t.rootWithOutgroup(...args, ...(Object.keys(kwargs).length > 0 ? [kwargs] : []));
    case "collapse": case "collapse_all": case "prune": case "is_parent_of": return t[camel(m)](args[0], kwargs);
    case "ladderize": return t.ladderize(args[0] ?? kwargs["reverse"] ?? false);
    case "split": return t.split(...args);
    default: return t[camel(m)](...args);
  }
};

const checkExc = (err: any, want: { type: string; msg: string | null }): void => {
  expect(err, "expected an exception").toBeDefined();
  expect(err.name).toBe(want.type);
  if (want.msg !== null) expect(err.message).toBe(want.msg);
};

describe("Bio.Phylo", () => {
  cases.forEach((c, n) => {
    if (c.kind === "ops") {
      it(`${n} ops`, () => {
        let tree: BaseTree | undefined;
        try { tree = read(c.newick, "newick", Object.fromEntries(Object.entries(c.parse ?? {}).map(([k, v]) => [camel(k), v]))); } catch (e) {
          expect(c.exc, `unexpected ${String(e)}`).toBeDefined();
          checkExc(e, c.exc);
          return;
        }
        expect(c.exc).toBeUndefined();
        expect(encTree(tree)).toEqual(c.tree);
        c.ops.forEach((op: Json, i: number) => {
          const want = c.results[i];
          if (want === undefined) return;
          let got: Json, err: any;
          try { got = encResult(tree!, runOp(tree!, op)); } catch (e) { err = e; }
          if (want.exc) checkExc(err, want.exc);
          else { if (err) throw err; expect(got, `op ${i} ${op.m}`).toEqual(want.result); }
          if (want.after !== undefined) expect(encTree(tree!), `tree after op ${i} ${op.m}`).toEqual(want.after);
        });
      });
    } else {
      it(`${n} io ${c.op} ${c.fmt ?? ""}`, () => {
        const run = (): unknown => {
          const kw = Object.fromEntries(Object.entries(c.kwargs ?? {}).map(([k, v]) => [camel(k), v]));
          switch (c.op) {
            case "parse": return [...parse(c.text, c.fmt ?? "newick", kw)].map(encTree);
            case "read": return encTree(read(c.text, c.fmt ?? "newick", kw));
            case "write": case "convert": { let text = ""; const nn = write(parse(c.text, c.in ?? "newick"), { write: (s: string) => { text += s; } }, c.fmt ?? "newick", kw); return { text, n: nn }; }
            case "write_single": { const t = read(c.text, "newick"); let text = ""; const nn = write(c.clade ? t.root : t, { write: (s: string) => { text += s; } }, c.fmt ?? "newick", kw); return { text, n: nn }; }
            case "format": return (read(c.text, "newick") as any).format(c.spec);
          }
        };
        if (c.exc) { let err: any; try { run(); } catch (e) { err = e; } checkExc(err, c.exc); }
        else expect(run()).toEqual(c.result);
      });
    }
  });
});
