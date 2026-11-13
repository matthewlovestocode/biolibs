/** Replays Bio.Phylo.PhyloXML / PhyloXMLIO golden cases (reference/golden/gen_phyloxml_cases.py). */
import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { Alignment, MultipleSeqAlignment } from "@biolibs/align";
import { PyFloat, captureWarnings, pyFloatRepr } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { Position, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { BranchColor as BaseBranchColor, PhyloXML as PX, PhyloXMLIO, parse as phyloParse, read as phyloRead, write as phyloWrite, type Tree } from "@biolibs/phylo";

type Json = any;
const cases: Json[] = JSON.parse(readFileSync(new URL("./golden/phyloxml.json", import.meta.url), "utf8"));

/** The same generic encoding as `enc_px` in reference/golden/phylo_codec.py. */
const byKey = (d: [string, unknown][]): [string, unknown][] => [...d].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const enc = (o: any): Json => {
  if (o === null || o === undefined || typeof o === "boolean" || typeof o === "string") return o ?? null;
  if (o instanceof Position) return Number(o);
  if (o instanceof SeqRecord) {
    return { rec: { id: o.id, name: o.name, description: o.description, dbxrefs: o.dbxrefs, seq: o.seq === null ? null : o.seq.toString(), annotations: enc(o.annotations), features: o.features.map(enc), letter: { d: [...(o.letterAnnotations as any).entries()].map(([k, v]: [string, unknown]) => [k, enc(v)]) } } };
  }
  if (o instanceof SeqFeature) return { feat: { type: o.type, id: o.id, loc: o.location!.repr(), qualifiers: enc(o.qualifiers) } };
  if (o instanceof Seq) return o.toString();
  if (o instanceof MultipleSeqAlignment) return { msa: [...o].map((r) => [r.id, r.seq!.toString()]) };
  if (o instanceof Alignment) return { aln: { seqs: (o.sequences as unknown[]).map(enc), coords: o.coordinates === null ? null : Array.from(o.coordinates as ArrayLike<ArrayLike<number>>, (r) => Array.from(r)) } };
  if (o instanceof Map) return { d: [...o].map(([k, v]) => [k, enc(v)]) };
  if (o instanceof PX.Confidence) return { c: "Confidence", f: pyFloatRepr(o.value), a: byKey(o.pyDict()).map(([k, v]) => [k, enc(v)]), r: o.repr(), s: String(o) };
  if (o instanceof PyFloat) return { f: pyFloatRepr(o.value) };
  if (typeof o === "number") return Number.isInteger(o) ? o : { f: pyFloatRepr(o) };
  if (Array.isArray(o)) return o.map(enc);
  if (typeof o.next === "function") return [...o].map(enc);
  if (o instanceof BaseBranchColor && typeof o.pyDict !== "function") return { c: "BranchColor", a: [["blue", o.blue], ["green", o.green], ["red", o.red]], r: `BranchColor(red=${o.red}, green=${o.green}, blue=${o.blue})`, s: String(o) };
  if (typeof o.pyDict === "function") return { c: o.constructor.name, a: byKey(o.pyDict()).map(([k, v]) => [k, enc(v)]), r: o.repr(), s: String(o) };
  if (o.constructor === Object) return { d: Object.entries(o).map(([k, v]) => [k, enc(v)]) };
  return { repr: String(o) };
};

/** Python dicts as `Map`s (recursively, through arrays). */
const toMaps = (o: any): any => (Array.isArray(o) ? o.map(toMaps) : o !== null && typeof o === "object" && o.constructor === Object ? new Map(Object.entries(o).map(([k, v]) => [k, toMaps(v)])) : o);

const camel = (s: string): string => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const camelKeys = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).map(([k, v]) => [camel(k), v]));
const exc = (e: any): Json => ({ type: e?.name === "Error" ? "Error" : e?.name, msg: e?.message });
const text = (): { target: { write(s: string): void }; get: () => string } => { let t = ""; return { target: { write: (s: string) => { t += s; } }, get: () => t }; };

/** Run `fn`, collecting warnings and an exception as the generator does. */
const catchAll = (fn: () => unknown): Json => {
  const cap = captureWarnings(fn);
  const out: Json = {};
  if (cap.error !== undefined) out.exc = exc(cap.error); else out.result = cap.result;
  out.warnings = cap.warnings.map((w) => [w.category, w.message]);
  return out;
};

const writeText = (obj: any, ...rest: any[]): unknown => { const t = text(); const n = (PhyloXMLIO.write as any)(obj, t.target, ...rest); return [n, t.get()]; };
const phyloWriteText = (obj: any, options: Record<string, unknown> = {}): unknown => { const t = text(); const n = phyloWrite(obj, t.target, "phyloxml", options); return [n, t.get()]; };
const indentArg = (kw: Json): any[] => (kw && kw.indent === false ? [false] : []);

const run = (c: Json): Json => {
  switch (c.fn) {
    case "read": return catchAll(() => enc(PhyloXMLIO.read(c.xml)));
    case "parse": {
      const cap = captureWarnings(() => {
        const items: Json[] = [];
        try { for (const t of PhyloXMLIO.parse(c.xml)) items.push(enc(t)); } catch (e) { return { items, exc: exc(e) }; }
        return { items };
      });
      const r: Json = cap.error !== undefined ? { items: [], exc: exc(cap.error) } : cap.result;
      r.warnings = cap.warnings.map((w) => [w.category, w.message]);
      return r;
    }
    case "phylo_read": return catchAll(() => enc(phyloRead(c.xml, "phyloxml")));
    case "roundtrip": return catchAll(() => writeText(PhyloXMLIO.read(c.xml), ...indentArg(c.kwargs)));
    case "phylo_roundtrip": return catchAll(() => phyloWriteText([...phyloParse(c.xml, "phyloxml")], c.kwargs ?? {}));
    case "convert": return catchAll(() => {
      let trees: any = [...phyloParse(c.text, c.fmt)];
      if (c.single) trees = trees[0];
      if (c.clade) trees = trees.root;
      return phyloWriteText(trees, c.kwargs ?? {});
    });
    case "write_direct": return catchAll(() => {
      const trees = [...phyloParse(c.text, c.fmt)];
      return writeText(c.single ? trees[0] : trees);
    });
    case "as_phyloxml": return catchAll(() => enc((phyloRead(c.text, c.fmt) as Tree).asPhyloxml(camelKeys(c.kwargs ?? {}))));
    case "ctor": return catchAll(() => enc(new Function("PX", "SeqRecord", "Seq", "SeqFeature", "SimpleLocation", "M", `return ${c.ts};`)(PX, SeqRecord, Seq, SeqFeature, SimpleLocation, toMaps)));
    case "ops": return catchAll(() => {
      const px = PhyloXMLIO.read(c.xml);
      const ph = px.phylogenies[0] as any;
      const root = ph.root;
      const Phylo = { read: phyloRead };
      const tryit = (fn: () => unknown): unknown => { try { return fn(); } catch (e: any) { return { EXC: e?.name === "Error" ? "Error" : e?.name }; } };
      return c.steps.map((s: Json) => {
        try {
          const f = new Function("px", "ph", "root", "PX", "Phylo", "tryit", s.kind === "exec" ? s.ts : `return ${s.ts};`);
          const v = f(px, ph, root, PX, Phylo, tryit);
          return s.kind === "exec" ? null : { v: enc(v) };
        } catch (e) { return { exc: exc(e) }; }
      });
    });
    default: throw new Error(`unknown fn ${c.fn}`);
  }
};

/** Python `AttributeError` becomes a `TypeError` here and its message is not compared: copy the expected null message into `got` where the types agree. */
const align = (got: Json, want: Json): Json => {
  if (Array.isArray(got) && Array.isArray(want)) return got.map((g, i) => align(g, want[i]));
  if (got && want && typeof got === "object" && typeof want === "object" && !Array.isArray(got)) {
    const out: Json = {};
    for (const k of Object.keys(got)) out[k] = align(got[k], want[k]);
    if (out.exc && want.exc && want.exc.msg === null && out.exc.type === want.exc.type) out.exc = { ...out.exc, msg: null };
    return out;
  }
  return got;
};

const failures: Json[] = [];
afterAll(() => { if (process.env.PX_DUMP) writeFileSync("/tmp/px_fail.json", JSON.stringify(failures)); });

describe("Bio.Phylo.PhyloXML / PhyloXMLIO", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.fn}`, () => {
      const got = run(c);
      const want = c.expect;
      const norm = (x: Json): Json => JSON.parse(JSON.stringify(x));
      const aligned = align(norm(got), want);
      if (process.env.PX_DUMP && JSON.stringify(aligned) !== JSON.stringify(want)) failures.push({ n, fn: c.fn, got: aligned, want, case: c });
      expect(aligned).toEqual(want);
    });
  });
});
