/** Replays the Bio.Restriction golden cases (reference/golden/gen_restriction_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { MutableSeq, Seq } from "@biolibs/seq";
import { Analysis, FormattedSeq, RestrictionBatch, RestrictionType, enzymes, restDict } from "@biolibs/restriction";

type Exc = { type: string; msg: string | null };
type Out = { result?: unknown; exc?: Exc; skip?: boolean };
interface Case { kind: string; name: string; a: string; b: string; batch: string[] | null; seq: any; linear: boolean; ops: any[][]; ops_out: Out[]; warnings: string[]; [k: string]: any }

const E = (n: string): RestrictionType => enzymes[n]!;
const num = (x: unknown): unknown => (typeof x === "number" && Number.isNaN(x) ? "nan" : x === Infinity ? "inf" : x);

/** Encode a result like the generator's `enc`. */
function enc(x: any): unknown {
  if (x === null || x === undefined || typeof x === "boolean" || typeof x === "string") return x ?? null;
  if (typeof x === "number") return num(x);
  if (x instanceof Seq || x instanceof MutableSeq) return { seq: x.toString(), cls: x instanceof Seq ? "Seq" : "MutableSeq" };
  if (x instanceof FormattedSeq) return { fseq: x.repr() };
  if (x instanceof RestrictionType) return { enz: x.name };
  if (x instanceof RestrictionBatch) return { batch: [...x].map((e) => e.name).sort() };
  if (x instanceof Map) return { map: [...x].map(([k, v]) => [k.name, enc(v)]).sort((a: any, b: any) => (a[0] < b[0] ? -1 : 1)) };
  if (Array.isArray(x)) return x.map(enc);
  throw new Error("cannot encode");
}

/** AttributeError is a TypeError here, with no message to compare. */
const excOk = (want: Exc | undefined, got: Exc | undefined): boolean => {
  if (want === undefined || got === undefined) return want === got;
  const w = want.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return w.type === got.type && (w.msg === null || w.msg === got.msg);
};
const err = (e: unknown): Exc => ({ type: (e as Error).name, msg: (e as Error).message });
const attempt = (f: () => unknown): Out => { try { return { result: enc(f()) }; } catch (e) { return { exc: err(e) }; } };
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const outOk = (w: Out, g: Out): boolean => (w.exc ? excOk(w.exc, g.exc) : g.exc === undefined && same(w.result, g.result));

const METHODS: Record<string, (e: RestrictionType) => unknown> = {
  is_blunt: (e) => e.isBlunt(), is_5overhang: (e) => e.is5overhang(), is_3overhang: (e) => e.is3overhang(), overhang: (e) => e.overhang(), is_palindromic: (e) => e.isPalindromic(),
  is_defined: (e) => e.isDefined(), is_ambiguous: (e) => e.isAmbiguous(), is_unknown: (e) => e.isUnknown(), is_methylable: (e) => e.isMethylable(), is_comm: (e) => e.isComm(),
  cut_once: (e) => e.cutOnce(), cut_twice: (e) => e.cutTwice(), characteristic: (e) => e.characteristic(), elucidate: (e) => e.elucidate(), frequency: (e) => e.frequency(),
  supplier_list: (e) => e.supplierList(), __str__: (e) => e.toString(), __repr__: (e) => e.repr(), __len__: (e) => e.len(), buffers: (e) => e.buffers("B"),
};

function buildSeq(spec: any): Seq | MutableSeq | FormattedSeq {
  if (spec.cls === "Seq") return new Seq(spec.text);
  if (spec.cls === "MutableSeq") return new MutableSeq(spec.text);
  return new FormattedSeq(new Seq(spec.text), spec.linear);
}
const tok = (x: any): any => (Array.isArray(x) && x.length === 2 && x[0] === "e" ? E(x[1]) : x);

function runEnzyme(c: Case): Record<string, unknown> {
  const e = E(c.name), d = restDict[c.name]!;
  const attrs: Record<string, unknown> = { site: e.site, size: e.size, fst5: e.fst5, fst3: e.fst3, scd5: e.scd5, scd3: e.scd3, ovhg: e.ovhg, ovhgseq: e.ovhgseq, freq: e.freq, id: e.id, inact_temp: e.inactTemp, opt_temp: e.optTemp, substrat: e.substrat, uri: e.uri, charac: [...e.charac], suppl: [...e.suppl] };
  void d;
  return { attrs, methods: Object.fromEntries(Object.entries(METHODS).map(([k, f]) => [k, attempt(() => f(e))])) };
}

function runDigest(c: Case): Record<string, unknown> {
  const out: Record<string, any> = {};
  const e = E(c.name);
  // Python forks every case, so each starts with an enzyme that has never searched.
  e.dna = null; e.results = null; e.onMinus = null;
  let s: Seq | MutableSeq | FormattedSeq;
  try { s = buildSeq(c.seq); } catch (x) { return { exc: err(x) }; }
  out["search"] = attempt(() => [...e.search(s, c.linear)]);
  out["state"] = { results: enc(e.results), on_minus: enc(e.onMinus), dna: e.dna ? e.dna.repr() : null };
  out["catalyse"] = attempt(() => e.catalyse(s, c.linear));
  out["div"] = attempt(() => e.search(s));
  out["floordiv"] = attempt(() => e.floordiv(s));
  return out;
}

function runPair(c: Case): Record<string, unknown> {
  const a = E(c.a), b = E(c.b);
  const ops: Record<string, () => unknown> = { ne: () => a.ne(b), eq: () => a === b, rshift: () => a.rshift(b), mod: () => a.mod(b), lt: () => a.lt(b), le: () => a.le(b), gt: () => a.gt(b), ge: () => a.ge(b),
    equi: () => a.isEquischizomer(b), neo: () => a.isNeoschizomer(b), iso: () => a.isIsoschizomer(b), plus: () => a.add(b), ne_str: () => a.ne("x"), mod_str: () => a.mod("x"), lt_str: () => a.lt(3) };
  return { ops: Object.fromEntries(Object.entries(ops).map(([k, f]) => [k, attempt(f)])) };
}

function runLists(c: Case): Record<string, unknown> {
  const e = E(c.name);
  const out: Record<string, unknown> = {};
  const fns: Record<string, (b?: RestrictionBatch) => unknown> = { equischizomers: (b) => e.equischizomers(b ?? null), neoschizomers: (b) => e.neoschizomers(b ?? null), isoschizomers: (b) => e.isoschizomers(b ?? null), compatible_end: (b) => e.compatibleEnd(b) };
  for (const [k, f] of Object.entries(fns)) {
    out[k] = attempt(() => f());
    if (c.batch !== null) out[k + "_batch"] = attempt(() => f(new RestrictionBatch(c.batch!)));
  }
  return out;
}

function runBatch(c: Case): Record<string, unknown> {
  const ops_out: Out[] = [];
  let b: RestrictionBatch | null = null;
  for (const op of c.ops) {
    ops_out.push(attempt(() => {
      if (b === null && op[0] !== "new") throw new TypeError("the batch was never built");
      switch (op[0]) {
        case "new": b = new RestrictionBatch(op[1].map(tok), op[2]); return null;
        case "str": return b!.toString();
        case "repr": return b!.repr();
        case "elements": return b!.elements();
        case "len": return b!.size;
        case "has": return b!.has(tok(op[1]));
        case "get": return b!.get(tok(op[1]), op[2]);
        case "add": b!.add(tok(op[1])); return null;
        case "plus": return b!.plus(tok(op[1]));
        case "iadd": b!.iadd(tok(op[1])); return null;
        case "add_nocheck": { const x = tok(op[1]); if (!(x instanceof RestrictionType)) { /* Python adds anything unchecked; a string or number lands in the set */ (b as any).addNocheck(x); } else b!.addNocheck(x); return null; }
        case "remove": b!.remove(tok(op[1])); return null;
        case "split": { const r = b!.split(op[1], op[2]); return [r.size, [...r._data!.keys()].map((e) => e.name).sort()]; }
        case "lambdasplit": { const r = b!.lambdasplit((e) => e.size >= op[1]); return [r.size, [...r._data!.keys()].map((e) => e.name).sort()]; }
        case "add_supplier": b!.addSupplier(op[1]); return null;
        case "current_suppliers": return b!.currentSuppliers();
        case "suppliers": return [...b!.suppliers];
        case "search": return b!.search(op[3] === "Seq" ? new Seq(op[1]) : op[3] === "MutableSeq" ? (new MutableSeq(op[1]) as never) : new FormattedSeq(new Seq(op[1]), op[2]), op[2]);
        case "is_restriction": return b!.isRestriction(tok(op[1]));
        case "as_string": return b!.asString().sort();
      }
      throw new Error(op[0]);
    }));
  }
  const bb = b as RestrictionBatch | null;
  return { ops_out, final: bb ? [...bb].map((e) => e.name).sort() : null };
}

function runFseq(c: Case): Record<string, unknown> {
  let f: FormattedSeq, other: FormattedSeq;
  try { f = new FormattedSeq(c["cls"] === "Seq" ? new Seq(c["text"]) : new MutableSeq(c["text"]), c.linear); other = new FormattedSeq(new Seq(c["text"]), c.linear); } catch (x) { return { exc: err(x) }; }
  const ops_out = c.ops.map((op) => attempt(() => {
    switch (op[0]) {
      case "len": return f.length;
      case "repr": return f.repr();
      case "eq": return f.equals(other);
      case "eq_other": return f.equals("x");
      case "circ": f.circularise(); return f.repr();
      case "lin": f.linearise(); return f.repr();
      case "to_lin": return f.toLinear().repr();
      case "to_circ": return f.toCircular().repr();
      case "is_linear": return f.isLinear();
      case "slice": return f.slice(op[1] ?? undefined, op[2] ?? undefined);
      case "at": return f.at(op[1]);
      case "finditer": return f.finditer(new RegExp(op[1].replaceAll("(?P<", "(?<"), "g"), op[2]).map(([s, m]) => [s, m[0]]);
    }
    throw new Error(op[0]);
  }));
  return { ops_out };
}

function runAnalysis(c: Case): Record<string, unknown> {
  let a: Analysis;
  try { a = new Analysis(new RestrictionBatch(c.batch!), new Seq(c.seq), c.linear); } catch (x) { return { exc: err(x) }; }
  const ops_out: Out[] = [];
  const initial = enc(a.mapping);   // before any `change`
  for (const op of c.ops) {
    const k = op[0];
    if (k === "format") {
      a.printAs(op[1]);
      const pos = [...a.mapping.values()].flat();
      if (op[1] === "map" && pos.length !== new Set(pos).size) { ops_out.push({ skip: true }); continue; }
    }
    ops_out.push(attempt(() => {
      switch (k) {
        case "full": return a.full();
        case "blunt": return a.blunt();
        case "overhang5": return a.overhang5();
        case "overhang3": return a.overhang3();
        case "defined": return a.defined();
        case "with_sites": return a.withSites();
        case "without_site": return a.withoutSite();
        case "with_N_sites": return a.withNSites(op[1]);
        case "with_number_list": return a.withNumberList(op[1]);
        case "with_name": { const names = [...op[1]]; return [a.withName(names), names]; }
        case "with_site_size": return a.withSiteSize(op[1]);
        case "only_between": return a.onlyBetween(op[1], op[2]);
        case "between": return a.between(op[1], op[2]);
        case "show_only_between": return a.showOnlyBetween(op[1], op[2]);
        case "only_outside": return a.onlyOutside(op[1], op[2]);
        case "outside": return a.outside(op[1], op[2]);
        case "do_not_cut": return a.doNotCut(op[1], op[2]);
        case "format": return a.formatOutput(null, op[2], op[3]);
        case "change": {
          const what = { ...op[1] };
          a.change(what);
          const f = a.format_;
          return [a.mapping, a.sequence.toString(), a.linear, f.NameWidth, f.ConsoleWidth, f.Cmodulo, f.PrefWidth];
        }
        case "repr": return a.repr();
      }
      throw new Error(k);
    }));
  }
  return { mapping: initial, ops_out };
}

function check(c: Case, got: Record<string, any>): string {
  switch (c.kind) {
    case "enzyme": {
      for (const k of Object.keys(c["attrs"])) if (!same(c["attrs"][k], got["attrs"][k])) return `attr ${k}: want ${JSON.stringify(c["attrs"][k])} got ${JSON.stringify(got["attrs"][k])}`;
      for (const k of Object.keys(c["methods"])) if (!outOk(c["methods"][k], got["methods"][k])) return `method ${k}: want ${JSON.stringify(c["methods"][k])} got ${JSON.stringify(got["methods"][k])}`;
      return "";
    }
    case "digest": {
      if (c["exc"] || got["exc"]) return excOk(c["exc"], got["exc"]) ? "" : `ctor: want ${JSON.stringify(c["exc"])} got ${JSON.stringify(got["exc"])}`;
      for (const k of ["search", "catalyse", "div", "floordiv"]) if (!outOk(c[k], got[k])) return `${k}: want ${JSON.stringify(c[k]).slice(0, 300)} got ${JSON.stringify(got[k]).slice(0, 300)}`;
      return same(c["state"], got["state"]) ? "" : `state: want ${JSON.stringify(c["state"]).slice(0, 300)} got ${JSON.stringify(got["state"]).slice(0, 300)}`;
    }
    case "pair": { for (const k of Object.keys(c["ops"])) if (!outOk(c["ops"][k], got["ops"][k])) return `${k}: want ${JSON.stringify(c["ops"][k])} got ${JSON.stringify(got["ops"][k])}`; return ""; }
    case "lists": { for (const k of Object.keys(got)) if (!outOk(c[k], got[k])) return `${k}: want ${JSON.stringify(c[k]).slice(0, 300)} got ${JSON.stringify(got[k]).slice(0, 300)}`; return ""; }
    default: {
      if (c["exc"] || got["exc"]) return excOk(c["exc"], got["exc"]) ? "" : `ctor: want ${JSON.stringify(c["exc"])} got ${JSON.stringify(got["exc"])}`;
      if (c.kind === "analysis" && !same(c["mapping"], got["mapping"])) return "mapping differs";
      for (let i = 0; i < c.ops.length; i++) {
        const w = c.ops_out[i]!, g = got["ops_out"][i] as Out;
        if (w.skip) continue;
        if (!outOk(w, g)) return `op ${JSON.stringify(c.ops[i]).slice(0, 120)}: want ${JSON.stringify(w).slice(0, 400)} got ${JSON.stringify(g).slice(0, 400)}`;
      }
      if (c.kind === "batch" && !same(c["final"], got["final"])) return `final: want ${JSON.stringify(c["final"])} got ${JSON.stringify(got["final"])}`;
      return "";
    }
  }
}

describe("Bio.Restriction: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/restriction.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`enzymes, digests, batches, analysis (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    const runners: Record<string, (c: Case) => Record<string, unknown>> = { enzyme: runEnzyme, digest: runDigest, pair: runPair, fseq: runFseq, lists: runLists, batch: runBatch, analysis: runAnalysis };
    for (const c of cases) {
      const cap = captureWarnings(() => runners[c.kind]!(c));
      if (cap.error !== undefined) { bad.push(`${c.kind} ${c.name ?? ""}: threw ${(cap.error as Error).message}`); continue; }
      let why = check(c, cap.result as Record<string, any>);
      if (!why && JSON.stringify(c.warnings) !== JSON.stringify(cap.warnings.map((w) => w.message))) why = `warnings: want ${JSON.stringify(c.warnings)} got ${JSON.stringify(cap.warnings.map((w) => w.message))}`;
      if (why) bad.push(`${c.kind} ${c.name ?? c.a ?? ""} ${JSON.stringify(c.seq ?? c.ops?.[0] ?? "").slice(0, 100)}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 6).join("\n")}`).toBe(0);
  });
});
