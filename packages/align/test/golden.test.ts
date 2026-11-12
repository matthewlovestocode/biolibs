/** Replays Bio.Align.MultipleSeqAlignment golden cases (reference/golden/gen_msa_cases.py). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MultipleSeqAlignment } from "@biolibs/align";
import { SeqRecord } from "@biolibs/seqrecord";
import { dec, enc } from "../../seqrecord/test/golden-runner";

type Spec = ["i", number] | ["s", number | null, number | null, number | null];
interface Case {
  records: unknown[]; ops: unknown[][]; kind?: string; annotations?: [string, unknown][] | null; column_annotations?: [string, unknown][]; annotations_bad?: boolean;
  ctor_exc?: { type: string; msg: string | null }; ops_out?: { result?: unknown; exc?: { type: string; msg: string | null } }[]; state?: unknown;
}

const spec = (s: Spec): number | { start?: number; stop?: number; step?: number } => (s[0] === "i" ? s[1] : { start: s[1] ?? undefined, stop: s[2] ?? undefined, step: s[3] ?? undefined });

/** The encoding of an alignment, as in gen_msa_cases.py. */
function encMsa(a: MultipleSeqAlignment): unknown {
  const col = a.peekColumnAnnotations();
  return { $: "msa", records: [...a].map((r) => enc(r)), annotations: enc(a.annotations), column: col === null ? null : [...col].map(([k, v]) => [k, enc(v)]) };
}
const encAny = (x: unknown): unknown => (x instanceof MultipleSeqAlignment ? encMsa(x) : enc(x));

function apply(a: MultipleSeqAlignment, op: any[]): unknown {
  switch (op[0]) {
    case "len": return a.length;
    case "align_len": return a.getAlignmentLength();
    case "str": return a.toString();
    case "ids": return [...a].map((r) => r.id);
    case "get": return (a as any).get(spec(op[1]));
    case "get2": return (a as any).get(spec(op[1]), spec(op[2]));
    case "append": a.append(dec(op[1])); return undefined;
    case "extend": a.extend(op[1].map(dec)); return undefined;
    case "extend_gen": a.extend((function* () { yield* op[1].map(dec); })()); return undefined;
    case "add": return a.add(new MultipleSeqAlignment(op[1].map(dec), null, op[2] ? new Map(op[2].map(([k, v]: [string, unknown]) => [k, dec(v)])) : null));
    case "add_other": return a.add(op[1]);
    case "delete": a.delete(spec(op[1])); return undefined;
    case "sort": a.sort(op[1] === "desc" ? (r: SeqRecord) => r.description.length : null, op[2]); return undefined;
    case "set_column": a.columnAnnotations = new Map(op[1].map(([k, v]: [string, unknown]) => [k, dec(v)])); return undefined;
    case "col_set": a.columnAnnotations.set(op[1], dec(op[2])); return undefined;
    case "format": return a.format(op[1]);
    default: throw new Error(op[0]);
  }
}

const file = JSON.parse(readFileSync(new URL("./golden/msa.json", import.meta.url), "utf8")) as { biopython: string; cases: Case[] };

describe(`Bio.Align.MultipleSeqAlignment: parity with Biopython ${file.biopython}`, () => {
  it(`operations (${file.cases.length} cases)`, () => {
    const bad: string[] = [];
    for (const c of file.cases) {
      let a: MultipleSeqAlignment;
      try {
        const annotations = c.annotations_bad ? ([1] as never) : c.annotations === undefined ? null : c.annotations === null ? null : new Map(c.annotations.map(([k, v]) => [k, dec(v)]));
        const column = c.column_annotations === undefined ? null : new Map(c.column_annotations.map(([k, v]) => [k, dec(v)] as [string, never]));
        const records = c.kind === "gen" ? (function* () { yield* c.records.map(dec); })() : c.records.map(dec);
        a = new MultipleSeqAlignment(records, null, annotations, column);
      } catch (e) {
        const want = c.ctor_exc;
        const err = e as Error;
        if (!want) bad.push(`ctor threw ${err.name}: ${err.message}`);
        else if (want.type !== err.name && !(want.type === "AttributeError" && err.name === "TypeError")) bad.push(`ctor expected ${want.type} got ${err.name}: ${err.message}`);
        else if (want.msg !== null && want.msg !== err.message) bad.push(`ctor message expected ${want.msg} got ${err.message}`);
        continue;
      }
      if (c.ctor_exc) { bad.push(`ctor expected ${c.ctor_exc.type}`); continue; }
      c.ops.forEach((op, i) => {
        const want = c.ops_out![i]!;
        try {
          const r = apply(a, op);
          const got = r === undefined ? null : encAny(r);
          if (want.exc) bad.push(`op ${JSON.stringify(op).slice(0, 80)} expected ${want.exc.type}, got result`);
          else if (JSON.stringify(got) !== JSON.stringify(want.result ?? null)) bad.push(`op ${JSON.stringify(op).slice(0, 80)}: expected ${JSON.stringify(want.result).slice(0, 200)}, got ${JSON.stringify(got).slice(0, 200)}`);
        } catch (e) {
          const err = e as Error;
          if (!want.exc) bad.push(`op ${JSON.stringify(op).slice(0, 80)} threw ${err.name}: ${err.message}`);
          else if (want.exc.type !== err.name && !(want.exc.type === "AttributeError" && err.name === "TypeError")) bad.push(`op ${JSON.stringify(op).slice(0, 80)} expected ${want.exc.type}: ${want.exc.msg}, got ${err.name}: ${err.message}`);
          else if (want.exc.msg !== null && want.exc.msg !== err.message) bad.push(`op ${JSON.stringify(op).slice(0, 80)} message expected ${want.exc.msg}, got ${err.message}`);
        }
      });
      if (JSON.stringify(encMsa(a)) !== JSON.stringify(c.state)) bad.push(`final state differs: expected ${JSON.stringify(c.state).slice(0, 200)}, got ${JSON.stringify(encMsa(a)).slice(0, 200)}`);
    }
    expect(bad.length, `${bad.length} mismatches:\n${bad.slice(0, 8).join("\n")}`).toBe(0);
  });
});
