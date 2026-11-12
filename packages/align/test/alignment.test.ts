/** Replays Bio.Align.Alignment golden cases (reference/golden/gen_alignment_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Alignment, substitutionMatrices as SM, PairwiseAligner } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";

type Exc = { type: string; msg: string | null };
interface Case { kind: string; sequences: unknown[]; coordinates: number[][] | null; score?: number; colann?: Record<string, string | unknown[]>; annotations?: Record<string, unknown>; others?: { sequences: unknown[]; coordinates: number[][]; colann?: Record<string, string | unknown[]>; annotations?: Record<string, unknown> }[]; ops: unknown[][]; exc?: Exc; ops_out?: { result?: unknown; exc?: Exc }[]; warnings: string[] }

const seqIn = (s: any): unknown => {
  if (s !== null && typeof s === "object" && !Array.isArray(s)) {
    switch (s.t) {
      case "seq": return new Seq(s.v);
      case "record": { const r = new SeqRecord(new Seq(s.v), s.id ?? "<unknown id>"); if (s.weight !== undefined) r.annotations.set("weight", s.weight); return r; }
      case "bytes": return Uint8Array.from(s.v, (c: string) => c.charCodeAt(0));
      case "list": return s.v;
    }
  }
  return s;
};
const keyIn = (k: any): unknown => {
  if (k !== null && typeof k === "object" && !Array.isArray(k)) {
    if ("slice" in k) return { start: k.slice[0], stop: k.slice[1], step: k.slice[2] };
    if ("list" in k) return k.list;
    if ("tuple" in k) return k.tuple.map(keyIn);
    if ("str" in k) return k.str;
    if ("float" in k) return k.float;
    if ("none" in k) return null;
  }
  return k;
};
const FUNCS: Record<string, (a: number, b: number) => (i: number, j: number) => number> = {
  affine: (a, b) => (_i, j) => a + b * (j - 1), pos: (a, b) => (i, j) => a - b * j - 0.01 * i, const: (a) => () => a,
};
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const scoringIn = (sp: any): any => {
  if (sp === null) return null;
  if ("wildcard" in sp) return sp.wildcard;
  if ("matrix" in sp) return SM.loadMatrix(sp.matrix);
  if ("int" in sp) return sp.int;
  const al: any = new PairwiseAligner();
  for (const [name, v0] of sp.aligner) {
    let v = v0;
    if (v !== null && typeof v === "object" && "fn" in v) v = FUNCS[v.fn]!(v.a ?? -1.0, v.b ?? -0.5);
    else if (v !== null && typeof v === "object" && "matrix" in v) v = SM.loadMatrix(v.matrix);
    al[camel(name)] = v;
  }
  return al;
};
const COUNT_NAMES = ["score", "aligned", "substitution_score", "identities", "mismatches", "positives", "gap_score", "gaps", "open_gaps", "extend_gaps", "open_left_gaps", "open_right_gaps", "open_internal_gaps", "extend_left_gaps", "extend_right_gaps", "extend_internal_gaps", "open_left_insertions", "open_left_deletions", "open_right_insertions", "open_right_deletions", "open_internal_insertions", "open_internal_deletions", "extend_left_insertions", "extend_left_deletions", "extend_right_insertions", "extend_right_deletions", "extend_internal_insertions", "extend_internal_deletions", "left_insertions", "left_deletions", "right_insertions", "right_deletions", "internal_insertions", "internal_deletions", "insertions", "open_insertions", "extend_insertions", "deletions", "open_deletions", "extend_deletions", "left_gaps", "right_gaps", "internal_gaps"];
const enc = (x: unknown): unknown => {
  if (x === null) return { none: true };
  if (x instanceof Alignment) {
    const aln: any = { sequences: enc(x.sequences), coordinates: x.coordinates };
    if (x.score !== undefined) aln.score = x.score;
    if (x.columnAnnotations !== undefined) aln.colann = Object.fromEntries(x.columnAnnotations);
    return { aln };
  }
  if (typeof x === "string") return { s: x };
  if (x instanceof Seq) return { Seq: x.toString() };
  if (x instanceof SeqRecord) return { rec: x.id, seq: String(x.seq) };
  if (x instanceof Uint8Array) return { b: String.fromCharCode(...x) };
  if (Array.isArray(x)) return x.map(enc);
  return x;
};
const keyFn = (name: string): ((s: any) => unknown) => ({
  len: (s: any) => s.length, neg: (s: any) => -s.length,
  str: (s: any) => (s instanceof SeqRecord ? String(s.seq) : String(s)), id: (s: any) => s.id,
} as Record<string, (s: any) => unknown>)[name]!;

function apply(a: Alignment, op: any[], others: Alignment[]): unknown {
  switch (op[0]) {
    case "str": return a.toString();
    case "format": return a.format(op[1]);
    case "format_matrix": return a.format("", SM.loadMatrix(op[1]));
    case "format_aligner": return a.format("", new PairwiseAligner({ substitutionMatrix: SM.loadMatrix(op[1]) }));
    case "length": return a.length;
    case "shape": return a.shape;
    case "len": return a.size;
    case "aligned": return a.aligned;
    case "indices": return a.indices;
    case "inverse_indices": return a.inverseIndices;
    case "target": return a.target;
    case "query": return a.query;
    case "set_target": a.target = seqIn(op[1]); return String(a.target);
    case "set_query": a.query = seqIn(op[1]); return String(a.query);
    case "cmp": { const b = others[op[1]]!; return [a.equals(b), !a.equals(b), a.lt(b), a.le(b), a.gt(b), a.ge(b)]; }
    case "frequencies": return Object.fromEntries([...a.frequencies].map(([k, v]) => [k, [...v]]));
    case "substitutions": { const m = a.substitutions; const n = m.shape[0]!; const v: number[] = []; for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) v.push(m.data[r * n + c]!); void v; return { alphabet: m.alphabet, v: [...m.data] }; }
    case "same_ref": return Alignment.fromAlignmentsWithSameReference(op[1].map((i: number) => others[i]!));
    case "counts": { const c: any = a.counts(scoringIn(op[1])); return { str: c.toString(), ...Object.fromEntries(COUNT_NAMES.map((n) => [n, c[camel(n)]])) }; }
    case "map": return a.map(others[op[1]]!);
    case "mapall": return a.mapall(op[1].map((i: number) => others[i]!));
    case "get": return a.get(keyIn(op[1]) as never);
    case "reverse_complement": return a.reverseComplement();
    case "add": return a.add(others[op[1]]!);
    case "annotations": return a.annotations === undefined ? { none: true } : Object.fromEntries(a.annotations);
    case "parse_printed": { const r = Alignment.parsePrintedAlignment(op[1].map((l: string) => new TextEncoder().encode(l))); return { seqs: r.sequences.map((b) => new TextDecoder().decode(b)), coords: r.coordinates }; }
    case "sort": a.sort(op[1] ? keyFn(op[1]) : null, op[2]); return [enc(a.sequences), a.coordinates];
    default: throw new Error(op[0]);
  }
}

function run(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  try {
    const decorate = (x: Alignment, o: { colann?: Record<string, string | unknown[]>; annotations?: Record<string, unknown>; score?: number }): Alignment => {
      if (o.score !== undefined) x.score = o.score;
      if (o.colann) x.columnAnnotations = new Map(Object.entries(o.colann));
      if (o.annotations) x.annotations = new Map(Object.entries(o.annotations));
      return x;
    };
    const a = decorate(new Alignment(c.sequences.map(seqIn), c.coordinates), c);
    const others = (c.others ?? []).map((o) => decorate(new Alignment(o.sequences.map(seqIn), o.coordinates), o));
    const res: any[] = [];
    out["ops_out"] = res;
    for (const op of c.ops) {
      try { const r = apply(a, op, others); res.push({ result: enc(r) }); }
      catch (e) { res.push({ exc: { type: (e as Error).name, msg: (e as Error).message } }); }
    }
  } catch (e) { out["exc"] = { type: (e as Error).name, msg: (e as Error).message }; }
  return out;
}

const excOk = (want?: Exc, got?: Exc): boolean => {
  if (!want || !got) return !want && !got;
  const w = want.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return w.type === got.type && (w.msg === null || w.msg === got.msg);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

describe("Alignment: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/alignment.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`alignment methods (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const got = run(c);
      let why = "";
      if (!excOk(c.exc, got["exc"])) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
      else if (!c.exc) c.ops_out!.forEach((w, i) => {
        const g = got["ops_out"][i];
        if (!why && (w.exc || g.exc ? !excOk(w.exc, g.exc) : !same(w.result, g.result))) why = `op ${JSON.stringify(c.ops[i])}: want ${JSON.stringify(w)?.slice(0, 400)} got ${JSON.stringify(g)?.slice(0, 400)}`;
      });
      if (why) bad.push(`${JSON.stringify({ sequences: c.sequences, coordinates: c.coordinates })?.slice(0, 200)}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 6).join("\n")}`).toBe(0);
  });
});
