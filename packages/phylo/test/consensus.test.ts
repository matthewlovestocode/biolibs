/** Replays Bio.Phylo.Consensus golden cases (reference/golden/gen_consensus_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Clade as BaseClade, Consensus, Newick, read, type Tree } from "@biolibs/phylo";
import { PyFloat } from "@biolibs/core";

type Json = any;
const cases: Json[] = JSON.parse(readFileSync(new URL("./golden/consensus.json", import.meta.url), "utf8"));
const tree = (text: string): Tree => read(text, "newick");

const fx = (x: unknown): unknown => (typeof x === "number" && !Number.isFinite(x) ? { f: Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf" } : x);
const conf = (c: unknown): unknown => (c === null ? null : c instanceof PyFloat ? ["float", fx(c.value)] : Number.isInteger(c) ? ["int", c] : ["float", fx(c)]);
const encClade = (c: BaseClade | Newick.Clade): Json => {
  const d: Json = { name: c.name, bl: fx(c.branchLength), conf: conf(c.confidence), width: fx(c.width), color: c.color === null ? null : c.color.toRgb(), clades: c.clades.map(encClade) };
  if ("comment" in c) d.comment = (c as Newick.Clade).comment;
  return d;
};
const encTree = (t: Tree): Json => {
  const d: Json = { rooted: t.rooted, id: t.id, name: t.name, root: encClade(t.root) };
  if ("weight" in t) d.weight = fx((t as Newick.Tree).weight);
  return d;
};

/**
 * Adam consensus builds sets of clade objects whose iteration order in Python depends on memory addresses, so the order of the
 * children of a clade can differ from run to run; its trees are compared with every clade's children put in a canonical order.
 */
const canon = (c: Json): Json => {
  const kids = c.clades.map(canon).sort((a: Json, b: Json) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  return { ...c, clades: kids };
};
const canonTree = (t: Json): Json => ({ ...t, root: canon(t.root) });

describe("Bio.Phylo.Consensus", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.fn} ${c.op ?? ""}`, () => {
      const run = (): unknown => {
        switch (c.fn) {
          case "strict": case "majority": case "adam": {
            const trees = (c.trees as string[]).map(tree);
            const input: Iterable<Tree> = c.iterator ? (function* () { yield* trees; })() : trees;
            if (c.fn === "strict") return encTree(Consensus.strictConsensus(input));
            if (c.fn === "majority") return encTree(Consensus.majorityConsensus(input, c.kwargs?.cutoff));
            return encTree(Consensus.adamConsensus([...input]));
          }
          case "support": {
            const reps = (c.trees as string[]).map(tree);
            const input: Iterable<Tree> = c.as_list ? reps : (function* () { yield* reps; })();
            return encTree(Consensus.getSupport(tree(c.target), input, c.len_trees ?? null));
          }
          case "equal": return Consensus.equalTopology(tree(c.a), tree(c.b));
          default: {
            const B = Consensus.BitString;
            const a = c.a !== undefined ? new B(c.a) : undefined, b = c.b !== undefined ? new B(c.b) : undefined;
            switch (c.op) {
              case "and": case "or": case "xor": { const r = (a as any)[c.op](b); return [r.toString(), r.repr()]; }
              case "contains": case "independent": case "iscompatible": return (a as any)[c.op](b);
              case "index_one": return a!.indexOne();
              case "index_zero": return a!.indexZero();
              case "from_bool": return B.fromBool(c.bools).toString();
              default: return a!.repr();
            }
          }
        }
      };
      if (c.exc) {
        let err: any;
        try { run(); } catch (e) { err = e; }
        expect(err, "expected an exception").toBeDefined();
        expect(err.name).toBe(c.exc.type);
        if (c.exc.msg !== null) expect(err.message).toBe(c.exc.msg);
      } else if (c.fn === "adam") expect(canonTree(run() as Json)).toEqual(canonTree(c.result));
      else expect(run()).toEqual(c.result);
    });
  });
});
