/** Replays the Bio.PDB.internal_coords.AtomKey golden cases (reference/golden/gen_ickey_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AtomKey } from "@biolibs/pdb";

type Exc = { type: string; msg: string | null };
type Out = { result?: unknown; exc?: Exc };
interface Spec { how: string; value: unknown }
interface Case { kind: string; spec?: Spec; a?: Spec; b?: Spec; keys?: string[]; result?: unknown; exc?: Exc; warnings: string[] }

/** AttributeError is a TypeError here, with no message to compare. */
const excOk = (want?: Exc, got?: Exc): boolean => {
  if (!want || !got) return !want && !got;
  const w = want.type === "AttributeError" ? { type: "TypeError", msg: null } : want;
  return w.type === got.type && (w.msg === null || w.msg === got.msg);
};
const err = (e: unknown): Exc => ({ type: (e as Error).name, msg: (e as Error).message });
const attempt = (f: () => unknown): Out => { try { return { result: f() }; } catch (e) { return { exc: err(e) }; } };
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const outOk = (w: Out, g: Out): boolean => (w.exc ? excOk(w.exc, g.exc) : g.exc === undefined && same(w.result, g.result));

/** Build a key the way the generator's `build` does. */
function build(spec: Spec): AtomKey {
  const { how, value } = spec;
  if (how === "string") return new AtomKey(value);
  if (how === "args") return new AtomKey(value as unknown[]);
  if (how === "list") return new AtomKey([value]);
  if (how === "dict") return new AtomKey([Object.fromEntries(value as [string, unknown][])]);
  if (how === "kwargs") return new AtomKey([], Object.fromEntries(value as [string, unknown][]));
  throw new Error(how);
}

function runKey(c: Case): Out {
  return attempt(() => {
    const k = build(c.spec!);
    return { akl: [...k.akl], id: k.id, repr: k.repr(), atm: attempt(() => k.atm()),
      is_backbone: k.isBackbone(), cr_class: attempt(() => k.crClass()) };
  });
}

function runPair(c: Case): Out {
  return attempt(() => {
    const a = build(c.a!), b = build(c.b!);
    return { cmp: attempt(() => a.compare(b)), lt: attempt(() => a.lt(b)), le: attempt(() => a.le(b)),
      gt: attempt(() => a.gt(b)), ge: attempt(() => a.ge(b)),
      eq: a.equals(b), ne: !a.equals(b), altloc_match: a.altlocMatch(b) };
  });
}

function runSort(c: Case): Out {
  return attempt(() => {
    // Python's `sorted` is stable and uses `<`; the ranks `compare` returns drive it the same way.
    const keys = c.keys!.map((s) => new AtomKey(s));
    return [...keys].sort((x, y) => { const [p, q] = x.compare(y); return p - q; }).map((k) => k.id);
  });
}

describe("Bio.PDB.internal_coords.AtomKey: parity with Biopython", () => {
  const { biopython, cases } = JSON.parse(readFileSync(new URL("./golden/ickey.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };
  const runners: Record<string, (c: Case) => Out> = { key: runKey, pair: runPair, sort: runSort };
  for (const kind of ["key", "pair", "sort"]) {
    const list = cases.filter((c) => c.kind === kind);
    it(`${kind} (${list.length} cases, Biopython ${biopython})`, () => {
      const bad: string[] = [];
      for (const c of list) {
        const got = runners[kind]!(c);
        const want: Out = c.exc ? { exc: c.exc } : { result: c.result };
        if (!outOk(want, got)) {
          bad.push(`${JSON.stringify(c.spec ?? [c.a, c.b] ?? c.keys)}\n    want ${JSON.stringify(want).slice(0, 300)}\n    got  ${JSON.stringify(got).slice(0, 300)}`);
        }
      }
      expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 4).join("\n")}`).toBe(0);
    });
  }
});
