/** Replays Bio.Align.PairwiseAligner golden cases (reference/golden/gen_aligner_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { PairwiseAligner, resetDefaultsWarning, substitutionMatrices as SM } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";

type Exc = { type: string; msg: string | null };
interface Case { kind: string; len?: number; len_exc?: Exc; first?: { coordinates: number[][]; score: number }[]; idx?: { result?: number[][]; exc?: Exc }[]; indices?: number[]; scoring: string | null; props: [string, unknown][]; ops?: unknown[][]; a?: unknown; b?: unknown; strand?: string; exc?: Exc; score?: number; ops_out?: { result?: unknown; exc?: Exc }[]; algorithm?: string; warnings: string[]; steps?: [string, unknown][][]; step_warnings?: string[][] }

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const FUNCS: Record<string, (a: number, b: number) => (i: number, j: number) => unknown> = {
  affine: (a, b) => (_i, j) => a + b * (j - 1),
  pos: (a, b) => (i, j) => a - b * j - 0.01 * i,
  const: (a) => () => a,
  bad: () => () => "x",
  int: () => (_i, j) => -j,
};
const val = (v: any): unknown => {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    if ("fn" in v) return FUNCS[v.fn]!(v.a ?? -1.0, v.b ?? -0.5);
    if ("matrix" in v) return SM.loadMatrix(v.matrix);
  }
  return v;
};
const seqIn = (s: any): unknown => {
  if (s !== null && typeof s === "object" && !Array.isArray(s)) {
    switch (s.t) {
      case "seq": return new Seq(s.v);
      case "record": return new SeqRecord(new Seq(s.v));
      case "bytes": return Uint8Array.from(s.v, (c: string) => c.charCodeAt(0));
      case "list": case "tuple": return s.v;
      case "int": return s.v;
    }
  }
  return s;
};
const encV = (x: unknown): unknown => (x instanceof SM.SubstitutionArray ? { $: "matrix", alphabet: x.alphabet } : typeof x === "function" ? { $: "function" } : x);

function build(c: Case): PairwiseAligner {
  const a = new PairwiseAligner({ scoring: c.scoring });
  for (const [name, v] of c.props) {
    if (name === "bogus") throw new TypeError("'PairwiseAligner' object has no attribute 'bogus'");
    (a as any)[camel(name)] = val(v);
  }
  return a;
}

function run(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  if (c.kind === "defaults_warning") {
    // The flag is per process in Biopython too, so the case replays the whole sequence after clearing it; each
    // step's warnings are captured on their own.
    resetDefaultsWarning();
    out["step_warnings"] = (c.steps ?? []).map((step) => {
      const inner = captureWarnings(() => {
        const a = new PairwiseAligner();
        for (const [name, v] of step) (a as any)[camel(name)] = val(v);
        a.warnDefaultsChanged();
      });
      if (inner.error !== undefined) throw inner.error;
      return inner.warnings.map((w) => w.message);
    });
    out["warnings"] = [];
    return out;
  }
  const cap = captureWarnings(() => {
    const a = build(c);
    if (c.kind === "settings") {
      const res: any[] = [];
      out["ops_out"] = res;
      for (const op of c.ops!) {
        try {
          if (op[0] === "get") res.push({ result: encV((a as any)[camel(op[1] as string)]) });
          else if (op[0] === "set") { (a as any)[camel(op[1] as string)] = val(op[2]); res.push({ result: null }); }
          else res.push({ result: a.substitutionMatrix === null && !a.gaps.insertionScoreFunction && !a.gaps.deletionScoreFunction ? a.toString() : null });
        } catch (e) { res.push({ exc: { type: (e as Error).name, msg: (e as Error).message } }); }
      }
      out["algorithm"] = a.algorithm;
    } else if (c.kind === "align") {
      const al = a.align(seqIn(c.a) as never, seqIn(c.b) as never, c.strand);
      out["algorithm"] = a.algorithm;
      out["score"] = al.score;
      try { out["len"] = Number(al.length); } catch (e) { out["len_exc"] = { type: (e as Error).name, msg: (e as Error).message }; }
      const first: unknown[] = [];
      out["first"] = first;
      let k = 0;
      for (const x of al) { if (k++ >= 300) break; first.push({ coordinates: x.coordinates, score: x.score }); }
      out["idx"] = c.indices!.map((i) => { try { return { result: al.get(i).coordinates }; } catch (e) { return { exc: { type: (e as Error).name, msg: (e as Error).message } }; } });
    } else out["score"] = c.strand !== undefined ? a.score(seqIn(c.a) as never, seqIn(c.b) as never, c.strand) : a.score(seqIn(c.a) as never, seqIn(c.b) as never);
  });
  if (cap.error !== undefined) out["exc"] = { type: (cap.error as Error).name, msg: (cap.error as Error).message };
  out["warnings"] = cap.warnings.map((w) => w.message);
  return out;
}

const excOk = (want?: Exc, got?: Exc): boolean => {
  if (!want || !got) return !want && !got;
  const w = want.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return w.type === got.type && (w.msg === null || w.msg === got.msg);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

describe("PairwiseAligner: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/aligner.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  for (const kind of ["settings", "score", "align", "defaults_warning"]) {
    // align is ported for the linear-gap algorithms so far
    const list = cases.filter((c) => c.kind === kind && (kind !== "align" || ["Needleman-Wunsch", "Smith-Waterman", "Gotoh global alignment algorithm", "Gotoh local alignment algorithm", "Waterman-Smith-Beyer global alignment algorithm", "Waterman-Smith-Beyer local alignment algorithm", "Fast Optimal Global Sequence Alignment Algorithm"].includes((c as any).algorithm) || c.exc));
    it(`${kind} (${list.length} cases, Biopython ${biopython})`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const got = run(c);
        let why = "";
        if (!excOk(c.exc, got["exc"])) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
        else if (!c.exc && kind === "score" && !Object.is(c.score, got["score"])) why = `score: want ${c.score} got ${got["score"]}`;
        else if (kind === "align" && !c.exc) {
          for (const k of ["score", "len", "first"] as const) if (!why && !same(c[k], got[k])) why = `${k}: want ${JSON.stringify(c[k])?.slice(0, 300)} got ${JSON.stringify(got[k])?.slice(0, 300)}`;
          c.idx!.forEach((w, i) => { const g = got["idx"][i]; if (!why && (w.exc || g.exc ? !excOk(w.exc, g.exc) : !same(w.result, g.result))) why = `index ${c.indices![i]}: want ${JSON.stringify(w)} got ${JSON.stringify(g)}`; });
        } else if (kind === "defaults_warning") {
          if (!same(c.step_warnings, got["step_warnings"])) {
            why = `step warnings: want ${JSON.stringify(c.step_warnings)?.slice(0, 200)} got ${JSON.stringify(got["step_warnings"])?.slice(0, 200)}`;
          }
        } else if (kind === "settings" && !c.exc) {
          if (c.algorithm !== got["algorithm"]) why = `algorithm: want ${c.algorithm} got ${got["algorithm"]}`;
          c.ops_out!.forEach((w, i) => {
            const g = got["ops_out"][i];
            if (!why && (w.exc || g.exc ? !excOk(w.exc, g.exc) : !same(w.result, g.result))) why = `op ${JSON.stringify(c.ops![i])}: want ${JSON.stringify(w)} got ${JSON.stringify(g)}`;
          });
        }
        if (!why && !same(c.warnings, got["warnings"])) why = `warnings: want ${JSON.stringify(c.warnings)} got ${JSON.stringify(got["warnings"])}`;
        if (why) bad.push(`${JSON.stringify({ scoring: c.scoring, props: c.props, a: c.a, b: c.b, strand: c.strand })}\n    ${why}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 6).join("\n")}`).toBe(0);
    });
  }
});
