/**
 * Replays Bio.SeqRecord golden cases (reference/golden/gen_record_cases.py) against the TypeScript port.
 * Encoding: see reference/golden/codec_feature.py (the "rec" tag).
 */
import { captureWarnings } from "@biolibs/core";
import * as BioSeq from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { dec as decF, enc as encF } from "../../seqfeature/test/golden-runner";

type J = null | boolean | number | string | { [k: string]: unknown };

/** Named records, filled in by the test from the file's `records` table. */
export const RECORDS: Record<string, unknown> = {};

/** Encode a result like codec_feature.enc in Python. */
export function enc(x: unknown): J {
  if (x instanceof SeqRecord) {
    const pla = x.perLetterAnnotations;
    return {
      $: "rec", seq: encF(x.seq), id: x.id, name: x.name, description: x.description, dbxrefs: [...x.dbxrefs],
      features: x.features.map(encF), annotations: [...x.annotations].map(([k, v]) => [k, encF(v)]),
      letter: pla === null ? null : [...pla].map(([k, v]) => [k, encF(v)]),
    };
  }
  if (Array.isArray(x)) return { $: "list", v: x.map(enc) };
  return encF(x);
}

/** Decode a value; `recref` entries are looked up in {@link RECORDS}. */
export function dec(x: unknown): any {
  if (x !== null && typeof x === "object") {
    const o = x as Record<string, any>;
    if (o["$"] === "recref") return dec(RECORDS[o["name"]]);
    if (o["$"] === "rec") {
      const r = new SeqRecord(dec(o["seq"]), o["id"], o["name"], o["description"], [...o["dbxrefs"]], o["features"].map(decF), new Map(o["annotations"].map(([k, v]: [string, unknown]) => [k, decF(v)])));
      if (o["letter"] !== null) r.letterAnnotations = new Map(o["letter"].map(([k, v]: [string, unknown]) => [k, decF(v)]));
      return r;
    }
    if (o["$"] === "list") return o["v"].map(dec);
  }
  return decF(x);
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function apply(c: Case, recv: any, args: any[]): unknown {
  if (c.ctor) return new (SeqRecord as any)(...args);
  if (c.func) return (BioSeq as any)[camel(c.func)](...args);
  switch (c.op) {
    case "__getitem__": return recv.get(args[0]);
    case "__iter__": return [...recv];
    case "__contains__": return recv.contains(args[0]);
    case "__bytes__": return recv.toBytes();
    case "__str__": return recv.toString();
    case "__repr__": return recv.repr();
    case "__len__": return recv.length;
    case "__add__": return recv.add(args[0]);
    case "__radd__": return args[0] instanceof SeqRecord ? args[0].add(recv) : recv.radd(args[0]); // Python's operator protocol
    case "__lt__": return recv.lt(args[0]);
    case "__le__": return recv.le(args[0]);
    case "__eq__": return recv.equals(args[0]);
    case "__ne__": return recv.ne(args[0]);
    case "__gt__": return recv.gt(args[0]);
    case "__ge__": return recv.ge(args[0]);
    case "set_seq": recv.seq = args[0]; return null;
    case "set_letter": recv.letterAnnotations = args[0]; return null;
    case "letter_setitem": recv.letterAnnotations.set(args[0], args[1]); return null;
    case "letter_update": recv.letterAnnotations.update(args[0]); return null;
    case "letter_annotations": return recv.letterAnnotations;
    case "seq": case "id": case "name": case "description": case "dbxrefs": case "annotations": case "features": return recv[c.op];
    default: return recv[camel(c.op!)](...args);
  }
}

export interface Case {
  op?: string; func?: string; ctor?: boolean; recv?: unknown; args?: unknown[];
  result?: J; exc?: { type: string; msg: string | null }; warnings: string[]; after?: J; unchanged?: boolean;
}

/** Run one case, returning the same outcome shape Python recorded. */
export function runCase(c: Case) {
  let recv: any = null;
  let before: J = null;
  const cap = captureWarnings(() => {
    recv = "recv" in c ? dec(c.recv) : null;
    if (recv) before = enc(recv);
    return enc(apply(c, recv, (c.args ?? []).map(dec)));
  });
  const out: { result?: J; exc?: { type: string; msg: string }; warnings: string[]; after?: J; unchanged?: boolean } = { warnings: cap.warnings.map((w) => w.message) };
  if (cap.error !== undefined) out.exc = { type: (cap.error as Error).name, msg: (cap.error as Error).message };
  else out.result = cap.result as J;
  if (recv) {
    const after = enc(recv);
    if (JSON.stringify(after) === JSON.stringify(before)) out.unchanged = true;
    else out.after = after;
  }
  return out;
}

/** First difference between Python's outcome and ours, or null. */
export function diff(c: Case, got: ReturnType<typeof runCase>): string | null {
  const want: Case = c.exc?.type === "AttributeError" ? { ...c, exc: { type: "TypeError", msg: null } } : c;
  if (want.exc) {
    if (!got.exc) return `expected ${want.exc.type}: ${want.exc.msg}, got result ${JSON.stringify(got.result)}`;
    if (want.exc.type !== got.exc.type) return `expected ${want.exc.type}: ${want.exc.msg}, got ${got.exc.type}: ${got.exc.msg}`;
    if (want.exc.msg !== null && want.exc.msg !== got.exc.msg) return `message: expected ${JSON.stringify(want.exc.msg)}, got ${JSON.stringify(got.exc.msg)}`;
  } else {
    if (got.exc) return `expected result ${JSON.stringify(want.result)}, got ${got.exc.type}: ${got.exc.msg}`;
    if (JSON.stringify(want.result) !== JSON.stringify(got.result)) return `result: expected ${JSON.stringify(want.result)}, got ${JSON.stringify(got.result)}`;
  }
  if (JSON.stringify(want.warnings) !== JSON.stringify(got.warnings)) return `warnings: expected ${JSON.stringify(want.warnings)}, got ${JSON.stringify(got.warnings)}`;
  if (!!want.unchanged !== !!got.unchanged) return `state: expected ${want.unchanged ? "unchanged" : JSON.stringify(want.after)}, got ${got.unchanged ? "unchanged" : JSON.stringify(got.after)}`;
  if (!want.unchanged && JSON.stringify(want.after) !== JSON.stringify(got.after)) return `state after: expected ${JSON.stringify(want.after)}, got ${JSON.stringify(got.after)}`;
  return null;
}
