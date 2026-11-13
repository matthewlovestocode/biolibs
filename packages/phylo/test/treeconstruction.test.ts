/** Replays Bio.Phylo.TreeConstruction golden cases (reference/golden/gen_treeconstruction_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Alignment, MultipleSeqAlignment } from "@biolibs/align";
import { PyFloat } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Clade as BaseClade, Newick, TreeConstruction as TC, read, type Tree } from "@biolibs/phylo";

type Json = any;
const cases: Json[] = JSON.parse(readFileSync(new URL("./golden/treeconstruction.json", import.meta.url), "utf8"));

const fx = (x: unknown): unknown => (typeof x === "number" && !Number.isFinite(x) ? { f: Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf" } : x);
const conf = (c: unknown): unknown => (c === null ? null : c instanceof PyFloat ? ["float", fx(c.value)] : Number.isInteger(c) ? ["int", c] : ["float", fx(c)]);
const encClade = (c: BaseClade | Newick.Clade, intBl: (c: BaseClade) => boolean): Json => {
  const d: Json = { name: c.name, bl: fx(c.branchLength), conf: conf(c.confidence), width: fx(c.width), color: c.color === null ? null : c.color.toRgb(), clades: c.clades.map((x) => encClade(x, intBl)) };
  if ("comment" in c) d.comment = (c as Newick.Clade).comment;
  return d;
};
const encTree = (t: Tree): Json => {
  const d: Json = { rooted: t.rooted, id: t.id, name: t.name, root: encClade(t.root, () => false) };
  if ("weight" in t) d.weight = fx((t as Newick.Tree).weight);
  return d;
};

const tag = (v: TC.PyNum): Json => (v instanceof PyFloat ? ["f", v.value] : Number.isInteger(v) ? ["i", v] : ["f", v]);
const decNum = (v: Json): TC.PyNum => (v[0] === "i" ? v[1] : Number.isInteger(v[1]) ? new PyFloat(v[1]) : v[1]);
const decMatrix = (spec: Json): TC.PyNum[][] | null => (spec === null || spec === undefined ? null : spec.map((r: Json[]) => r.map(decNum)));
const encMatrix = (m: TC.Matrix): Json => ({ cls: m.constructor.name === "Matrix" ? "_Matrix" : m.constructor.name, names: [...m.names], matrix: m.matrix.map((r) => r.map(tag)) });
const tree = (text: string): Tree => read(text, "newick");

const makeMsa = (spec: Json, kind: string): unknown => {
  if (kind === "msa") return new MultipleSeqAlignment(spec.rows.map((r: string, i: number) => new SeqRecord(new Seq(r), spec.ids[i])));
  const parsed = Alignment.parsePrintedAlignment(spec.rows.map((r: string) => new TextEncoder().encode(r)));
  return new Alignment(parsed.sequences.map((s, i) => new SeqRecord(new Seq(new TextDecoder().decode(s)), spec.ids[i])), parsed.coordinates);
};
const num = (x: number): unknown => fx(x);

const matrixOp = (m: TC.Matrix, op: Json): unknown => {
  const args = op.args ?? [];
  const idx = Array.isArray(args[0]) ? (args[0] as unknown as [number | string, number | string]) : args[0];
  switch (op.m) {
    case "get": { const r = m.get(idx); return Array.isArray(r) ? r.map(tag) : tag(r); }
    case "set": {
      const v = args[1];
      m.set(idx, v !== null && typeof v === "object" && !Array.isArray(v) && "list" in v ? v.list.map(decNum) : Array.isArray(v) ? decNum(v) : v);
      return null;
    }
    case "del": m.delete(idx as number | string); return null;
    case "insert": m.insert(args[0], args[1].map(decNum), args[2] ?? null); return null;
    case "repr": return m.repr();
    case "str": return m.toString();
    case "len": return m.length;
    default: { let text = ""; (m as TC.DistanceMatrix).formatPhylip({ write: (s: string) => { text += s; } }); return text; }
  }
};

const checkExc = (err: any, want: { type: string; msg: string | null }): void => {
  expect(err, "expected an exception").toBeDefined();
  expect(err.name).toBe(want.type);
  if (want.msg !== null) expect(err.message).toBe(want.msg);
};

describe("Bio.Phylo.TreeConstruction", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.kind}`, () => {
      if (c.kind === "matrix") {
        let m: TC.Matrix;
        try { m = c.cls === "_Matrix" ? new TC.Matrix(c.names, decMatrix(c.matrix)) : new TC.DistanceMatrix(c.names, decMatrix(c.matrix)); } catch (e) { checkExc(e, c.exc); return; }
        expect(c.exc).toBeUndefined();
        expect(encMatrix(m)).toEqual(c.initial);
        c.ops.forEach((op: Json, i: number) => {
          const want = c.results[i];
          let got: unknown, err: any;
          try { got = matrixOp(m, op); } catch (e) { err = e; }
          if (want.exc) checkExc(err, want.exc); else { if (err) throw err; expect(got, `op ${i} ${op.m}`).toEqual(want.result); }
          expect(encMatrix(m), `matrix after op ${i}`).toEqual(want.after);
        });
        return;
      }
      const run = (): unknown => {
        switch (c.kind) {
          case "models": return TC.DistanceCalculator.models;
          case "calc": {
            const calc = new TC.DistanceCalculator(c.model ?? "identity", c.skip ?? null);
            const msa = c.akind === "msa" || c.akind === "aln" ? makeMsa(c.aln, c.akind) : c.bad;
            const dm = calc.getDistance(msa);
            return { m: encMatrix(dm), str: dm.toString() };
          }
          case "build": {
            let t: Tree;
            if (c.matrix !== undefined) {
              const dm = new TC.DistanceMatrix(c.names, decMatrix(c.matrix));
              const dtc = new TC.DistanceTreeConstructor(null, c.method);
              t = c.method === "upgma" ? dtc.upgma(dm) : dtc.nj(dm);
            } else if (c.bad !== undefined) { const dtc = new TC.DistanceTreeConstructor(); t = c.method === "upgma" ? dtc.upgma(c.bad) : dtc.nj(c.bad); }
            else t = new TC.DistanceTreeConstructor(new TC.DistanceCalculator(c.model ?? "identity"), c.method).buildTree(makeMsa(c.aln, c.akind));
            return { tree: encTree(t), str: t.toString() };
          }
          case "ctor": return [new TC.DistanceTreeConstructor(...(c.args as [unknown, string])).constructor.name];
          case "score": {
            const t = tree(c.newick), msa = makeMsa(c.aln, c.akind) as MultipleSeqAlignment | Alignment;
            const scorer = new TC.ParsimonyScorer(c.matrix === undefined ? null : new TC.Matrix(c.names, decMatrix(c.matrix)));
            const s = scorer.getScore(t, msa);
            const ids = c.akind === "msa" ? [...(msa as MultipleSeqAlignment)].map((r) => r.id) : (msa as Alignment).sequences.map((q) => (q as SeqRecord).id);
            return { score: num(s), tree: encTree(t), ids };
          }
          case "neighbors": { const t = tree(c.newick); const ns = new TC.NNITreeSearcher(new TC.ParsimonyScorer()).getNeighbors(t); return { result: ns.map(encTree), tree: encTree(t) }; }
          case "search": {
            const t = tree(c.newick), msa = makeMsa(c.aln, c.akind);
            const scorer = new TC.ParsimonyScorer(c.matrix === undefined ? null : new TC.Matrix(c.names, decMatrix(c.matrix)));
            return encTree(new TC.NNITreeSearcher(scorer).search(t, msa));
          }
          case "constructor": {
            const msa = makeMsa(c.aln, c.akind);
            const start = c.newick ? tree(c.newick) : null;
            return encTree(new TC.ParsimonyTreeConstructor(new TC.NNITreeSearcher(new TC.ParsimonyScorer()), start).buildTree(msa));
          }
          default:
            if (c.what === "tc") return new TC.TreeConstructor().buildTree(null);
            if (c.what === "scorer") return new TC.Scorer().getScore(null as never, null);
            if (c.what === "searcher") return new TC.TreeSearcher().search(null as never, null);
            if (c.what === "nni") return new TC.NNITreeSearcher("x");
            return new TC.ParsimonyScorer("x");
        }
      };
      if (c.exc) { let err: any; try { run(); } catch (e) { err = e; } checkExc(err, c.exc); }
      else {
        const got = run() as Json;
        const want = c.kind === "neighbors" ? c.result : c.result;
        if (c.kind === "neighbors") expect(got).toEqual({ result: want, tree: c.tree });
        else expect(got).toEqual(want);
      }
    });
  });
});
