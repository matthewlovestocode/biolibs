/**
 * Replays Bio.Nexus golden cases (reference/golden/gen_nexus_cases.py): the Nexus editing and writing methods,
 * `combine`, and the `Tree` class. Reading and writing alignments through SeqIO is covered by seqio-nexus.json.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Seq } from "@biolibs/seq";
import { captureWarnings } from "@biolibs/core";
import { Node, Nexus, Tree, StandardData, combine, consensus, getStartEnd, quotestrip, safename } from "@biolibs/nexus";

const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/nexus.json", import.meta.url), "utf8")) as { biopython: string; cases: any[] };
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Mirror of the generator's `conv`: Maps as `{$map: pairs}`, Sets as sorted lists, sequences as text. */
function conv(v: unknown): unknown {
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [conv(k), conv(x)]) };
  if (v instanceof Set) return { $set: [...v].map(conv).sort((a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; }) };
  if (Array.isArray(v)) return v.map(conv);
  if (v instanceof Seq) return v.toString();
  if (v instanceof Node) return "<Node>";
  if (typeof v === "number" && Number.isNaN(v)) return { $nan: 1 };
  if (v === undefined) return null;
  if (v !== null && typeof v === "object" && typeof (v as { toString(): string }).toString === "function" && !("constructor" in v && (v as object).constructor === Object)) return String(v);
  return v;
}

function snapshot(n: Nexus): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fields: Record<string, string> = {
    ntax: "ntax", nchar: "nchar", taxlabels: "taxlabels", unaltered_taxlabels: "unalteredTaxlabels", charlabels: "charlabels", datatype: "datatype", missing: "missing", gap: "gap",
    matchchar: "matchchar", symbols: "symbols", equate: "equate", labels: "labels", interleave: "interleave", charsets: "charsets", taxsets: "taxsets", charpartitions: "charpartitions",
    taxpartitions: "taxpartitions", codonposset: "codonposset", options: "options", respectcase: "respectcase", translate: "translate",
  };
  for (const [py, ts] of Object.entries(fields)) out[py] = (n as any)[ts] === undefined ? "<unset>" : conv((n as any)[ts]);
  out["matrix"] = n.matrix && n.matrix.size > 0 ? conv(n.matrix) : null;
  return out;
}

// A JavaScript stack overflow (RangeError) stands for Python's RecursionError, whose message is not compared.
const err = (e: unknown) => (e instanceof RangeError ? { type: "RecursionError", msg: null } : { type: (e as Error).name, msg: (e as Error).message });
const camelKeys = (kw: Record<string, unknown>) => Object.fromEntries(Object.entries(kw).map(([k, v]) => [k === "omit_NEXUS" ? "omitNEXUS" : camel(k), v]));

function nexusOp(n: Nexus, name: string, kw: Record<string, any>): unknown {
  const k = camelKeys(kw) as Record<string, any>;
  switch (name) {
    case "write_nexus_data": {
      let text = "";
      const handle = { write(t: string) { text += t; } };
      const r = n.writeNexusData({ ...k, filename: handle });
      return new Map<string, unknown>([["text", text], ["returned", r === handle]]);
    }
    case "export_fasta":
    case "export_phylip": {
      // Biopython writes a real file and returns its name; here the text goes to a target and the derived name
      // comes back, so `stem` becomes the Nexus's own filename.
      let text = "";
      n.filename = k.stem;
      const filename = name === "export_fasta"
        ? n.exportFasta({ filename: { write(t: string) { text += t; } }, width: k.width })
        : n.exportPhylip({ filename: { write(t: string) { text += t; } } });
      return new Map<string, unknown>([["text", text], ["filename", filename]]);
    }
    case "write_nexus_data_partitions": {
      n.filename = k.stem;
      // As in the generator: "part"/"nope" name a partition to look up, "literal" passes the string Biopython
      // chokes on, and anything else leaves it out.
      const asked = k.charpartition as string | null | undefined;
      const charpartition = asked === "literal" ? "part"
        : asked === undefined || asked === null ? null
          : n.charpartitions.get(asked) ?? new Map<string, number[]>();
      const parts = n.writeNexusDataPartitions({ ...k, stem: undefined, charpartition });
      if (parts === undefined) return null;
      return new Map([...parts].map(([part, out]) => [part, new Map<string, unknown>([["text", out.text], ["filename", out.filename]])]));
    }
    case "append_sets": return n.appendSets(k.exclude, k.delete, k.mrbayes, k.includeCodons, k.codonsOnly);
    case "crop_matrix": return n.cropMatrix(null, k.delete, k.exclude);
    case "adjust_charlabels": return n.adjustCharlabels(k.exclude, k.insert);
    case "constant": return n.constant(null, k.delete, k.exclude);
    case "cstatus": return n.cstatus(k.site, k.delete, k.narrow);
    case "weighted_stepmatrix": return n.weightedStepmatrix(k.name, k.exclude, k.delete);
    case "add_sequence": return n.addSequence(k.name, k.sequence);
    case "insert_gap": return n.insertGap(k.pos, k.n, k.leftgreedy);
    case "invert": return n.invert(k.charlist);
    case "gaponly": return n.gaponly(k.includeMissing);
    case "terminal_gap_to_missing": return n.terminalGapToMissing(k.missing, k.skipN);
  }
  throw new Error(name);
}

function treeOp(t: Tree, name: string, args: any[]): unknown {
  switch (name) {
    case "display": return t.display();
    case "str": return t.toString();
    case "to_string": return t.toString(camelKeys(args[0]));
    case "is_identical": return t.isIdentical(new Tree(args[0]));
    case "is_compatible": return t.isCompatible(new Tree(args[0]), args[1], args[2]);
    case "merge_with_support": return t.mergeWithSupport(args[0].length ? args[0].map((x: string) => new Tree(x)) : null, args[1] ? new Tree(args[1]) : null, args[2], args[3]);
    case "node_call": {
      const node = t.node(args[0]);
      const [method, ...rest] = args.slice(1) as [string, ...any[]];
      switch (method) {
        case "add_succ": return node.addSucc(rest[0]);
        case "remove_succ": return node.removeSucc(rest[0]);
        case "set_succ": return node.setSucc(rest[0]);
        case "set_id": return node.setId(rest[0]);
        case "set_prev": return node.setPrev(rest[0]);
        case "get_succ": return node.succ;
        case "get_id": return node.id;
        case "get_prev": return node.prev;
      }
      throw new Error(method);
    }
    default: return (t as any)[camel(name)](...args);
  }
}

function run(c: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const { warnings } = captureWarnings(() => {
    try {
      if (c.kind === "nexus") {
        const n = new Nexus(c.text);
        const res: unknown[] = [];
        out["ops_out"] = res;
        for (const [name, kw] of c.ops) {
          try { res.push({ result: conv(nexusOp(n, name, kw)) }); } catch (e) { res.push({ exc: err(e) }); }
        }
        out["state"] = snapshot(n);
      } else if (c.kind === "combine") {
        const r = combine(c.texts.map(([nm, t]: [string, string]) => [nm, new Nexus(t)]));
        out["state"] = r === null ? null : snapshot(r);
      } else if (c.kind === "standard") {
        const coding = (x: { t: string; d: string[] }) => new Map<string, unknown>([["t", x.t], ["d", x.d]]);
        const sd = new StandardData(c.data);
        out["raw"] = conv(sd.raw().map(coding));
        out["str"] = sd.toString();
        out["len"] = sd.length;
        out["iter"] = conv([...sd].map(coding));
        out["items"] = c.indices.map((i: number) => { try { return { result: conv(coding(sd.at(i))) }; } catch (e) { return { exc: err(e) }; } });
      } else if (c.kind === "func") {
        const fns: Record<string, (...a: any[]) => unknown> = { safename, quotestrip, get_start_end: getStartEnd };
        out["result"] = conv(fns[c.fn]!(...c.args));
      } else if (c.kind === "consensus") {
        const r = consensus(c.trees.map((t: string) => new Tree(t, 1.0, true)), ...c.args);
        out["result"] = r === null ? null : r.toString();
      } else {
        const kw = c.kw;
        const t = new Tree(c.newick, kw.weight ?? 1.0, kw.rooted ?? false, kw.name ?? "", undefined, kw.values_are_support ?? false, kw.max_support ?? 1.0);
        const res: unknown[] = [];
        out["ops_out"] = res;
        out["initial"] = t.toString();
        for (const [name, args] of c.ops) {
          try { res.push({ result: conv(treeOp(t, name, args)), tree: t.toString() }); } catch (e) { res.push({ exc: err(e) }); }
        }
      }
    } catch (e) {
      out["exc"] = err(e);
    }
  });
  out["warnings"] = warnings;
  return out;
}

/** Compare error records: type names must match, and messages when Biopython's is not an AttributeError-style null. */
function sameExc(want: any, got: any): boolean {
  if (!want || !got) return want === got;
  const wt = want.type === "AttributeError" ? "TypeError" : want.type;
  return wt === got.type && (want.msg === null || got.msg === null || want.msg === got.msg);
}

describe(`nexus.json: parity with Biopython ${biopython}`, () => {
  for (const kind of ["nexus", "combine", "tree", "func", "consensus", "standard"]) {
    const list = cases.filter((c) => c.kind === kind);
    it(`${kind} (${list.length} cases)`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const got = run(c);
        const probs: string[] = [];
        if (!sameExc(c.exc, got["exc"])) probs.push(`exc: ${JSON.stringify(c.exc)} vs ${JSON.stringify(got["exc"])}`);
        for (const key of ["state", "initial", "result", "raw", "str", "len", "iter"]) if (key in c && JSON.stringify(c[key]) !== JSON.stringify(got[key])) probs.push(`${key}: want ${JSON.stringify(c[key])?.slice(0, 600)} got ${JSON.stringify(got[key])?.slice(0, 600)}`);
        (c.ops_out ?? []).forEach((w: any, i: number) => {
          const g = (got["ops_out"] as any[] | undefined)?.[i];
          if (!g) { probs.push(`op ${i} missing`); return; }
          if (!sameExc(w.exc, g.exc)) probs.push(`op ${i} ${JSON.stringify(c.ops[i])}: exc ${JSON.stringify(w.exc)} vs ${JSON.stringify(g.exc)}`);
          else if (!w.exc && (JSON.stringify(w.result) !== JSON.stringify(g.result) || JSON.stringify(w.tree) !== JSON.stringify(g.tree))) {
            probs.push(`op ${i} ${JSON.stringify(c.ops[i])}: want ${JSON.stringify(w)?.slice(0, 500)} got ${JSON.stringify(g)?.slice(0, 500)}`);
          }
        });
        (c.items ?? []).forEach((w: any, i: number) => {
          const g = (got["items"] as any[] | undefined)?.[i];
          if (!g || JSON.stringify(w.result) !== JSON.stringify(g.result) || !sameExc(w.exc, g.exc)) probs.push(`item ${i}: want ${JSON.stringify(w)} got ${JSON.stringify(g)}`);
        });
        if (JSON.stringify(c.warnings) !== JSON.stringify(got["warnings"])) probs.push("warnings");
        if (probs.length) bad.push(`${(c.text ?? c.newick ?? "").slice(0, 80)}\n    ${probs.slice(0, 2).join("\n    ")}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 4).join("\n")}`).toBe(0);
    });
  }
});
