/**
 * Replays Bio.SeqUtils golden cases (reference/golden/gen_sequtils_cases.py) against the TypeScript port.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CodonTable } from "@biolibs/seq";
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
};
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Python keyword names become the trailing positional arguments in this port. */
const KW_ORDER: Record<string, string[]> = { molecular_weight: ["double_stranded", "circular", "monoisotopic"] };

function call(c: Case): Json {
  const args = c.args!.map(dec);
  const fn = NAMES[c.fn!]!;
  if (c.kw) {
    const names = KW_ORDER[c.fn!]!;
    const fixed = c.fn === "molecular_weight" ? 2 : args.length;
    const rest = names.map((n) => (n in c.kw! ? c.kw![n] : false));
    return enc(fn(...args.slice(0, fixed), ...rest));
  }
  return enc(fn(...args));
}

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
    else box["result"] = call(c);
  });
  const got = { ...box };
  for (const k of Object.keys(box)) delete box[k];
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
    const norm = (v: unknown): string => JSON.stringify(v, (_, x) => (typeof x === "number" && !Number.isInteger(x) && k_ === "ops_out" ? Number(x.toPrecision(14)) : x));
    let k_ = "";
    for (const k of ["items", "str", "ops_out"]) if ((k_ = k, norm(c[k])) !== norm(got[k])) return `${k}: expected ${JSON.stringify(c[k]).slice(0, 300)}, got ${JSON.stringify(got[k]).slice(0, 300)}`;
  } else if (JSON.stringify(c["result"]) !== JSON.stringify(got["result"])) {
    return `result: expected ${JSON.stringify(c["result"])}, got ${JSON.stringify(got["result"])}`;
  }
  if (JSON.stringify(c.warnings) !== JSON.stringify(cap.warnings.map((w) => w.message))) return `warnings: expected ${JSON.stringify(c.warnings)}, got ${JSON.stringify(cap.warnings.map((w) => w.message))}`;
  return null;
}
const box: Record<string, unknown> = {};

describe(`Bio.SeqUtils: parity with Biopython ${file.biopython}`, () => {
  const groups = new Map<string, (Case & Record<string, any>)[]>();
  for (const c of file.cases) {
    const key = c.kind === "cai" ? "CodonAdaptationIndex" : camel(c.fn!);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const [name, cases] of groups) {
    it(`${name} (${cases.length} cases)`, () => {
      const bad: string[] = [];
      for (const c of cases) {
        const d = compare(c);
        if (d) bad.push(`${JSON.stringify(c.kind === "cai" ? { seqs: c.seqs!.length, table: c.table } : { args: c.args, kw: c.kw }).slice(0, 200)}\n    ${d}`);
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 6).join("\n")}`).toBe(0);
    });
  }
});
