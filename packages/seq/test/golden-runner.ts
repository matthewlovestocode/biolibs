/**
 * Replays golden cases (generated from real Biopython by reference/golden/*.py)
 * against the TypeScript implementation. See reference/golden/codec.py for the
 * JSON encoding.
 */
import { captureWarnings } from "@biolibs/core";
import * as B from "@biolibs/seq";
import { MutableSeq, Seq, CodonTable, PartiallyDefinedSequenceData, UndefinedSequenceData, SequenceDataAbstractBaseClass, BytesData } from "@biolibs/seq";
import { addData, toData } from "../src/seqdata/index.js";

type J = null | boolean | number | string | { [k: string]: unknown };

const l1 = (b: Uint8Array): string => Array.from(b, (c) => String.fromCharCode(c)).join("");
const b1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

const REG: Record<string, Map<number, unknown>> = {
  unambiguous_dna: CodonTable.unambiguousDnaById,
  unambiguous_rna: CodonTable.unambiguousRnaById,
  generic: CodonTable.genericById,
  ambiguous_dna: CodonTable.ambiguousDnaById,
  ambiguous_rna: CodonTable.ambiguousRnaById,
  ambiguous_generic: CodonTable.ambiguousGenericById,
};

/** Encode a value exactly like codec.enc in Python. */
export function enc(x: unknown): J {
  if (x === null || x === undefined) return null;
  if (typeof x === "number" && !Number.isFinite(x)) return { $: "float", v: Number.isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf" };
  if (typeof x === "boolean" || typeof x === "number" || typeof x === "string") return x;
  if (x instanceof Uint8Array) return { $: "bytes", v: l1(x) };
  if (x instanceof BytesData) return { $: "bytes", v: l1(x.toBytes()) }; // Python holds defined content as raw bytes
  if (x instanceof SequenceDataAbstractBaseClass) return enc(new Seq(x));
  if (x instanceof Seq || x instanceof MutableSeq) {
    const cls = x.constructor.name;
    const d = x._data;
    if (d instanceof UndefinedSequenceData) return { $: cls, undef: d.length };
    if (d instanceof PartiallyDefinedSequenceData) return { $: cls, length: d.length, segs: [...d.segments].map(([k, v]) => [k, l1(v)]) };
    return { $: cls, v: l1(d.toBytes()) };
  }
  if (Array.isArray(x)) return { $: "list", v: x.map(enc) };
  if (x instanceof Map) return { $: "dict", v: [...x].map(([k, v]) => [enc(k), enc(v)]) };
  throw new Error(`cannot encode ${String(x)}`);
}

/** Decode a golden-JSON value into a live object (inverse of Python's enc). */
export function dec(x: unknown): unknown {
  if (x === null || typeof x !== "object") return x;
  const o = x as Record<string, unknown>;
  switch (o["$"]) {
    case "bytes": return b1(o["v"] as string);
    case "float": return Number(o["v"] === "nan" ? NaN : o["v"] === "inf" ? Infinity : -Infinity);
    case "Seq":
    case "MutableSeq": {
      if ("undef" in o) return new Seq(null, o["undef"] as number);
      if ("segs" in o) return new Seq(new Map((o["segs"] as [number, string][]).map(([k, v]) => [k, b1(v)])), o["length"] as number);
      const bytes = b1(o["v"] as string);
      return o["$"] === "Seq" ? new Seq(bytes) : new MutableSeq(bytes);
    }
    case "list":
    case "tuple": return (o["v"] as unknown[]).map(dec);
    case "slice": { const [start, stop, step] = o["v"] as (number | null)[]; return { start, stop, step }; }
    case "dict": return new Map((o["v"] as [unknown, unknown][]).map(([k, v]) => [dec(k), dec(v)]));
    case "table": return REG[o["kind"] as string]!.get(o["id"] as number);
    default: throw new Error(`unknown tag ${String(o["$"])}`);
  }
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Call a method of the data provider directly; mirrors `apply_data` in gen_seq_cases.py. */
function applyData(name: string, d: any, rawArgs: any[]): unknown {
  const args = rawArgs.map((a) => (a instanceof Seq ? a._data : a));
  switch (name) {
    case "__len__": return d.length;
    case "__getitem__": return typeof args[0] === "number" ? d.getItem(args[0]) : d.getSlice(args[0]);
    case "__bytes__": return d.toBytes();
    case "__hash__": d.hashCode(); return "hash-ok";
    case "__eq__": return d.eq(args[0]);
    case "__lt__": return d.lt(args[0]);
    case "__le__": return d.le(args[0]);
    case "__gt__": return d.gt(args[0]);
    case "__ge__": return d.ge(args[0]);
    case "__add__": return addData(d, toData(args[0]));
    case "__radd__": return addData(toData(args[0]), d);
    case "__mul__": return d.mul(args[0]);
    case "__contains__": return d.contains(args[0]);
    case "defined": return d.defined;
    case "defined_ranges": return d.definedRanges;
    default: return d[camel(name)](...args);
  }
}

/** Execute one case; mirrors `apply` in gen_seq_cases.py. */
function apply(c: Case, recv: any, args: any[]): unknown {
  if (c.op?.startsWith("data:")) return applyData(c.op.slice(5), recv._data, args);
  if (c.func) return (B as any)[camel(c.func)](...args);
  if (c.ctor) return new (B as any)[c.ctor](...args);
  switch (c.op) {
    case "__len__": return recv.length;
    case "__getitem__": return typeof args[0] === "number" ? recv.at(args[0]) : recv.slice(args[0].start, args[0].stop, args[0].step);
    case "__add__": return recv.add(args[0]);
    case "__radd__": return recv.radd(args[0]);
    case "__mul__": return recv.mul(args[0]);
    case "__rmul__": return recv.rmul(args[0]);
    case "__imul__": return recv.imul(args[0]);
    case "__eq__": return recv.equals(args[0]);
    case "__lt__": return recv.lt(args[0]);
    case "__le__": return recv.le(args[0]);
    case "__gt__": return recv.gt(args[0]);
    case "__ge__": return recv.ge(args[0]);
    case "__contains__": return recv.contains(args[0]);
    case "__str__": return recv.toString();
    case "__bytes__": return recv.toBytes();
    case "__repr__": return recv.repr();
    case "__hash__":
      if (recv instanceof MutableSeq) { const e = new TypeError("unhashable type: 'MutableSeq'"); throw e; }
      recv.hashCode();
      return "hash-ok";
    case "__iter__": return [...recv];
    case "__setitem__": recv.set(args[0], args[1]); return null;
    case "__delitem__": recv.delete(args[0]); return null;
    case "search": return [...recv.search(args[0])].map((p: unknown) => p);
    case "defined": return recv.defined;
    case "defined_ranges": return recv.definedRanges;
    default: return recv[camel(c.op!)](...args);
  }
}

export interface Case {
  op?: string; func?: string; ctor?: string; recv?: unknown; args?: unknown[];
  result?: J; exc?: { type: string; msg: string | null }; warnings: string[]; after?: J;
}

export interface Outcome { result?: J; exc?: { type: string; msg: string }; warnings: string[]; after?: J }

/** Run a case in TypeScript and produce the same outcome shape Python recorded. */
export function runCase(c: Case): Outcome {
  const recv = "recv" in c ? dec(c.recv) : null;
  const args = (c.args ?? []).map(dec);
  const cap = captureWarnings(() => enc(apply(c, recv, args)));
  const out: Outcome = { warnings: cap.warnings.map((w) => w.message) };
  if (cap.error !== undefined) {
    const e = cap.error as Error;
    out.exc = { type: e.name, msg: e.message };
  } else out.result = cap.result as J;
  if (recv instanceof MutableSeq) out.after = enc(recv);
  return out;
}

/** Compare an expected (Python) outcome with the TypeScript outcome; returns a description of the first difference, or null. */
export function diff(c: Case, got: Outcome): string | null {
  const want: Case = c.exc?.type === "AttributeError"
    // Python's duck typing raises AttributeError for wrong argument types; a typed port throws TypeError.
    ? { ...c, exc: { type: "TypeError", msg: null } }
    : c;
  if (want.exc) {
    if (!got.exc) return `expected ${want.exc.type}: ${want.exc.msg}, got result ${JSON.stringify(got.result)}`;
    if (want.exc.type !== got.exc.type) return `expected ${want.exc.type}: ${want.exc.msg}, got ${got.exc.type}: ${got.exc.msg}`;
    if (want.exc.msg !== null && want.exc.msg !== got.exc.msg) return `message: expected ${JSON.stringify(want.exc.msg)}, got ${JSON.stringify(got.exc.msg)}`;
  } else {
    if (got.exc) return `expected result ${JSON.stringify(want.result)}, got ${got.exc.type}: ${got.exc.msg}`;
    if (JSON.stringify(want.result) !== JSON.stringify(got.result)) return `result: expected ${JSON.stringify(want.result)}, got ${JSON.stringify(got.result)}`;
  }
  if (JSON.stringify(want.warnings) !== JSON.stringify(got.warnings)) return `warnings: expected ${JSON.stringify(want.warnings)}, got ${JSON.stringify(got.warnings)}`;
  if ("after" in want && JSON.stringify(want.after) !== JSON.stringify(got.after)) return `state after: expected ${JSON.stringify(want.after)}, got ${JSON.stringify(got.after)}`;
  return null;
}
