/** Replays the Bio.SeqIO.index golden cases (reference/golden/gen_index_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWarnings } from "@biolibs/core";
import { index, type IndexedSeqFileDict } from "@biolibs/seqio";
import { enc } from "../../seqrecord/test/golden-runner";

type Exc = { type: string; msg: string | null };
interface Item { key: string; raw?: string; raw_exc?: Exc; record?: unknown; same?: boolean; exc?: Exc }
interface Case { format: string; text: string; keyfunc: string; exc?: Exc; keys?: string[]; len?: number; items?: Item[]; probes?: { result?: unknown; exc?: Exc }[]; str?: string; warnings: string[] }

const KEYFUNCS: Record<string, ((k: string) => string) | null> = { none: null, upper: (k) => k.toUpperCase(), first4: (k) => k.slice(0, 4), const: () => "x" };
/** Python's AttributeError is a TypeError here, with no message to compare. */
const excOk = (want: Exc | undefined, got: Exc | undefined): boolean => {
  if (want === undefined || got === undefined) return want === got;
  const w = want.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return w.type === got.type && (w.msg === null || w.msg === got.msg);
};
const err = (e: unknown): Exc => ({ type: (e as Error).name === "AttributeError" ? "TypeError" : (e as Error).name, msg: (e as Error).message });
const latin1 = (b: Uint8Array): string => Array.from(b, (c) => String.fromCharCode(c)).join("");

function run(c: Case): Record<string, any> {
  const out: Record<string, any> = {};
  const cap = captureWarnings(() => {
    let d: IndexedSeqFileDict;
    try { d = index(c.text, c.format, { keyFunction: KEYFUNCS[c.keyfunc] }); } catch (e) { out["exc"] = err(e); return; }
    const keys = [...d.keys()];
    out["keys"] = keys; out["len"] = d.size;
    out["items"] = keys.slice(0, 8).map((k) => {
      const item: Record<string, unknown> = { key: k };
      try { item["raw"] = latin1(d.getRaw(k)); } catch (e) { item["raw_exc"] = err(e); }
      try { const r = d.get(k); item["record"] = enc(r); item["same"] = d.get(k) === r; } catch (e) { item["exc"] = err(e); }
      return item;
    });
    out["probes"] = ["__missing__", ""].flatMap((k) => [() => d.get(k), () => d.getRaw(k), () => d.has(k)].map((fn) => {
      try { const r = fn(); return { result: r instanceof Uint8Array ? "bytes" : typeof r === "boolean" ? r : "record" }; } catch (e) { return { exc: err(e) }; }
    }));
    out["str"] = d.toString();
  });
  out["warnings"] = cap.warnings.map((w) => w.message);
  return out;
}

describe("SeqIO.index: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden-index/seqio-index.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  it(`index (${cases.length} cases, Biopython ${biopython})`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const got = run(c);
      let why = "";
      if (!excOk(c.exc, got["exc"])) why = `exc: want ${JSON.stringify(c.exc)} got ${JSON.stringify(got["exc"])}`;
      else if (!c.exc) {
        if (JSON.stringify(c.keys) !== JSON.stringify(got["keys"])) why = `keys: want ${JSON.stringify(c.keys)?.slice(0, 200)} got ${JSON.stringify(got["keys"])?.slice(0, 200)}`;
        else if (c.len !== got["len"]) why = "len";
        else if (c.str !== got["str"]) why = `str: want ${c.str} got ${got["str"]}`;
        else {
          c.items!.forEach((w, i) => {
            if (why) return;
            const g = got["items"][i];
            if (w.raw !== g.raw || !excOk(w.raw_exc, g.raw_exc)) why = `raw of ${w.key}: want ${JSON.stringify(w.raw ?? w.raw_exc)?.slice(0, 200)} got ${JSON.stringify(g.raw ?? g.raw_exc)?.slice(0, 200)}`;
            else if (!excOk(w.exc, g.exc)) why = `get ${w.key}: want ${JSON.stringify(w.exc)} got ${JSON.stringify(g.exc)}`;
            else if (!w.exc && (JSON.stringify(w.record) !== JSON.stringify(g.record) || w.same !== g.same)) why = `record ${w.key}: want ${JSON.stringify(w.record)?.slice(0, 250)} got ${JSON.stringify(g.record)?.slice(0, 250)}`;
          });
          c.probes!.forEach((w, i) => {
            if (why) return;
            const g = got["probes"][i];
            const ok = w.exc ? excOk(w.exc, g.exc) : g.exc === undefined && (w.result === g.result || (typeof w.result === "object" && g.result === "record"));
            if (!ok) why = `probe ${i}: want ${JSON.stringify(w)} got ${JSON.stringify(g)}`;
          });
        }
      }
      if (!why && JSON.stringify(c.warnings) !== JSON.stringify(got["warnings"])) why = `warnings: want ${JSON.stringify(c.warnings)} got ${JSON.stringify(got["warnings"])}`;
      if (why) bad.push(`${c.format}/${c.keyfunc} ${JSON.stringify(c.text.slice(0, 80))}\n    ${why}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 5).join("\n")}`).toBe(0);
  });
});
