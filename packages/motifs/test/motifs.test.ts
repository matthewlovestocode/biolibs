/** Replays the Bio.motifs golden cases (reference/golden/gen_motif_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import * as M from "@biolibs/motifs";

type Exc = { type: string; msg: string | null };
type Out = { result?: unknown; exc?: Exc };
interface Case { kind: string; matrix: any; other: any; spec: any; ops: any[][]; ops_out: Out[]; op: string; fmt: string; text: string; strict?: boolean; to: string[]; exc?: Exc; matrix_enc?: unknown; motif?: unknown; result?: unknown; version?: unknown; str?: unknown; extra?: unknown; extras?: unknown; record?: unknown; id?: string; written?: Record<string, Out>; warnings: string[] }

const SP: Record<string, number> = { nan: NaN, inf: Infinity, "-inf": -Infinity };
const dec = (v: any): any => (typeof v === "string" && Object.hasOwn(SP, v) ? SP[v] : v);
const num = (x: number): unknown => (Number.isNaN(x) ? "nan" : x === Infinity ? "inf" : x === -Infinity ? "-inf" : x);
const excOk = (want?: Exc, got?: Exc): boolean => {
  if (!want || !got) return want === got;
  const w = want.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return w.type === got.type && (w.msg === null || w.msg === got.msg);
};
const err = (e: unknown): Exc => ({ type: (e as Error).name, msg: (e as Error).message });

function enc(x: any): unknown {
  if (x === null || x === undefined || typeof x === "boolean" || typeof x === "string") return x ?? null;
  if (typeof x === "number") return Number.isInteger(x) && !Object.is(x, -0) ? x : num(x);
  if (x instanceof Seq) return { seq: x.toString() };
  if (x instanceof M.GenericPositionMatrix) return { matrix: x.constructor.name, alphabet: x.alphabet, length: x.length, rows: x.items().map(([k, v]) => [k, v.map(num)]) };
  if (x instanceof M.Motif) return encMotif(x);
  if (x instanceof Float32Array || x instanceof Float64Array) return { arr: [...x].map(num) };
  if (x instanceof Map) return { dict: [...x].map(([k, v]) => [String(k), enc(v)]) };
  if (x instanceof M.ScoreDistribution) return { dist: { min_score: num(x.minScore), interval: num(x.interval), n_points: x.nPoints, ic: num(x.ic), step: num(x.step) } };
  if (Array.isArray(x)) return x.map(enc);
  throw new Error("cannot encode " + String(x));
}
const pyClass = (m: any): string => (m instanceof M.meme.MemeMotif ? "meme.Motif" : m instanceof M.clusterbuster.ClusterbusterMotif ? "motifs.Motif" : m instanceof M.transfac.TransfacMotif ? "transfac.Motif" : m instanceof M.jaspar.JasparMotif ? "jaspar.Motif" : "motifs.Motif");
function encMotif(m: any): unknown {
  const out: any = {
    cls: pyClass(m), name: m.name, length: m.length, alphabet: m.alphabet, mask: [...m.mask], pseudocounts: [...m.pseudocounts].map(([k, v]: any) => [k, num(v)]), background: [...m.background].map(([k, v]: any) => [k, num(v)]),
    counts: m.counts === null ? null : enc(m.counts), alignment: m.alignment === null ? null : m.toString(),
  };
  if (m instanceof M.jaspar.JasparMotif) out.jaspar = { matrix_id: m.matrixId, collection: m.collection, tf_class: m.tfClass, tf_family: m.tfFamily, species: m.species, tax_group: m.taxGroup, acc: m.acc, data_type: m.dataType, medline: m.medline, pazar_id: m.pazarId, comment: m.comment };
  if (m instanceof M.clusterbuster.ClusterbusterMotif) out.gap_weight = [m.gap, m.weight];
  if (m instanceof M.transfac.TransfacMotif) { out.annotations = [...m.annotations]; out.references = m.references; }
  return out;
}

const attempt = (f: () => unknown): Out => { try { return { result: enc(f()) }; } catch (e) { return { exc: err(e) }; } };

function key(k: any): any {
  if (Array.isArray(k) && k[0] === "s") return { start: k[1], stop: k[2], step: k[3] };
  if (Array.isArray(k) && k[0] === "t") return k.slice(1);
  return k;
}

function buildMatrix(spec: any): M.GenericPositionMatrix {
  const rows = new Map<string, number[]>(spec.rows.map(([k, v]: [string, any[]]) => [k, v.map(dec)]));
  const C = { freq: M.FrequencyPositionMatrix, pwm: M.PositionWeightMatrix, pssm: M.PositionSpecificScoringMatrix }[spec.cls as "freq"];
  return new C(spec.alphabet, rows);
}
const bgOf = (b: any): Map<string, number> | null => (b === null ? null : new Map(b));

/**
 * The right-hand operand of a comparison, matching the generator's `operand`. A plain `Map` stands for Python's dict
 * of lists, which is why a weight matrix (tuple rows there) is never equal to one.
 */
function cmpOperand(spec: any, what: string, left: M.GenericPositionMatrix): unknown {
  switch (what) {
    case "same": return left;
    case "copy": case "other": return buildMatrix(spec);
    case "generic": return new M.GenericPositionMatrix(spec.alphabet, new Map<string, number[]>(spec.rows.map(([k, v]: [string, any[]]) => [k, v.map(dec)])));
    case "dict_list": return new Map<string, number[]>(spec.rows.map(([k, v]: [string, any[]]) => [k, v.map(dec)]));
    case "str": return "x";
    case "int": return 3;
    case "none": return null;
    case "list": return [1, 2];
  }
  throw new Error(what);
}

/** `==` and the ordering operators, which `dict` refuses. */
function runMatrixcmp(c: Case): Record<string, any> {
  let m: M.GenericPositionMatrix;
  try { m = buildMatrix(c.matrix ?? c["left"]); } catch (e) { return { exc: err(e) }; }
  const ops_out = c.ops.map(([k, what]: [string, string]) => attempt(() => {
    const spec = ["same", "copy", "generic", "dict_list"].includes(what) ? c["left"] : c["right"];
    const o = cmpOperand(spec, what, m);
    switch (k) {
      case "eq": return m.equals(o);
      case "lt": return m.lt(o);
      case "le": return m.le(o);
      case "gt": return m.gt(o);
      case "ge": return m.ge(o);
    }
    throw new Error(k);
  }));
  return { ops_out };
}

function runMatrix(c: Case): Record<string, any> {
  let m: any;
  try { m = buildMatrix(c.matrix); } catch (e) { return { exc: err(e) }; }
  const other: any = c.other ? buildMatrix(c.other) : null;
  const ops_out = c.ops.map((op) => attempt(() => {
    switch (op[0]) {
      case "str": return m.toString();
      case "get": {
        const k1 = key(op[1]);
        if (op.length === 2) return Array.isArray(op[1]) && op[1][0] === "t" ? m.getTuple(op[1].slice(1)) : m.get(k1);
        return m.get(k1, key(op[2]));
      }
      case "consensus": return m.consensus;
      case "anticonsensus": return m.anticonsensus;
      case "degenerate": return m.degenerateConsensus;
      case "calc_consensus": { const a = op[1]; return m.calculateConsensus(a.substitution_matrix ?? null, a.plurality ?? null, a.identity ?? 0, a.setcase ?? null); }
      case "gc": return m.gcContent;
      case "rc": return m.reverseComplement();
      case "normalize": return m.normalize(Array.isArray(op[1]) ? new Map(op[1]) : op[1]);
      case "log_odds": return m.logOdds(bgOf(op[1]));
      case "calculate": return m.calculate(op[2] === "Seq" ? new Seq(op[1]) : op[2] === "bytes" ? Uint8Array.from(op[1], (ch: string) => ch.charCodeAt(0) & 0x7f) : op[1]);
      case "search": return m.search(new Seq(op[1]), dec(op[2]), op[3], op[4]);
      case "max": return m.max;
      case "min": return m.min;
      case "mean": return m.mean(bgOf(op[1]));
      case "std": return m.std(bgOf(op[1]));
      case "pearson": return m.distPearson(other);
      case "pearson_at": return m.distPearsonAt(other, op[1]);
      case "distribution": {
        const d = new M.ScoreDistribution(op[2], m, bgOf(op[1]) === null ? new Map([...m.alphabet].map((l: string) => [l, 1 / m.alphabet.length])) : normalised(op[1]));
        const r: unknown[] = [d];
        for (const t of op[3]) {
          if (t === "fpr") r.push(d.thresholdFpr(op[4]));
          else if (t === "fnr") r.push(d.thresholdFnr(op[4]));
          else if (t === "balanced") r.push(d.thresholdBalanced(op[4], op[5]));
          else if (t === "patser") r.push(d.thresholdPatser());
        }
        return r;
      }
    }
    throw new Error(op[0]);
  }));
  return { ops_out, matrix_enc: enc(m) };
}
function normalised(b: [string, number][]): Map<string, number> {
  const total = b.reduce((s, [, v]) => s + v, 0);
  return new Map(b.map(([k, v]) => [k, v / total]));
}

function buildMotif(spec: any): M.Motif {
  const seqs = (): Seq[] => spec.instances.map((s: string) => new Seq(s));
  if (spec.how === "instances") return M.create(seqs(), spec.alphabet);
  if (spec.how === "counts") return new M.Motif(spec.alphabet, null, new Map(spec.counts));
  if (spec.how === "both") return new M.Motif(spec.alphabet, M.create(seqs()).alignment, new Map(spec.counts));
  return new M.Motif();
}

function runMotif(c: Case): Record<string, any> {
  let m: M.Motif;
  try { m = buildMotif(c.spec); } catch (e) { return { exc: err(e) }; }
  const motif0 = enc(m);
  const ops_out = c.ops.map((op) => attempt(() => {
    switch (op[0]) {
      case "str": return m.toString();
      case "str_masked": return m.toString(true);
      case "len": return m.size;
      case "mask": m.mask = op[1]; return [...m.mask];
      case "pseudocounts": m.pseudocounts = Array.isArray(op[1]) ? new Map(op[1]) : op[1]; return [...m.pseudocounts].map(([a, b]) => [a, num(b)]);
      case "background": m.background = Array.isArray(op[1]) ? new Map(op[1]) : op[1]; return [...m.background].map(([a, b]) => [a, num(b)]);
      case "slice": return m.slice({ start: op[1][0], stop: op[1][1], step: op[1][2] });
      case "item": throw new TypeError("motif indices must be slices");
      case "pwm": return m.pwm;
      case "pssm": return m.pssm;
      case "rc": return m.reverseComplement();
      case "consensus": return m.consensus;
      case "anticonsensus": return m.anticonsensus;
      case "degenerate": return m.degenerateConsensus;
      case "entropy": return m.relativeEntropy;
      case "format": return m.format(op[1]);
      case "fmt": return m.format(op[1]);
      case "write": return M.write([m], op[1]);
      case "name": m.name = op[1]; return m.name;
    }
    throw new Error(op[0]);
  }));
  return { ops_out, motif: motif0 };
}

const SNAKE: Record<string, string> = { num_occurrences: "numOccurrences", alt_id: "altId", strand_handling: "strandHandling" };
const camel = (k: string): string => SNAKE[k] ?? k;
const INSTANCE_KEYS: [string, string][] = [["motif_name", "motifName"], ["sequence_id", "sequenceId"], ["sequence_name", "sequenceName"], ["start", "start"], ["pvalue", "pvalue"], ["strand", "strand"], ["length", "lengthAttr"]];

function encExtra(m: any): unknown {
  const ex: Record<string, unknown> = {};
  for (const k of ["score", "number", "evalue", "num_occurrences", "id", "alt_id"]) if (camel(k) in m) ex[k] = typeof m[camel(k)] === "number" && !Number.isInteger(m[camel(k)]) ? num(m[camel(k)]) : m[camel(k)];
  if (m.alignment !== null) ex["instances"] = m.alignment.sequences.map((s: any) => Object.fromEntries(INSTANCE_KEYS.filter(([, t]) => Object.hasOwn(s, t) && s[t] !== undefined).map(([k, t]) => [k, typeof s[t] === "number" && !Number.isInteger(s[t]) ? num(s[t]) : s[t]])));
  return ex;
}
function encRecord(rec: any): unknown {
  const out: Record<string, unknown> = {};
  for (const k of ["version", "command", "parameters", "sequences", "datafile", "alphabet", "background", "diagrams", "database", "strand_handling"]) {
    const t = camel(k);
    if (!(t in rec) || rec[t] === undefined) continue;
    const v = rec[t];
    out[k] = v instanceof Map ? Object.fromEntries([...v].map(([a, b]) => [a, typeof b === "number" && !Number.isInteger(b) ? num(b) : b])) : v;
  }
  return out;
}

function runIo(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  try {
    if (c.op === "parse") {
      const ms: any = M.parse(c.text, c.fmt, c.strict ?? true);
      out["result"] = ms.map(encMotif);
      if (["alignace", "meme", "minimal", "mast", "xms", "pfm-four-columns", "pfm-four-rows"].includes(c.fmt)) { out["extras"] = [...ms].map(encExtra); out["record"] = encRecord(ms); }
      out["version"] = ["meme", "minimal", "mast", "alignace"].includes(c.fmt) ? null : ms.version ?? null;
      if (c.fmt === "jaspar" && ms.length) {
        const first = ms[0];
        const ex: Record<string, unknown> = { ids: [...ms].map((m: any) => [m.baseId, m.version]), dict: [...ms.toDict().keys()].sort(), eq: [...ms].map((m: any) => first.equals(m)), str: ms.toString() };
        ex["pseudo"] = attempt(() => M.jaspar.calculatePseudocounts(first));
        first.background = new Map([["A", 0.4], ["C", 0.1], ["G", 0.1], ["T", 0.4]]);
        ex["pseudo_bg"] = attempt(() => M.jaspar.calculatePseudocounts(first));
        out["extra"] = ex;
      }
      out["str"] = c.fmt === "transfac" ? ms.toString() : null;
    } else if (c.op === "read") out["result"] = [encMotif(M.read(c.text, c.fmt, c.strict ?? true))];
    else {
      const ms = M.parse(c.text, c.fmt);
      out["written"] = Object.fromEntries(c.to.map((f) => [f, attempt(() => M.write([...ms], f))]));
      out["written"]["pfm-four-columns"] = attempt(() => M.pfm.write([...ms]));
    }
  } catch (e) { out["exc"] = err(e); }
  return out;
}

/** Floats to 1e-9 relative (log2 and exp differ in the last bits); structure and text exactly. */
function same(want: any, got: any): boolean {
  if (typeof want === "number" && typeof got === "number") return want === got || Math.abs(want - got) <= 1e-9 * Math.max(1, Math.abs(want));
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => same(w, got[i]));
  if (want !== null && typeof want === "object") return got !== null && typeof got === "object" && Object.keys(want).length === Object.keys(got).length && Object.keys(want).every((k) => same(want[k], got[k]));
  return want === got;
}
const outOk = (w: Out, g: Out): boolean => (w.exc ? excOk(w.exc, g.exc) : g.exc === undefined && same(w.result, g.result));

describe("Bio.motifs: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/motifs.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`matrices, motifs and formats (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      if (c.kind === "split_id") { if (!same(c.result, M.jaspar.splitJasparId(c.id!))) bad.push(`split_id ${c.id}`); continue; }
      const cap = captureWarnings(() => (c.kind === "matrix" ? runMatrix(c) : c.kind === "matrixcmp" ? runMatrixcmp(c) : c.kind === "motif" ? runMotif(c) : runIo(c)));
      if (cap.error !== undefined) { bad.push(`${c.kind}: threw ${(cap.error as Error).message}`); continue; }
      const got = cap.result as Record<string, any>;
      let why = "";
      if (c.kind === "io") {
        if (c.exc || got["exc"]) why = excOk(c.exc, got["exc"]) ? "" : `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
        else if (c.op === "write") { for (const f of Object.keys(c.written!)) if (!outOk(c.written![f]!, got["written"][f])) { why = `write ${f}: want ${JSON.stringify(c.written![f]).slice(0, 300)} got ${JSON.stringify(got["written"][f]).slice(0, 300)}`; break; } }
        else if (!same(c.result, got["result"])) why = `result: want ${JSON.stringify(c.result).slice(0, 500)} got ${JSON.stringify(got["result"]).slice(0, 500)}`;
        else if (c.op === "parse" && c.extras !== undefined && !same([c.extras, c.record], [got["extras"], got["record"]])) why = `extras: want ${JSON.stringify([c.extras, c.record]).slice(0, 500)} got ${JSON.stringify([got["extras"], got["record"]]).slice(0, 500)}`;
        else if (c.op === "parse" && c.extra !== undefined && !same(c.extra, got["extra"])) why = `extra: want ${JSON.stringify(c.extra).slice(0, 400)} got ${JSON.stringify(got["extra"]).slice(0, 400)}`;
        else if (c.op === "parse" && (c.version !== got["version"] || c.str !== got["str"])) why = `version/str: want ${JSON.stringify([c.version, c.str]).slice(0, 300)} got ${JSON.stringify([got["version"], got["str"]]).slice(0, 300)}`;
      } else {
        if (c.exc || got["exc"]) why = excOk(c.exc, got["exc"]) ? "" : `ctor: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
        else {
          if (c.kind !== "matrixcmp" && !same(c.kind === "matrix" ? c.matrix_enc : c.motif, c.kind === "matrix" ? got["matrix_enc"] : got["motif"])) why = "built object differs";
          for (let i = 0; i < c.ops.length && !why; i++) if (!outOk(c.ops_out[i]!, got["ops_out"][i])) why = `op ${JSON.stringify(c.ops[i]).slice(0, 120)}: want ${JSON.stringify(c.ops_out[i]).slice(0, 400)} got ${JSON.stringify(got["ops_out"][i]).slice(0, 400)}`;
        }
      }
      if (!why && JSON.stringify(c.warnings) !== JSON.stringify(cap.warnings.map((w) => w.message))) why = "warnings differ";
      if (why) bad.push(`${c.kind} ${c.op ?? ""} ${c.fmt ?? ""} ${JSON.stringify(c.text ?? c.matrix ?? c.spec).slice(0, 100)}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 6).join("\n")}`).toBe(0);
  });
});
