/**
 * Replays Bio.SeqFeature golden cases (reference/golden/gen_feature_cases.py) against the TypeScript port.
 * The JSON encoding is described in reference/golden/codec_feature.py.
 */
import { captureWarnings } from "@biolibs/core";
import * as SF from "@biolibs/seqfeature";
import { Seq, MutableSeq } from "@biolibs/seq";
import { dec as decSeq, enc as encSeq } from "../../seq/test/golden-runner";

type J = null | boolean | number | string | { [k: string]: unknown };

const POS: Record<string, any> = {
  ExactPosition: SF.ExactPosition, UncertainPosition: SF.UncertainPosition, BeforePosition: SF.BeforePosition, AfterPosition: SF.AfterPosition,
  WithinPosition: SF.WithinPosition, BetweenPosition: SF.BetweenPosition, OneOfPosition: SF.OneOfPosition, UnknownPosition: SF.UnknownPosition,
};

/** Encode a result exactly like codec_feature.enc in Python. */
export function enc(x: unknown): J {
  if (x instanceof SF.UnknownPosition) return { $: "pos", cls: "UnknownPosition" };
  if (x instanceof SF.Position) {
    const d: Record<string, unknown> = { $: "pos", cls: x.constructor.name, v: x.valueOf() };
    if (x instanceof SF.WithinPosition || x instanceof SF.BetweenPosition) { d["left"] = x.left; d["right"] = x.right; }
    if (x instanceof SF.OneOfPosition) d["choices"] = x.positionChoices.map(enc);
    return d;
  }
  if (x instanceof SF.SimpleLocation) return { $: "loc", cls: "SimpleLocation", start: enc(x.start), end: enc(x.end), strand: x.strand, ref: x.ref, ref_db: x.refDb };
  if (x instanceof SF.CompoundLocation) return { $: "loc", cls: "CompoundLocation", parts: x.parts.map(enc), operator: x.operator };
  if (x instanceof SF.SeqFeature) return { $: "feat", location: enc(x.location), type: x.type, id: x.id, qualifiers: [...x.qualifiers].map(([k, v]) => [k, enc(v)]) };
  if (x instanceof SF.Reference) {
    return { $: "ref", authors: x.authors, consrtm: x.consrtm, title: x.title, journal: x.journal, medline_id: x.medlineId, pubmed_id: x.pubmedId, comment: x.comment, location: x.location.map(enc) };
  }
  if (Array.isArray(x)) return { $: "list", v: x.map(enc) };
  if (x instanceof Map) return { $: "dict", v: [...x].map(([k, v]) => [enc(k), enc(v)]) };
  return encSeq(x);
}

/** Decode an argument or receiver. */
export function dec(x: unknown): any {
  if (x !== null && typeof x === "object") {
    const o = x as Record<string, any>;
    switch (o["$"]) {
      case "pos": {
        const C = POS[o["cls"]];
        if (C === SF.UnknownPosition) return new C();
        if (C === SF.WithinPosition || C === SF.BetweenPosition) return new C(o["v"], o["left"], o["right"]);
        if (C === SF.OneOfPosition) return new C(o["v"], o["choices"].map(dec));
        return new C(o["v"]);
      }
      case "loc":
        return o["cls"] === "SimpleLocation"
          ? new SF.SimpleLocation(dec(o["start"]), dec(o["end"]), o["strand"], o["ref"], o["ref_db"])
          : new SF.CompoundLocation(o["parts"].map(dec), o["operator"]);
      case "feat": return new SF.SeqFeature(dec(o["location"]), o["type"], o["id"], new Map(o["qualifiers"].map(([k, v]: [string, unknown]) => [k, dec(v)])));
      case "ref": {
        const r = new SF.Reference();
        Object.assign(r, { authors: o["authors"], consrtm: o["consrtm"], title: o["title"], journal: o["journal"], medlineId: o["medline_id"], pubmedId: o["pubmed_id"], comment: o["comment"] });
        r.location = o["location"].map(dec);
        return r;
      }
      case "list":
      case "tuple": return o["v"].map(dec);
      case "dict": return new Map(o["v"].map(([k, v]: [unknown, unknown]) => [dec(k), dec(v)]));
    }
  }
  return decSeq(x);
}

const PROP: Record<string, string> = { ref_db: "refDb", position_choices: "positionChoices" };
const camel = (s: string) => s.replace(/^_/, "").replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function apply(c: Case, recv: any, args: any[]): unknown {
  // The three INSDC writers, which are module functions rather than methods: the other direction from
  // `Location.fromstring`, and the only part of the port a GenBank writer needs.
  if (c.insdc) {
    if (c.insdc === "position") return SF.insdcFeaturePositionString(args[0], args[1]);
    if (c.insdc === "plain") return SF.insdcLocationStringIgnoringStrandAndSubfeatures(args[0], args[1]);
    return SF.insdcLocationString(args[0], args[1]);
  }
  if (c.static) {
    const [cls, fn] = c.static.split(".") as [string, string];
    return (cls === "Position" ? SF.Position : cls === "Location" ? SF.Location : SF.SimpleLocation).fromstring(...(args as [any, any, any, any]));
  }
  if (c.ctor) return new (SF as any)[c.ctor](...args);
  const cmp = (op: string) => { const a = Number(recv), b = args[0]; return op === "lt" ? a < b : op === "le" ? a <= b : op === "gt" ? a > b : a >= b; };
  switch (c.op) {
    case "__str__": return recv.toString();
    case "__repr__": return recv.repr();
    case "__add__": return recv.add(args[0]);
    case "__radd__": return recv.radd(args[0]);
    case "__sub__":
      if (typeof recv.sub !== "function") throw new TypeError(`unsupported operand type(s) for -: '${recv.constructor.name}' and '${typeof args[0] === "number" ? "int" : "str"}'`);
      return recv.sub(args[0]);
    case "__len__": return recv.length;
    case "__contains__": return recv.contains(args[0]);
    case "__iter__": return [...recv];
    case "__eq__": return recv.equals(args[0]);
    case "__lt__": return cmp("lt");
    case "__le__": return cmp("le");
    case "__gt__": return cmp("gt");
    case "__ge__": return cmp("ge");
    case "int": return Number(recv);
    case "set_strand": recv.strand = args[0]; return null;
    case "start": case "end": case "strand": case "parts": case "ref": case "operator": case "location": case "type": case "id": case "qualifiers":
    case "ref_db": case "position_choices": return recv[PROP[c.op!] ?? c.op!];
    default: return recv[camel(c.op!)](...args);
  }
}

export interface Case {
  op?: string; static?: string; ctor?: string; insdc?: string; recv?: unknown; args?: unknown[];
  result?: J; exc?: { type: string; msg: string | null }; warnings: string[]; after?: J;
}

/** Run one case; returns the outcome in the shape Python recorded. */
export function runCase(c: Case) {
  const out: { result?: J; exc?: { type: string; msg: string }; warnings: string[]; after?: J } = { warnings: [] };
  let recv: any = null;
  const cap = captureWarnings(() => {
    recv = "recv" in c ? dec(c.recv) : null;
    return enc(apply(c, recv, (c.args ?? []).map(dec)));
  });
  out.warnings = cap.warnings.map((w) => w.message);
  if (cap.error !== undefined) out.exc = { type: (cap.error as Error).name, msg: (cap.error as Error).message };
  else out.result = cap.result as J;
  if (c.op === "set_strand" && recv) out.after = enc(recv);
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
  if ("after" in want && JSON.stringify(want.after) !== JSON.stringify(got.after)) return `state after: expected ${JSON.stringify(want.after)}, got ${JSON.stringify(got.after)}`;
  return null;
}
void Seq; void MutableSeq;
