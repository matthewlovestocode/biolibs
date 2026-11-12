/**
 * Replays Bio.SeqUtils golden cases (reference/golden/gen_sequtils_cases.py) against the TypeScript port.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CodonTable } from "@biolibs/seq";
import { ProteinAnalysis, IsoelectricPoint, ProtParamData, setStderrWriter } from "@biolibs/seqtools";
import { captureWarnings } from "@biolibs/core";
import * as U from "@biolibs/seqtools";
import { dec, enc } from "../../seqrecord/test/golden-runner";

type Json = null | boolean | number | string | { [k: string]: unknown } | Json[];
interface Case {
  fn?: string; kind?: string; args?: unknown[]; kw?: Record<string, unknown>; seqs?: unknown[]; table?: number | null; ops?: unknown[][];
  result?: Json; items?: [string, number][]; str?: string; exc?: { type: string; msg: string | null }; warnings: string[];
  ops_out?: unknown;
}

const NAMES: Record<string, (...a: any[]) => unknown> = {
  gc_fraction: U.gcFraction, GC123: U.gc123, GC_skew: U.gcSkew, nt_search: U.ntSearch, seq1: U.seq1, seq3: U.seq3,
  molecular_weight: U.molecularWeight, six_frame_translations: U.sixFrameTranslations,
  Tm_Wallace: U.tmWallace, Tm_GC: U.tmGC, Tm_NN: U.tmNN, salt_correction: U.saltCorrection, chem_correction: U.chemCorrection, make_table: U.makeTable,
  crc32: U.crc32, crc64: U.crc64, gcg: U.gcg, seguid: U.seguid, lcc_simp: U.lccSimp, lcc_mult: U.lccMult,
};
const PA_METHODS: Record<string, string> = {
  count_amino_acids: "countAminoAcids", amino_acids_percent: "aminoAcidsPercent", molecular_weight: "molecularWeight", aromaticity: "aromaticity", instability_index: "instabilityIndex",
  flexibility: "flexibility", gravy: "gravy", protein_scale: "proteinScale", isoelectric_point: "isoelectricPoint", charge_at_pH: "chargeAtPH", secondary_structure_fraction: "secondaryStructureFraction",
  molar_extinction_coefficient: "molarExtinctionCoefficient", pi: "pi",
};

/** Run the method calls of a `pa` or `ip` case, capturing what is written to standard error. */
function runObject(c: Case & Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let obj: any = null;
  try {
    obj = c.kind === "pa" ? new ProteinAnalysis(dec(c.seq), ...(c.args ?? [])) : new IsoelectricPoint(dec(c.seq), ...((c.args ?? []).map(dec) as []));
    out["ctor"] = "ok";
  } catch (e) {
    out["ctor"] = { type: (e as Error).name, msg: (e as Error).message };
  }
  out["ops_out"] = (obj === null ? [] : c.ops!).map((op: any[]) => {
    let stderr = "";
    const old = setStderrWriter((t) => { stderr += t; });
    try {
      const args = op.slice(1).map((a: any) => (a && typeof a === "object" && "$scale" in a ? (ProtParamData as any)[a.$scale] : dec(a)));
      const r = op[0] === "amino_acids_percent" ? obj.aminoAcidsPercent : obj[PA_METHODS[op[0]]!](...args);
      return { result: enc(r), stderr };
    } catch (e) {
      return { exc: { type: (e as Error).name, msg: (e as Error).message }, stderr };
    } finally {
      setStderrWriter(old);
    }
  });
  return out;
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Python keyword names become the trailing positional arguments in this port. */
const KW_ORDER: Record<string, string[]> = {
  molecular_weight: ["double_stranded", "circular", "monoisotopic"],
  Tm_Wallace: ["check", "strict"],
  Tm_GC: ["check", "strict", "valueset", "userset", "Na", "K", "Tris", "Mg", "dNTPs", "saltcorr", "mismatch"],
  Tm_NN: ["check", "strict", "c_seq", "shift", "nn_table", "tmm_table", "imm_table", "de_table", "dnac1", "dnac2", "selfcomp", "Na", "K", "Tris", "Mg", "dNTPs", "saltcorr"],
  salt_correction: ["Na", "K", "Tris", "Mg", "dNTPs", "method", "seq"],
  chem_correction: ["DMSO", "fmd", "DMSOfactor", "fmdfactor", "fmdmethod", "GC"],
};

function call(c: Case): Json {
  const fn = NAMES[c.fn!]!;
  const raw = (a: any): unknown => (a && typeof a === "object" && "$table" in a ? (U.MeltingTempData as any)[tableName(a.$table)] : dec(a));
  const args = c.args!.map(raw);
  if (c.kw) {
    const names = KW_ORDER[c.fn!]!;
    // Keyword arguments become positional ones; any not given stay undefined so the default applies.
    const positional = names.map((n) => (n in c.kw! ? raw(c.kw![n]) : undefined));
    const fixed = c.fn === "molecular_weight" ? 2 : c.fn === "Tm_NN" || c.fn === "Tm_GC" || c.fn === "Tm_Wallace" ? 1 : c.fn === "chem_correction" ? 1 : 0;
    const rest = c.fn === "molecular_weight" ? positional.map((v) => v ?? false) : positional;
    return enc(fn(...args.slice(0, fixed), ...rest));
  }
  return enc(fn(...args));
}

/** The camelCase export for a Python table name (`DNA_NN3` becomes `dnaNn3`). */
const tableName = (n: string): string => n.toLowerCase().replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());

function runCai(c: Case): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const table = c.table ? CodonTable.unambiguousDnaById.get(c.table) : undefined;
  const cai = new U.CodonAdaptationIndex(c.seqs!.map(dec), table);
  out["items"] = [...cai];
  out["str"] = cai.toString();
  out["ops_out"] = c.ops!.map((op) => {
    try {
      if (op[0] === "calculate") return { result: cai.calculate(dec(op[1])) };
      return { result: enc(cai.optimize(dec(op[1]), ...(op.slice(2) as [string, boolean]))) };
    } catch (e) {
      return { exc: { type: (e as Error).name, msg: (e as Error).message } };
    }
  });
  return out;
}

const file = JSON.parse(readFileSync(new URL("./golden/sequtils.json", import.meta.url), "utf8")) as { biopython: string; cases: (Case & Record<string, any>)[] };

/** First difference between the recorded and actual outcome, or null. */
function compare(c: Case & Record<string, any>): string | null {
  const cap = captureWarnings(() => {
    if (c.kind === "cai") Object.assign(box, runCai(c));
    else if (c.kind === "pa" || c.kind === "ip") Object.assign(box, runObject(c));
    else box["result"] = call(c);
  });
  const got = { ...box };
  for (const k of Object.keys(box)) delete box[k];
  if (c.kind === "pa" || c.kind === "ip") {
    if (JSON.stringify(c["ctor"]) !== JSON.stringify(got["ctor"])) {
      const w = c["ctor"], g = got["ctor"] as any;
      if (!(typeof w === "object" && typeof g === "object" && w.type === g.type && (w.msg === null || w.msg === g.msg))) return `ctor: expected ${JSON.stringify(w)}, got ${JSON.stringify(g)}`;
    }
    const want = c["ops_out"] as any[];
    const have = got["ops_out"] as any[];
    if (want.length !== have.length) return `ops: expected ${want.length}, got ${have.length}`;
    for (let i = 0; i < want.length; i++) {
      const w = want[i], g = have[i];
      if (w.stderr !== g.stderr) return `op ${JSON.stringify(c.ops[i]).slice(0, 80)} stderr: expected ${JSON.stringify(w.stderr)}, got ${JSON.stringify(g.stderr)}`;
      if (w.exc) {
        if (!g.exc || g.exc.type !== (w.exc.type === "AttributeError" ? "TypeError" : w.exc.type) || (w.exc.msg !== null && w.exc.msg !== g.exc.msg)) return `op ${JSON.stringify(c.ops[i]).slice(0, 80)}: expected ${JSON.stringify(w.exc)}, got ${JSON.stringify(g.exc ?? g.result)}`;
      } else if (g.exc || !close(w.result, g.result)) {
        return `op ${JSON.stringify(c.ops[i]).slice(0, 80)}: expected ${JSON.stringify(w.result).slice(0, 200)}, got ${JSON.stringify(g.exc ?? g.result).slice(0, 200)}`;
      }
    }
    return null;
  }
  const wantExc = c.exc?.type === "AttributeError" ? { type: "TypeError", msg: null } : c.exc;
  if (wantExc) {
    if (cap.error === undefined) return `expected ${wantExc.type}: ${wantExc.msg}, got no error`;
    const e = cap.error as Error;
    if (e.name !== wantExc.type) return `expected ${wantExc.type}: ${wantExc.msg}, got ${e.name}: ${e.message}`;
    if (wantExc.msg !== null && wantExc.msg !== e.message) return `message: expected ${JSON.stringify(wantExc.msg)}, got ${JSON.stringify(e.message)}`;
  } else if (cap.error !== undefined) {
    return `expected success, got ${(cap.error as Error).name}: ${(cap.error as Error).message}`;
  } else if (c.kind === "cai") {
    // `calculate` uses log and exp, which the C library behind Python and V8's own implementation round differently in the last bit.
    for (const k of ["items", "str"]) if (JSON.stringify(c[k]) !== JSON.stringify(got[k])) return `${k}: expected ${JSON.stringify(c[k]).slice(0, 300)}, got ${JSON.stringify(got[k]).slice(0, 300)}`;
    for (const k of ["ops_out"]) if (!close(c[k], got[k])) return `${k}: expected ${JSON.stringify(c[k]).slice(0, 300)}, got ${JSON.stringify(got[k]).slice(0, 300)}`;
  } else if (LIBM.has(c.fn ?? "") ? !close(c["result"], got["result"]) : JSON.stringify(c["result"]) !== JSON.stringify(got["result"])) {
    return `result: expected ${JSON.stringify(c["result"])}, got ${JSON.stringify(got["result"])}`;
  }
  if (JSON.stringify(c.warnings) !== JSON.stringify(cap.warnings.map((w) => w.message))) return `warnings: expected ${JSON.stringify(c.warnings)}, got ${JSON.stringify(cap.warnings.map((w) => w.message))}`;
  return null;
}
/** Functions built on log, exp or pow, whose last bit depends on the C library behind Python. */
const LIBM = new Set(["lcc_simp", "lcc_mult", "Tm_GC", "Tm_NN", "salt_correction"]);
const round = (c: Case, v: unknown): string =>
  JSON.stringify(v, (_, x) => (typeof x === "number" && !Number.isInteger(x) && LIBM.has(c.fn ?? "") ? Number(x.toPrecision(14)) : x));
/** Structural equality where numbers may differ by a relative 1e-12 (log, exp and pow differ in the last bits between C libraries). */
function close(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b || Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b)) || (Number.isNaN(a) && Number.isNaN(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => close(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => close((a as any)[k], (b as any)[k]));
  }
  return a === b;
}

/** JSON with floats rounded to 13 significant digits (pow and log differ in the last bits between C libraries). */
const approx = (v: unknown): string => JSON.stringify(v, (_, x) => (typeof x === "number" && !Number.isInteger(x) ? Number(x.toPrecision(13)) : x));
const box: Record<string, unknown> = {};

describe(`Bio.SeqUtils: parity with Biopython ${file.biopython}`, () => {
  const groups = new Map<string, (Case & Record<string, any>)[]>();
  for (const c of file.cases) {
    const key = c.kind === "cai" ? "CodonAdaptationIndex" : c.kind === "pa" ? "ProteinAnalysis" : c.kind === "ip" ? "IsoelectricPoint" : camel(c.fn!);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const [name, cases] of groups) {
    it(`${name} (${cases.length} cases)`, () => {
      const bad: string[] = [];
      for (const c of cases) {
        const d = compare(c);
        if (d) bad.push(`${JSON.stringify(c.kind === "cai" ? { seqs: c.seqs!.length, table: c.table } : c.kind === "pa" || c.kind === "ip" ? { seq: c.seq, args: c.args } : { args: c.args, kw: c.kw }).slice(0, 200)}\n    ${d}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 6).join("\n")}`).toBe(0);
    });
  }
});
